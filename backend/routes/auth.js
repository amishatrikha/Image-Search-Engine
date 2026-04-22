const express      = require("express");
const jwt          = require("jsonwebtoken");
const crypto       = require("crypto");
const nodemailer   = require("nodemailer");
const rateLimit    = require("express-rate-limit");
const User         = require("../models/User");

const router = express.Router();

// Stricter rate limit for auth endpoints (10 attempts per 15 min per IP)
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many attempts. Please try again later." }
});

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function generateToken(user) {
    return jwt.sign(
        { id: user._id, email: user.email, name: user.name },
        process.env.JWT_SECRET,
        { expiresIn: "7d" }
    );
}

/**
 * POST /api/auth/register
 */
router.post("/register", authLimiter, async (req, res) => {
    const { name, email, password } = req.body;

    if (!name || !email || !password)
        return res.status(400).json({ error: "All fields are required." });
    if (typeof name !== "string" || name.trim().length < 2)
        return res.status(400).json({ error: "Name must be at least 2 characters." });
    if (!EMAIL_REGEX.test(email))
        return res.status(400).json({ error: "Invalid email address." });
    if (typeof password !== "string" || password.length < 6)
        return res.status(400).json({ error: "Password must be at least 6 characters." });

    try {
        const exists = await User.findOne({ email: email.toLowerCase().trim() });
        if (exists)
            return res.status(409).json({ error: "An account with this email already exists." });

        const user  = await User.create({ name: name.trim(), email, password });
        const token = generateToken(user);
        res.status(201).json({ token, name: user.name, email: user.email });
    } catch (err) {
        console.error("Register error:", err.message);
        res.status(500).json({ error: "Registration failed. Please try again." });
    }
});

/**
 * POST /api/auth/login
 */
router.post("/login", authLimiter, async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password)
        return res.status(400).json({ error: "Email and password are required." });

    try {
        const user = await User.findOne({ email: email.toLowerCase().trim() });
        if (!user)
            return res.status(401).json({ error: "Invalid email or password." });

        const match = await user.comparePassword(password);
        if (!match)
            return res.status(401).json({ error: "Invalid email or password." });

        const token = generateToken(user);
        res.json({ token, name: user.name, email: user.email });
    } catch (err) {
        console.error("Login error:", err.message);
        res.status(500).json({ error: "Login failed. Please try again." });
    }
});

/**
 * POST /api/auth/forgot-password
 */
router.post("/forgot-password", authLimiter, async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "Email is required." });

    try {
        const user = await User.findOne({ email: email.toLowerCase().trim() });
        // Always respond OK to prevent email enumeration
        if (!user) return res.json({ message: "If that email exists, a reset link has been sent." });

        const token  = crypto.randomBytes(32).toString("hex");
        const expiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
        user.resetToken       = token;
        user.resetTokenExpiry = expiry;
        await user.save();

        const frontendUrl = process.env.FRONTEND_URL || "http://127.0.0.1:5500/Image-Search-Engine";
        const resetLink   = `${frontendUrl}/reset-password.html?token=${token}`;

        const transporter = nodemailer.createTransport({
            service: "gmail",
            auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
        });

        await transporter.sendMail({
            from: `"ImageSearch" <${process.env.EMAIL_USER}>`,
            to:   user.email,
            subject: "Reset your ImageSearch password",
            html: `
                <div style="font-family:sans-serif;max-width:480px;margin:auto">
                    <h2 style="color:#7c3aed">Reset your password</h2>
                    <p>Hi ${user.name},</p>
                    <p>Click the button below to reset your password. This link expires in <strong>1 hour</strong>.</p>
                    <a href="${resetLink}" style="display:inline-block;margin:20px 0;padding:12px 28px;background:linear-gradient(135deg,#7c3aed,#06b6d4);color:#fff;border-radius:8px;text-decoration:none;font-weight:bold">Reset Password</a>
                    <p style="color:#888;font-size:0.85rem">If you didn't request this, you can safely ignore this email.</p>
                </div>
            `
        });

        res.json({ message: "If that email exists, a reset link has been sent." });
    } catch (err) {
        console.error("Forgot password error:", err.message);
        res.status(500).json({ error: "Could not send reset email. Check your email config in .env." });
    }
});

/**
 * POST /api/auth/reset-password
 */
router.post("/reset-password", async (req, res) => {
    const { token, password } = req.body;
    if (!token || !password) return res.status(400).json({ error: "Token and new password are required." });
    if (password.length < 6)  return res.status(400).json({ error: "Password must be at least 6 characters." });

    try {
        const user = await User.findOne({
            resetToken:       token,
            resetTokenExpiry: { $gt: new Date() }
        });
        if (!user) return res.status(400).json({ error: "Reset link is invalid or has expired." });

        user.password          = password; // pre-save hook will hash it
        user.resetToken        = null;
        user.resetTokenExpiry  = null;
        await user.save();

        res.json({ message: "Password reset successfully. You can now sign in." });
    } catch (err) {
        console.error("Reset password error:", err.message);
        res.status(500).json({ error: "Password reset failed. Please try again." });
    }
});

module.exports = router;
