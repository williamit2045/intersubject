// INTER-SUBJECT/app.js

require("dotenv").config();
const express = require("express");
const session = require("express-session");
const flash = require("connect-flash");
const passport = require("passport");
const path = require("path");
const morgan = require("morgan");
const SequelizeStore = require("connect-session-sequelize")(session.Store);
const { sequelize } = require("./models");
require("./config/db"); // Ensure database connection is established at startup

const app = express();

// Validate environment variables
if (!process.env.SESSION_SECRET) {
    console.error("❌ SESSION_SECRET is missing from .env");
    process.exit(1);
}

// Set EJS as the templating engine
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// Middleware
app.use(morgan("dev")); // Logs requests
app.use(express.urlencoded({ extended: true })); // Parses form data
app.use(express.json()); // Parses JSON requests
app.use(express.static("public"));

// 🔐 Setup Sequelize session store and sync it
const sessionStore = new SequelizeStore({ db: sequelize });
app.use(session({ 
    secret: process.env.SESSION_SECRET, 
    store: sessionStore,
    resave: false, 
    saveUninitialized: false 
}));
sessionStore.sync(); // ✅ Ensures Sessions table exists

app.use(flash());
require('./config/passport')(passport); // Initialize strategy before use
app.use(passport.initialize());
app.use(passport.session());

// 🔹 Ensure `user` is available in all views BEFORE routes execute
app.use((req, res, next) => {
    res.locals.user = req.user || null;
    next();
});

// Routes
app.use("/", require("./routes/main"));
app.use("/auth", require("./routes/auth"));

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));
