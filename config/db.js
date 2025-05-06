const { Sequelize } = require("sequelize");
require("dotenv").config();

const sequelize = new Sequelize(process.env.DATABASE_URL, {
  dialect: "postgres",
  logging: false,
});

(async () => {
  try {
    await sequelize.authenticate();
    console.log("✅ Database connected.");
  } catch (err) {
    console.error("❌ Database connection error:", err);
  }
})();

module.exports = sequelize;
