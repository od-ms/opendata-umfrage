const express = require('express');
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const sqlite3 = require('sqlite3').verbose();
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(bodyParser.json());

const DATA_DIR = path.join(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'db.sqlite');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Load questions from multiple YAML files (questions1.yml, questions2.yml, etc.)
let questionsSets = {};
function loadQuestions() {
  questionsSets = {};
  for (let i = 1; ; i++) {
    const file = path.join(DATA_DIR, `questions${i}.yml`);
    if (!fs.existsSync(file)) break;
    try {
      const raw = fs.readFileSync(file, 'utf8');
      const parsed = yaml.load(raw);
      if (Array.isArray(parsed)) {
        questionsSets[i] = parsed.map((q, idx) => ({ id: idx + 1, set: i, ...q }));
      }
    } catch (err) {
      console.error(`Failed to parse ${file}:`, err);
    }
  }
  if (Object.keys(questionsSets).length === 0) {
    console.warn('No questions files found in data/. Add questions1.yml, etc.');
  }
}
loadQuestions();

// Initialize sqlite DB
const db = new sqlite3.Database(DB_FILE);
db.serialize(() => {
  db.run(
    `CREATE TABLE IF NOT EXISTS answers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      set_id INTEGER,
      question_id INTEGER,
      answer INTEGER,
      ts INTEGER
    )`
  );
  // Migrate old data if exists (assume set_id 1 for old entries)
  db.run(`UPDATE answers SET set_id = 1 WHERE set_id IS NULL`);
});

app.get('/api/questions/random', (req, res) => {
  const set = parseInt(req.query.set, 10) || 1;
  const qs = questionsSets[set];
  if (!qs || !qs.length) return res.status(404).json({ error: 'no questions for this set' });
  const idx = Math.floor(Math.random() * qs.length);
  res.json(qs[idx]);
});

app.post('/api/answers', (req, res) => {
  const { questionId, answer, set } = req.body;
  const setId = parseInt(set, 10) || 1;
  if (!questionId || ![1, 2].includes(answer)) {
    return res.status(400).json({ error: 'invalid payload' });
  }
  const ts = Date.now();
  db.run(
    'INSERT INTO answers (set_id, question_id, answer, ts) VALUES (?, ?, ?, ?)',
    [setId, questionId, answer, ts],
    function (err) {
      if (err) return res.status(500).json({ error: 'db error' });
      res.json({ ok: true, id: this.lastID });
    }
  );
});

// Return all known questions (useful for dashboards)
app.get('/api/questions', (req, res) => {
  const set = parseInt(req.query.set, 10) || 1;
  const qs = questionsSets[set];
  res.json(qs || []);
});

// Return recent answers for timeline/dashboard (limit optional)
app.get('/api/answers', (req, res) => {
  const set = parseInt(req.query.set, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 1000;
  db.all('SELECT id, question_id, answer, ts FROM answers WHERE set_id = ? ORDER BY ts DESC LIMIT ?', [set, limit], (err, rows) => {
    if (err) return res.status(500).json({ error: 'db error' });
    res.json(rows || []);
  });
});

// Basic stats: total counts per answer and per question
app.get('/api/stats', (req, res) => {
  const set = parseInt(req.query.set, 10) || 1;
  db.all(
    `SELECT question_id, answer, COUNT(*) as cnt FROM answers WHERE set_id = ? GROUP BY question_id, answer`,
    [set],
    (err, rows) => {
      if (err) return res.status(500).json({ error: 'db error' });
      const byQuestion = {};
      rows.forEach((r) => {
        byQuestion[r.question_id] = byQuestion[r.question_id] || { '1': 0, '2': 0 };
        byQuestion[r.question_id][String(r.answer)] = r.cnt;
      });
      // also provide totals
      const totals = rows.reduce((acc, r) => {
        acc[String(r.answer)] = (acc[String(r.answer)] || 0) + r.cnt;
        return acc;
      }, {});
      res.json({ totals, byQuestion });
    }
  );
});

// Serve static files if a frontend build is present in ../frontend/build
const FRONTEND_BUILD = path.join(process.cwd(), '..', 'frontend', 'build');
if (fs.existsSync(FRONTEND_BUILD)) {
  app.use(express.static(FRONTEND_BUILD));
  app.get('*', (req, res) => res.sendFile(path.join(FRONTEND_BUILD, 'index.html')));
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server listening on http://0.0.0.0:${PORT}`);
});
