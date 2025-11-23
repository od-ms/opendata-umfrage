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
const QUESTIONS_FILE = path.join(DATA_DIR, 'questions.yml');
const DB_FILE = path.join(DATA_DIR, 'db.sqlite');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Load questions from YAML (if present)
let questions = [];
if (fs.existsSync(QUESTIONS_FILE)) {
  const raw = fs.readFileSync(QUESTIONS_FILE, 'utf8');
  try {
    const parsed = yaml.load(raw);
    if (Array.isArray(parsed)) {
      questions = parsed.map((q, i) => ({ id: i + 1, ...q }));
    }
  } catch (err) {
    console.error('Failed to parse questions.yml:', err);
  }
} else {
  console.warn('No questions.yml found in data/. Add one to `data/questions.yml`.');
}

// Initialize sqlite DB
const db = new sqlite3.Database(DB_FILE);
db.serialize(() => {
  db.run(
    `CREATE TABLE IF NOT EXISTS answers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      question_id INTEGER,
      answer INTEGER,
      ts INTEGER
    )`
  );
});

app.get('/api/questions/random', (req, res) => {
  if (!questions.length) return res.status(404).json({ error: 'no questions' });
  const idx = Math.floor(Math.random() * questions.length);
  res.json(questions[idx]);
});

app.post('/api/answers', (req, res) => {
  const { questionId, answer } = req.body;
  if (!questionId || ![1, 2].includes(answer)) {
    return res.status(400).json({ error: 'invalid payload' });
  }
  const ts = Date.now();
  db.run(
    'INSERT INTO answers (question_id, answer, ts) VALUES (?, ?, ?)',
    [questionId, answer, ts],
    function (err) {
      if (err) return res.status(500).json({ error: 'db error' });
      res.json({ ok: true, id: this.lastID });
    }
  );
});

// Return all known questions (useful for dashboards)
app.get('/api/questions', (req, res) => {
  res.json(questions);
});

// Return recent answers for timeline/dashboard (limit optional)
app.get('/api/answers', (req, res) => {
  const limit = parseInt(req.query.limit, 10) || 1000;
  db.all('SELECT id, question_id, answer, ts FROM answers ORDER BY ts DESC LIMIT ?', [limit], (err, rows) => {
    if (err) return res.status(500).json({ error: 'db error' });
    res.json(rows || []);
  });
});

// Basic stats: total counts per answer and per question
app.get('/api/stats', (req, res) => {
  db.all(
    `SELECT question_id, answer, COUNT(*) as cnt FROM answers GROUP BY question_id, answer`,
    [],
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
