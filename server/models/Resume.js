const mongoose = require("mongoose");

const resumeSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  fileName: {
    type: String,
    required: true,
  },
  fileUrl: {
    type: String,
    default: "",
  },
  extractedText: {
    type: String,
  },
  score: {
    type: Number,
    default: 0,
  },
  matchedSkills: {
    type: [String],
    default: [],
  },
  missingSkills: {
    type: [String],
    default: [],
  },
  suggestions: {
    type: [String],
    default: [],
  },
  jobDescription: {
    type: String,
    default: "",
  },
  jobMatchPercent: {
    type: Number,
    default: null,
  },
  yearsExperience: {
    type: Number,
    default: 0,
  },
  actionVerbsFound: {
    type: [String],
    default: [],
  },
}, { timestamps: true });

module.exports = mongoose.model("Resume", resumeSchema);