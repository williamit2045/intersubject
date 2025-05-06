// models/index.js
require('dotenv').config(); // 👈 This loads your .env file

const { Sequelize, DataTypes } = require('sequelize');

// Configure Sequelize with Neon PostgreSQL
const sequelize = new Sequelize(process.env.DATABASE_URL, {
  dialect: 'postgres',
  dialectOptions: {
    ssl: {
      require: true,
      rejectUnauthorized: false
    }
  },
  logging: false
});

// Define User model
const User = sequelize.define('User', {
  username: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true
  },
  password_hash: {
    type: DataTypes.STRING,
    allowNull: false
  },
  email: {
    type: DataTypes.STRING,
    allowNull: true
  }
}, {
  tableName: 'users',
  timestamps: true
});

// Define Expression model
const Expression = sequelize.define('Expression', {
  text: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true
  },
  set: {
    type: DataTypes.STRING,
    allowNull: true // e.g., 'universal', 'local', etc.
  }
}, {
  tableName: 'expressions',
  timestamps: true
});

// Define UserExpression join table
const UserExpression = sequelize.define('UserExpression', {
  // Additional fields can be added here if needed
}, {
  tableName: 'user_expressions',
  timestamps: true
});

// Set up associations
User.belongsToMany(Expression, { through: UserExpression });
Expression.belongsToMany(User, { through: UserExpression });
UserExpression.belongsTo(User);
UserExpression.belongsTo(Expression);

// REMOVE the line above and keep ONLY this one 👇
module.exports = {
  Sequelize,
  sequelize,
  User,
  Expression,
  UserExpression
};



