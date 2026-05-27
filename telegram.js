const { TelegramClient, Api } = require('telegram');
const { StringSession } = require('telegram/sessions');
const db = require('./database');

let client = null;
let tempClient = null;

/**
 * Initializes and returns the active connected Telegram user client.
 */
async function getTelegramClient() {
  if (client && client.connected) {
    return client;
  }

  const apiId = await db.getTelegramConfig('api_id');
  const apiHash = await db.getTelegramConfig('api_hash');
  const sessionString = await db.getTelegramConfig('session_string');

  if (!apiId || !apiHash || !sessionString) {
    return null;
  }

  try {
    client = new TelegramClient(
      new StringSession(sessionString),
      parseInt(apiId),
      apiHash,
      { connectionRetries: 5 }
    );
    await client.connect();
    console.log('Telegram User Client: Successfully connected.');
    return client;
  } catch (err) {
    console.error('Telegram User Client: Connection error:', err.message);
    client = null;
    return null;
  }
}

/**
 * Initiates the phone number verification process, sending an OTP code.
 */
async function sendCode(apiId, apiHash, phoneNumber) {
  // Store setup details
  await db.saveTelegramConfig('api_id', apiId.toString());
  await db.saveTelegramConfig('api_hash', apiHash);
  await db.saveTelegramConfig('phone_number', phoneNumber);

  // Clean up any existing instances
  if (tempClient) {
    try { await tempClient.disconnect(); } catch (e) {}
  }

  tempClient = new TelegramClient(
    new StringSession(''),
    parseInt(apiId),
    apiHash,
    { connectionRetries: 5 }
  );

  await tempClient.connect();

  const result = await tempClient.sendCode(
    {
      apiId: parseInt(apiId),
      apiHash: apiHash
    },
    phoneNumber
  );

  return result.phoneCodeHash;
}

/**
 * Completes the code login process (OTP + 2FA password).
 */
async function signIn(phoneCode, password, phoneCodeHash) {
  if (!tempClient) {
    throw new Error('Telegram connection not initialized. Please try sending the code again.');
  }

  const apiId = await db.getTelegramConfig('api_id');
  const apiHash = await db.getTelegramConfig('api_hash');
  const phoneNumber = await db.getTelegramConfig('phone_number');

  try {
    // Invoke auth.signIn manually using GramJS Api
    await tempClient.invoke(
      new Api.auth.SignIn({
        phoneNumber: phoneNumber,
        phoneCodeHash: phoneCodeHash,
        phoneCode: phoneCode
      })
    );

    // Save the established session
    const sessionString = tempClient.session.save();
    await db.saveTelegramConfig('session_string', sessionString);

    client = tempClient;
    tempClient = null;
    return { success: true };
  } catch (err) {
    if (err.message.includes('SESSION_PASSWORD_NEEDED')) {
      if (!password) {
        return { success: false, requiresPassword: true };
      }

      // If user provided a password, authenticate using the 2FA password helper
      try {
        await tempClient.signInWithPassword(
          {
            apiId: parseInt(apiId),
            apiHash: apiHash
          },
          {
            password: () => Promise.resolve(password),
            onError: (err) => { throw err; }
          }
        );

        // Save session
        const sessionString = tempClient.session.save();
        await db.saveTelegramConfig('session_string', sessionString);

        client = tempClient;
        tempClient = null;
        return { success: true };
      } catch (pwdErr) {
        throw new Error('2FA password verification failed: ' + pwdErr.message);
      }
    }
    throw err;
  }
}

/**
 * Retrieves the dialogs/groups on-demand.
 */
async function getTelegramChats() {
  const activeClient = await getTelegramClient();
  if (!activeClient) {
    throw new Error('Telegram client is not authenticated.');
  }

  try {
    const dialogs = await activeClient.getDialogs({ limit: 100 });
    const groups = [];

    for (const dialog of dialogs) {
      if (dialog.isGroup || dialog.isChannel) {
        const chatId = dialog.id.toString();
        const chatTitle = dialog.title || 'Unnamed Telegram Group';

        // Update database cache
        await db.saveTelegramChat(chatId, chatTitle);

        groups.push({
          id: chatId,
          name: chatTitle,
          platform: 'telegram'
        });
      }
    }
    return groups;
  } catch (err) {
    console.error('Telegram Client: Failed to fetch dialogues:', err);
    throw err;
  }
}

/**
 * Syncs recent messages for a group/channel on-demand.
 */
async function syncTelegramMessages(chatId, days = 1) {
  const activeClient = await getTelegramClient();
  if (!activeClient) {
    throw new Error('Telegram client is not authenticated.');
  }

  try {
    const cutoffTime = Math.floor(Date.now() / 1000) - (parseInt(days) * 24 * 60 * 60);
    
    // Fetch recent messages
    const messages = await activeClient.getMessages(chatId, { limit: 150 });
    const formatted = [];

    for (const m of messages) {
      if (m.date < cutoffTime) continue;

      if (m.message && m.message.trim().length > 0) {
        let senderName = 'Unknown';
        try {
          const sender = await m.getSender();
          if (sender) {
            senderName = sender.username || 
              [sender.firstName, sender.lastName].filter(Boolean).join(' ') || 
              sender.title || 'Unknown';
          }
        } catch (err) {
          // Fallback if sender lookup fails
        }

        formatted.push({
          id: `tg_${m.id}`,
          chatId: chatId,
          senderId: (m.senderId || chatId).toString(),
          senderName: senderName,
          timestamp: m.date,
          body: m.message,
          platform: 'telegram'
        });
      }
    }

    if (formatted.length > 0) {
      await db.saveMessages(formatted);
      console.log(`Telegram Client: Cached and saved ${formatted.length} messages for chat ${chatId}`);
    }
    return formatted.length;
  } catch (err) {
    console.error('Telegram Client: Error syncing messages:', err);
    throw err;
  }
}

/**
 * Returns connection status: ready or disconnected.
 */
async function getTelegramStatus() {
  if (client && client.connected) {
    return 'ready';
  }
  return 'disconnected';
}

/**
 * Starts the Telegram client connection loop on startup.
 */
function startTelegramPolling() {
  console.log('Telegram User Client: Loading saved session configuration...');
  getTelegramClient().catch(err => {
    console.warn('Telegram User Client: Failed to connect on startup:', err.message);
  });
}

module.exports = {
  sendCode,
  signIn,
  getTelegramChats,
  syncTelegramMessages,
  getTelegramStatus,
  startTelegramPolling
};
