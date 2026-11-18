import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import User from "../models/User.js";

const router = Router();
const demoUsers = new Map();
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const publicUser = (user) => ({
  _id: String(user._id || user.email),
  name: user.name,
  email: user.email,
});

function issueToken(user) {
  return jwt.sign({ sub: String(user._id || user.email) }, process.env.AUTH_TOKEN_SECRET, {
    expiresIn: "7d",
  });
}

function authenticate(req, res, next) {
  const authorization = req.get("authorization") || "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!token) return res.status(401).json({ message: "Please sign in to continue." });
  try {
    req.authUserId = jwt.verify(token, process.env.AUTH_TOKEN_SECRET).sub;
    return next();
  } catch {
    return res.status(401).json({ message: "Your session has expired. Please sign in again." });
  }
}

router.post("/register", async (req, res, next) => {
  try {
    const name = typeof req.body.name === "string" ? req.body.name.trim() : "";
    const email = typeof req.body.email === "string" ? req.body.email.trim().toLowerCase() : "";
    const password = typeof req.body.password === "string" ? req.body.password : "";
    if (!name || name.length > 80 || email.length > 254 || !emailPattern.test(email)) {
      return res.status(400).json({ message: "Enter your name and a valid email address." });
    }
    if (password.length < 8 || Buffer.byteLength(password, "utf8") > 72) {
      return res.status(400).json({ message: "Your password must be at least 8 characters and no more than 72 bytes." });
    }

    const existing = mongoose.connection.readyState === 1
      ? await User.exists({ email })
      : demoUsers.has(email);
    if (existing) return res.status(409).json({ message: "An account with this email already exists. Please sign in." });

    const passwordHash = await bcrypt.hash(password, 12);
    const user = mongoose.connection.readyState === 1
      ? await User.create({ name, email, passwordHash })
      : { name, email, passwordHash };
    if (mongoose.connection.readyState !== 1) demoUsers.set(email, user);
    return res.status(201).json({ user: publicUser(user), token: issueToken(user) });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ message: "An account with this email already exists. Please sign in." });
    }
    return next(error);
  }
});

router.post("/login", async (req, res, next) => {
  try {
    const email = typeof req.body.email === "string" ? req.body.email.trim().toLowerCase() : "";
    const password = typeof req.body.password === "string" ? req.body.password : "";
    if (email.length > 254 || !emailPattern.test(email) || !password || Buffer.byteLength(password, "utf8") > 72) {
      return res.status(400).json({ message: "Enter a valid email address and password." });
    }

    const user = mongoose.connection.readyState === 1
      ? await User.findOne({ email }).select("+passwordHash")
      : demoUsers.get(email);
    const passwordMatches = user ? await bcrypt.compare(password, user.passwordHash) : false;
    if (!passwordMatches) return res.status(401).json({ message: "The email or password is incorrect." });
    return res.json({ user: publicUser(user), token: issueToken(user) });
  } catch (error) {
    return next(error);
  }
});

router.get("/me", authenticate, async (req, res, next) => {
  try {
    const user = mongoose.connection.readyState === 1
      ? await User.findById(req.authUserId)
      : [...demoUsers.values()].find((item) => item.email === req.authUserId);
    if (!user) return res.status(401).json({ message: "Your account could not be found. Please sign in again." });
    return res.json({ user: publicUser(user) });
  } catch (error) {
    return next(error);
  }
});

export default router;
