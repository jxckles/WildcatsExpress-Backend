const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const http = require("http");
const socketIo = require("socket.io");
const cookieParser = require("cookie-parser");
const jwt = require("jsonwebtoken");
const path = require("path");
const multer = require("multer");

// Import all models
const UserModel = require("./models/User");
const MenuItem = require("./models/Menu");
const Order = require("./models/Order");
const ClientOrder = require("./models/ClientOrder");

const app = express();
const server = http.createServer(app);

// Define allowed origins
const allowedOrigins = [
  'https://wildcatsexpress.onrender.com',
  'http://localhost:5173'
];

// Setup Socket.IO
const io = socketIo(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"],
    credentials: true
  }
});

// Multer setup for image storage
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "public/Images");
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + path.extname(file.originalname));
  },
});

const upload = multer({ storage: storage });

// CORS and middleware setup
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
app.use("/Images", express.static(path.join(__dirname, "public/Images")));

// Authentication Middleware
const verifyToken = (req, res, next) => {
  const accessToken = req.cookies.accessToken;
  
  if (!accessToken) {
    return res.status(401).json({ message: "No token provided" });
  }

  try {
    const decoded = jwt.verify(accessToken, "jwt-access-token-secret-key");
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
};

// Admin Middleware
const isAdmin = (req, res, next) => {
  if (req.user.role !== "admin") {
    return res.status(403).json({ message: "Access denied: Admin only" });
  }
  next();
};

// Auth Routes
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
            { email: email, role: role, userId: userID },
            "jwt-access-token-secret-key",
            { expiresIn: "1d" }
          );
          
          const refreshToken = jwt.sign(
            { email: email, role: role, userId: userID },
            "jwt-refresh-access-token-secret-key",
            { expiresIn: "7d" }
          );

          res.cookie("accessToken", accessToken, {
            maxAge: 24 * 60 * 60 * 1000, // 1 day
            httpOnly: true,
            secure: true,
            sameSite: 'none',
            domain: '.onrender.com'
          });

          res.cookie("refreshToken", refreshToken, {
            maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
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

app.post("/logout", (req, res) => {
  res.clearCookie("accessToken", {
    httpOnly: true,
    secure: true,
    sameSite: 'none',
    domain: '.onrender.com'
  });
  res.clearCookie("refreshToken", {
    httpOnly: true,
    secure: true,
    sameSite: 'none',
    domain: '.onrender.com'
  });
  res.json({ message: "Logged out successfully" });
});

app.get("/check-auth", verifyToken, (req, res) => {
  res.json({ 
    authenticated: true, 
    user: req.user 
  });
});

// Admin Routes
app.get("/admin", verifyToken, isAdmin, (req, res) => {
  res.json({ message: "Admin access granted", user: req.user });
});

app.get("/admin/users", verifyToken, isAdmin, async (req, res) => {
  try {
    const users = await UserModel.find({}, '-password');
    res.json(users);
  } catch (error) {
    res.status(500).json({ message: "Error fetching users" });
  }
});

app.get("/admin/orders", verifyToken, isAdmin, async (req, res) => {
  try {
    const orders = await Order.find({}).populate('userId');
    res.json(orders);
  } catch (error) {
    res.status(500).json({ message: "Error fetching orders" });
  }
});

// Menu Routes
app.get("/menu", async (req, res) => {
  try {
    const items = await MenuItem.find();
    res.json(items);
  } catch (err) {
    console.error("Error fetching menu items:", err);
    res.status(500).json({ message: "Error fetching menu items" });
  }
});

app.post("/menu", verifyToken, isAdmin, upload.single("image"), async (req, res) => {
  try {
    const item = new MenuItem({
      ...req.body,
      image: req.file ? `/Images/${req.file.filename}` : null,
    });
    const savedItem = await item.save();
    res.json(savedItem);
  } catch (err) {
    res.status(400).json(err);
  }
});

app.put("/menu/:id", verifyToken, isAdmin, upload.single("image"), async (req, res) => {
  try {
    const updatedItem = await MenuItem.findByIdAndUpdate(
      req.params.id,
      {
        ...req.body,
        ...(req.file && { image: `/Images/${req.file.filename}` }),
      },
      { new: true }
    );
    res.json(updatedItem);
  } catch (err) {
    res.status(400).json(err);
  }
});

app.delete("/menu/:id", verifyToken, isAdmin, async (req, res) => {
  try {
    await MenuItem.findByIdAndDelete(req.params.id);
    res.json({ message: "Item deleted successfully" });
  } catch (err) {
    res.status(400).json(err);
  }
});

// Orders Routes
app.get("/orders", verifyToken, async (req, res) => {
  try {
    const userId = req.query.userId;
    let orders;
    if (req.user.role === "admin") {
      orders = await Order.find({});
    } else {
      orders = await Order.find({ userId: userId });
    }
    res.json(orders);
  } catch (error) {
    console.error("Error fetching orders:", error);
    res.status(500).json({ message: "Failed to fetch orders" });
  }
});

app.post("/orders", verifyToken, async (req, res) => {
  try {
    const newOrder = new Order({
      ...req.body,
      userId: req.user.userId
    });
    const savedOrder = await newOrder.save();
    io.emit("newOrder", savedOrder);
    res.status(201).json(savedOrder);
  } catch (error) {
    console.error("Error creating order:", error);
    res.status(500).json({ message: "Failed to create order" });
  }
});

app.put("/orders/:id", verifyToken, async (req, res) => {
  try {
    const updatedOrder = await Order.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );
    io.emit("orderUpdated", updatedOrder);
    res.json(updatedOrder);
  } catch (error) {
    res.status(400).json({ message: "Error updating order" });
  }
});

// Client Orders Routes
app.get("/clientorders", verifyToken, async (req, res) => {
  try {
    const orders = await ClientOrder.find();
    res.json(orders);
  } catch (error) {
    console.error("Error fetching client orders:", error);
    res.status(500).json({ message: "Failed to fetch client orders" });
  }
});

app.post("/clientorders", verifyToken, async (req, res) => {
  try {
    const newOrder = new ClientOrder({
      ...req.body,
      userId: req.user.userId
    });
    const savedOrder = await newOrder.save();
    io.emit("newClientOrder", savedOrder);
    res.status(201).json(savedOrder);
  } catch (error) {
    console.error("Error creating client order:", error);
    res.status(500).json({ message: "Failed to create client order" });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: "Something went wrong!" });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ message: "Route not found" });
});

// MongoDB connection
mongoose.connect(
  "mongodb+srv://castroy092003:7xiHqTSiUKH0ZIf4@wildcats-food-express.7w2snhk.mongodb.net/User?retryWrites=true&w=majority&appName=Wildcats-Food-Express"
).then(() => {
  console.log("Connected to MongoDB");
}).catch((err) => {
  console.error("MongoDB connection error:", err);
});

// Start server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

module.exports = { app, server, io };