require("dotenv").config();
const express    = require("express");
const cors       = require("cors");
const rateLimit  = require("express-rate-limit");
const mongoose   = require("mongoose");

const path         = require("path");
const imagesRouter = require("./routes/images");
const authRouter   = require("./routes/auth");

const app         = express();
const PORT        = process.env.PORT || 5000;
const FRONTEND    = path.join(__dirname, "..");

/* ── MongoDB ───────────────────────────────── */
mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log("MongoDB connected"))
    .catch(err => {
        console.error("MongoDB connection error:", err.message);
        process.exit(1);
    });

/* ── Middleware ────────────────────────────── */
app.use(express.json());

// Allow requests from the frontend (file:// during dev, or your deployed domain)
app.use(cors({
    origin: process.env.CLIENT_ORIGIN || "*",
    methods: ["GET", "POST", "DELETE"]
}));

// Global rate limit: max 100 requests per 15 minutes per IP
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many requests. Please try again later." }
});
app.use(limiter);

/* ── Serve frontend static files ──────────── */
app.use(express.static(FRONTEND));

/* ── Routes ────────────────────────────────── */
app.use("/api/images", imagesRouter);
app.use("/api/auth",   authRouter);

// Health check
app.get("/api/health", (req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// API 404 handler (only for /api routes)
app.use("/api", (req, res) => {
    res.status(404).json({ error: "Route not found" });
});

// Global error handler
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: "Internal server error" });
});

/* ── Start ─────────────────────────────────── */
app.listen(PORT, () => {
    console.log(`ImageSearch backend running on http://localhost:${PORT}`);
});
