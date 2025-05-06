const LocalStrategy = require('passport-local').Strategy;
const bcrypt = require('bcrypt');
const { User } = require('../models');

module.exports = function (passport) {
  passport.use(new LocalStrategy(async (username, password, done) => {
    try {
      const user = await User.findOne({ where: { username } });
      if (!user) return done(null, false, { message: 'Incorrect username.' });

      const isValid = await bcrypt.compare(password, user.password_hash);
      if (!isValid) return done(null, false, { message: 'Incorrect password.' });

      return done(null, user);
    } catch (err) {
      return done(err);
    }
  }));

  passport.serializeUser((user, done) => {
    done(null, user.id);
  });

  passport.deserializeUser(async (id, done) => {
    try {
      const user = await User.findByPk(id);
      done(null, user);
    } catch (err) {
      done(err);
    }
  });
};
