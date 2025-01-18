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
app.use("/api/Images", express.static(path.join(__dirname, "public/Images")));

// Menu Routes
app.get("/api/menu", async (req, res) => {
  try {
    const items = await MenuItem.find();
    res.json(items);
  } catch (err) {
    console.error("Error fetching menu items:", err);
    res.status(500).json({ message: "Error fetching menu items" });
  }
});

app.post("/api/menu", upload.single("image"), async (req, res) => {
  try {
    const item = new MenuItem({
      ...req.body,
      image: req.file ? `/api/Images/${req.file.filename}` : null,
    });
    const savedItem = await item.save();
    res.json(savedItem);
  } catch (err) {
    res.status(400).json(err);
  }
});

// Orders Routes
app.get("/api/orders", async (req, res) => {
  try {
    const userId = req.query.userId;
    let orders;
    if (userId === "668e8d77cfc185e3ac2d32a5") {
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

app.post("/api/orders", async (req, res) => {
  try {
    const newOrder = new Order(req.body);
    const savedOrder = await newOrder.save();
    io.emit("newOrder", savedOrder);
    res.status(201).json(savedOrder);
  } catch (error) {
    console.error("Error creating order:", error);
    res.status(500).json({ message: "Failed to create order" });
  }
});

// Client Orders Routes
app.get("/api/clientorders", async (req, res) => {
  try {
    const orders = await ClientOrder.find();
    res.json(orders);
  } catch (error) {
    console.error("Error fetching client orders:", error);
    res.status(500).json({ message: "Failed to fetch client orders" });
  }
});

app.post("/api/clientorders", async (req, res) => {
  try {
    const newOrder = new ClientOrder(req.body);
    const savedOrder = await newOrder.save();
    res.status(201).json(savedOrder);
  } catch (error) {
    console.error("Error creating client order:", error);
    res.status(500).json({ message: "Failed to create client order" });
  }
});

// Login route
app.post("/api/Login", (req, res) => {
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