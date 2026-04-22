const express  = require("express");
const fetch    = require("node-fetch");
const rateLimit = require("express-rate-limit");
const auth     = require("../middleware/auth");
const User     = require("../models/User");

const router = express.Router();

const PEXELS_API_KEY = process.env.PEXELS_API_KEY;
const PEXELS_BASE    = "https://api.pexels.com/v1";

// Stricter rate limit specifically for image search (30 req / 15 min per IP)
const searchLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 30,
    message: { error: "Too many search requests. Please slow down." }
});

// Validate & sanitize pagination params
function getPaginationParams(query) {
    const page    = Math.max(1, parseInt(query.page)     || 1);
    const perPage = Math.min(40, Math.max(1, parseInt(query.per_page) || 15));
    return { page, per_page: perPage };
}

/**
 * GET /api/images/curated
 * Returns curated photos from Pexels
 */
router.get("/curated", searchLimiter, async (req, res) => {
    if (!PEXELS_API_KEY) {
        return res.status(500).json({ error: "Pexels API key not configured." });
    }

    const { page, per_page } = getPaginationParams(req.query);
    const url = `${PEXELS_BASE}/curated?page=${page}&per_page=${per_page}`;

    try {
        const response = await fetch(url, {
            headers: { Authorization: PEXELS_API_KEY }
        });

        if (!response.ok) {
            return res.status(response.status).json({ error: "Pexels API error." });
        }

        const data = await response.json();
        res.json(data);
    } catch (err) {
        console.error("Curated fetch error:", err.message);
        res.status(500).json({ error: "Failed to fetch images." });
    }
});

/**
 * GET /api/images/search?q=cats&page=1&per_page=15
 * Proxies a search query to Pexels
 */
router.get("/search", searchLimiter, async (req, res) => {
    if (!PEXELS_API_KEY) {
        return res.status(500).json({ error: "Pexels API key not configured." });
    }

    const query = req.query.q;
    if (!query || typeof query !== "string" || !query.trim()) {
        return res.status(400).json({ error: "Missing or invalid search query." });
    }

    // Sanitize: strip any characters that aren't letters, numbers, spaces, or hyphens
    const safeQuery = query.trim().replace(/[^a-zA-Z0-9 \-]/g, "").slice(0, 100);
    if (!safeQuery) {
        return res.status(400).json({ error: "Search query contains invalid characters." });
    }

    const { page, per_page } = getPaginationParams(req.query);
    const url = `${PEXELS_BASE}/search?query=${encodeURIComponent(safeQuery)}&page=${page}&per_page=${per_page}`;

    try {
        const response = await fetch(url, {
            headers: { Authorization: PEXELS_API_KEY }
        });

        if (!response.ok) {
            return res.status(response.status).json({ error: "Pexels API error." });
        }

        const data = await response.json();
        res.json(data);
    } catch (err) {
        console.error("Search fetch error:", err.message);
        res.status(500).json({ error: "Failed to fetch images." });
    }
});

/**
 * POST /api/images/download
 * Logs a downloaded image to the authenticated user's history.
 * Body: { pexelsId, photographer, photographerUrl, url, src: { medium, original }, width, height }
 */
router.post("/download", auth, async (req, res) => {
    const { pexelsId, photographer, photographerUrl, url, src, width, height } = req.body;

    if (!pexelsId || !photographer || !url || !src?.medium || !src?.original) {
        return res.status(400).json({ error: "Missing required image fields." });
    }
    if (typeof pexelsId !== "number" || pexelsId <= 0) {
        return res.status(400).json({ error: "Invalid pexelsId." });
    }

    try {
        const user = await User.findById(req.user.id);
        if (!user) return res.status(404).json({ error: "User not found." });

        // Avoid duplicate entries for the same photo — just update downloadedAt
        const existingIndex = user.downloads.findIndex(d => d.pexelsId === pexelsId);
        if (existingIndex !== -1) {
            user.downloads[existingIndex].downloadedAt = new Date();
        } else {
            // Prepend so newest appears first; cap history at 200 items
            user.downloads.unshift({
                pexelsId,
                photographer:    String(photographer).slice(0, 100),
                photographerUrl: String(photographerUrl || "").slice(0, 300),
                url:             String(url).slice(0, 300),
                src: {
                    medium:   String(src.medium).slice(0, 500),
                    original: String(src.original).slice(0, 500)
                },
                width:  Number(width)  || 0,
                height: Number(height) || 0
            });
            if (user.downloads.length > 200) user.downloads = user.downloads.slice(0, 200);
        }

        await user.save();
        res.json({ message: "Download logged.", total: user.downloads.length });
    } catch (err) {
        console.error("Log download error:", err.message);
        res.status(500).json({ error: "Failed to log download." });
    }
});

/**
 * GET /api/images/downloads?page=1&limit=20
 * Returns the authenticated user's download history (paginated).
 */
router.get("/downloads", auth, async (req, res) => {
    const page  = Math.max(1, parseInt(req.query.page)  || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));
    const skip  = (page - 1) * limit;

    try {
        const user = await User.findById(req.user.id).select("downloads");
        if (!user) return res.status(404).json({ error: "User not found." });

        const total   = user.downloads.length;
        const results = user.downloads.slice(skip, skip + limit);

        res.json({
            downloads: results,
            total,
            page,
            totalPages: Math.ceil(total / limit)
        });
    } catch (err) {
        console.error("Get downloads error:", err.message);
        res.status(500).json({ error: "Failed to fetch downloads." });
    }
});

/**
 * DELETE /api/images/downloads/:pexelsId
 * Removes a single image from the user's download history.
 */
router.delete("/downloads/:pexelsId", auth, async (req, res) => {
    const pexelsId = parseInt(req.params.pexelsId);
    if (!pexelsId || pexelsId <= 0) {
        return res.status(400).json({ error: "Invalid pexelsId." });
    }

    try {
        const user = await User.findById(req.user.id);
        if (!user) return res.status(404).json({ error: "User not found." });

        const before = user.downloads.length;
        user.downloads = user.downloads.filter(d => d.pexelsId !== pexelsId);

        if (user.downloads.length === before) {
            return res.status(404).json({ error: "Image not found in history." });
        }

        await user.save();
        res.json({ message: "Removed from history.", total: user.downloads.length });
    } catch (err) {
        console.error("Delete download error:", err.message);
        res.status(500).json({ error: "Failed to remove image." });
    }
});

module.exports = router;
