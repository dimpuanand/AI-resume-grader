import { useState, useEffect } from "react";
import axios from "axios";
import "./App.css";

const API = "https://ai-resume-ai.onrender.com";

const tips = [
  "Keep your resume to 1-2 pages max.",
  "Use bullet points to describe achievements.",
  "Tailor your resume for each job application.",
  "Include measurable results (e.g. improved speed by 30%).",
  "Always include a professional summary at the top.",
  "Use standard fonts like Arial or Calibri.",
  "Avoid spelling and grammar mistakes.",
  "List skills relevant to the job description.",
  "Include LinkedIn profile and GitHub links.",
  "Use action verbs: built, designed, led, improved.",
];

const LOADING_STAGES = [
  "Extracting resume text...",
  "Analyzing skills with AI...",
  "Matching against job description...",
  "Generating suggestions...",
  "Almost done...",
];

const getToken = () => localStorage.getItem("accessToken");
const getUser  = () => {
  try { return JSON.parse(localStorage.getItem("user")); } catch { return null; }
};
const saveAuth = ({ accessToken, refreshToken, user }) => {
  localStorage.setItem("accessToken", accessToken);
  localStorage.setItem("refreshToken", refreshToken);
  localStorage.setItem("user", JSON.stringify(user));
};
const clearAuth = () => {
  localStorage.removeItem("accessToken");
  localStorage.removeItem("refreshToken");
  localStorage.removeItem("user");
};

const authAxios = axios.create({ baseURL: API });
authAxios.interceptors.request.use((config) => {
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

function SuggestionText({ text }) {
  const parts = text.split(/\*\*(.+?)\*\*/g);
  return (
    <span>
      {parts.map((part, i) =>
        i % 2 === 1 ? <strong key={i}>{part}</strong> : part
      )}
    </span>
  );
}

function AuthPage({ onAuth }) {
  const [mode, setMode]         = useState("login");
  const [name, setName]         = useState("");
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");

  const submit = async () => {
    setError("");
    if (!email || !password) return setError("Email and password are required.");
    if (mode === "register" && !name) return setError("Name is required.");
    if (password.length < 6) return setError("Password must be at least 6 characters.");
    setLoading(true);
    try {
      const endpoint = mode === "login" ? "/api/v1/auth/login" : "/api/v1/auth/register";
      const payload  = mode === "login" ? { email, password } : { name, email, password };
      const res = await axios.post(`${API}${endpoint}`, payload);
      saveAuth(res.data);
      onAuth(res.data.user);
    } catch (err) {
      setError(err.response?.data?.error || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  const handleKey = (e) => { if (e.key === "Enter") submit(); };

  return (
    <div className="auth-overlay">
      <div className="auth-card">
        <div className="auth-logo">🎯</div>
        <h1 className="auth-title">AI Resume Grader</h1>
        <p className="auth-subtitle">
          {mode === "login" ? "Sign in to your account" : "Create your account"}
        </p>
        <div className="auth-tabs">
          <button className={`auth-tab ${mode === "login" ? "active" : ""}`}
            onClick={() => { setMode("login"); setError(""); }}>Login</button>
          <button className={`auth-tab ${mode === "register" ? "active" : ""}`}
            onClick={() => { setMode("register"); setError(""); }}>Register</button>
        </div>
        {mode === "register" && (
          <input className="auth-input" type="text" placeholder="Full Name"
            value={name} onChange={(e) => setName(e.target.value)} onKeyDown={handleKey} />
        )}
        <input className="auth-input" type="email" placeholder="Email Address"
          value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={handleKey} />
        <input className="auth-input" type="password" placeholder="Password"
          value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={handleKey} />
        {error && <p className="auth-error">{error}</p>}
        <button className="auth-btn" onClick={submit} disabled={loading}>
          {loading
            ? <span className="loading-text"><span className="spinner"></span> Please wait...</span>
            : mode === "login" ? "Sign In" : "Create Account"
          }
        </button>
        <p className="auth-footer">
          {mode === "login"
            ? <>Don't have an account? <button className="auth-link" onClick={() => { setMode("register"); setError(""); }}>Register</button></>
            : <>Already have an account? <button className="auth-link" onClick={() => { setMode("login"); setError(""); }}>Login</button></>
          }
        </p>
      </div>
    </div>
  );
}

function HistoryPage({ onBack }) {
  const [resumes, setResumes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");

  useEffect(() => {
    authAxios.get("/api/v1/resume/history")
      .then((res) => setResumes(res.data.resumes || []))
      .catch(() => setError("Failed to load history."))
      .finally(() => setLoading(false));
  }, []);

  const getScoreColor = (score) => {
    if (score >= 75) return "#16a34a";
    if (score >= 50) return "#d97706";
    return "#dc2626";
  };

  const getScoreLabel = (score) => {
    if (score >= 75) return "Excellent";
    if (score >= 50) return "Average";
    return "Needs Work";
  };

  const formatDate = (iso) => {
    const d = new Date(iso);
    return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  };

  return (
    <div className="app">
      <div className="header">
        <div className="header-left">
          <h1>🎯 AI Resume Grader</h1>
          <p>Your resume analysis history</p>
        </div>
        <button className="header-badge clickable" onClick={onBack}>← Back to Grader</button>
      </div>
      <div className="history-page">
        <h2 className="history-title">Resume History</h2>
        {loading && (
          <div className="history-empty">
            <span className="spinner" style={{ borderTopColor: "#2563eb", width: 24, height: 24 }}></span>
            <p>Loading...</p>
          </div>
        )}
        {error && <p className="error" style={{ marginBottom: 16 }}>{error}</p>}
        {!loading && !error && resumes.length === 0 && (
          <div className="history-empty">
            <div style={{ fontSize: "2.5rem", marginBottom: 12 }}>📋</div>
            <h3>No resumes analyzed yet</h3>
            <p>Upload your first resume to see it here.</p>
            <button className="analyze-btn" style={{ marginTop: 16, width: "auto", padding: "10px 24px" }} onClick={onBack}>
              Analyze a Resume
            </button>
          </div>
        )}
        {!loading && resumes.length > 0 && (
          <div className="history-table-wrap">
            <table className="history-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>File Name</th>
                  <th>ATS Score</th>
                  <th>Status</th>
                  <th>Job Match</th>
                  <th>Experience</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {resumes.map((r, i) => (
                  <tr key={r._id}>
                    <td className="row-num">{i + 1}</td>
                    <td className="file-name">
                      <span className="file-icon">📄</span>{r.fileName}
                    </td>
                    <td>
                      <span className="score-badge"
                        style={{ background: getScoreColor(r.score) + "18", color: getScoreColor(r.score), border: `1px solid ${getScoreColor(r.score)}40` }}>
                        {r.score}/100
                      </span>
                    </td>
                    <td>
                      <span className="status-badge"
                        style={{ background: getScoreColor(r.score) + "18", color: getScoreColor(r.score) }}>
                        {getScoreLabel(r.score)}
                      </span>
                    </td>
                    <td>
                      {r.jobMatchPercent != null
                        ? <span className="match-pill">{r.jobMatchPercent}%</span>
                        : <span className="na-text">—</span>}
                    </td>
                    <td>{r.yearsExperience != null ? `${r.yearsExperience}+ yrs` : "—"}</td>
                    <td className="date-cell">{formatDate(r.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function App() {
  const [user, setUser]             = useState(getUser);
  const [page, setPage]             = useState("grader");
  const [file, setFile]             = useState(null);
  const [result, setResult]         = useState(null);
  const [loading, setLoading]       = useState(false);
  const [loadingMsg, setLoadingMsg] = useState("");
  const [error, setError]           = useState(null);
  const [jobDesc, setJobDesc]       = useState("");
  const [jobMatch, setJobMatch]     = useState(null);

  const handleAuth   = (u) => setUser(u);
  const handleLogout = async () => {
    try { await authAxios.post("/api/v1/auth/logout"); } catch {}
    clearAuth();
    setUser(null);
    setResult(null);
    setPage("grader");
  };

  const handleUpload = async () => {
    if (!file) return alert("Please select a file first!");
    setLoading(true);
    setError(null);
    setResult(null);
    setJobMatch(null);

    setLoadingMsg(LOADING_STAGES[0]);
    const timers = LOADING_STAGES.slice(1).map((msg, i) =>
      setTimeout(() => setLoadingMsg(msg), (i + 1) * 2000)
    );

    const formData = new FormData();
    formData.append("resume", file);
    if (jobDesc) formData.append("job_description", jobDesc);

    try {
      const res = await authAxios.post("/api/v1/resume/upload", formData);
      setResult(res.data);
      if (jobDesc) {
        const matchScore = calculateJobMatch(res.data.matched_skills, jobDesc);
        setJobMatch(matchScore);
      }
    } catch (err) {
      setError(
        err.response?.status === 401
          ? "Session expired. Please log in again."
          : "Something went wrong. Make sure both servers are running."
      );
      if (err.response?.status === 401) { clearAuth(); setUser(null); }
    } finally {
      timers.forEach(clearTimeout);
      setLoading(false);
      setLoadingMsg("");
    }
  };

  const calculateJobMatch = (matchedSkills, desc) => {
    const descLower = desc.toLowerCase();
    const matched = matchedSkills.filter((s) => descLower.includes(s.toLowerCase()));
    const percent = Math.round((matched.length / Math.max(matchedSkills.length, 1)) * 100);
    return { percent, matchedKeywords: matched };
  };

  const handleDownload = () => {
    if (!result) return;
    const content = `
AI RESUME GRADER - ANALYSIS REPORT
=====================================
ATS Score: ${result.score} / 100

MATCHED SKILLS:
${result.matched_skills.join(", ")}

MISSING SKILLS:
${result.missing_skills.join(", ")}

SUGGESTIONS:
${result.suggestions.map((s, i) => `${i + 1}. ${s.replace(/\*\*/g, "")}`).join("\n")}

${jobMatch ? `JOB MATCH SCORE: ${jobMatch.percent}%\nMatched Keywords: ${jobMatch.matchedKeywords.join(", ")}` : ""}

Generated by AI Resume Grader
    `.trim();
    const blob = new Blob([content], { type: "text/plain" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = "resume_report.txt"; a.click();
  };

  const getScoreColor = (score) => {
    if (score >= 75) return "#16a34a";
    if (score >= 50) return "#d97706";
    return "#dc2626";
  };

  const getScoreLabel = (score) => {
    if (score >= 75) return "Excellent";
    if (score >= 50) return "Average";
    return "Needs Work";
  };

  if (!user) return <AuthPage onAuth={handleAuth} />;
  if (page === "history") return <HistoryPage onBack={() => setPage("grader")} />;

  return (
    <div className="app">
      <div className="header">
        <div className="header-left">
          <h1>🎯 AI Resume Grader</h1>
          <p>Upload your resume and get an instant ATS score with AI feedback</p>
        </div>
        <div className="header-right">
          <button className="nav-btn" onClick={() => setPage("history")}>📋 History</button>
          <span className="user-chip">👤 {user.name}</span>
          <button className="logout-btn" onClick={handleLogout}>Logout</button>
        </div>
      </div>

      <div className="main-layout">
        <div className="left-panel">
          <div className="card">
            <h2>Upload Resume</h2>
            <div className="upload-area">
              <input type="file" accept=".pdf,.docx" id="fileInput"
                onChange={(e) => setFile(e.target.files[0])} />
              <label htmlFor="fileInput" className="file-label">
                {file ? `✅ ${file.name}` : "📄 Click to choose PDF or DOCX"}
              </label>
            </div>
            <h2>Job Description (Optional)</h2>
            <textarea className="job-textarea"
              placeholder="Paste the job description here to get a match score..."
              value={jobDesc} onChange={(e) => setJobDesc(e.target.value)} rows={6} />
            <button className="analyze-btn" onClick={handleUpload} disabled={loading}>
              {loading ? (
                <span className="loading-text">
                  <span className="spinner"></span> {loadingMsg}
                </span>
              ) : "Analyze Resume"}
            </button>
            {error && <p className="error">{error}</p>}
          </div>
        </div>

        <div className="right-panel">
          {!result && !loading && (
            <div className="empty-state">
              <div className="empty-icon">📋</div>
              <h3>No Resume Analyzed Yet</h3>
              <p>Upload your resume on the left to see your ATS score and detailed feedback.</p>
            </div>
          )}

          {loading && (
            <div className="card" style={{ textAlign: "center", padding: "3rem 2rem" }}>
              <div style={{ fontSize: "2.5rem", marginBottom: "1rem" }}>🤖</div>
              <h3 style={{ marginBottom: "0.5rem", color: "#2563eb" }}>AI is analyzing your resume</h3>
              <p style={{ color: "#6b7280", marginBottom: "1.5rem" }}>{loadingMsg}</p>
              <div className="loading-bar-track">
                <div className="loading-bar-fill"></div>
              </div>
            </div>
          )}

          {result && (
            <>
              <div className="card score-card">
                <div className="score-header">
                  <div>
                    <h2>ATS Score</h2>
                    <p className="score-subtitle">Based on skills, experience, keywords & education</p>
                  </div>
                  <button className="download-btn" onClick={handleDownload}>
                    ⬇ Download Report
                  </button>
                </div>
                <div className="score-display">
                  <div className="score-circle" style={{ borderColor: getScoreColor(result.score) }}>
                    <span className="score-number" style={{ color: getScoreColor(result.score) }}>
                      {result.score}
                    </span>
                    <span className="score-max">/100</span>
                    <span className="score-label" style={{ color: getScoreColor(result.score) }}>
                      {getScoreLabel(result.score)}
                    </span>
                  </div>
                  <div className="breakdown">
                    <h3>Score Breakdown</h3>
                    {[
                      { label: "Skills Match", value: Math.round(Math.min(result.matched_skills.length / 10, 1) * 40), max: 40, color: "#3b82f6" },
                      { label: "Experience",   value: result.years_experience >= 3 ? 30 : result.years_experience >= 1 ? 22 : 12, max: 30, color: "#8b5cf6" },
                      { label: "Keywords",     value: Math.round((result.action_verbs_found?.length || 0) / 22 * 20), max: 20, color: "#f59e0b" },
                      { label: "Education",    value: 10, max: 10, color: "#10b981" },
                    ].map((item) => (
                      <div key={item.label} className="bar-item">
                        <div className="bar-label">
                          <span>{item.label}</span>
                          <span>{item.value}/{item.max}</span>
                        </div>
                        <div className="bar-track">
                          <div className="bar-fill" style={{ width: `${(item.value / item.max) * 100}%`, background: item.color }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="stats-row">
                  <div className="stat-box">
                    <div className="stat-value">{result.years_experience || 0}+</div>
                    <div className="stat-label">Years Experience</div>
                  </div>
                  <div className="stat-box">
                    <div className="stat-value">{result.matched_skills.length}</div>
                    <div className="stat-label">Skills Matched</div>
                  </div>
                  <div className="stat-box">
                    <div className="stat-value">{result.action_verbs_found?.length || 0}</div>
                    <div className="stat-label">Action Verbs</div>
                  </div>
                </div>
              </div>

              {jobMatch && (
                <div className="card job-match-card">
                  <h2>Job Match Score</h2>
                  <div className="job-match-score">
                    <span style={{ color: getScoreColor(jobMatch.percent) }}>{jobMatch.percent}%</span>
                    <p>of your skills match the job description</p>
                  </div>
                  <div className="tags">
                    {jobMatch.matchedKeywords.map((k) => (
                      <span key={k} className="tag green">{k}</span>
                    ))}
                  </div>
                </div>
              )}

              <div className="card">
                <h2>Matched Skills</h2>
                <div className="tags">
                  {result.matched_skills.map((s) => (
                    <span key={s} className="tag green">{s}</span>
                  ))}
                </div>
              </div>

              <div className="card">
                <h2>Missing Skills</h2>
                <div className="tags">
                  {result.missing_skills.map((s) => (
                    <span key={s} className="tag red">{s}</span>
                  ))}
                </div>
              </div>

              {result.action_verbs_found?.length > 0 && (
                <div className="card">
                  <h2>Action Verbs Found</h2>
                  <div className="verbs-list">
                    {result.action_verbs_found.map((v) => (
                      <span key={v} className="verb-tag">{v}</span>
                    ))}
                  </div>
                </div>
              )}

              <div className="card">
                <h2>Suggestions</h2>
                <ul className="suggestions-list">
                  {result.suggestions.map((s, i) => (
                    <li key={i}>
                      <span className="suggestion-icon">→</span>
                      <SuggestionText text={s} />
                    </li>
                  ))}
                </ul>
              </div>
            </>
          )}

          <div className="card tips-grid-card">
            <h2>Resume Tips</h2>
            <div className="tips-grid">
              {tips.map((tip, i) => (
                <div key={i} className="tip-item">
                  <span className="tip-number">{i + 1}</span>
                  <span>{tip}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;