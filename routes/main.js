// 📔 routes/main.js
const express = require("express");

const models = require("../models");
const { Expression, User, UserExpression } = models;
const Sequelize = models.Sequelize;
const { Op } = Sequelize;

const router = express.Router();

////

async function hydrateExpressionsWithMembership(expressions, userId) {
  const expressionIds = expressions.map(e => e.id);

  // Count members for each expression
  const memberCounts = await Promise.all(
    expressionIds.map(async id => ({
      id,
      count: await UserExpression.count({ where: { ExpressionId: id } })
    }))
  );
  const countMap = Object.fromEntries(memberCounts.map(x => [x.id, x.count]));

  // Determine which expressions the user is in
  let userExpressionIds = [];
  if (userId) {
    const userLinks = await UserExpression.findAll({
      attributes: ['ExpressionId'],
      where: { UserId: userId }
    });
    userExpressionIds = userLinks.map(e => e.ExpressionId);
  }

  return expressions.map(expr => {
    // Properly handle different types of set values
    let setVal = expr.set;
    
    // For boolean values (true means universal)
    if (typeof setVal === 'boolean' && setVal === true) {
      setVal = 'universal';
    } 
    // For string values, keep as is
    else if (typeof setVal === 'string') {
      setVal = setVal.trim();
    } 
    // For all other types (including objects, undefined, null), set to null
    else {
      setVal = null;
    }
    
    return {
      id: expr.id,
      text: expr.text,
      set: setVal,
      memberCount: countMap[expr.id] || 0,
      isUserMember: userExpressionIds.includes(expr.id)
    };
  });
}

////

// ⛳️ Home
router.get("/", (req, res) => {
  res.render("home", { 
    title: "Intersubject", 
    pageStyle: "home" 
  });
});

// ℹ️ About Page
router.get("/about", (req, res) => {
  res.render("about", { 
    title: "About Intersubject",
    pageStyle: "about"
   });
});

// 🌱 Development Trajectories
router.get("/trajectories", (req, res) => {
  res.render("trajectories", {
    title: "Development Trajectories",
    pageStyle: "trajectories"
  });
});

// 🌍 Public 
router.get("/public", async (req, res) => {
  try {
    const rawExpressions = await Expression.findAll({
      where: { set: 'universal' },
      attributes: ['id', 'text', 'set'] // Explicitly include the set attribute
    });

    const expressions = await hydrateExpressionsWithMembership(rawExpressions, req.user?.id);

    res.render("dashboard", {
      title: "Public Dashboard",
      forExamination: expressions,
      results: [],
      page: 1,
      pageSize: 6,
      totalResults: 0,
      pageStyle: "dashboard"
    });
  } catch (err) {
    console.error("Public dashboard error:", err);
    res.status(500).send("Failed to load public dashboard");
  }
});


// 🧽 Personal Dashboard (Requires Login)
router.get("/personal", async (req, res) => {
  if (!req.isAuthenticated()) {
    return res.redirect("/");
  }

  try {
    const rawExpressions = await req.user.getExpressions({
      attributes: ['id', 'text', 'set'] // Explicitly include the set attribute
    });
    
    const expressions = await hydrateExpressionsWithMembership(rawExpressions, req.user.id);

    res.render("dashboard", {
      title: "Your Dashboard",
      forExamination: expressions,
      results: [],
      page: 1,
      pageSize: 6,
      totalResults: 0,
      pageStyle: "dashboard"
    });
  } catch (err) {
    console.error("Error loading personal dashboard:", err);
    res.status(500).send("Failed to load personal dashboard");
  }
});

router.get("/explore/:id", async (req, res) => {
  const exprId = parseInt(req.params.id);
  if (isNaN(exprId)) return res.redirect("/public");

  try {
    const expression = await Expression.findByPk(exprId, {
      attributes: ['id', 'text', 'set'] // Explicitly include the set attribute
    });
    
    if (!expression) return res.redirect("/public");

    // Convert to plain object for hydration including the set attribute
    const hydrated = await hydrateExpressionsWithMembership(
      [{ id: expression.id, text: expression.text, set: expression.set }],
      req.user?.id
    );

    res.render("dashboard", {
      title: `Exploring: ${expression.text}`,
      forExamination: hydrated,
      results: [],
      page: 1,
      pageSize: 6,
      totalResults: 0,
      pageStyle: "dashboard"
    });
  } catch (err) {
    console.error("Error loading explore view:", err);
    res.redirect("/public");
  }
});


// 🔍 Expression search (nav + dashboard autocomplete)
router.get("/api/expressions/search", async (req, res) => {
  const q = req.query.q?.trim();
  if (!q || q.length < 2) return res.json([]);

  try {
    const expressions = await Expression.findAll({
      where: {
        text: {
          [Op.iLike]: `%${q}%`
        }
      },
      attributes: ['id', 'text', 'set'], // Include set for the search results too
      limit: 10
    });

    res.json(expressions.map(e => ({
      id: e.id,
      text: e.text,
      set: e.set // Include the set in the response
    })));
  } catch (err) {
    console.error("Search error:", err);
    res.status(500).json([]);
  }
});

// ✍️ Handle Expression Creation (must be logged in)
router.post("/expressions/create", async (req, res) => {
  if (!req.isAuthenticated()) {
    return res.redirect("/");
  }

  const { text } = req.body;

  if (!text || text.trim().length === 0) {
    req.flash("error", "Expression cannot be empty.");
    return res.redirect("/personal");
  }

  try {
    const newExpression = await Expression.create({
      text: text.trim()
    });

    await req.user.addExpression(newExpression);
    res.redirect("/personal");
  } catch (err) {
    console.error("Expression creation error:", err);
    req.flash("error", "Failed to create expression.");
    res.redirect("/personal");
  }
});

// 🧠 Identify with an expression
router.post("/api/expressions/identify", async (req, res) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ success: false, error: "Authentication required" });
  }

  const { expressionId } = req.body;

  try {
    const existing = await UserExpression.findOne({
      where: {
        UserId: req.user.id,
        ExpressionId: expressionId
      }
    });

    if (existing) {
      return res.json({ success: true, message: "Already identified with this expression" });
    }

    await UserExpression.create({
      UserId: req.user.id,
      ExpressionId: expressionId
    });

    res.json({ success: true });
  } catch (err) {
    console.error("Identify error:", err);
    res.status(500).json({ success: false, error: "Failed to identify with expression" });
  }
});


// 🧠 Disidentify from an expression
router.post("/api/expressions/disidentify", async (req, res) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ success: false, error: "Authentication required" });
  }

  const { expressionId } = req.body;

  try {
    const result = await UserExpression.destroy({
      where: {
        UserId: req.user.id,
        ExpressionId: expressionId
      }
    });

    if (result === 0) {
      return res.json({ success: true, message: "No change — already disidentified" });
    }

    res.json({ success: true });
  } catch (err) {
    console.error("Disidentify error:", err);
    res.status(500).json({ success: false, error: "Failed to disidentify from expression" });
  }
});

// Explore Shared Expressions API
router.post("/api/explore", async (req, res) => {
  try {
    const { expressionIds, page = 1, pageSize = 30, includeHydration = false, filterUniversals = true } = req.body;

    const examiningIds = Array.isArray(expressionIds)
      ? expressionIds.map(id => parseInt(id, 10)).filter(id => !isNaN(id))
      : [];

    if (examiningIds.length === 0) {
      return res.json({ 
        html: `
          <div class="empty-results">
            <div class="no-results">No expressions selected</div>
            <p class="empty-tip">Try adding expressions to examine their relationships</p>
          </div>
        `,
        hydrationData: null
      });
    }

    // Include hydration data if requested
    let hydrationData = null;
    if (includeHydration) {
      const userExpressions = req.isAuthenticated() 
        ? await UserExpression.findAll({
            attributes: ['ExpressionId'],
            where: { UserId: req.user.id }
          })
        : [];
      
      const userExpressionIds = userExpressions.map(ue => ue.ExpressionId);
      
      const examinedExpressions = await Expression.findAll({
        where: { id: { [Op.in]: examiningIds } },
        attributes: ['id', 'text', 'set'] // Include set attribute here
      });
      
      // Count members for examined expressions
      const memberCounts = await Promise.all(
        examiningIds.map(async id => ({
          id,
          count: await UserExpression.count({ where: { ExpressionId: id } })
        }))
      );
      
      const countMap = Object.fromEntries(memberCounts.map(x => [x.id, x.count]));
      
      hydrationData = {
        expressions: examinedExpressions.map(expr => ({
          id: expr.id,
          text: expr.text,
          set: expr.set, // Include set in hydration data
          memberCount: countMap[expr.id] || 0,
          isUserMember: userExpressionIds.includes(expr.id)
        }))
      };
    }

    const { sequelize } = require("../models");

    // Step 1: Find users who belong to ALL examined expressions
    const strictUsersQuery = `
      SELECT "UserId"
      FROM "user_expressions"
      WHERE "ExpressionId" IN (${examiningIds.join(',')})
      GROUP BY "UserId"
      HAVING COUNT(DISTINCT "ExpressionId") = ${examiningIds.length}
    `;
    const [userRows] = await sequelize.query(strictUsersQuery);
    const userIds = userRows.map(row => row.UserId);

    if (userIds.length === 0) {
      return res.json({
        html: `
          <div class="empty-results">
            <div class="no-results">No matches yet</div>
            <p class="empty-tip">No one shares your exact identity — try removing one expression or wait for others to join.</p>
          </div>
        `,
        hydrationData
      });
    }

    // Step 2: Get all expressions those users identify with (excluding examined ones)
    // Calculate the percentage of overlap with the examination set users
    // Use optimized sorting with deterministic tie-breaking
    const expressionQuery = `
      SELECT 
        e.id,
        e.text,
        e."set",
        COUNT(DISTINCT ue."UserId") as member_count,
        (COUNT(DISTINCT ue."UserId") * 100.0 / ${userIds.length}) as overlap_percentage
      FROM "expressions" e
      JOIN "user_expressions" ue ON ue."ExpressionId" = e.id
      WHERE ue."UserId" IN (${userIds.join(',')})
      AND e.id NOT IN (${examiningIds.join(',')})
      GROUP BY e.id, e.text, e."set"
      ORDER BY 
        overlap_percentage DESC, 
        member_count DESC,
        e.id ASC
    `;
    const [expressions] = await sequelize.query(expressionQuery);

    // Step 3: Get universal expressions for filtering if needed
    const universalExpressions = await Expression.findAll({
      where: { set: 'universal' },
      attributes: ['id']
    });
    const universalIds = new Set(universalExpressions.map(e => e.id));
    
    // Apply filtering based on preference
    let filteredExpressions = expressions;
    if (filterUniversals) {
      filteredExpressions = expressions.filter(expr =>
        !(universalIds.has(expr.id) && !examiningIds.includes(expr.id))
      );
    }
    
    const universalCount = expressions.length - filteredExpressions.length;

    // Step 4: Which expressions is the current user in?
    let userExpressionIds = [];
    if (req.isAuthenticated()) {
      const userExpressions = await UserExpression.findAll({
        attributes: ['ExpressionId'],
        where: { UserId: req.user.id }
      });
      userExpressionIds = userExpressions.map(e => e.ExpressionId);
    }

    const allResults = filteredExpressions.map(expr => ({
      id: expr.id,
      text: expr.text,
      set: expr.set,
      memberCount: parseInt(expr.member_count, 10),
      overlapPercentage: parseFloat(expr.overlap_percentage).toFixed(1),
      isUserMember: userExpressionIds.includes(expr.id),
      isUniversal: universalIds.has(expr.id)
    }));

    const totalResults = allResults.length;
    const paginated = allResults.slice((page - 1) * pageSize, page * pageSize);

    res.render("partials/results", {
      results: paginated,
      totalResults,
      universalCount,
      pageSize,
      page,
      user: req.user,
      showPercentage: true,
      filterUniversals
    }, (err, html) => {
      if (err) {
        console.error("Render error:", err);
        return res.status(500).json({ html: "Render error", hydrationData });
      }

      res.json({
        html,
        hydrationData,
        universalCount,
        totalResults
      });
    });

  } catch (err) {
    console.error("Explore error:", err);
    res.status(500).json({
      html: `
        <div class="empty-results">
          <div class="no-results">Server error</div>
          <p class="empty-tip">${err.message}</p>
        </div>
      `,
      hydrationData: null
    });
  }
});

// User identifies with an expression
router.post("/api/expressions/identify", async (req, res) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ success: false, error: "Not authenticated" });
  }

  const { expressionId } = req.body;
  if (!expressionId) {
    return res.status(400).json({ success: false, error: "Expression ID required" });
  }

  try {
    const expression = await Expression.findByPk(expressionId, {
      attributes: ['id', 'text', 'set'] // Include set here too for consistency
    });
    
    if (!expression) {
      return res.status(404).json({ success: false, error: "Expression not found" });
    }

    // Check if already identifies
    const existing = await UserExpression.findOne({
      where: {
        UserId: req.user.id,
        ExpressionId: expressionId
      }
    });

    if (existing) {
      return res.json({ success: true, message: "Already identifying with this expression" });
    }

    // Create the association
    await UserExpression.create({
      UserId: req.user.id,
      ExpressionId: expressionId
    });

    res.json({ success: true });
  } catch (err) {
    console.error("Identify error:", err);
    res.status(500).json({ success: false, error: "Server error" });
  }
});

// User disidentifies with an expression
router.post("/api/expressions/disidentify", async (req, res) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ success: false, error: "Not authenticated" });
  }

  const { expressionId } = req.body;
  if (!expressionId) {
    return res.status(400).json({ success: false, error: "Expression ID required" });
  }

  try {
    // Remove the association
    await UserExpression.destroy({
      where: {
        UserId: req.user.id,
        ExpressionId: expressionId
      }
    });

    res.json({ success: true });
  } catch (err) {
    console.error("Disidentify error:", err);
    res.status(500).json({ success: false, error: "Server error" });
  }
});

router.get("/debug/user-expressions", async (req, res) => {
  try {
    const users = await User.findAll({
      include: { model: Expression }
    });

    for (const user of users) {
      console.log(`🧑 User ${user.id}:`);
      for (const expr of user.Expressions) {
        console.log(` - ${expr.text} (${expr.id})`);
      }
    }

    res.send("✅ Check your terminal for joined expressions.");
  } catch (err) {
    console.error("Debug route error:", err);
    res.status(500).send("Error in debug route.");
  }
});

router.get('/api/dashboard/hydrate', async (req, res) => {
  if (!req.isAuthenticated()) return res.status(401).json({ html: '', expressions: [] });

  try {
    const rawExpressions = await req.user.getExpressions({
      attributes: ['id', 'text', 'set'] // Explicitly include the 'set' attribute
    });
    
    const expressions = await hydrateExpressionsWithMembership(rawExpressions, req.user.id);

    // Create proper HTML with correct badge handling
    const html = expressions.map(expression => {
      // Hard-code the universal badge directly
      let badgeHtml = '';
      
      if (expression.set === 'universal') {
        badgeHtml = '<span class="cohort-badge universal-badge">UNIVERSAL</span>';
      } else if (expression.set) {
        const setClass = typeof expression.set === 'string' ? expression.set.toLowerCase() : 'unknown';
        const setName = typeof expression.set === 'string' ? expression.set.toUpperCase() : 'UNKNOWN';
        badgeHtml = `<span class="cohort-badge ${setClass}-badge">${setName}</span>`;
      }
      
      return `
        <div class="expression-card ${expression.isUserMember ? 'user-member' : ''}" 
             data-expression-id="${expression.id}" 
             data-section="card-details-${expression.id}">
          <span class="card-text">${expression.text}</span>
          <div class="expression-meta">
            ${badgeHtml}
            <span class="member-count">${expression.memberCount} members</span>
          </div>
          <button class="remove-expression">×</button>
        </div>
      `;
    }).join('');

    res.json({
      html,
      expressions
    });
  } catch (err) {
    console.error('Hydration error:', err);
    res.status(500).json({ html: '', expressions: [] });
  }
});

module.exports = router;