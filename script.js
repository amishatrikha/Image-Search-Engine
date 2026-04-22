/* ─────────────────────────────────────────────
   ImageSearch – script.js
   Features:
   • Pexels API (curated + search)
   • Category filter chips
   • Recent searches (localStorage)
   • Skeleton loading cards
   • Dark / Light mode (persisted)
   • Lightbox with download + copy-link + Pexels link
   • Back-to-top button
   • Toast notifications
   • Keyboard: Escape closes lightbox
───────────────────────────────────────────── */

const BACKEND   = "https://your-backend.onrender.com"; // ← replace with your Render URL
const API_BASE  = `${BACKEND}/api/images`;
const PEXELS_KEY = ""; // Set via backend proxy — see backend/.env
const PER_PAGE  = 15;
const MAX_RECENT = 6;

let currentPage  = 1;
let searchTerm   = "";
let activeCategory = "";
let totalResults = 0;
let isLoading    = false;
let hasMore      = true;

/* ── DOM refs ──────────────────────────────── */
const imagesWrapper  = document.getElementById("imagesWrapper");
const skeletonGrid   = document.getElementById("skeletonGrid");
const loadMoreBtn    = document.getElementById("loadMoreBtn");
const searchInput    = document.getElementById("searchInput");
const clearBtn       = document.getElementById("clearBtn");
const recentSearches = document.getElementById("recentSearches");
const recentTags     = document.getElementById("recentTags");
const clearHistory   = document.getElementById("clearHistory");
const themeToggle    = document.getElementById("themeToggle");
const categories     = document.getElementById("categories");
const resultsBar     = document.getElementById("resultsBar");
const resultsCount   = document.getElementById("resultsCount");
const backToTop      = document.getElementById("backToTop");
const toast          = document.getElementById("toast");

// Lightbox
const lightbox         = document.getElementById("lightbox");
const lbImg            = lightbox.querySelector(".preview-img .img img");
const lbPhotographer   = lightbox.querySelector(".photographer-name");
const lbResolution     = lightbox.querySelector(".img-resolution");
const closeImgBtn      = document.getElementById("closeImgBtn");
const downloadImgBtn   = document.getElementById("downloadImgBtn");
const copyLinkBtn      = document.getElementById("copyLinkBtn");

/* ── Toast ─────────────────────────────────── */
let toastTimer;
function showToast(msg) {
    clearTimeout(toastTimer);
    toast.textContent = msg;
    toast.classList.add("show");
    toastTimer = setTimeout(() => toast.classList.remove("show"), 2500);
}

/* ── Theme ─────────────────────────────────── */
function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    themeToggle.innerHTML = theme === "dark"
        ? '<i class="uil uil-sun"></i>'
        : '<i class="uil uil-moon"></i>';
    localStorage.setItem("px-theme", theme);
}

(function initTheme() {
    const saved = localStorage.getItem("px-theme") || "light";
    applyTheme(saved);
})();

themeToggle.addEventListener("click", () => {
    const current = document.documentElement.getAttribute("data-theme");
    applyTheme(current === "dark" ? "light" : "dark");
});

/* ── Recent Searches ───────────────────────── */
function getRecent() {
    return JSON.parse(localStorage.getItem("px-recent") || "[]");
}

function saveRecent(term) {
    if (!term.trim()) return;
    let list = getRecent().filter(t => t.toLowerCase() !== term.toLowerCase());
    list.unshift(term.trim());
    list = list.slice(0, MAX_RECENT);
    localStorage.setItem("px-recent", JSON.stringify(list));
}

function renderRecent() {
    const list = getRecent();
    if (!list.length) {
        recentSearches.hidden = true;
        return;
    }
    recentSearches.hidden = false;
    recentTags.innerHTML = list.map(t =>
        `<button class="recent-tag" data-term="${t}">${t}</button>`
    ).join("");
    recentTags.querySelectorAll(".recent-tag").forEach(btn => {
        btn.addEventListener("click", () => {
            searchInput.value = btn.dataset.term;
            clearBtn.hidden = false;
            triggerSearch(btn.dataset.term);
        });
    });
}

clearHistory.addEventListener("click", () => {
    localStorage.removeItem("px-recent");
    renderRecent();
});

renderRecent();

/* ── Search Input ──────────────────────────── */
searchInput.addEventListener("input", () => {
    clearBtn.hidden = searchInput.value === "";
    if (searchInput.value === "") {
        searchTerm = "";
        activeCategory = "";
        document.querySelectorAll(".chip").forEach(c => c.classList.remove("active"));
        document.querySelector('.chip[data-category=""]').classList.add("active");
        resetAndLoad();
    }
});

searchInput.addEventListener("keydown", e => {
    if (e.key === "Enter" && searchInput.value.trim()) {
        triggerSearch(searchInput.value.trim());
    }
});

clearBtn.addEventListener("click", () => {
    searchInput.value  = "";
    clearBtn.hidden    = true;
    searchTerm         = "";
    activeCategory     = "";
    document.querySelectorAll(".chip").forEach(c => c.classList.remove("active"));
    document.querySelector('.chip[data-category=""]').classList.add("active");
    resetAndLoad();
});

function triggerSearch(term) {
    searchTerm = term;
    saveRecent(term);
    renderRecent();
    resetAndLoad();
}

/* ── Category Chips ────────────────────────── */
categories.addEventListener("click", e => {
    const chip = e.target.closest(".chip");
    if (!chip) return;
    document.querySelectorAll(".chip").forEach(c => c.classList.remove("active"));
    chip.classList.add("active");
    activeCategory = chip.dataset.category;
    if (activeCategory) {
        searchTerm = activeCategory;
        searchInput.value = activeCategory;
        clearBtn.hidden = false;
    } else {
        searchTerm = "";
        searchInput.value = "";
        clearBtn.hidden = true;
    }
    resetAndLoad();
});

/* ── Skeleton Loader ───────────────────────── */
const SKELETON_HEIGHTS = [200, 280, 180, 320, 240, 200, 260, 300, 220, 200, 280, 180, 240, 310, 200];

function showSkeleton() {
    skeletonGrid.hidden = false;
    skeletonGrid.innerHTML = SKELETON_HEIGHTS.map(h =>
        `<div class="skeleton-card" style="height:${h}px"></div>`
    ).join("");
}

function hideSkeleton() {
    skeletonGrid.hidden = true;
    skeletonGrid.innerHTML = "";
}

/* ── Download ──────────────────────────────── */
function downloadImg(photo) {
    fetch(photo.src.original)
        .then(res => res.blob())
        .then(blob => {
            const a = document.createElement("a");
            a.href = URL.createObjectURL(blob);
            a.download = `photo-${photo.id}`;
            a.click();
            URL.revokeObjectURL(a.href);
            showToast("Downloaded!");
        })
        .catch(() => showToast("Download failed. Try again."));
}

/* ── Lightbox ──────────────────────────────── */
function showLightbox(photo) {
    lbImg.src                = photo.src.large2x;
    lbPhotographer.textContent = photo.photographer;
    lbResolution.textContent = `${photo.width} × ${photo.height}`;
    downloadImgBtn.onclick   = () => downloadImg(photo);
    copyLinkBtn.onclick      = () => {
        navigator.clipboard.writeText(photo.src.large2x)
            .then(() => showToast("Image link copied!"))
            .catch(() => showToast("Copy failed."));
    };
    lightbox.classList.add("show");
    document.body.style.overflow = "hidden";
}

function hideLightbox() {
    lightbox.classList.remove("show");
    document.body.style.overflow = "";
    lbImg.src = "";
}

closeImgBtn.addEventListener("click", hideLightbox);
lightbox.addEventListener("click", e => { if (e.target === lightbox) hideLightbox(); });
document.addEventListener("keydown", e => { if (e.key === "Escape") hideLightbox(); });

/* ── Render Cards ──────────────────────────── */
function generateHTML(photos) {
    const fragment = photos.map(photo => `
        <li class="card" tabindex="0" role="button" aria-label="View photo by ${photo.photographer}">
            <img
                src="${photo.src.large}"
                alt="Photo by ${photo.photographer}"
                loading="lazy"
            >
            <div class="details">
                <div class="photographer">
                    <i class="uil uil-camera"></i>
                    <span>${photo.photographer}</span>
                </div>
                <div class="card-actions">
                    <button class="card-btn download-btn" title="Download" aria-label="Download">
                        <i class="uil uil-import"></i>
                    </button>
                </div>
            </div>
        </li>
    `).join("");

    imagesWrapper.insertAdjacentHTML("beforeend", fragment);

    // Bind events to newly added cards only
    const cards = imagesWrapper.querySelectorAll(".card:not([data-bound])");
    cards.forEach((card, i) => {
        card.setAttribute("data-bound", "true");
        const photo = photos[i];
        card.addEventListener("click", e => {
            if (e.target.closest(".download-btn")) return;
            showLightbox(photo);
        });
        card.addEventListener("keydown", e => {
            if (e.key === "Enter") showLightbox(photo);
        });
        card.querySelector(".download-btn").addEventListener("click", e => {
            e.stopPropagation();
            downloadImg(photo);
        });
    });
}

/* ── Fetch Images ──────────────────────────── */
function buildURL(page) {
    const base = searchTerm
        ? `https://api.pexels.com/v1/search?query=${encodeURIComponent(searchTerm)}&page=${page}&per_page=${PER_PAGE}`
        : `https://api.pexels.com/v1/curated?page=${page}&per_page=${PER_PAGE}`;
    return base;
}

function getImages(apiURL, append = false) {
    isLoading = true;
    loadMoreBtn.textContent = "Loading…";
    loadMoreBtn.style.display = "";
    loadMoreBtn.classList.add("disabled");
    showSkeleton();

    fetch(apiURL, { headers: { Authorization: "XYU5NlNMhkxHZVLN1ahpeLs8fTvS18VaI6NfBL0TRQl1YX4pLTrlN18Y" } })
        .then(res => {
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return res.json();
        })
        .then(data => {
            hideSkeleton();
            totalResults = data.total_results || 0;

            if (!append) imagesWrapper.innerHTML = "";
            if (data.photos.length === 0) {
                imagesWrapper.innerHTML = `<p style="color:var(--text-muted);padding:40px;text-align:center;grid-column:1/-1">No images found for "<strong>${searchTerm}</strong>".</p>`;
                hasMore = false;
                loadMoreBtn.style.display = "none";
            } else {
                generateHTML(data.photos);
                hasMore = !!data.next_page;
                loadMoreBtn.style.display = "none";

                // Update results bar
                if (searchTerm) {
                    resultsBar.hidden   = false;
                    resultsCount.textContent = `About ${totalResults.toLocaleString()} results for "${searchTerm}"`;
                } else {
                    resultsBar.hidden = true;
                }
            }

            isLoading = false;
            loadMoreBtn.classList.remove("disabled");
        })
        .catch(err => {
            hideSkeleton();
            isLoading = false;
            loadMoreBtn.style.display = "none";
            loadMoreBtn.classList.remove("disabled");
            showToast("Failed to load images. Check your connection.");
            console.error(err);
        });
}

/* ── Controls ──────────────────────────────── */
function resetAndLoad() {
    currentPage = 1;
    hasMore     = true;
    getImages(buildURL(currentPage), false);
    window.scrollTo({ top: 0, behavior: "smooth" });
}

/* ── Back to Top + Infinite Scroll ─────────── */
window.addEventListener("scroll", () => {
    backToTop.classList.toggle("visible", window.scrollY > 500);

    if (!isLoading && hasMore) {
        if (window.scrollY + window.innerHeight >= document.body.offsetHeight - 400) {
            currentPage++;
            getImages(buildURL(currentPage), true);
        }
    }
});
backToTop.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));

/* ── Init ──────────────────────────────────── */

/* ═══════════════════════════════════════════
   AUTH
═══════════════════════════════════════════ */
const AUTH_BASE    = `${BACKEND}/api/auth`;
const authOverlay    = document.getElementById("authOverlay");
const tabLogin       = document.getElementById("tabLogin");
const tabRegister    = document.getElementById("tabRegister");
const loginForm      = document.getElementById("loginForm");
const registerForm   = document.getElementById("registerForm");
const forgotForm     = document.getElementById("forgotForm");
const forgotLink     = document.getElementById("forgotLink");
const backToLogin    = document.getElementById("backToLogin");
const authError      = document.getElementById("authError");
const loginSubmit    = document.getElementById("loginSubmit");
const registerSubmit = document.getElementById("registerSubmit");
const forgotSubmit   = document.getElementById("forgotSubmit");
const userMenu       = document.getElementById("userMenu");
const userAvatar     = document.getElementById("userAvatar");
const userNameEl     = document.getElementById("userName");
const logoutBtn      = document.getElementById("logoutBtn");

/* ── helpers ──────────────────────────────── */
function showAuthError(msg) {
    authError.textContent = msg;
    authError.hidden = false;
}
function clearAuthError() {
    authError.textContent = "";
    authError.hidden = true;
}

function setLoggedIn(name) {
    authOverlay.hidden = true;
    userMenu.hidden    = false;
    userNameEl.textContent  = name;
    userAvatar.textContent  = name.charAt(0).toUpperCase();
}

function setLoggedOut() {
    localStorage.removeItem("px-token");
    localStorage.removeItem("px-user");
    userMenu.hidden    = true;
    authOverlay.hidden = false;
    document.getElementById("loginEmail").value    = "";
    document.getElementById("loginPassword").value = "";
}

/* ── tab switching ────────────────────────── */
function showAuthView(view) {
    loginForm.hidden    = view !== "login";
    registerForm.hidden = view !== "register";
    forgotForm.hidden   = view !== "forgot";
    clearAuthError();
    // Keep tabs in sync
    tabLogin.classList.toggle("active",    view === "login");
    tabRegister.classList.toggle("active", view === "register");
}

[tabLogin, tabRegister].forEach(tab => {
    tab.addEventListener("click", () => {
        showAuthView(tab.dataset.tab);
    });
});

forgotLink.addEventListener("click",  () => showAuthView("forgot"));
backToLogin.addEventListener("click", () => showAuthView("login"));

/* ── password toggle ──────────────────────── */
document.querySelectorAll(".toggle-pw").forEach(btn => {
    btn.addEventListener("click", () => {
        const input = document.getElementById(btn.dataset.target);
        const isText = input.type === "text";
        input.type = isText ? "password" : "text";
        btn.querySelector("i").className = isText ? "uil uil-eye" : "uil uil-eye-slash";
    });
});

/* ── login ────────────────────────────────── */
loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearAuthError();
    const email    = document.getElementById("loginEmail").value.trim();
    const password = document.getElementById("loginPassword").value;
    if (!email || !password) { showAuthError("Please fill in all fields."); return; }

    loginSubmit.disabled = true;
    loginSubmit.textContent = "Signing in…";
    try {
        const res  = await fetch(`${AUTH_BASE}/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password })
        });
        const data = await res.json();
        if (!res.ok) { showAuthError(data.error || "Login failed."); return; }
        localStorage.setItem("px-token", data.token);
        localStorage.setItem("px-user",  data.name);
        // Prompt browser to save password
        if (window.PasswordCredential) {
            const cred = new PasswordCredential({ id: email, password });
            navigator.credentials.store(cred).catch(() => {});
        }
        setLoggedIn(data.name);
        getImages(buildURL(currentPage), false);
    } catch {
        showAuthError("Could not connect to server. Is the backend running?");
    } finally {
        loginSubmit.disabled = false;
        loginSubmit.textContent = "Sign In";
    }
});

/* ── register ─────────────────────────────── */
registerForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearAuthError();
    const name     = document.getElementById("regName").value.trim();
    const email    = document.getElementById("regEmail").value.trim();
    const password = document.getElementById("regPassword").value;
    if (!name || !email || !password) { showAuthError("Please fill in all fields."); return; }

    registerSubmit.disabled = true;
    registerSubmit.textContent = "Creating account…";
    try {
        const res  = await fetch(`${AUTH_BASE}/register`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name, email, password })
        });
        const data = await res.json();
        if (!res.ok) { showAuthError(data.error || "Registration failed."); return; }
        localStorage.setItem("px-token", data.token);
        localStorage.setItem("px-user",  data.name);
        // Prompt browser to save password
        if (window.PasswordCredential) {
            const cred = new PasswordCredential({ id: email, password });
            navigator.credentials.store(cred).catch(() => {});
        }
        setLoggedIn(data.name);
        showToast(`Welcome, ${data.name}!`);
        getImages(buildURL(currentPage), false);
    } catch {
        showAuthError("Could not connect to server. Is the backend running?");
    } finally {
        registerSubmit.disabled = false;
        registerSubmit.textContent = "Create Account";
    }
});

/* ── forgot password ──────────────────────── */
forgotForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearAuthError();
    const email = document.getElementById("forgotEmail").value.trim();
    if (!email) { showAuthError("Please enter your email."); return; }

    forgotSubmit.disabled    = true;
    forgotSubmit.textContent = "Sending…";
    try {
        const res  = await fetch(`${AUTH_BASE}/forgot-password`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email })
        });
        const data = await res.json();
        if (!res.ok) { showAuthError(data.error || "Failed to send reset email."); return; }
        // Show success inline
        authError.textContent = "✓ " + data.message;
        authError.style.background = "var(--surface2)";
        authError.style.color = "var(--text)";
        authError.hidden = false;
    } catch {
        showAuthError("Could not connect to server. Is the backend running?");
    } finally {
        forgotSubmit.disabled    = false;
        forgotSubmit.textContent = "Send Reset Link";
    }
});

/* ── logout ───────────────────────────────── */
logoutBtn.addEventListener("click", () => {
    setLoggedOut();
    showToast("You have been signed out.");
});

/* ── init auth state ──────────────────────── */
(function initAuth() {
    const token = localStorage.getItem("px-token");
    const name  = localStorage.getItem("px-user");
    if (token && name) {
        setLoggedIn(name);
        getImages(buildURL(currentPage), false);
    }
    // If no token, the overlay stays visible (already shown by default)
})();

