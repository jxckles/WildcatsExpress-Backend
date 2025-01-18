const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const app = express();

// Other imports remain the same...

// Define allowed origins
const allowedOrigins = [
  'https://wildcatsexpress.onrender.com',
  'http://localhost:5173' // Keep local development origin
];

// CORS configuration
app.use(cors({
  origin: function(origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) === -1) {
      const msg = 'The CORS policy for this site does not allow access from the specified Origin.';
      return callback(new Error(msg), false);
    }
    return callback(null, true);
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept']
}));

// Add security headers middleware
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS');
  res.header(
    'Access-Control-Allow-Headers',
    'Origin, X-Requested-With, Content-Type, Accept, Authorization'
  );
  next();
});

// Modified Login route with proper CORS handling
app.post("/Login", (req, res) => {
  const { email, password } = req.body;
  UserModel.findOne({ email: email })
    .then((user) => {
      if (user) {
        if (password === user.password) {
          const role = user.role;
          const userID = user._id;
          const userName = user.firstName + " " + user.lastName;
          
          const accessToken = jwt.sign(
            { email: email, role: role },
            "jwt-access-token-secret-key",
            { expiresIn: "7d" }
          );
          
          const refreshToken = jwt.sign(
            { email: email, role: role },
            "jwt-refresh-access-token-secret-key",
            { expiresIn: "7d" }
          );

          // Set cookies with proper configuration
          res.cookie("accessToken", accessToken, {
            maxAge: 15 * 60 * 1000,
            httpOnly: true,
            secure: true, // Enable for HTTPS
            sameSite: 'none', // Required for cross-origin cookies
            domain: '.onrender.com' // Adjust domain as needed
          });

          res.cookie("refreshToken", refreshToken, {
            maxAge: 2 * 24 * 60 * 60 * 1000,
            httpOnly: true,
            secure: true,
            sameSite: 'none',
            domain: '.onrender.com'
          });

          return res.json({ role, userID, userName });
        } else {
          return res.json("Incorrect password");
        }
      } else {
        return res.json("User does not exist");
      }
    })
    .catch((err) => {
      console.error('Login error:', err);
      return res.status(500).json({ message: "Server error" });
    });
});

// Start server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
