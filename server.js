import express from 'express';
import cors from 'cors';
import sqlite3 from 'sqlite3';
import { fileURLToPath } from 'url';
import path from 'path';

const app = express();
app.use(cors());
app.use(express.json());

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.join(__dirname, 'leads.db');

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error("Error opening SQLite database:", err.message);
  } else {
    console.log("Connected to SQLite database at:", dbPath);
    db.run(`
      CREATE TABLE IF NOT EXISTS players (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        contact TEXT NOT NULL,
        registered_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }
});

// API endpoint to register a new player
app.post('/api/register', (req, res) => {
  const { name, contact } = req.body;
  if (!name || !contact) {
    return res.status(400).json({ error: "Name and contact are required." });
  }
  
  db.run(
    `INSERT INTO players (name, contact) VALUES (?, ?)`,
    [name, contact],
    function (err) {
      if (err) {
        console.error("Database insert error:", err.message);
        return res.status(500).json({ error: "Failed to write player to SQLite." });
      }
      res.json({ success: true, id: this.lastID });
    }
  );
});

// API endpoint to list all players for real-time inspection
app.get('/api/players', (req, res) => {
  db.all(`SELECT * FROM players ORDER BY registered_at DESC`, [], (err, rows) => {
    if (err) {
      console.error("Database select error:", err.message);
      return res.status(500).json({ error: "Failed to read database." });
    }
    res.json(rows);
  });
});

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`SQLite Registration Server running on port ${PORT}`);
});
