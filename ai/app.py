from flask import Flask, request, jsonify
from flask_cors import CORS
import os
import re
import json
import hashlib
from google import genai
from pdfminer.high_level import extract_text
from docx import Document

app = Flask(__name__)
CORS(app)

import os

# Gemini setup
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
gemini_client = genai.Client(api_key=GEMINI_API_KEY)

# ---------------------------------------------------------------------------
# In-memory cache  {cache_key -> result_dict}
# ---------------------------------------------------------------------------
analysis_cache = {}

def get_cache_key(filepath, job_desc):
    with open(filepath, "rb") as f:
        file_hash = hashlib.md5(f.read()).hexdigest()
    job_hash = hashlib.md5((job_desc or "").encode()).hexdigest()
    return f"{file_hash}_{job_hash}"

# ---------------------------------------------------------------------------
# Fallback data (used only if Gemini totally fails)
# ---------------------------------------------------------------------------
FALLBACK_SKILLS = [
    "python", "java", "javascript", "typescript", "react", "node.js",
    "sql", "mongodb", "postgresql", "docker", "kubernetes", "aws",
    "machine learning", "deep learning", "git", "linux", "flask", "django",
    "tensorflow", "pytorch", "pandas", "numpy", "rest api", "graphql",
]

ACTION_VERBS = [
    "developed", "built", "designed", "implemented", "created", "managed",
    "led", "improved", "optimized", "deployed", "integrated", "automated",
    "architected", "delivered", "collaborated", "maintained", "reduced",
    "increased", "launched", "migrated", "resolved", "analyzed",
]

EDUCATION_KEYWORDS = [
    "bachelor", "master", "b.e", "b.tech", "m.tech", "mba", "phd",
    "degree", "engineering", "computer science", "information technology",
    "b.sc", "m.sc", "diploma",
]

# ---------------------------------------------------------------------------
# File extraction
# ---------------------------------------------------------------------------
def extract_text_from_pdf(path):
    return extract_text(path)

def extract_text_from_docx(path):
    doc = Document(path)
    return "\n".join([p.text for p in doc.paragraphs])

# ---------------------------------------------------------------------------
# Single Gemini call — skills + suggestions + meta in one shot
# ---------------------------------------------------------------------------
def get_gemini_analysis(resume_text, job_desc=None):
    try:
        job_section = (
            f"\n\nJob Description (use this to judge matched/missing skills):\n{job_desc[:1500]}"
            if job_desc else
            "\n\nNo job description provided — extract skills relevant to general tech/professional roles."
        )

        prompt = f"""You are an expert ATS resume analyst. Analyze the resume below and return a single JSON object.

Resume:
{resume_text[:3000]}
{job_section}

Return ONLY this JSON — no markdown, no explanation, no code fences:
{{
  "matched_skills": ["skill1", "skill2"],
  "missing_skills": ["skill3", "skill4"],
  "suggestions": ["suggestion1", "suggestion2", "suggestion3", "suggestion4", "suggestion5"],
  "years_experience": 0,
  "action_verbs_found": ["verb1", "verb2"]
}}

Rules:
- matched_skills: every skill/tool/language the candidate demonstrably has. Include aliases (ML = machine learning). Max 25.
- missing_skills: important skills completely absent from resume. Max 8, only genuinely useful gaps.
- suggestions: exactly 5 specific actionable improvements starting with action verbs, referencing actual resume content. No generic advice.
- years_experience: integer total years of professional experience. 0 if student/fresher.
- action_verbs_found: strong action verbs present in the resume.
- Return ONLY valid JSON. No markdown. No backticks."""

        response = gemini_client.models.generate_content(
            model="gemini-2.5-flash",
            contents=prompt
        )

        raw = response.text.strip()
        raw = re.sub(r'^```(?:json)?\s*', '', raw, flags=re.MULTILINE)
        raw = re.sub(r'\s*```$', '', raw, flags=re.MULTILINE)
        raw = raw.strip()

        data = json.loads(raw)

        return {
            "matched_skills":     [str(s) for s in data.get("matched_skills",     [])],
            "missing_skills":     [str(s) for s in data.get("missing_skills",     [])],
            "suggestions":        [str(s) for s in data.get("suggestions",        [])],
            "years_experience":   int(data.get("years_experience", 0)),
            "action_verbs_found": [str(v) for v in data.get("action_verbs_found", [])],
        }

    except Exception as e:
        print(f"Gemini error: {e}")
        return None

# ---------------------------------------------------------------------------
# Scoring
# ---------------------------------------------------------------------------
def calculate_score(text, job_desc=None):
    text_lower = text.lower()

    gemini = get_gemini_analysis(text, job_desc)

    if gemini:
        matched        = gemini["matched_skills"]
        missing        = gemini["missing_skills"]
        suggestions    = gemini["suggestions"]
        years          = gemini["years_experience"]
        action_matches = gemini["action_verbs_found"]
    else:
        print("Falling back to string matching")
        matched        = [s for s in FALLBACK_SKILLS if s in text_lower]
        missing        = [s for s in FALLBACK_SKILLS if s not in text_lower][:8]
        action_matches = [v for v in ACTION_VERBS if v in text_lower]
        years_match    = re.findall(r'(\d+)\s*\+?\s*year', text_lower)
        years          = max([int(y) for y in years_match], default=0) if years_match else 0
        suggestions    = build_fallback_suggestions(text_lower, matched, missing, action_matches, job_desc)

    has_numbers = bool(re.search(r'\d+\s*%|\d+\s*x\b|\$\d+', text_lower))

    # Skills (40%)
    if job_desc:
        total_relevant    = len(matched) + len(missing)
        skills_score      = min(len(matched) / max(total_relevant * 0.5, 1), 1.0) * 40
        job_match_percent = round(len(matched) / max(total_relevant, 1) * 100)
    else:
        skills_score      = min(len(matched) / 15, 1.0) * 40
        job_match_percent = None

    # Experience (30%)
    if years >= 5:
        exp_score = 30
    elif years >= 3:
        exp_score = 26
    elif years >= 1:
        exp_score = 20
    elif len(action_matches) >= 5:
        exp_score = 16
    else:
        exp_score = 10
    if has_numbers:
        exp_score = min(exp_score + 5, 30)

    # Keywords (20%)
    keyword_score = min(len(action_matches) / 10, 1.0) * 20

    # Education (10%)
    edu_score = 10 if any(e in text_lower for e in EDUCATION_KEYWORDS) else 4

    total = min(round(skills_score + exp_score + keyword_score + edu_score), 100)

    return {
        "score":              total,
        "matched_skills":     matched[:25],
        "missing_skills":     missing[:8],
        "suggestions":        suggestions[:5],
        "job_match_percent":  job_match_percent,
        "years_experience":   years,
        "action_verbs_found": action_matches,
    }

def build_fallback_suggestions(text_lower, matched, missing, action_matches, job_desc):
    tips = []
    if len(matched) < 5:
        tips.append("Add more technical skills relevant to your target role.")
    if len(action_matches) < 4:
        tips.append("Use strong action verbs like: built, developed, designed, led, optimized.")
    if not re.search(r'\d+\s*%|\d+\s*x\b|\$\d+', text_lower):
        tips.append("Quantify your achievements (e.g. 'improved performance by 30%').")
    if not any(e in text_lower for e in EDUCATION_KEYWORDS):
        tips.append("Clearly mention your degree and field of study.")
    if missing:
        tips.append(f"Consider adding these missing skills: {', '.join(missing[:5])}.")
    return tips or ["Review your resume for completeness and clarity."]

# ---------------------------------------------------------------------------
# Route
# ---------------------------------------------------------------------------
@app.route("/analyze", methods=["POST"])
def analyze():
    if "resume" not in request.files:
        return jsonify({"error": "No file uploaded"}), 400

    file     = request.files["resume"]
    filename = file.filename
    filepath = os.path.join("uploads", filename)
    os.makedirs("uploads", exist_ok=True)
    file.save(filepath)

    job_desc = request.form.get("job_description", "").strip()

    try:
        # Cache check
        cache_key = get_cache_key(filepath, job_desc)
        if cache_key in analysis_cache:
            print(f"Cache hit for {filename} — returning instantly")
            return jsonify(analysis_cache[cache_key])

        # Extract text
        if filename.endswith(".pdf"):
            text = extract_text_from_pdf(filepath)
        elif filename.endswith(".docx"):
            text = extract_text_from_docx(filepath)
        else:
            return jsonify({"error": "Only PDF and DOCX supported"}), 400

        # Analyze
        result = calculate_score(text, job_desc if job_desc else None)

        # Store in cache
        analysis_cache[cache_key] = result
        print(f"Cached result for {filename}")

        return jsonify(result)

    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    app.run(port=5001, debug=True)