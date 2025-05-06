const express = require("express");
const passport = require("passport");
const bcrypt = require("bcryptjs");
const { User, Expression } = require("../models");
const router = express.Router();

// GET login should redirect to home with login overlay
router.get("/login", (req, res) => {
  if (req.isAuthenticated()) {
    return res.redirect("/personal");
  }
  res.render("home", {
    title: "Home",
    pageStyle: "home",
    showLoginOverlay: true,
    messages: req.flash()
  });
});

router.get("/register", (req, res) => {
  if (req.isAuthenticated()) {
    return res.redirect("/personal");
  }
  res.render("home", {
    title: "Home",
    pageStyle: "home",
    showRegisterOverlay: true,
    messages: req.flash()
  });
});


router.post("/register", async (req, res) => {
  try {
    let { username, password, email } = req.body;
    username = username.trim();

    if (!username || !password) {
      req.flash("error", "Username and password are required.");
      return res.redirect("/auth/register");
    }

    const existingUser = await User.findOne({ where: { username } });
    if (existingUser) {
      req.flash("error", "Username already exists.");
      return res.redirect("/auth/register");
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = await User.create({
      username,
      password_hash: hashedPassword,
      email: email || null
    });

    // 🔗 Join all universal expressions automatically
    const universalExpressions = await Expression.findAll({
      where: { set: 'universal' }
    });
    await newUser.addExpressions(universalExpressions);

    // ✳️ Handle demographic-derived expressions
    const demographics = req.body.demographic || {};
    const demographicExpressions = [];

    for (const [key, value] of Object.entries(demographics)) {
      if (!value || !value.trim()) continue;

      let expressionText;

      switch (key) {
        case 'age':
          expressionText = `I am age ${value}`;
          break;
        case 'gender':
          expressionText = `I identify as ${value}`;
          break;
        case 'ethnicity':
          expressionText = `I am culturally ${value}`;
          break;
        case 'region':
          expressionText = `I am from ${value}`;
          break;
        case 'languages':
          value.split(',').map(v => v.trim()).forEach(lang => {
            if (lang) {
              const langClean = lang.charAt(0).toUpperCase() + lang.slice(1).toLowerCase();
              demographicExpressions.push(`I speak ${langClean}`);
            }
          });
          continue;
        case 'religion':
          expressionText = `I am ${value}`;
          break;
        case 'education':
          expressionText = `I have a ${value}`;
          break;
        case 'occupation':
          expressionText = `I work in ${value}`;
          break;
        case 'politics':
          expressionText = `I lean ${value}`;
          break;
        case 'orientation':
          expressionText = `I am ${value}`;
          break;
        default:
          continue;
      }

      if (expressionText) demographicExpressions.push(expressionText);
    }

    for (const raw of demographicExpressions) {
      const cleaned = raw.replace(/\s+/g, ' ').trim();
      const expressionText = cleaned.charAt(0).toUpperCase() + cleaned.slice(1).toLowerCase();
      const [expression] = await Expression.findOrCreate({ where: { text: expressionText } });
      await newUser.addExpression(expression);
    }

    req.flash("success", "Registration successful! You may now log in.");
    return res.redirect("/auth/login");

  } catch (error) {
    console.error("Registration error:", error);
    req.flash("error", "Registration failed. Please try again.");
    return res.redirect("/auth/register");
  }
});


// Login
router.post("/login", (req, res, next) => {
  passport.authenticate("local", (err, user, info) => {
    if (err) {
      console.error("Authentication error:", err);
      return res.status(500).json({ error: "Authentication error" });
    }

    if (!user) {
      return res.status(401).json({ error: info.message || "Invalid credentials" });
    }

    req.logIn(user, (err) => {
      if (err) {
        console.error("Login error:", err);
        return res.status(500).json({ error: "Login error" });
      }

      return res.redirect("/personal");
    });
  })(req, res, next);
});

// Logout
router.get("/logout", (req, res, next) => {
  req.logout((err) => {
    if (err) {
      console.error("Logout error:", err);
      return next(err);
    }
    res.redirect("/");
  });
});

const ensureAuthenticated = (req, res, next) => {
  if (req.isAuthenticated()) {
    return next();
  }
  res.status(401).json({ error: "Please log in to access this page" });
};

module.exports = router;
