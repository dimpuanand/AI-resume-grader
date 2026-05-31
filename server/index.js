const express = require("express");
const multer = require("multer");
const axios = require("axios");
const cors = require("cors");
const fs = require("fs");
const FormData = require("form-data");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const connectDB = require("./config/db");
const User = require("./models/User");
const Resume = require("./models/Resume");
const { protect, JWT_SECRET } = require("./middleware/auth");

const app = express();
app.use(cors());
app.use(express.json());

// Connect MongoDB
connectDB();

// ─── Multer ───────────────────────────────────────────────────────────────────
const upload = multer({ dest: "uploads/" });

// ─── Helpers ──────────────────────────────────────────────────────────────────
const generateAccessToken = (userId) =>
  jwt.sign({ id: userId }, JWT_SECRET, { expiresIn: "15m" });

const generateRefreshToken = (userId) =>
  jwt.sign({ id: userId }, JWT_SECRET, { expiresIn: "7d" });


// ════════════════════════════════════════════════════════════════════════════════
// AUTH ROUTES
// ════════════════════════════════════════════════════════════════════════════════

// POST /api/v1/auth/register
app.post("/api/v1/auth/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password)
      return res.status(400).json({ error: "All fields are required" });

    if (password.length < 6)
      return res.status(400).json({ error: "Password must be at least 6 characters" });

    const existing = await User.findOne({ email });
    if (existing)
      return res.status(409).json({ error: "Email already registered" });

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({ name, email, passwordHash });

    const accessToken = generateAccessToken(user._id);
    const refreshToken = generateRefreshToken(user._id);

    user.refreshToken = refreshToken;
    await user.save();

    return res.status(201).json({
      message: "Registered successfully",
      accessToken,
      refreshToken,
      user: { id: user._id, name: user.name, email: user.email },
    });
  } catch (err) {
    console.error("Register error:", err.message);
    return res.status(500).json({ error: "Server error" });
  }
});


// POST /api/v1/auth/login
app.post("/api/v1/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password)
      return res.status(400).json({ error: "Email and password are required" });

    const user = await User.findOne({ email });
    if (!user)
      return res.status(401).json({ error: "Invalid email or password" });

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch)
      return res.status(401).json({ error: "Invalid email or password" });

    const accessToken = generateAccessToken(user._id);
    const refreshToken = generateRefreshToken(user._id);

    user.refreshToken = refreshToken;
    await user.save();

    return res.json({
      message: "Logged in successfully",
      accessToken,
      refreshToken,
      user: { id: user._id, name: user.name, email: user.email },
    });
  } catch (err) {
    console.error("Login error:", err.message);
    return res.status(500).json({ error: "Server error" });
  }
});


// POST /api/v1/auth/refresh
app.post("/api/v1/auth/refresh", async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken)
      return res.status(400).json({ error: "Refresh token required" });

    const decoded = jwt.verify(refreshToken, JWT_SECRET);
    const user = await User.findById(decoded.id);

    if (!user || user.refreshToken !== refreshToken)
      return res.status(401).json({ error: "Invalid refresh token" });

    const newAccessToken = generateAccessToken(user._id);
    const newRefreshToken = generateRefreshToken(user._id);

    user.refreshToken = newRefreshToken;
    await user.save();

    return res.json({ accessToken: newAccessToken, refreshToken: newRefreshToken });
  } catch (err) {
    return res.status(401).json({ error: "Refresh token expired or invalid" });
  }
});


// POST /api/v1/auth/logout
app.post("/api/v1/auth/logout", protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (user) {
      user.refreshToken = null;
      await user.save();
    }
    return res.json({ message: "Logged out successfully" });
  } catch (err) {
    return res.status(500).json({ error: "Server error" });
  }
});


// ════════════════════════════════════════════════════════════════════════════════
// RESUME ROUTES
// ════════════════════════════════════════════════════════════════════════════════

// POST /api/v1/resume/upload  (protected)
app.post("/api/v1/resume/upload", protect, upload.single("resume"), async (req, res) => {
  try {
    const file = req.file;

    if (!file)
      return res.status(400).json({ error: "No file uploaded" });

    const originalName = file.originalname;
    if (!originalName.endsWith(".pdf") && !originalName.endsWith(".docx"))
      return res.status(400).json({ error: "Only PDF and DOCX allowed" });

    const newPath = file.path + "_" + originalName;
    fs.renameSync(file.path, newPath);

    const form = new FormData();
    form.append("resume", fs.createReadStream(newPath), originalName);

    // Forward optional job description
    if (req.body.jobDescription) {
      form.append("job_description", req.body.jobDescription);
    }

    const response = await axios.post("http://localhost:5001/analyze", form, {
      headers: form.getHeaders(),
    });

    fs.unlinkSync(newPath);

    const analysis = response.data;

    // Save to MongoDB
    const resume = await Resume.create({
      userId: req.user.id,
      fileName: originalName,
      fileUrl: "",                              // local multer — no permanent URL
      extractedText: analysis.extracted_text || "",
      score: analysis.ats_score ?? 0,
      matchedSkills: analysis.matched_skills || [],
      missingSkills: analysis.missing_skills || [],
      suggestions: analysis.suggestions || [],
      jobDescription: req.body.jobDescription || "",
      jobMatchPercent: analysis.job_match_percent ?? null,
      yearsExperience: analysis.years_experience ?? 0,
      actionVerbsFound: analysis.action_verbs_found || [],
    });

    return res.json({ ...analysis, resumeId: resume._id });
  } catch (err) {
    console.error("Upload error:", err.message);
    return res.status(500).json({ error: "Something went wrong" });
  }
});


// GET /api/v1/resume/history  (protected)
app.get("/api/v1/resume/history", protect, async (req, res) => {
  try {
    const resumes = await Resume.find({ userId: req.user.id })
      .sort({ createdAt: -1 })
      .select("fileName score jobMatchPercent yearsExperience createdAt");

    return res.json({ resumes });
  } catch (err) {
    console.error("History error:", err.message);
    return res.status(500).json({ error: "Server error" });
  }
});


// GET /api/v1/resume/:id  (protected)
app.get("/api/v1/resume/:id", protect, async (req, res) => {
  try {
    const resume = await Resume.findById(req.params.id);

    if (!resume)
      return res.status(404).json({ error: "Resume not found" });

    if (resume.userId.toString() !== req.user.id)
      return res.status(403).json({ error: "Not authorized" });

    return res.json({ resume });
  } catch (err) {
    console.error("Get resume error:", err.message);
    return res.status(500).json({ error: "Server error" });
  }
});


// ─── Legacy route (keep working during transition) ────────────────────────────
app.post("/api/resume/upload", upload.single("resume"), async (req, res) => {
  try {
    const file = req.file;
    if (!file) return res.status(400).json({ error: "No file uploaded" });

    const originalName = file.originalname;
    if (!originalName.endsWith(".pdf") && !originalName.endsWith(".docx"))
      return res.status(400).json({ error: "Only PDF and DOCX allowed" });

    const newPath = file.path + "_" + originalName;
    fs.renameSync(file.path, newPath);

    const form = new FormData();
    form.append("resume", fs.createReadStream(newPath), originalName);

    const response = await axios.post("http://localhost:5001/analyze", form, {
      headers: form.getHeaders(),
    });

    fs.unlinkSync(newPath);
    return res.json(response.data);
  } catch (err) {
    console.error(err.message);
    return res.status(500).json({ error: "Something went wrong" });
  }
});


// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(5000, () => {
  console.log("Server running on http://localhost:5000");
});