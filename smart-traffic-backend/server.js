require('dotenv').config();

const express = require('express');
const cors = require('cors');
const multer = require('multer');
const nodemailer = require('nodemailer');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');

const app = express();

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));


const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/smarttraffic';
const JWT_SECRET = process.env.JWT_SECRET || 'very_secret_demo_key';
const ADMIN_KEY = process.env.ADMIN_KEY || 'odisha_admin_key';
const UPLOADS_DIR = path.join(__dirname, 'uploads');

if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR);

// ----------------- MongoDB Setup -----------------

mongoose.set('strictQuery', false);

// Attempt to connect to MongoDB with fallback to local MongoDB when DNS/Atlas isn't reachable
// If all fails, continue with server running (graceful degradation for development)
async function connectWithFallback() {
  try {
    await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 5000 });
    console.log('✅ MongoDB connected to Atlas:', MONGO_URI);
  } catch (err) {
    console.warn('⚠️  Atlas connection failed:', err && err.message ? err.message : err);

    // Try local MongoDB fallback
    const fallback = process.env.LOCAL_MONGO_URI || 'mongodb://localhost:27017/smarttraffic';
    console.log('📍 Attempting fallback MongoDB URI:', fallback);
    try {
      await mongoose.connect(fallback, { serverSelectionTimeoutMS: 5000 });
      console.log('✅ MongoDB connected to localhost:', fallback);
    } catch (err2) {
      console.warn('⚠️  Fallback connection failed:', err2 && err2.message ? err2.message : err2);
      console.log('🔧 Running in offline mode. Database features will not work.');
      console.log('💡 To fix: Install MongoDB locally or configure Atlas cluster access.');
    }
  }
}

connectWithFallback();

// ----------------- Models -----------------

const userSchema = new mongoose.Schema({
  fullName: String,
  email: { type: String, unique: true, required: true },
  phone: String,
  passwordHash: String,
  kycFile: String,
  walletKm: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
  isAdmin: { type: Boolean, default: false },
  isEmailVerified: { type: Boolean, default: false },
  isVerified: { type: Boolean, default: false },
  verificationData: {
    name: String,
    phone: String,
    proofType: String, // aadhar, pan, driving_license
    idNumber: String,
    document: String, // filename of uploaded document
    verifiedAt: Date
  }
});
const User = mongoose.model('User', userSchema);

const otpSchema = new mongoose.Schema({
  email: String,
  otp: String,
  expiresAt: Date,
  createdAt: { type: Date, default: Date.now }
});
const OTP = mongoose.model('OTP', otpSchema);

const rideSchema = new mongoose.Schema({
  driverId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  start: String,
  dest: String,
  departTime: String,
  seats: { type: Number, default: 1 },
  passengers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  history: [{
    passengerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    joinedAt: Date,
    distanceKm: Number
  }],
  createdAt: { type: Date, default: Date.now },
  active: { type: Boolean, default: true }
});
const Ride = mongoose.model('Ride', rideSchema);

const reportSchema = new mongoose.Schema({
  issue: String,
  location: String,
  image: String,
  createdAt: { type: Date, default: Date.now }
});
const Report = mongoose.model('Report', reportSchema);

const txSchema = new mongoose.Schema({
  type: String,
  from: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  to: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  km: Number,
  rideId: { type: mongoose.Schema.Types.ObjectId, ref: 'Ride' },
  createdAt: { type: Date, default: Date.now }
});
const Tx = mongoose.model('Tx', txSchema);

// ----------------- Multer Setup -----------------

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, unique + '-' + file.originalname);
  }
});
const upload = multer({ storage });

// ----------------- Mailer Setup -----------------

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 465),
  secure: true,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

// ----------------- Helpers & Middleware -----------------

function generateJwt(user) {
  return jwt.sign({ id: user._id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
}

function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header) return res.status(401).json({ error: 'Missing authorization' });
  const token = header.split(' ')[1];
  try {
    const data = jwt.verify(token, JWT_SECRET);
    req.user = data;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

function adminMiddleware(req, res, next) {
  const key = req.headers['x-admin-key'];
  if (key && key === ADMIN_KEY) return next();
  return res.status(403).json({ error: 'Admin key missing/invalid' });
}

function haversineKm(lat1, lon1, lat2, lon2) {
    // This is a placeholder as lat/lon are not in the schema.
    // In a real app, you'd geocode addresses to get coordinates.
    if (!lat1 || !lon1 || !lat2 || !lon2) return 10.0; // Return a default distance
    const toRad = (deg) => deg * Math.PI / 180;
    const R = 6371;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return +(R * c).toFixed(2);
}

// Generate 6-digit OTP
function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Send OTP via email
async function sendOTPEmail(email, fullName, otp) {
  const mailOptions = {
    from: process.env.FROM_EMAIL || 'SmartTraffic <buskart.verify@gmail.com>',
    to: email,
    subject: '🎉 Welcome to SMART TRAVEL - Email Verification',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: 'Arial', sans-serif; background-color: #f4f4f4; margin: 0; padding: 0; }
          .container { max-width: 600px; margin: 20px auto; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); overflow: hidden; }
          .header { background: linear-gradient(90deg, #2563eb, #3b82f6); color: white; padding: 30px 20px; text-align: center; }
          .header h1 { margin: 0; font-size: 28px; }
          .content { padding: 30px 20px; }
          .greeting { font-size: 18px; color: #333; margin-bottom: 15px; }
          .message { color: #555; line-height: 1.6; margin-bottom: 20px; }
          .otp-box { background-color: #f0f7ff; border: 2px solid #2563eb; border-radius: 8px; padding: 20px; text-align: center; margin: 25px 0; }
          .otp-code { font-size: 36px; font-weight: bold; color: #2563eb; letter-spacing: 5px; font-family: 'Courier New', monospace; }
          .otp-label { color: #666; font-size: 12px; margin-top: 10px; text-transform: uppercase; }
          .footer { background-color: #f9f9f9; padding: 20px; text-align: center; border-top: 1px solid #ddd; color: #888; font-size: 12px; }
          .warning { background-color: #fff3cd; border-left: 4px solid #ffc107; padding: 12px; margin: 15px 0; color: #856404; border-radius: 4px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🚗 SMART TRAVEL</h1>
            <p>Your Journey, Our Priority</p>
          </div>
          
          <div class="content">
            <div class="greeting">
              <strong>Hello ${fullName}! 👋</strong>
            </div>
            
            <div class="message">
              <p>Welcome to SMART TRAVEL - the intelligent transportation solution for Odisha!</p>
              <p>We're thrilled to have you join our community. Whether you're looking to share rides, save time, or contribute to smarter traffic management, you're in the right place.</p>
              <p>To get started and secure your account, please verify your email address using the OTP code below:</p>
            </div>
            
            <div class="otp-box">
              <div class="otp-code">${otp}</div>
              <div class="otp-label">One-Time Password (Valid for 10 minutes)</div>
            </div>
            
            <div class="warning">
              <strong>🔒 Security Notice:</strong> Never share this OTP with anyone. Our team will never ask for your OTP via email or phone.
            </div>
            
            <div class="message">
              <p>This code will expire in <strong>10 minutes</strong>. If you didn't request this verification, please ignore this email.</p>
              <p>If you have any questions or need help, feel free to reach out to our support team.</p>
              <p><strong>Happy travels! 🌍</strong></p>
            </div>
          </div>
          
          <div class="footer">
            <p>© 2025 SMART TRAVEL. All rights reserved.</p>
            <p>This is an automated email. Please do not reply directly to this message.</p>
          </div>
        </div>
      </body>
      </html>
    `
  };

  try {
    await transporter.sendMail(mailOptions);
    return true;
  } catch (err) {
    console.error('Email sending error:', err);
    return false;
  }
}

// ----------------- Routes -----------------

app.get('/', (req, res) => res.send('Smart Traffic backend running'));

// Signup
// Signup - Send OTP
app.post('/api/signup', upload.single('kycDoc'), async (req, res) => {
  const { fullName, email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ error: 'Email & password required' });
  
  const existing = await User.findOne({ email });
  if (existing)
    return res.status(400).json({ error: 'User with this email already exists' });

  try {
    // Generate OTP
    const otp = generateOTP();
    
    // Set OTP expiry to 10 minutes
    const expiryTime = new Date(Date.now() + 10 * 60 * 1000);

    // Save OTP to database
    await OTP.deleteMany({ email }); // Clear old OTPs
    await OTP.create({ email, otp, expiresAt: expiryTime });

    // Send OTP via email
    const emailSent = await sendOTPEmail(email, fullName || 'User', otp);
    
    if (!emailSent) {
      return res.status(500).json({ error: 'Failed to send OTP email' });
    }

    // Store signup data temporarily (we'll use it when OTP is verified)
    const hashed = await bcrypt.hash(password, 10);
    
    res.status(200).json({ 
      message: 'OTP sent to your email. Please verify to complete signup.',
      email,
      tempData: {
        fullName: fullName || 'Unnamed',
        email,
        passwordHash: hashed
      }
    });
  } catch (err) {
    console.error('Signup error:', err);
    res.status(500).json({ error: 'Server error during signup' });
  }
});

// Verify OTP and Complete Signup
app.post('/api/verify-otp-signup', async (req, res) => {
  const { email, otp, fullName, password } = req.body;
  
  if (!email || !otp) {
    return res.status(400).json({ error: 'Email and OTP required' });
  }

  try {
    // Find OTP record
    const otpRecord = await OTP.findOne({ email, otp });
    
    if (!otpRecord) {
      return res.status(400).json({ error: 'Invalid OTP' });
    }

    // Check if OTP expired
    if (otpRecord.expiresAt < new Date()) {
      await OTP.deleteOne({ _id: otpRecord._id });
      return res.status(400).json({ error: 'OTP has expired' });
    }

    // Check if user already exists
    let user = await User.findOne({ email });
    
    if (!user) {
      // Create new user if doesn't exist
      if (!fullName || !password) {
        return res.status(400).json({ error: 'Full name and password required for new signup' });
      }
      
      const hashed = await bcrypt.hash(password, 10);
      user = await User.create({
        fullName,
        email,
        passwordHash: hashed,
        walletKm: 50, // Initial bonus wallet credit
        isEmailVerified: true
      });
    } else {
      // Mark existing user as email verified
      user.isEmailVerified = true;
      await user.save();
    }

    // Delete OTP record after successful verification
    await OTP.deleteOne({ _id: otpRecord._id });

    // Generate JWT token
    const token = generateJwt(user);

    res.json({ 
      message: 'Email verified successfully! Account created.',
      token,
      user: {
        id: user._id,
        email: user.email,
        fullName: user.fullName
      }
    });
  } catch (err) {
    console.error('OTP verification error:', err);
    res.status(500).json({ error: 'Server error during OTP verification' });
  }
});

// Resend OTP
app.post('/api/resend-otp', async (req, res) => {
  const { email, fullName } = req.body;
  
  if (!email) {
    return res.status(400).json({ error: 'Email required' });
  }

  try {
    // Generate new OTP
    const otp = generateOTP();
    const expiryTime = new Date(Date.now() + 10 * 60 * 1000);

    // Clear old OTPs and save new one
    await OTP.deleteMany({ email });
    await OTP.create({ email, otp, expiresAt: expiryTime });

    // Send OTP via email
    const emailSent = await sendOTPEmail(email, fullName || 'User', otp);
    
    if (!emailSent) {
      return res.status(500).json({ error: 'Failed to send OTP email' });
    }

    res.json({ message: 'OTP resent to your email' });
  } catch (err) {
    console.error('Resend OTP error:', err);
    res.status(500).json({ error: 'Server error while resending OTP' });
  }
});

// Login
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ error: 'Email & password required' });
  const user = await User.findOne({ email });
  if (!user || !user.passwordHash)
    return res.status(400).json({ error: 'Invalid credentials' });
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok)
    return res.status(400).json({ error: 'Invalid credentials' });
  const token = generateJwt(user);
  res.json({ token });
});

// User profile
app.get('/api/me', authMiddleware, async (req, res) => {
  const user = await User.findById(req.user.id).select('-passwordHash').lean();
  if (!user)
    return res.status(404).json({ error: 'User not found' });
  res.json({ user });
});

// Verify User - Upload ID proof
app.post('/api/verify-user', authMiddleware, upload.single('document'), async (req, res) => {
  try {
    const { name, phone, proofType, idNumber } = req.body;
    
    if (!name || !phone || !proofType || !idNumber) {
      return res.status(400).json({ error: 'All fields are required' });
    }
    
    if (!req.file) {
      return res.status(400).json({ error: 'Document file is required' });
    }

    // Validate ID number based on proof type
    if (proofType === 'aadhar') {
      if (!/^\d{12}$/.test(idNumber)) {
        return res.status(400).json({ error: 'Invalid Aadhar number format (must be 12 digits)' });
      }
    } else if (proofType === 'pan') {
      if (!/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(idNumber.toUpperCase())) {
        return res.status(400).json({ error: 'Invalid PAN number format (AAAAA0000A)' });
      }
    } else if (proofType === 'driving_license') {
      if (!/^[A-Z0-9]{1,20}$/.test(idNumber.toUpperCase())) {
        return res.status(400).json({ error: 'Invalid Driving License format' });
      }
    } else {
      return res.status(400).json({ error: 'Invalid proof type' });
    }

    // Validate phone number
    if (!/^\d{10}$/.test(phone)) {
      return res.status(400).json({ error: 'Invalid phone number (must be 10 digits)' });
    }

    // Update user with verification data
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    user.isVerified = true;
    user.verificationData = {
      name,
      phone,
      proofType,
      idNumber: idNumber.toUpperCase(),
      document: req.file.filename,
      verifiedAt: new Date()
    };

    await user.save();

    res.json({ 
      message: 'User verification successful', 
      verified: true,
      verificationData: user.verificationData
    });
  } catch (err) {
    console.error('Verification error:', err);
    res.status(500).json({ error: 'Server error while processing verification' });
  }
});

// Traffic prediction
app.post('/api/predict-traffic', (req, res) => {
  const { start = '', dest = '', dayOfWeek, time } = req.body;
  const hhmm = time || new Date().toTimeString().slice(0, 5);
  const [hh, mm] = hhmm.split(':').map(Number);
  const minutes = hh * 60 + mm;
  const lowerStart = start.toLowerCase();
  const lowerDest = dest.toLowerCase();

  const officeAreas = ['bhubaneswar', 'cuttack', 'infocity'];
  const weekendAreas = ['mall', 'puri', 'beach', 'market'];

  const isOffice = officeAreas.some((k) => lowerStart.includes(k) || lowerDest.includes(k));
  const isWeekendSpot = weekendAreas.some((k) => lowerStart.includes(k) || lowerDest.includes(k));

  let prediction = 'Light traffic expected.';
  let reason = 'Normal conditions.';

  if (dayOfWeek >= 1 && dayOfWeek <= 5) { // Weekday
    if ((minutes >= 480 && minutes <= 600) || (minutes >= 1020 && minutes <= 1140)) { // 8-10am or 5-7pm
      if (isOffice) {
        prediction = 'Heavy traffic likely.';
        reason = 'Weekday rush hour in a business area.';
      } else {
        prediction = 'Moderate traffic expected.';
        reason = 'Weekday commute time.';
      }
    }
  } else { // Weekend
    if (isWeekendSpot && minutes >= 660 && minutes < 1260) { // 11am - 9pm
      prediction = 'High traffic expected near weekend hotspots.';
      reason = 'Weekend leisure traffic.';
    }
  }

  res.json({ prediction, reason });
});

// Create ride
app.post('/api/rides', authMiddleware, async (req, res) => {
  const { start, dest, departTime, seats } = req.body;
  if (!start || !dest) return res.status(400).json({ error: 'Start and destination are required' });
  const ride = await Ride.create({ driverId: req.user.id, start, dest, departTime, seats: seats || 1 });
  res.status(201).json({ message: 'Ride created successfully', ride });
});

// Search rides - CORRECTED
app.post('/api/rides/search', async (req, res) => {
  const { start = '', dest = '' } = req.body;
  const searchCriteria = { active: true };
  if (start) searchCriteria.start = { $regex: start, $options: 'i' };
  if (dest) searchCriteria.dest = { $regex: dest, $options: 'i' };

  try {
    const matched = await Ride.find(searchCriteria)
      .populate('driverId', 'fullName')
      .lean();
    res.json({ matched });
  } catch (err) {
    res.status(500).json({ error: 'Error searching for rides' });
  }
});

// Join ride
app.post('/api/rides/:rideId/join', authMiddleware, async (req, res) => {
    try {
        const ride = await Ride.findById(req.params.rideId);
        if (!ride) return res.status(404).json({ error: 'Ride not found' });
        if (ride.driverId.toString() === req.user.id) {
            return res.status(400).json({ error: 'You cannot join your own ride' });
        }
        if (ride.passengers.some((p) => p.toString() === req.user.id))
            return res.status(400).json({ error: 'You have already joined this ride' });
        if (ride.passengers.length >= ride.seats)
            return res.status(400).json({ error: 'This ride is full' });

        const passenger = await User.findById(req.user.id);
        const driver = await User.findById(ride.driverId);
        if (!passenger || !driver)
            return res.status(404).json({ error: 'User not found' });

        const distanceKm = haversineKm(); // Using placeholder distance

        if (passenger.walletKm < distanceKm) {
            return res.status(400).json({ error: `Insufficient wallet balance. You need ${distanceKm} km but have ${passenger.walletKm} km.` });
        }

        passenger.walletKm -= distanceKm;
        driver.walletKm += distanceKm;
        
        ride.passengers.push(passenger._id);
        ride.history.push({ passengerId: passenger._id, joinedAt: new Date(), distanceKm });

        await passenger.save();
        await driver.save();
        await ride.save();

        await Tx.create({
            type: 'ride_payment',
            from: passenger._id,
            to: driver._id,
            km: distanceKm,
            rideId: ride._id,
        });

        res.json({ message: 'Successfully joined ride', distanceKm });
    } catch (err) {
        console.error("Join ride error:", err);
        res.status(500).json({ error: 'Server error while joining ride' });
    }
});


// User's rides (as driver or passenger) - CORRECTED
app.get('/api/my/rides', authMiddleware, async (req, res) => {
  const rides = await Ride.find({
    $or: [{ driverId: req.user.id }, { passengers: req.user.id }],
  })
    .populate('driverId', 'fullName email')
    .populate('passengers', 'fullName email')
    .sort({ createdAt: -1 })
    .lean();
  res.json(rides);
});

// Report an issue - NEWLY ADDED
app.post('/api/report', authMiddleware, upload.single('image'), async (req, res) => {
    const { issue, location } = req.body;
    if (!issue || !location) {
        return res.status(400).json({ error: 'Issue and location are required' });
    }
    try {
        const report = await Report.create({
            issue,
            location,
            image: req.file ? req.file.filename : null,
        });
        res.status(201).json({ message: 'Report submitted successfully', report });
    } catch (err) {
        res.status(500).json({ error: 'Server error while submitting report' });
    }
});


// Admin: list reports
app.get('/api/admin/reports', adminMiddleware, async (req, res) => {
  const reports = await Report.find().sort({ createdAt: -1 }).lean();
  res.json({ reports });
});

// Start server
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));