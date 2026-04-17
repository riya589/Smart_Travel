# Smart Travel

A modern travel management application with intelligent routing, booking, and user management features.

## Project Structure

```
smart-travel/
├── smart-traffic-backend/    # Express.js backend API
│   ├── server.js            # Main server file
│   ├── package.json         # Backend dependencies
│   ├── middleware/          # Custom middleware
│   ├── public/              # Static files (frontend)
│   ├── uploads/             # File upload directory
│   └── db_*.json            # Local database files
├── package.json             # Root package configuration
└── README.md               # This file
```

## Backend Features

- **Authentication**: JWT-based user authentication with bcrypt password hashing
- **User Management**: User registration, profile management, and authorization
- **File Uploads**: Multer-based file upload handling
- **Email Notifications**: Nodemailer integration for email communications
- **Database**: MongoDB integration with Atlas/local fallback support
- **CORS**: Cross-origin resource sharing enabled for frontend integration
- **Environment Configuration**: Dotenv support for secure configuration management

## Tech Stack

### Backend
- **Runtime**: Node.js
- **Framework**: Express.js 4.19.2
- **Database**: MongoDB 8.21.0 with Mongoose ODM
- **Authentication**: JSON Web Tokens (JWT)
- **Security**: bcrypt for password hashing
- **File Handling**: Multer 1.4.5
- **Email**: Nodemailer 7.0.12
- **Utilities**: UUID for unique ID generation

### Frontend
- Located in `smart-traffic-backend/public/`
- HTML-based interface
- Served through Express static middleware

## Installation

### Prerequisites
- Node.js 14+ and npm
- MongoDB (Atlas account or local MongoDB instance)

### Setup Instructions

1. **Install root dependencies**:
   ```bash
   npm install
   ```

2. **Install backend dependencies**:
   ```bash
   cd smart-traffic-backend
   npm install
   ```

3. **Configure environment variables**:
   Create a `.env` file in the `smart-traffic-backend/` directory:
   ```env
   PORT=5000
   MONGO_URI=mongodb+srv://username:password@cluster.mongodb.net/smarttraffic
   LOCAL_MONGO_URI=mongodb://localhost:27017/smarttraffic
   JWT_SECRET=your_jwt_secret_key
   ADMIN_KEY=your_admin_key
   ```

## Running the Application

### Development Mode
```bash
cd smart-traffic-backend
npm run dev
```
This uses Nodemon for automatic restart on file changes.

### Production Mode
```bash
cd smart-traffic-backend
npm start
```

The server will run on the port specified in your `.env` file (default: 5000).

## API Configuration

- **CORS**: Enabled for cross-origin requests
- **Port**: Configurable via `PORT` environment variable (default: 5000)
- **Database**: Attempts Atlas connection first, falls back to local MongoDB
- **File Uploads**: Stored in `/uploads` directory
- **Static Files**: Served from `/public` directory

## Database

The application supports two MongoDB configurations:

1. **MongoDB Atlas** (Cloud): Set `MONGO_URI` environment variable
2. **Local MongoDB**: Automatically used as fallback, or set `LOCAL_MONGO_URI`

The server gracefully handles offline mode when neither connection is available.

## Database Files

Local JSON database files for development:
- `db_users.json` - User data
- `db_rides.json` - Ride/travel data
- `db_txns.json` - Transaction data
- `db_reports.json` - Report data

## Security Notes

⚠️ **Important**: 
- Never commit `.env` files with real credentials
- Change default `JWT_SECRET` and `ADMIN_KEY` in production
- Use strong MongoDB passwords
- Enable MongoDB IP whitelist in production

## Development

### Available Scripts

**Root directory:**
- `npm start` - Start production server
- `npm run dev` - Start development server
- `npm test` - Run tests

**Backend directory:**
- `npm start` - Start production server
- `npm run dev` - Start with Nodemon (hot reload)

### Middleware

Custom middleware is located in the `middleware/` directory for:
- Authentication verification
- Request validation
- Error handling
- Other custom logic

## Deployment

To deploy this application:

1. Set up environment variables on your hosting platform
2. Ensure MongoDB connection is properly configured
3. Build and start the application:
   ```bash
   npm install
   cd smart-traffic-backend
   npm install
   npm start
   ```

## Troubleshooting

### MongoDB Connection Issues
- Verify connection string in `.env`
- Check MongoDB Atlas IP whitelist
- Ensure local MongoDB is running (if using local fallback)

### Port Already in Use
- Change the `PORT` in `.env` or set it via environment variables
- Or kill the process using the port

### File Upload Issues
- Ensure `/uploads` directory exists and is writable
- Check Multer configuration in `server.js`

## License

ISC

## Author

Your Name/Organization

---

For more information or support, please open an issue on the GitHub repository.
