const mongoose = require("mongoose");
const bcrypt   = require("bcryptjs");

const downloadedImageSchema = new mongoose.Schema({
    pexelsId:      { type: Number, required: true },
    photographer:  { type: String, required: true },
    photographerUrl: { type: String, default: "" },
    url:           { type: String, required: true },   // Pexels photo page URL
    src: {
        medium:    { type: String, required: true },   // thumbnail shown in profile
        original:  { type: String, required: true }    // full download URL
    },
    width:         { type: Number, default: 0 },
    height:        { type: Number, default: 0 },
    downloadedAt:  { type: Date, default: Date.now }
}, { _id: false });

const userSchema = new mongoose.Schema({
    name:              { type: String, required: true, trim: true, maxlength: 50 },
    email:             { type: String, required: true, unique: true, lowercase: true, trim: true },
    password:          { type: String, required: true, minlength: 6 },
    resetToken:        { type: String, default: null },
    resetTokenExpiry:  { type: Date,   default: null },
    downloads:         { type: [downloadedImageSchema], default: [] }
}, { timestamps: true });

// Hash password before saving
userSchema.pre("save", async function (next) {
    if (!this.isModified("password")) return next();
    this.password = await bcrypt.hash(this.password, 12);
    next();
});

// Compare a candidate password against the stored hash
userSchema.methods.comparePassword = function (candidate) {
    return bcrypt.compare(candidate, this.password);
};

module.exports = mongoose.model("User", userSchema);
