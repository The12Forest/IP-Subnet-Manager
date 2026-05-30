const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const config = require('../config');

const dbPath = path.resolve(config.dbPath);
const dbDir = path.dirname(dbPath);

// Ensure the database directory exists
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database', err.message);
    throw err;
  }
  console.log('Connected to the SQLite database.');
});

module.exports = db;
