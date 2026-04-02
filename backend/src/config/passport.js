import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { User } from "../models/user.model.js";
import { generateAccessToken } from "../utils/auth.middleware.js";
import crypto from "crypto";

// Build callback URL - use BACKEND_URL for production, relative for dev
const callbackURL = process.env.BACKEND_URL
    ? `${process.env.BACKEND_URL}/api/v1/users/auth/google/callback`
    : "/api/v1/users/auth/google/callback";

passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: callbackURL
  },
  async (accessToken, refreshToken, profile, done) => {
    try {
      let user = await User.findOne({ googleId: profile.id });

      if (!user) {
        // Check if email already registered normally
        user = await User.findOne({ username: profile.emails[0].value });
        if (user) {
          // Link Google to existing account
          user.googleId = profile.id;
          await user.save();
        } else {
          // Create new user
          user = await User.create({
            name: profile.displayName,
            username: profile.emails[0].value,
            password: crypto.randomBytes(32).toString("hex"), // dummy password
            googleId: profile.id
          });
        }
      }

      // Generate JWT token instead of random string
      const token = generateAccessToken(user._id.toString(), user.username);

      return done(null, { token, userId: user._id, username: user.username });
    } catch (err) {
      return done(err, null);
    }
  }
));

export default passport;