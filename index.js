const express = require("express");
const app = express();
const morgan = require("morgan");
const cors = require("cors");
const bodyParser = require("body-parser");
const cookieParser = require("cookie-parser");
const path = require('path');
const http = require('http');
const { initializeSocket } = require('./io');

// Load and verify JWT_SECRET configuration at startup
try {
  const JWT_SECRET = require('./config/jwtSecret');
  console.log('✅ JWT_SECRET configuration loaded successfully');
} catch (error) {
  console.error('❌ Failed to load JWT_SECRET configuration:', error);
  process.exit(1);
}

const { getAllowedOrigins, getFrontendUrl, getApiUrl } = require('./config/appUrls');
const allowedOrigins = getAllowedOrigins();

// Configure CORS properly
app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.log('CORS blocked origin:', origin);
      // Still allow but log it for debugging
      callback(null, true);
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
  exposedHeaders: ['Content-Range', 'X-Content-Range'],
  preflightContinue: false,
  optionsSuccessStatus: 200
}));

// Handle preflight requests
app.options('*', (req, res) => {
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
  }
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.sendStatus(200);
});


// General request logger - log ALL incoming requests for debugging
app.use((req, res, next) => {
  // Log uploads requests specifically
  if (req.path.startsWith('/uploads/') || req.originalUrl.startsWith('/uploads/')) {
    console.log('📥 INCOMING UPLOADS REQUEST:');
    console.log('   Method:', req.method);
    console.log('   Path:', req.path);
    console.log('   URL:', req.url);
    console.log('   Original URL:', req.originalUrl);
  }
  next();
});

// Add CORS debugging middleware - MUST be before routes
app.use((req, res, next) => {
  // Skip CORS middleware for /uploads routes (they have their own CORS handling)
  if (req.path.startsWith('/uploads/') || req.path.startsWith('/api/v1/uploads/')) {
    return next();
  }
  
  const origin = req.headers.origin;
  
  // Always set CORS headers if origin matches or is missing
  if (!origin || allowedOrigins.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin || '*');
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    res.header('Access-Control-Expose-Headers', 'Content-Range, X-Content-Range');
  }
  
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  
  next();
});

app.use(morgan("dev"));
app.use(express.json());
app.use(bodyParser.urlencoded({ extended: true }));
// NOTE: express.static("public") is commented out to avoid conflicts with /uploads route
// app.use(express.static("public"));
app.use(cookieParser());

// ============================================
// IMAGE UPLOAD ENDPOINT - REGISTER FIRST!
// ============================================
// CRITICAL: These routes MUST be registered BEFORE any other routes
// to ensure they're matched before the catch-all 404 handler
// Handle OPTIONS for uploads endpoints (CORS preflight)
app.options(/^\/uploads\/(.+)$/, (req, res) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, OPTIONS, HEAD');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.sendStatus(200);
});

app.options('/api/v1/uploads/:filename', (req, res) => {
  console.log('🔵 OPTIONS request for /api/v1/uploads endpoint');
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, OPTIONS, HEAD');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.sendStatus(200);
});

// Debug middleware to log ALL requests to /uploads (BEFORE the route handler)
app.use('/uploads', (req, res, next) => {
  console.log('🔍 Middleware hit for /uploads');
  console.log('📋 Method:', req.method);
  console.log('📋 URL:', req.url);
  console.log('📋 Path:', req.path);
  console.log('📋 Original URL:', req.originalUrl);
  next();
});

// Debug middleware to log ALL requests to /api/v1/uploads
app.use('/api/v1/uploads', (req, res, next) => {
  console.log('🔍 Middleware hit for /api/v1/uploads');
  console.log('📋 Method:', req.method);
  console.log('📋 URL:', req.url);
  console.log('📋 Path:', req.path);
  next();
});

// Serve uploaded images through API endpoint (more reliable than static files)
// MUST be registered BEFORE static files and other API routes

// NEW CLEAN APPROACH: Handle ANY filename with special characters
// Use regex route to capture everything after /uploads/ (handles any filename)
app.get(/^\/uploads\/(.+)$/, (req, res) => {
  console.log('🟢🟢🟢 GET request received for /uploads endpoint - ROUTE MATCHED!');
  console.log('📋 Full request path:', req.path);
  console.log('📋 Request URL:', req.url);
  console.log('📋 Request params:', req.params);
  console.log('📋 Request method:', req.method);
  console.log('📋 Original URL:', req.originalUrl);
  
  const fs = require('fs');
  
  try {
    // Extract filename from regex match (req.params[0] contains the matched group)
    let filename = req.params[0] || req.path.replace('/uploads/', '');
    
    // Remove query string if present
    if (filename.includes('?')) {
      filename = filename.split('?')[0];
    }
    
    // Decode URL-encoded filename (handles %20 for spaces, etc.)
    try {
      filename = decodeURIComponent(filename);
    } catch (e) {
      // If decoding fails, try without decoding
      console.warn('⚠️ Could not decode, trying as-is:', filename);
    }
    
    if (!filename) {
      return res.status(400).json({ success: false, message: 'Filename required' });
    }
    
    const uploadsDir = path.resolve(__dirname, 'uploads');
    const uploadsDirCwd = path.join(process.cwd(), 'uploads');
    let filePath = path.join(uploadsDir, filename);
    
    // Normalize path separators (Windows uses \, Unix uses /)
    filePath = path.normalize(filePath);
    
    // Security: Ensure file is within uploads directory (prevent directory traversal)
    if (!filePath.startsWith(uploadsDir)) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    
    // Try exact match first
    if (fs.existsSync(filePath)) {
      return serveFile(filePath, filename, res);
    }
    
    // Try with just the basename (in case path had extra segments)
    const baseName = path.basename(filename);
    if (baseName !== filename) {
      const altPath = path.join(uploadsDir, baseName);
      if (fs.existsSync(altPath)) {
        return serveFile(altPath, baseName, res);
      }
    }
    
    // Case-insensitive + recursive search; try both uploads locations (__dirname vs cwd)
    function findFileRecursive(dir, targetName) {
      if (!fs.existsSync(dir)) return null;
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      const targetLower = targetName.toLowerCase();
      for (const e of entries) {
        const fullPath = path.join(dir, e.name);
        if (e.isFile()) {
          if (e.name.toLowerCase() === targetLower) return { fullPath, name: e.name };
          try {
            if (decodeURIComponent(e.name).toLowerCase() === targetLower) return { fullPath, name: e.name };
          } catch (_) {}
        } else if (e.isDirectory()) {
          const found = findFileRecursive(fullPath, targetName);
          if (found) return found;
        }
      }
      return null;
    }
    
    try {
      let found = findFileRecursive(uploadsDir, filename) || findFileRecursive(uploadsDir, baseName);
      if (!found && uploadsDir !== uploadsDirCwd) {
        found = findFileRecursive(uploadsDirCwd, filename) || findFileRecursive(uploadsDirCwd, baseName);
      }
      if (found) {
        const resolved = path.resolve(found.fullPath);
        if (resolved.startsWith(path.resolve(uploadsDir)) || resolved.startsWith(path.resolve(uploadsDirCwd))) {
          return serveFile(found.fullPath, found.name, res);
        }
      }
    } catch (dirErr) {
      console.error('Error searching directory:', dirErr);
    }
    
    // File not found
    res.status(404).json({ 
      success: false, 
      message: 'File not found',
      requested: filename
    });
    
  } catch (error) {
    console.error('Error serving file:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Helper function to serve file
function serveFile(filePath, filename, res) {
  const fs = require('fs');
  
  // Set CORS headers
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  res.header('Cache-Control', 'public, max-age=3600');
  
  // Determine content type
  const ext = path.extname(filename).toLowerCase();
  const contentTypes = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml'
  };
  const contentType = contentTypes[ext] || 'application/octet-stream';
  
  res.contentType(contentType);
  
  // Try sendFile first (more efficient)
  res.sendFile(filePath, (err) => {
    if (err) {
      // Fallback: read and send file directly
      try {
        const fileData = fs.readFileSync(filePath);
        res.contentType(contentType);
        res.send(fileData);
      } catch (readErr) {
        console.error('Error reading file:', readErr);
        res.status(500).json({ success: false, message: 'Error serving file' });
      }
    }
  });
}

// Keep old endpoint for backward compatibility
app.get('/api/v1/uploads/:filename', (req, res) => {
  console.log('🟢 GET request received for uploads endpoint');
  console.log('📋 Full request path:', req.path);
  console.log('📋 Request URL:', req.url);
  console.log('📋 Request params:', req.params);
  console.log('📋 Request method:', req.method);
  console.log('📋 Original URL:', req.originalUrl);
  
  try {
    // Extract filename from params
    let filename = req.params.filename;
    
    // Remove query string if present in filename
    if (filename && filename.includes('?')) {
      filename = filename.split('?')[0];
    }
    
    // Decode URL-encoded filename
    if (filename) {
      try {
        filename = decodeURIComponent(filename);
      } catch (e) {
        console.warn('⚠️ Could not decode filename, using as-is:', filename);
      }
    }
    
    if (!filename) {
      console.error('❌ No filename provided');
      return res.status(400).json({
        success: false,
        message: 'Filename is required'
      });
    }
    
    // Use absolute path for sendFile
    const filePath = path.resolve(__dirname, 'uploads', filename);
    const fs = require('fs');
    
    console.log(`📸 Image request received: ${filename}`);
    console.log(`📁 Resolved file path: ${filePath}`);
    
    // Set CORS headers FIRST
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    res.header('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour
    res.header('Pragma', 'public');
    
    if (fs.existsSync(filePath)) {
      // Determine content type from file extension
      const ext = path.extname(filename).toLowerCase();
      const contentTypes = {
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif',
        '.webp': 'image/webp',
        '.svg': 'image/svg+xml'
      };
      const contentType = contentTypes[ext] || 'application/octet-stream';
      
      console.log(`✅ Serving file: ${filename} as ${contentType}`);
      
      // Try sendFile first, fallback to readFile if it fails
      try {
        res.contentType(contentType);
        res.sendFile(filePath, {
          dotfiles: 'allow',
          headers: {
            'Access-Control-Allow-Origin': '*',
          }
        }, (err) => {
          if (err) {
            console.error(`❌ Error with sendFile, trying readFile:`, err.message);
            // Fallback: read file and send manually
            try {
              const fileData = fs.readFileSync(filePath);
              res.contentType(contentType);
              res.send(fileData);
              console.log(`✅ File sent successfully via readFile: ${filename}`);
            } catch (readErr) {
              console.error(`❌ Error reading file:`, readErr);
              if (!res.headersSent) {
                res.status(500).json({
                  success: false,
                  message: 'Error serving file',
                  error: readErr.message
                });
              }
            }
          } else {
            console.log(`✅ File sent successfully via sendFile: ${filename}`);
          }
        });
      } catch (sendFileErr) {
        console.error(`❌ Error with sendFile:`, sendFileErr);
        // Fallback: read file and send manually
        try {
          const fileData = fs.readFileSync(filePath);
          res.contentType(contentType);
          res.send(fileData);
          console.log(`✅ File sent successfully via readFile fallback: ${filename}`);
        } catch (readErr) {
          console.error(`❌ Error reading file:`, readErr);
          res.status(500).json({
            success: false,
            message: 'Error serving file',
            error: readErr.message
          });
        }
      }
    } else {
      console.error(`❌ File not found: ${filePath}`);
      console.error(`📂 Uploads directory: ${path.resolve(__dirname, 'uploads')}`);
      console.error(`📋 Listing files in uploads directory...`);
      
      // List files in uploads directory for debugging
      try {
        const uploadsDir = path.resolve(__dirname, 'uploads');
        if (fs.existsSync(uploadsDir)) {
          const files = fs.readdirSync(uploadsDir);
          console.log(`📁 Files in uploads directory:`, files);
        } else {
          console.error(`❌ Uploads directory does not exist: ${uploadsDir}`);
        }
      } catch (listError) {
        console.error(`❌ Error listing uploads directory:`, listError);
      }
      
      res.status(404).json({
        success: false,
        message: 'File not found',
        filename: filename,
        path: filePath
      });
    }
  } catch (error) {
    console.error('❌ Error in uploads endpoint:', error);
    console.error('❌ Error stack:', error.stack);
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error.message
      });
    }
  }
});

// Test endpoint to verify file access
app.get('/api/v1/test-upload/:filename', (req, res) => {
  const filename = req.params.filename;
  const filePath = path.join(__dirname, 'uploads', filename);
  const fs = require('fs');
  
  if (fs.existsSync(filePath)) {
    res.json({
      success: true,
      message: 'File exists',
      path: filePath,
      url: `${getApiUrl()}/uploads/${filename}`
    });
  } else {
    res.status(404).json({
      success: false,
      message: 'File not found',
      path: filePath,
      filename: filename
    });
  }
});

let server = http.createServer(app);

// Initialize Socket.IO after server setup
initializeSocket(server);

// Import your routes as usual
const googleAuthRoutes = require(`${__dirname}/routes/googleAuthRoutes`);
const superadminRouter = require(`${__dirname}/routes/superAdminRouter`);
const adminRouter = require(`${__dirname}/routes/adminRouter`);
const meetingRouter = require(`${__dirname}/routes/meetingRouter`);
const driverRouter = require(`${__dirname}/routes/driverRouter`);
const patientRouter = require(`${__dirname}/routes/patientRouter`);
const tripRouter = require(`${__dirname}/routes/tripRouter`);
const userRouter = require(`${__dirname}/routes/userRouter`);
const chatRouter = require(`${__dirname}/routes/chatRouter`);
const notificationRouter = require(`${__dirname}/routes/notificationRouter`)


// Add no-cache middleware for API routes (but exclude uploads endpoint)
const noCacheMiddleware = (req, res, next) => {
  // Skip no-cache for uploads endpoint (it has its own headers)
  if (req.path.startsWith('/api/v1/uploads/')) {
    return next();
  }
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
};
// Apply no-cache middleware to all API routes (but skip uploads)
app.use("/api", (req, res, next) => {
  // Skip middleware for uploads endpoint
  if (req.path.startsWith('/v1/uploads/')) {
    return next();
  }
  noCacheMiddleware(req, res, next);
});
app.use("/auth", noCacheMiddleware);

app.use("/auth", googleAuthRoutes);
app.use("/api/v1/chat", chatRouter)
app.use("/api/v1/superadmin", superadminRouter);
app.use("/api/v1/admin", adminRouter);
app.use("/api/v1/meeting", meetingRouter);
app.use("/api/v1/driver", driverRouter);
app.use("/api/v1/patient", patientRouter);
app.use("/api/v1/trip", tripRouter);
app.use("/api/v1/user", userRouter);
app.use("/api/v1/notification", notificationRouter)

// Diagnostic endpoint to check JWT_SECRET (for debugging - remove in production if needed)
app.get("/api/v1/check-jwt-config", (req, res) => {
  const JWT_SECRET = require('./config/jwtSecret');
  res.json({
    success: true,
    jwtSecretPreview: JWT_SECRET.substring(0, 10) + '...',
    jwtSecretLength: JWT_SECRET.length,
    usingEnvVar: !!process.env.JWT_SECRET,
    nodeEnv: process.env.NODE_ENV || 'not set'
  });
});

// Base API route for health check
app.get("/api/v1", (req, res) => {
  res.json({ 
    status: "success", 
    message: "Triphog API is running",
    version: "1.0.0",
    cors: "enabled",
    origin: req.headers.origin,
    endpoints: {
      auth: "/auth",
      superadmin: "/api/v1/superadmin",
      admin: "/api/v1/admin",
      meeting: "/api/v1/meeting",
      driver: "/api/v1/driver",
      patient: "/api/v1/patient",
      trip: "/api/v1/trip",
      user: "/api/v1/user",
      chat: "/api/v1/chat",
      notification: "/api/v1/notification"
    }
  });
});

// CORS test endpoint
app.get("/api/v1/cors-test", (req, res) => {
  res.json({
    success: true,
    message: "CORS is working correctly",
    origin: req.headers.origin,
    timestamp: new Date().toISOString()
  });
});

// For Create admin password
app.get('/admin/user/createpassword/*', (req, res) => {
  res.redirect(getFrontendUrl() + '/admin/create-password/' + req.params[0]);
});
// For Create subadmin password
app.get('/admin/user/createpassword/*', (req, res) => {
  res.redirect(getFrontendUrl() + '/admin/user/createpassword/' + req.params[0]);
});
// For Create Driver password
app.get('/driver/createpassword/*', (req, res) => {
  res.redirect(getFrontendUrl() + '/driver/createpassword/' + req.params[0]);
});

// Global error handler - MUST set CORS headers even on errors
app.use((err, req, res, next) => {
  console.error('Global error handler:', err);
  
  // Always set CORS headers even on errors
  const origin = req.headers.origin;
  if (!origin || allowedOrigins.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin || '*');
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  }
  
  // CORS error
  if (err.message === 'Not allowed by CORS') {
    return res.status(403).json({
      success: false,
      message: 'CORS policy violation',
      origin: req.headers.origin
    });
  }
  
  // Other errors
  const statusCode = err.statusCode || 500;
  res.status(statusCode).json({
    success: false,
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  });
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Catch-all 404 handler - MUST be last
app.use("*", (req, resp) => {
  console.log(`404 - Route not found: ${req.method} ${req.originalUrl}`);
  console.log(`404 - Request path: ${req.path}`);
  console.log(`404 - Request URL: ${req.url}`);
  console.log(`404 - Request base URL: ${req.baseUrl}`);
  
  // Check if this is an uploads request that should have been caught
  if (req.path.startsWith('/uploads/') || req.originalUrl.startsWith('/uploads/')) {
    console.error('❌❌❌ UPLOADS REQUEST CAUGHT BY CATCH-ALL!');
    console.error('❌ This should have been handled by /uploads/:filename route');
    console.error('❌ Request details:', {
      method: req.method,
      path: req.path,
      originalUrl: req.originalUrl,
      url: req.url,
      params: req.params
    });
  }
  
  // Set CORS headers even for 404 responses
  const origin = req.headers.origin;
  if (!origin || allowedOrigins.includes(origin)) {
    resp.header('Access-Control-Allow-Origin', origin || '*');
    resp.header('Access-Control-Allow-Credentials', 'true');
    resp.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
    resp.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  }
  
  resp.status(404).json({ status: "fail", message: "Page Not Found" });
});

module.exports = { app, server };
