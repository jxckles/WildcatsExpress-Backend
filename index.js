const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const http = require("http");
const socketIo = require("socket.io");
const app = express();

// Create HTTP server
const server = http.createServer(app);

// Define allowed origins
const allowedOrigins = [
  'https://wildcatsexpress.onrender.com',
  'http://localhost:5173'
];

// Setup Socket.IO with CORS
const io = socketIo(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"],
    credentials: true
  }
});

// Socket.IO connection handling
io.on("connection", (socket) => {
  console.log("New client connected");

  socket.on("authenticate", (userId) => {
    socket.userId = userId;
    console.log(`User ${userId} authenticated`);
  });

  socket.on("disconnect", () => {
    console.log("Client disconnected");
  });
});

// CORS configuration
app.use(cors({
  origin: function(origin, callback) {
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept']
}));

app.use(express.json());
app.use(cookieParser());

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

// Login route
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

          res.cookie("accessToken", accessToken, {
            maxAge: 15 * 60 * 1000,
            httpOnly: true,
            secure: true,
            sameSite: 'none',
            domain: '.onrender.com'
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

// MongoDB connection
mongoose.connect(
  "mongodb+srv://castroy092003:7xiHqTSiUKH0ZIf4@wildcats-food-express.7w2snhk.mongodb.net/User?retryWrites=true&w=majority&appName=Wildcats-Food-Express"
);

// Start server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

// Export for potential testing or external use
module.exports = { app, server, io };
