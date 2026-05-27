// State variables
let csrfToken = null;
let isAuthenticated = false;
let waStatus = 'disconnected';
let activeChat = null;
let statusInterval = null;
let lastSyncedChats = null;

// DOM Elements
const loginScreen = document.getElementById('loginScreen');
const dashboardScreen = document.getElementById('dashboardScreen');
const loginForm = document.getElementById('loginForm');
const appPasswordInput = document.getElementById('appPassword');
const loginError = document.getElementById('loginError');

const connectionDot = document.getElementById('connectionDot');
const connectionText = document.getElementById('connectionText');
const groupsList = document.getElementById('groupsList');
const logoutBtn = document.getElementById('logoutBtn');

const qrOverlay = document.getElementById('qrOverlay');
const qrImage = document.getElementById('qrImage');

const welcomeScreen = document.getElementById('welcomeScreen');
const activeDashboard = document.getElementById('activeDashboard');
const activeChatTitle = document.getElementById('activeChatTitle');
const timeRangeSelect = document.getElementById('timeRangeSelect');
const summarizeBtn = document.getElementById('summarizeBtn');

const tabSummary = document.getElementById('tabSummary');
const tabHistory = document.getElementById('tabHistory');
const tabContentSummary = document.getElementById('tabContentSummary');
const tabContentHistory = document.getElementById('tabContentHistory');

const summaryDisplay = document.getElementById('summaryDisplay');
const historyDisplay = document.getElementById('historyDisplay');

// ==========================================
// INITIALIZATION & STATE POLLING
// ==========================================

document.addEventListener('DOMContentLoaded', () => {
  // Check auth status immediately
  checkStatus();
  
  // Start status polling
  statusInterval = setInterval(checkStatus, 3000);

  // Setup Event Listeners
  loginForm.addEventListener('submit', handleLogin);
  logoutBtn.addEventListener('click', handleLogout);
  summarizeBtn.addEventListener('click', handleSummarize);
  
  tabSummary.addEventListener('click', () => switchTab('summary'));
  tabHistory.addEventListener('click', () => switchTab('history'));
});

/**
 * Checks the session auth status and WhatsApp client connection status from server.
 */
async function checkStatus() {
  try {
    const res = await fetch('/api/status');
    if (!res.ok) throw new Error('Failed to get status');
    
    const data = await res.json();
    
    isAuthenticated = data.isAuthenticated;
    waStatus = data.whatsappStatus;
    
    if (data.csrfToken) {
      csrfToken = data.csrfToken;
    }

    // Toggle between login screen and dashboard
    if (isAuthenticated) {
      loginScreen.style.display = 'none';
      dashboardScreen.style.display = 'flex';
      
      // Update WhatsApp connection UI
      updateWhatsAppUI(data);
      
      // If WhatsApp is ready and we haven't loaded chats yet, load them
      if (waStatus === 'ready' && !lastSyncedChats) {
        fetchChats();
      }
    } else {
      loginScreen.style.display = 'flex';
      dashboardScreen.style.display = 'none';
      lastSyncedChats = null;
    }
  } catch (err) {
    console.error('Error polling status:', err);
  }
}

/**
 * Updates connection indicators and overlay QR status
 */
function updateWhatsAppUI(data) {
  // 1. Connection indicators
  connectionDot.className = `status-dot ${waStatus}`;
  
  const statusLabels = {
    disconnected: 'Disconnected',
    connecting: 'Connecting...',
    qr_ready: 'Scan QR Code',
    authenticated: 'Connecting...',
    ready: 'Ready',
    auth_failure: 'Auth Failure'
  };
  
  connectionText.textContent = statusLabels[waStatus] || 'Unknown';

  // 2. Manage QR Overlay
  if (waStatus === 'qr_ready' && data.qrCode) {
    qrOverlay.style.display = 'flex';
    qrImage.src = data.qrCode;
  } else if (waStatus === 'connecting') {
    qrOverlay.style.display = 'flex';
    qrImage.src = ''; // Clear image, maybe show a loading text in a real app
    qrImage.alt = 'Connecting to WhatsApp Web...';
  } else if (waStatus === 'disconnected') {
    qrOverlay.style.display = 'flex';
    qrImage.src = '';
    qrImage.alt = 'Starting WhatsApp Web Service...';
  } else {
    // authenticated or ready
    qrOverlay.style.display = 'none';
  }
}

// ==========================================
// LOGIN & LOGOUT HANDLERS
// ==========================================

async function handleLogin(e) {
  e.preventDefault();
  loginError.style.display = 'none';
  
  const password = appPasswordInput.value;
  
  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': csrfToken
      },
      body: JSON.stringify({ password })
    });
    
    const data = await res.json();
    
    if (res.ok && data.success) {
      csrfToken = data.csrfToken;
      isAuthenticated = true;
      appPasswordInput.value = '';
      checkStatus();
    } else {
      loginError.textContent = data.error || 'Authentication failed';
      loginError.style.display = 'block';
    }
  } catch (err) {
    loginError.textContent = 'Server communication error';
    loginError.style.display = 'block';
  }
}

async function handleLogout() {
  try {
    const res = await fetch('/api/logout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': csrfToken
      }
    });
    
    if (res.ok) {
      isAuthenticated = false;
      csrfToken = null;
      activeChat = null;
      welcomeScreen.style.display = 'flex';
      activeDashboard.style.display = 'none';
      checkStatus();
    }
  } catch (err) {
    console.error('Error logging out:', err);
  }
}

// ==========================================
// FETCH CHATS & LOAD GROUPS
// ==========================================

async function fetchChats() {
  try {
    const res = await fetch('/api/chats');
    if (!res.ok) throw new Error('Failed to fetch chats');
    
    const data = await res.json();
    if (data.success && data.groups) {
      lastSyncedChats = data.groups;
      renderGroups(data.groups);
    }
  } catch (err) {
    console.error('Error loading chats:', err);
  }
}

function renderGroups(groups) {
  groupsList.replaceChildren(); // Safely clear container

  if (groups.length === 0) {
    const emptyMsg = document.createElement('p');
    emptyMsg.className = 'logo-sub';
    emptyMsg.style.paddingLeft = '1rem';
    emptyMsg.textContent = 'No groups found.';
    groupsList.appendChild(emptyMsg);
    return;
  }

  groups.forEach(group => {
    const item = document.createElement('div');
    item.className = 'chat-item';
    if (activeChat && activeChat.id === group.id) {
      item.classList.add('active');
    }

    const avatar = document.createElement('div');
    avatar.className = 'chat-avatar';
    avatar.textContent = group.name.substring(0, 2).toUpperCase();

    const info = document.createElement('div');
    info.className = 'chat-info';

    const name = document.createElement('div');
    name.className = 'chat-name';
    name.textContent = group.name;

    const meta = document.createElement('div');
    meta.className = 'chat-meta';
    meta.textContent = group.unreadCount > 0 ? `${group.unreadCount} unread` : 'No unread';

    info.appendChild(name);
    info.appendChild(meta);

    item.appendChild(avatar);
    item.appendChild(info);

    if (group.unreadCount > 0) {
      const badge = document.createElement('span');
      badge.className = 'badge';
      badge.textContent = group.unreadCount;
      item.appendChild(badge);
    }

    item.addEventListener('click', () => selectGroup(group));
    groupsList.appendChild(item);
  });
}

function selectGroup(group) {
  activeChat = group;
  
  // Highlight active sidebar item
  const items = groupsList.querySelectorAll('.chat-item');
  items.forEach(el => {
    const nameEl = el.querySelector('.chat-name');
    if (nameEl && nameEl.textContent === group.name) {
      el.classList.add('active');
    } else {
      el.classList.remove('active');
    }
  });

  // Switch displays
  welcomeScreen.style.display = 'none';
  activeDashboard.style.display = 'flex';
  activeChatTitle.textContent = group.name;

  // Clear previous output and switch to summary tab
  summaryDisplay.replaceChildren();
  const initMsg = document.createElement('p');
  initMsg.className = 'logo-sub';
  initMsg.textContent = 'Click "Generate Digest" to sync messages and build a direct, straightforward outcome summary.';
  summaryDisplay.appendChild(initMsg);
  
  switchTab('summary');
  
  // Load summaries history for this chat
  loadPastSummaries(group.id);
}

// ==========================================
// SUMMARIZE INTERACTION & MD RENDERING
// ==========================================

async function handleSummarize() {
  if (!activeChat) return;

  const days = timeRangeSelect.value;
  
  // Show Loading Shimmer
  renderShimmer();
  summarizeBtn.disabled = true;
  summarizeBtn.textContent = 'Generating Digest...';

  try {
    const res = await fetch('/api/summarize', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': csrfToken
      },
      body: JSON.stringify({
        chatId: activeChat.id,
        chatName: activeChat.name,
        days: days
      })
    });

    const data = await res.json();
    summarizeBtn.disabled = false;
    summarizeBtn.textContent = 'Generate Digest';

    if (res.ok && data.success) {
      renderMarkdown(data.summary, summaryDisplay);
      // Reload history list in background
      loadPastSummaries(activeChat.id);
    } else {
      summaryDisplay.replaceChildren();
      const errMsg = document.createElement('p');
      errMsg.className = 'error-message';
      errMsg.style.display = 'block';
      errMsg.textContent = data.error || 'Failed to generate digest.';
      summaryDisplay.appendChild(errMsg);
    }
  } catch (err) {
    summarizeBtn.disabled = false;
    summarizeBtn.textContent = 'Generate Digest';
    summaryDisplay.replaceChildren();
    
    const errMsg = document.createElement('p');
    errMsg.className = 'error-message';
    errMsg.style.display = 'block';
    errMsg.textContent = 'Network error generating digest. Please try again.';
    summaryDisplay.appendChild(errMsg);
  }
}

/**
 * Loads past summaries for the current active group chat.
 */
async function loadPastSummaries(chatId) {
  try {
    const res = await fetch(`/api/summaries?chatId=${encodeURIComponent(chatId)}`);
    if (!res.ok) throw new Error('Failed to fetch summaries');
    
    const data = await res.json();
    if (data.success && data.summaries) {
      renderHistoryList(data.summaries);
    }
  } catch (err) {
    console.error('Error fetching summaries history:', err);
  }
}

function renderHistoryList(summaries) {
  historyDisplay.replaceChildren();

  if (summaries.length === 0) {
    const emptyMsg = document.createElement('p');
    emptyMsg.className = 'logo-sub';
    emptyMsg.textContent = 'No past digests found for this group.';
    historyDisplay.appendChild(emptyMsg);
    return;
  }

  summaries.forEach(sum => {
    const card = document.createElement('div');
    card.className = 'history-card';
    
    const meta = document.createElement('div');
    meta.className = 'history-meta';

    // Format generated date
    const date = new Date(sum.created_at * 1000).toLocaleString();
    const dateTitle = document.createElement('div');
    dateTitle.className = 'history-date';
    dateTitle.textContent = `Digest from ${date}`;

    // Format range dates
    const startStr = new Date(sum.start_timestamp * 1000).toLocaleDateString();
    const endStr = new Date(sum.end_timestamp * 1000).toLocaleDateString();
    const rangeSub = document.createElement('div');
    rangeSub.className = 'history-details';
    rangeSub.textContent = `Timeframe: ${startStr} to ${endStr}`;

    meta.appendChild(dateTitle);
    meta.appendChild(rangeSub);

    const actionText = document.createElement('span');
    actionText.className = 'badge';
    actionText.textContent = 'View';

    card.appendChild(meta);
    card.appendChild(actionText);

    card.addEventListener('click', () => loadPastSummaryDetails(sum.id));
    historyDisplay.appendChild(card);
  });
}

async function loadPastSummaryDetails(summaryId) {
  renderShimmer();
  switchTab('summary');

  try {
    const res = await fetch(`/api/summaries/${summaryId}`);
    if (!res.ok) throw new Error('Failed to fetch summary details');

    const data = await res.json();
    if (data.success && data.summary) {
      renderMarkdown(data.summary.summary_markdown, summaryDisplay);
    }
  } catch (err) {
    summaryDisplay.replaceChildren();
    const errMsg = document.createElement('p');
    errMsg.className = 'error-message';
    errMsg.style.display = 'block';
    errMsg.textContent = 'Could not load digest details.';
    summaryDisplay.appendChild(errMsg);
  }
}

// ==========================================
// UI HELPERS (TABS, SKELETONS, MD PARSING)
// ==========================================

function switchTab(tab) {
  if (tab === 'summary') {
    tabSummary.classList.add('active');
    tabHistory.classList.remove('active');
    tabContentSummary.classList.add('active');
    tabContentHistory.classList.remove('active');
  } else {
    tabSummary.classList.remove('active');
    tabHistory.classList.add('active');
    tabContentSummary.classList.remove('active');
    tabContentHistory.classList.add('active');
  }
}

function renderShimmer() {
  summaryDisplay.replaceChildren();

  const wrapper = document.createElement('div');
  wrapper.className = 'shimmer-wrapper';

  const lines = ['header', 'p1', 'p2', 'p3', 'p1', 'p2', 'p4'];
  lines.forEach(type => {
    const line = document.createElement('div');
    line.className = `shimmer-line ${type}`;
    wrapper.appendChild(line);
  });

  summaryDisplay.appendChild(wrapper);
}

/**
 * Safely parses and renders Markdown to HTML using marked + DOMPurify (XSS prevention)
 */
function renderMarkdown(markdown, targetElement) {
  targetElement.replaceChildren();

  // Find marked parser across UMD variants and ES exports
  let parser = null;
  if (typeof window.marked !== 'undefined') {
    if (typeof window.marked.parse === 'function') {
      parser = window.marked.parse;
    } else if (typeof window.marked === 'function') {
      parser = window.marked;
    } else if (window.marked.marked && typeof window.marked.marked.parse === 'function') {
      parser = window.marked.marked.parse;
    }
  } else if (typeof marked !== 'undefined') {
    if (typeof marked.parse === 'function') {
      parser = marked.parse;
    } else if (typeof marked === 'function') {
      parser = marked;
    }
  }

  if (parser && typeof DOMPurify !== 'undefined') {
    try {
      const rawHtml = parser(markdown);
      const cleanHtml = DOMPurify.sanitize(rawHtml);
      
      // Use DOMParser to safely load cleanHtml, then append elements cleanly to prevent XSS-edge cases
      const docParser = new DOMParser();
      const doc = docParser.parseFromString(cleanHtml, 'text/html');
      
      // Append all nodes from parsed body into the target container
      const bodyChildren = Array.from(doc.body.childNodes);
      bodyChildren.forEach(child => {
        targetElement.appendChild(child);
      });
    } catch (err) {
      console.error('Error parsing markdown:', err);
      const rawText = document.createElement('pre');
      rawText.textContent = markdown;
      targetElement.appendChild(rawText);
    }
  } else {
    // If marked or DOMPurify failed to load, fall back to safe plaintext display
    console.warn('marked or DOMPurify library not loaded. Falling back to plain text.');
    const rawText = document.createElement('pre');
    rawText.style.whiteSpace = 'pre-wrap';
    rawText.textContent = markdown;
    targetElement.appendChild(rawText);
  }
}
