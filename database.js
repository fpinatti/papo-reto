const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');

let db = null;

/**
 * Initializes the SQLite database and creates the tables if they do not exist.
 */
async function initDatabase() {
  if (db) return db;

  const dbPath = path.join(__dirname, 'messages.db');
  const dbExists = fs.existsSync(dbPath);

  if (!dbExists) {
    console.log('Database file does not exist. Creating a new database file at:', dbPath);
  }
  
  db = await open({
    filename: dbPath,
    driver: sqlite3.Database
  });

  // Enable foreign keys
  await db.run('PRAGMA foreign_keys = ON;');

  // Create messages table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      chat_id TEXT NOT NULL,
      sender_id TEXT,
      sender_name TEXT,
      timestamp INTEGER NOT NULL,
      body TEXT,
      is_summarized INTEGER DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_messages_chat_timestamp ON messages(chat_id, timestamp);
  `);

  // Create summaries table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS summaries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_id TEXT NOT NULL,
      chat_name TEXT NOT NULL,
      summary_markdown TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      start_timestamp INTEGER NOT NULL,
      end_timestamp INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_summaries_chat_created ON summaries(chat_id, created_at);
  `);

  console.log('Database initialized successfully at', dbPath);
  return db;
}

/**
 * Saves a list of messages to the database.
 * Skips messages that already exist (INSERT OR IGNORE).
 * @param {Array} messages List of message objects
 */
async function saveMessages(messages) {
  if (!db) await initDatabase();

  const stmt = await db.prepare(`
    INSERT OR IGNORE INTO messages (id, chat_id, sender_id, sender_name, timestamp, body, is_summarized)
    VALUES (?, ?, ?, ?, ?, ?, 0)
  `);

  try {
    for (const msg of messages) {
      // Basic sanitization of arguments is handled by parameterization
      await stmt.run([
        msg.id,
        msg.chatId,
        msg.senderId,
        msg.senderName,
        msg.timestamp,
        msg.body
      ]);
    }
  } finally {
    await stmt.finalize();
  }
}

/**
 * Retrieves all unsummarized messages for a specific chat in a given timestamp range.
 * @param {string} chatId The WhatsApp chat ID
 * @param {number} startTimestamp Start Unix timestamp (seconds)
 * @param {number} endTimestamp End Unix timestamp (seconds)
 * @returns {Promise<Array>} List of messages
 */
async function getUnsummarizedMessages(chatId, startTimestamp, endTimestamp) {
  if (!db) await initDatabase();

  return db.all(
    `SELECT * FROM messages 
     WHERE chat_id = ? 
     AND timestamp >= ? 
     AND timestamp <= ? 
     AND is_summarized = 0 
     ORDER BY timestamp ASC`,
    [chatId, startTimestamp, endTimestamp]
  );
}

/**
 * Marks a list of message IDs as summarized.
 * @param {Array<string>} messageIds List of unique message IDs
 */
async function markMessagesAsSummarized(messageIds) {
  if (!db) await initDatabase();
  if (!messageIds || messageIds.length === 0) return;

  // Since messageIds can be long, we chunk updates to avoid SQL parameter limits
  const chunkSize = 999;
  for (let i = 0; i < messageIds.length; i += chunkSize) {
    const chunk = messageIds.slice(i, i + chunkSize);
    const placeholders = chunk.map(() => '?').join(',');
    await db.run(
      `UPDATE messages SET is_summarized = 1 WHERE id IN (${placeholders})`,
      chunk
    );
  }
}

/**
 * Saves a generated summary.
 * @param {string} chatId WhatsApp chat ID
 * @param {string} chatName Name of the chat
 * @param {string} summaryMarkdown Summarization content
 * @param {number} startTimestamp Timestamp of first message
 * @param {number} endTimestamp Timestamp of last message
 */
async function saveSummary(chatId, chatName, summaryMarkdown, startTimestamp, endTimestamp) {
  if (!db) await initDatabase();

  const now = Math.floor(Date.now() / 1000);
  
  const result = await db.run(
    `INSERT INTO summaries (chat_id, chat_name, summary_markdown, created_at, start_timestamp, end_timestamp)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [chatId, chatName, summaryMarkdown, now, startTimestamp, endTimestamp]
  );

  return result.lastID;
}

/**
 * Retrieves all saved summaries for a specific group.
 * @param {string} chatId WhatsApp chat ID
 * @returns {Promise<Array>} Saved summaries
 */
async function getSummaries(chatId) {
  if (!db) await initDatabase();

  if (chatId) {
    return db.all(
      `SELECT * FROM summaries WHERE chat_id = ? ORDER BY created_at DESC`,
      [chatId]
    );
  } else {
    return db.all(
      `SELECT * FROM summaries ORDER BY created_at DESC`
    );
  }
}

/**
 * Retrieves a specific summary by ID.
 * @param {number} id The database summary ID
 * @returns {Promise<Object>} The summary record
 */
async function getSummaryById(id) {
  if (!db) await initDatabase();

  return db.get(`SELECT * FROM summaries WHERE id = ?`, [id]);
}

module.exports = {
  initDatabase,
  saveMessages,
  getUnsummarizedMessages,
  markMessagesAsSummarized,
  saveSummary,
  getSummaries,
  getSummaryById
};
