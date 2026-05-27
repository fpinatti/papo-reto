require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const QRCode = require('qrcode');
const { Client, LocalAuth } = require('whatsapp-web.js');

const db = require('./database');
const gemini = require('./gemini');
const telegram = require('./telegram');

const app = express();
const port = process.env.PORT || 3000;
const host = process.env.HOST || '127.0.0.1'; // Listen locally by default for security

// Initialize App Password
let hashedAppPassword = null;
if (process.env.APP_PASSWORD) {
  hashedAppPassword = bcrypt.hashSync(process.env.APP_PASSWORD, 10);
  console.log('App login password configured from environment variable.');
} else {
  const tempPass = crypto.randomBytes(8).toString('hex');
  console.warn('\n========================================================================');
  console.warn('WARNING: APP_PASSWORD is not set in your .env file.');
  console.warn(`An ephemeral password has been generated for this session: ${tempPass}`);
  console.warn('========================================================================\n');
  hashedAppPassword = bcrypt.hashSync(tempPass, 10);
}

// 1. Body parsing middleware
app.use(express.json());

// 2. Security Headers (CSP, XSS protection, anti-clickjacking)
app.use((req, res, next) => {
  // Strict Content Security Policy
  // Allows loading fonts from Google Fonts and styles locally
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; " +
    "script-src 'self'; " +
    "style-src 'self' https://fonts.googleapis.com; " +
    "font-src 'self' https://fonts.gstatic.com; " +
    "img-src 'self' data:; " +
    "connect-src 'self'; " +
    "frame-ancestors 'none';"
  );
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
});

// 3. Secure Session Setup
const isProd = process.env.NODE_ENV === 'production';
app.use(session({
  name: isProd ? '__Host-wa-session' : 'wa_session',
  secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: isProd, // Requires HTTPS in production
    sameSite: 'strict',
    maxAge: 1000 * 60 * 60 * 24 // 24 hours
  }
}));

// Serve static libraries from node_modules for local XSS protection
app.use('/libs/dompurify', express.static(path.join(__dirname, 'node_modules/dompurify/dist')));
app.use('/libs/marked', express.static(path.join(__dirname, 'node_modules/marked')));

// Serve other static frontend assets
app.use(express.static(path.join(__dirname, 'public')));

// 4. CSRF Protection Middleware (Synchronizer Token Pattern)
// Generates a CSRF token on login and validates it on state-changing requests
function validateCsrf(req, res, next) {
  const method = req.method;
  // Ignore safe HTTP methods
  if (['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    return next();
  }

  const clientToken = req.headers['x-csrf-token'];
  const sessionToken = req.session.csrfToken;

  if (!sessionToken || clientToken !== sessionToken) {
    console.warn(`CSRF validation failed for ${method} ${req.url}`);
    return res.status(403).json({ error: 'Invalid or missing CSRF token' });
  }
  next();
}

// 5. Authentication Verification Middleware
function requireAuth(req, res, next) {
  if (req.session && req.session.authenticated) {
    return next();
  }
  res.status(401).json({ error: 'Unauthorized. Please log in.' });
}

// Apply CSRF checking to all post-login state-changing requests
app.use('/api', validateCsrf);

// 6. WhatsApp Web Client Initialization
let waClientStatus = 'disconnected'; // disconnected, connecting, qr_ready, authenticated, ready, auth_failure
let waQrCodeData = null;

console.log('Initializing WhatsApp Web Client...');
const waClient = new Client({
  authStrategy: new LocalAuth({
    dataPath: path.join(__dirname, '.wwebjs_auth')
  }),
  puppeteer: {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--single-process',
      '--disable-gpu'
    ]
  }
});

waClient.on('qr', async (qr) => {
  try {
    waQrCodeData = await QRCode.toDataURL(qr);
    waClientStatus = 'qr_ready';
    console.log('WhatsApp Web QR Code generated. Ready for scanning.');
  } catch (err) {
    console.error('Error generating QR Code data URL:', err);
    waClientStatus = 'disconnected';
  }
});

waClient.on('connecting', () => {
  waClientStatus = 'connecting';
  waQrCodeData = null;
  console.log('Connecting to WhatsApp Web...');
});

waClient.on('authenticated', () => {
  waClientStatus = 'authenticated';
  waQrCodeData = null;
  console.log('WhatsApp Web Authenticated successfully.');
});

waClient.on('auth_failure', (msg) => {
  waClientStatus = 'auth_failure';
  waQrCodeData = null;
  console.error('WhatsApp Web Authentication Failure:', msg);
});

waClient.on('ready', () => {
  waClientStatus = 'ready';
  waQrCodeData = null;
  console.log('WhatsApp Web Client is READY.');
});

waClient.on('disconnected', (reason) => {
  waClientStatus = 'disconnected';
  waQrCodeData = null;
  console.warn('WhatsApp Web Client was disconnected:', reason);
  // Re-initialize after delay
  setTimeout(() => {
    console.log('Re-initializing WhatsApp Web client...');
    waClient.initialize().catch(err => console.error('Error re-initializing WA Client:', err));
  }, 5000);
});

// Start the client
waClient.initialize().catch((err) => {
  console.error('Failed to initialize WhatsApp Web Client:', err);
});

// ==========================================
// API ENDPOINTS
// ==========================================

// Login Endpoint
app.post('/api/login', (req, res) => {
  const { password } = req.body;

  if (!password) {
    return res.status(400).json({ error: 'Password is required' });
  }

  const matches = bcrypt.compareSync(password, hashedAppPassword);
  if (matches) {
    req.session.authenticated = true;
    
    // Generate secure CSRF token
    const csrfToken = crypto.randomBytes(32).toString('hex');
    req.session.csrfToken = csrfToken;

    console.log('User logged in successfully. Session initialized.');
    return res.json({ success: true, csrfToken });
  }

  res.status(401).json({ error: 'Incorrect password' });
});

// Logout Endpoint
app.post('/api/logout', requireAuth, (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Error destroying session:', err);
      return res.status(500).json({ error: 'Failed to log out' });
    }
    res.clearCookie(isProd ? '__Host-wa-session' : 'wa_session');
    res.json({ success: true });
  });
});

// Status Endpoint (fetches connection status and CSRF token)
app.get('/api/status', async (req, res) => {
  // Ensure session has a CSRF token (even if not authenticated yet)
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(32).toString('hex');
  }

  let tgClientStatus = 'disconnected';
  if (req.session && req.session.authenticated) {
    tgClientStatus = await telegram.getTelegramStatus();
  }

  const responseData = {
    isAuthenticated: !!(req.session && req.session.authenticated),
    whatsappStatus: waClientStatus,
    telegramStatus: tgClientStatus,
    csrfToken: req.session.csrfToken
  };

  if (waClientStatus === 'qr_ready' && waQrCodeData) {
    responseData.qrCode = waQrCodeData;
  }

  res.json(responseData);
});

// Get Groups/Chats Endpoint
app.get('/api/chats', requireAuth, async (req, res) => {
  const platform = req.query.platform || 'whatsapp';

  if (platform === 'whatsapp') {
    if (waClientStatus !== 'ready') {
      return res.status(503).json({ error: 'WhatsApp client is not ready. Status: ' + waClientStatus });
    }

    try {
      console.log('Fetching chats from WhatsApp Web...');
      const chats = await waClient.getChats();
      const groups = chats
        .filter(c => c.isGroup)
        .map(c => ({
          id: c.id._serialized,
          name: c.name || 'Unnamed Group'
        }));

      res.json({ success: true, groups });
    } catch (error) {
      console.error('Error fetching chats:', error);
      res.status(500).json({ error: 'Failed to fetch chats from WhatsApp' });
    }
  } else if (platform === 'telegram') {
    try {
      console.log('Fetching discovered Telegram groups...');
      const groups = await telegram.getTelegramChats();
      res.json({ success: true, groups });
    } catch (error) {
      console.error('Error fetching Telegram chats:', error);
      res.status(500).json({ error: 'Failed to fetch Telegram groups: ' + error.message });
    }
  } else {
    res.status(400).json({ error: 'Invalid platform parameter' });
  }
});

// Telegram MTProto Connect Endpoint
app.post('/api/telegram/connect', requireAuth, async (req, res) => {
  const { apiId, apiHash, phoneNumber } = req.body;

  if (!apiId || !apiHash || !phoneNumber) {
    return res.status(400).json({ error: 'apiId, apiHash and phoneNumber are required' });
  }

  try {
    console.log(`Telegram login: Sending OTP verification code to ${phoneNumber}...`);
    const phoneCodeHash = await telegram.sendCode(apiId, apiHash, phoneNumber);
    req.session.tgPhoneCodeHash = phoneCodeHash;
    res.json({ success: true });
  } catch (error) {
    console.error('Error starting Telegram connection:', error);
    res.status(500).json({ error: 'Failed to send Telegram code: ' + error.message });
  }
});

// Telegram MTProto Verify Code Endpoint
app.post('/api/telegram/verify', requireAuth, async (req, res) => {
  const { phoneCode, password } = req.body;
  const phoneCodeHash = req.session.tgPhoneCodeHash;

  if (!phoneCode) {
    return res.status(400).json({ error: 'phoneCode is required' });
  }
  if (!phoneCodeHash) {
    return res.status(400).json({ error: 'Verification session expired. Please request the code again.' });
  }

  try {
    console.log(`Telegram login: Verifying login code...`);
    const result = await telegram.signIn(phoneCode, password, phoneCodeHash);
    
    if (result.success) {
      delete req.session.tgPhoneCodeHash;
      console.log('Telegram Login: Success!');
      res.json({ success: true });
    } else if (result.requiresPassword) {
      res.json({ success: false, requiresPassword: true });
    }
  } catch (error) {
    console.error('Error verifying Telegram code:', error);
    res.status(500).json({ error: 'Verification failed: ' + error.message });
  }
});

// Sync Messages Endpoint (Syncs WhatsApp messages to local DB)
app.post('/api/sync', requireAuth, async (req, res) => {
  const { chatId, days = 1 } = req.body;

  if (!chatId) {
    return res.status(400).json({ error: 'chatId is required' });
  }

  if (waClientStatus !== 'ready') {
    return res.status(503).json({ error: 'WhatsApp client is not ready. Status: ' + waClientStatus });
  }

  try {
    console.log(`Syncing messages for chat ${chatId} going back ${days} day(s)...`);
    const chat = await waClient.getChatById(chatId);
    
    // Fetch a large buffer of messages
    const msgs = await chat.fetchMessages({ limit: 1000 });
    
    const cutoffTime = Math.floor(Date.now() / 1000) - (parseInt(days) * 24 * 60 * 60);
    const filteredMsgs = msgs.filter(m => m.timestamp >= cutoffTime && m.body && m.body.trim().length > 0);

    const formattedMsgs = await Promise.all(
      filteredMsgs.map(async (m) => {
        let senderName = 'Unknown';
        try {
          const contact = await m.getContact();
          senderName = contact.pushname || contact.name || 'Unknown';
        } catch (contactError) {
          // Fallback if contact lookup fails
          senderName = m.author || m.from || 'Unknown';
        }

        return {
          id: m.id.id,
          chatId: chatId,
          senderId: m.author || m.from,
          senderName: senderName,
          timestamp: m.timestamp,
          body: m.body
        };
      })
    );

    await db.saveMessages(formattedMsgs);
    console.log(`Successfully synced and saved ${formattedMsgs.length} messages for group ${chat.name}`);

    res.json({
      success: true,
      totalSynced: formattedMsgs.length,
      chatName: chat.name
    });
  } catch (error) {
    console.error('Error syncing messages:', error);
    res.status(500).json({ error: 'Failed to synchronize messages' });
  }
});

// Summarize Endpoint (Syncs, then generates and saves a summary)
app.post('/api/summarize', requireAuth, async (req, res) => {
  const { chatId, chatName, days = 1, platform = 'whatsapp' } = req.body;

  if (!chatId || !chatName) {
    return res.status(400).json({ error: 'chatId and chatName are required' });
  }

  try {
    // 1. Trigger synchronization to get the latest messages
    if (platform === 'whatsapp') {
      if (waClientStatus === 'ready') {
        console.log(`Auto-syncing chat ${chatName} before summarization...`);
        try {
          const chat = await waClient.getChatById(chatId);
          const msgs = await chat.fetchMessages({ limit: 1000 });
          const cutoffTime = Math.floor(Date.now() / 1000) - (parseInt(days) * 24 * 60 * 60);
          const filteredMsgs = msgs.filter(m => m.timestamp >= cutoffTime && m.body && m.body.trim().length > 0);

          const formattedMsgs = await Promise.all(
            filteredMsgs.map(async (m) => {
              let senderName = 'Unknown';
              try {
                const contact = await m.getContact();
                senderName = contact.pushname || contact.name || 'Unknown';
              } catch (err) {
                senderName = m.author || m.from || 'Unknown';
              }
              return {
                id: m.id.id,
                chatId: chatId,
                senderId: m.author || m.from,
                senderName: senderName,
                timestamp: m.timestamp,
                body: m.body,
                platform: 'whatsapp'
              };
            })
          );
          await db.saveMessages(formattedMsgs);
        } catch (syncError) {
          console.warn('Silent sync error before summary (will proceed with existing DB messages):', syncError);
        }
      } else {
        console.warn('WhatsApp client is not ready. Proceeding with database-cached messages only.');
      }
    } else if (platform === 'telegram') {
      console.log(`Auto-syncing Telegram chat ${chatName} before digest...`);
      try {
        await telegram.syncTelegramMessages(chatId, days);
      } catch (syncError) {
        console.warn('Silent sync error before Telegram summary (will proceed with existing DB messages):', syncError);
      }
    }

    // 2. Fetch unsummarized messages from DB
    const cutoffTimestamp = Math.floor(Date.now() / 1000) - (parseInt(days) * 24 * 60 * 60);
    const nowTimestamp = Math.floor(Date.now() / 1000);

    const unsummarizedMessages = await db.getUnsummarizedMessages(chatId, cutoffTimestamp, nowTimestamp);
    
    if (unsummarizedMessages.length === 0) {
      return res.json({
        success: true,
        summary: 'No new, unprocessed messages were found in the selected timeframe to generate a Papo Reto digest.',
        messageCount: 0
      });
    }

    // 3. Generate summary using Gemini SDK
    const summaryMarkdown = await gemini.generateGroupSummary(chatName, unsummarizedMessages);

    // 4. Save summary to DB
    const summaryId = await db.saveSummary(chatId, chatName, summaryMarkdown, cutoffTimestamp, nowTimestamp, platform);

    // 5. Mark messages as summarized
    const messageIds = unsummarizedMessages.map(m => m.id);
    await db.markMessagesAsSummarized(messageIds);

    res.json({
      success: true,
      summaryId,
      summary: summaryMarkdown,
      messageCount: unsummarizedMessages.length
    });

  } catch (error) {
    console.error('Error generating summary:', error);
    res.status(500).json({ error: 'Failed to generate Papo Reto digest: ' + error.message });
  }
});

// Fetch Saved Summaries Endpoint
app.get('/api/summaries', requireAuth, async (req, res) => {
  const { chatId } = req.query;

  try {
    const summaries = await db.getSummaries(chatId);
    res.json({ success: true, summaries });
  } catch (error) {
    console.error('Error fetching summaries:', error);
    res.status(500).json({ error: 'Failed to retrieve past summaries' });
  }
});

// Fetch Single Summary Endpoint
app.get('/api/summaries/:id', requireAuth, async (req, res) => {
  const { id } = req.params;

  try {
    const summary = await db.getSummaryById(id);
    if (!summary) {
      return res.status(404).json({ error: 'Digest not found' });
    }
    res.json({ success: true, summary });
  } catch (error) {
    console.error('Error fetching summary details:', error);
    res.status(500).json({ error: 'Failed to retrieve digest details' });
  }
});

// Initialize database then start server
db.initDatabase()
  .then(() => {
    app.listen(port, host, () => {
      console.log(`\n========================================================================`);
      console.log(`Server is running at http://${host}:${port}`);
      console.log(`Security Notice: Listening on local interface only (127.0.0.1)`);
      console.log(`========================================================================\n`);
      
      // Start Telegram Bot background updates polling service
      telegram.startTelegramPolling();
    });
  })
  .catch((err) => {
    console.error('Failed to initialize database. Server cannot start.', err);
    process.exit(1);
  });
