// State variables
let csrfToken = null;
let isAuthenticated = false;
let waStatus = 'disconnected';
let tgStatus = 'disconnected';
let activeChat = null;
let statusInterval = null;
let lastSyncedChats = null;
let loadedGlobalOnStart = false;
let currentPlatform = 'whatsapp';
let loadedTgChatsOnStart = false;
let tgVerifyStep = false;

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

// Collapsible Sidebar and Global Dashboard Elements
const sidebar = document.getElementById('sidebar');
const toggleSidebarBtn = document.getElementById('toggleSidebarBtn');
const dashboardLink = document.getElementById('dashboardLink');
const dashboardGrid = document.getElementById('dashboardGrid');
const globalDigestReader = document.getElementById('globalDigestReader');
const globalDigestsList = document.getElementById('globalDigestsList');
const closeReaderBtn = document.getElementById('closeReaderBtn');
const readerTitle = document.getElementById('readerTitle');
const readerMeta = document.getElementById('readerMeta');
const readerContent = document.getElementById('readerContent');

// Telegram UI Elements
const tgConnectionDot = document.getElementById('tgConnectionDot');
const tgConnectionText = document.getElementById('tgConnectionText');
const btnPlatformWA = document.getElementById('btnPlatformWA');
const btnPlatformTG = document.getElementById('btnPlatformTG');
const chatsSectionTitle = document.getElementById('chatsSectionTitle');

// Telegram Connect Overlay Elements
const tgOverlay = document.getElementById('tgOverlay');
const tgRequestCodeForm = document.getElementById('tgRequestCodeForm');
const tgApiIdInput = document.getElementById('tgApiId');
const tgApiHashInput = document.getElementById('tgApiHash');
const tgPhoneInput = document.getElementById('tgPhone');
const tgRequestCodeBtn = document.getElementById('tgRequestCodeBtn');
const tgRequestError = document.getElementById('tgRequestError');
const tgVerifyCodeForm = document.getElementById('tgVerifyCodeForm');
const tgCodeInput = document.getElementById('tgCode');
const tgPasswordInput = document.getElementById('tgPassword');
const tgPasswordGroup = document.getElementById('tgPasswordGroup');
const tgVerifyCodeBtn = document.getElementById('tgVerifyCodeBtn');
const tgVerifyError = document.getElementById('tgVerifyError');
const tgBackToConnectBtn = document.getElementById('tgBackToConnectBtn');

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

  // Collapsible Sidebar & Dashboard Listeners
  toggleSidebarBtn.addEventListener('click', toggleSidebar);
  dashboardLink.addEventListener('click', showDashboard);
  closeReaderBtn.addEventListener('click', showDashboardList);

  // Platform Selector Listeners
  btnPlatformWA.addEventListener('click', () => switchPlatform('whatsapp'));
  btnPlatformTG.addEventListener('click', () => switchPlatform('telegram'));

  // Telegram Connect Listeners
  tgRequestCodeForm.addEventListener('submit', handleTgRequestCode);
  tgVerifyCodeForm.addEventListener('submit', handleTgVerifyCode);
  tgBackToConnectBtn.addEventListener('click', handleTgBackToConnect);
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
    tgStatus = data.telegramStatus || 'disconnected';
    
    if (data.csrfToken) {
      csrfToken = data.csrfToken;
    }

    // Toggle between login screen and dashboard
    if (isAuthenticated) {
      loginScreen.style.display = 'none';
      dashboardScreen.style.display = 'flex';
      
      // Update WhatsApp connection UI
      updateWhatsAppUI(data);
      
      // Update Telegram connection UI
      updateTelegramUI(data);
      
      // If WhatsApp is ready and we haven't loaded chats yet, load them
      if (waStatus === 'ready' && !lastSyncedChats && currentPlatform === 'whatsapp') {
        fetchChats();
      }

      // If Telegram is ready and we haven't loaded chats yet, load them
      if (tgStatus === 'ready' && !loadedTgChatsOnStart && currentPlatform === 'telegram') {
        loadedTgChatsOnStart = true;
        fetchChats();
      }

      // Load global digests dashboard on start
      if (!loadedGlobalOnStart) {
        loadedGlobalOnStart = true;
        fetchGlobalDigests();
      }
    } else {
      loginScreen.style.display = 'flex';
      dashboardScreen.style.display = 'none';
      lastSyncedChats = null;
      loadedGlobalOnStart = false;
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

  // 2. Manage QR Overlay (Only block interface if active platform is WhatsApp)
  if (currentPlatform === 'whatsapp') {
    if (waStatus === 'qr_ready' && data.qrCode) {
      qrOverlay.style.display = 'flex';
      qrImage.src = data.qrCode;
    } else if (waStatus === 'connecting') {
      qrOverlay.style.display = 'flex';
      qrImage.src = ''; // Clear image
      qrImage.alt = 'Connecting to WhatsApp Web...';
    } else if (waStatus === 'disconnected') {
      qrOverlay.style.display = 'flex';
      qrImage.src = '';
      qrImage.alt = 'Starting WhatsApp Web Service...';
    } else {
      // authenticated or ready
      qrOverlay.style.display = 'none';
    }
  } else {
    // Hide WhatsApp QR overlay if browsing Telegram
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
      lastSyncedChats = null;
      loadedGlobalOnStart = false;
      loadedTgChatsOnStart = false;
      tgVerifyStep = false;
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
    // Show a loading text in the sidebar first
    groupsList.replaceChildren();
    const loadingText = document.createElement('p');
    loadingText.className = 'logo-sub';
    loadingText.style.paddingLeft = '1rem';
    loadingText.textContent = 'Loading groups...';
    groupsList.appendChild(loadingText);

    const res = await fetch(`/api/chats?platform=${currentPlatform}`);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Failed to fetch chats');
    }
    
    const data = await res.json();
    if (data.success && data.groups) {
      if (currentPlatform === 'whatsapp') {
        lastSyncedChats = data.groups;
      } else if (currentPlatform === 'telegram') {
        loadedTgChatsOnStart = true;
      }
      renderGroups(data.groups);
    } else {
      throw new Error('Invalid response format');
    }
  } catch (err) {
    console.error('Error loading chats:', err);
    groupsList.replaceChildren();
    const errMsg = document.createElement('p');
    errMsg.className = 'logo-sub';
    errMsg.style.padding = '0.5rem 1rem';
    errMsg.style.fontSize = '0.8rem';
    errMsg.style.color = '#ff4a4a';
    
    if (currentPlatform === 'whatsapp' && waStatus !== 'ready') {
      errMsg.textContent = 'WhatsApp not connected. Scan the QR code to link your account.';
    } else {
      errMsg.textContent = err.message || 'Error loading groups. Please try again.';
    }
    groupsList.appendChild(errMsg);
  }
}

function renderGroups(groups) {
  groupsList.replaceChildren(); // Safely clear container

  if (groups.length === 0) {
    const emptyMsg = document.createElement('p');
    emptyMsg.className = 'logo-sub';
    emptyMsg.style.padding = '0.5rem 1rem';
    emptyMsg.style.fontSize = '0.8rem';
    
    if (currentPlatform === 'telegram') {
      emptyMsg.textContent = 'No groups or channels found on this account.';
    } else {
      emptyMsg.textContent = 'No groups found.';
    }
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

    info.appendChild(name);

    item.appendChild(avatar);
    item.appendChild(info);

    item.addEventListener('click', () => selectGroup(group));
    groupsList.appendChild(item);
  });
}

function selectGroup(group) {
  activeChat = group;
  
  // Highlight active sidebar item
  dashboardLink.classList.remove('active');
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
        days: days,
        platform: currentPlatform
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

// ==========================================
// COLLAPSIBLE SIDEBAR & DASHBOARD HANDLERS
// ==========================================

function toggleSidebar() {
  sidebar.classList.toggle('collapsed');
  if (sidebar.classList.contains('collapsed')) {
    toggleSidebarBtn.textContent = '▶';
  } else {
    toggleSidebarBtn.textContent = '◀';
  }
}

async function showDashboard() {
  activeChat = null;
  welcomeScreen.style.display = 'flex';
  activeDashboard.style.display = 'none';
  
  // Highlight Dashboard link, unhighlight chats
  dashboardLink.classList.add('active');
  const items = groupsList.querySelectorAll('.chat-item');
  items.forEach(el => el.classList.remove('active'));
  
  // Hide Reader, show Grid
  dashboardGrid.style.display = 'block';
  globalDigestReader.style.display = 'none';
  
  // Fetch and display all past digests
  fetchGlobalDigests();
}

function showDashboardList() {
  dashboardGrid.style.display = 'block';
  globalDigestReader.style.display = 'none';
}

async function fetchGlobalDigests() {
  try {
    globalDigestsList.replaceChildren();
    
    // Show a loading text or placeholder
    const loadingText = document.createElement('p');
    loadingText.className = 'logo-sub';
    loadingText.textContent = 'Loading past digests...';
    globalDigestsList.appendChild(loadingText);

    const res = await fetch('/api/summaries'); // No chatId query parameter fetches all
    if (!res.ok) throw new Error('Failed to fetch summaries');
    
    const data = await res.json();
    globalDigestsList.replaceChildren();
    
    if (data.success && data.summaries) {
      renderGlobalDigests(data.summaries);
    }
  } catch (err) {
    console.error('Error fetching global digests:', err);
    globalDigestsList.replaceChildren();
    const errorText = document.createElement('p');
    errorText.className = 'error-message';
    errorText.style.display = 'block';
    errorText.textContent = 'Failed to load past digests.';
    globalDigestsList.appendChild(errorText);
  }
}

function renderGlobalDigests(summaries) {
  if (summaries.length === 0) {
    const emptyMsg = document.createElement('p');
    emptyMsg.className = 'logo-sub';
    emptyMsg.textContent = 'No past digests found. Choose a group from the sidebar to generate your first digest!';
    globalDigestsList.appendChild(emptyMsg);
    return;
  }

  summaries.forEach(sum => {
    const card = document.createElement('div');
    card.className = 'global-digest-card';
    
    const meta = document.createElement('div');
    meta.className = 'global-digest-meta';

    // Format group name
    const groupName = document.createElement('div');
    groupName.className = 'global-digest-group';
    const platformEmoji = sum.platform === 'telegram' ? '✈️ ' : '💬 ';
    groupName.textContent = platformEmoji + sum.chat_name;

    // Format generated date
    const date = new Date(sum.created_at * 1000).toLocaleString();
    const dateTitle = document.createElement('div');
    dateTitle.className = 'global-digest-date';
    dateTitle.textContent = `Digest from ${date}`;

    // Format range dates
    const startStr = new Date(sum.start_timestamp * 1000).toLocaleDateString();
    const endStr = new Date(sum.end_timestamp * 1000).toLocaleDateString();
    const rangeSub = document.createElement('div');
    rangeSub.className = 'global-digest-timeframe';
    rangeSub.textContent = `Timeframe: ${startStr} to ${endStr}`;

    meta.appendChild(groupName);
    meta.appendChild(dateTitle);
    meta.appendChild(rangeSub);

    const actionText = document.createElement('span');
    actionText.className = 'badge';
    actionText.textContent = 'Read';

    card.appendChild(meta);
    card.appendChild(actionText);

    card.addEventListener('click', () => loadGlobalDigestDetails(sum.id));
    globalDigestsList.appendChild(card);
  });
}

async function loadGlobalDigestDetails(summaryId) {
  // Hide grid, show reader with shimmer loading
  dashboardGrid.style.display = 'none';
  globalDigestReader.style.display = 'block';
  
  readerTitle.textContent = 'Loading digest...';
  readerMeta.textContent = '';
  
  readerContent.replaceChildren();
  const wrapper = document.createElement('div');
  wrapper.className = 'shimmer-wrapper';
  const lines = ['header', 'p1', 'p2', 'p3', 'p1', 'p2', 'p4'];
  lines.forEach(type => {
    const line = document.createElement('div');
    line.className = `shimmer-line ${type}`;
    wrapper.appendChild(line);
  });
  readerContent.appendChild(wrapper);

  try {
    const res = await fetch(`/api/summaries/${summaryId}`);
    if (!res.ok) throw new Error('Failed to fetch summary details');

    const data = await res.json();
    if (data.success && data.summary) {
      readerTitle.textContent = `${data.summary.chat_name} Digest`;
      const date = new Date(data.summary.created_at * 1000).toLocaleString();
      const startStr = new Date(data.summary.start_timestamp * 1000).toLocaleDateString();
      const endStr = new Date(data.summary.end_timestamp * 1000).toLocaleDateString();
      readerMeta.textContent = `Generated on ${date} • Timeframe: ${startStr} to ${endStr}`;
      
      renderMarkdown(data.summary.summary_markdown, readerContent);
    }
  } catch (err) {
    console.error('Error fetching global summary details:', err);
    readerTitle.textContent = 'Error';
    readerMeta.textContent = '';
    readerContent.replaceChildren();
    const errMsg = document.createElement('p');
    errMsg.className = 'error-message';
    errMsg.style.display = 'block';
    errMsg.textContent = 'Could not load digest details.';
    readerContent.appendChild(errMsg);
  }
}

// ==========================================
// TELEGRAM WORKERS & PLATFORM TOGGLING
// ==========================================

function updateTelegramUI(data) {
  tgConnectionDot.className = `status-dot ${tgStatus}`;
  
  const statusLabels = {
    disconnected: 'Disconnected',
    ready: 'Connected'
  };
  
  tgConnectionText.textContent = statusLabels[tgStatus] || 'Disconnected';

  // Manage Telegram Overlay
  if (currentPlatform === 'telegram') {
    if (tgStatus !== 'ready') {
      tgOverlay.style.display = 'flex';
      if (tgVerifyStep) {
        tgRequestCodeForm.style.display = 'none';
        tgVerifyCodeForm.style.display = 'block';
      } else {
        tgRequestCodeForm.style.display = 'block';
        tgVerifyCodeForm.style.display = 'none';
      }
    } else {
      tgOverlay.style.display = 'none';
    }
  } else {
    tgOverlay.style.display = 'none';
  }
}

async function handleTgRequestCode(e) {
  e.preventDefault();
  tgRequestError.style.display = 'none';
  tgRequestCodeBtn.disabled = true;
  tgRequestCodeBtn.textContent = 'Sending Code...';

  const apiId = tgApiIdInput.value.trim();
  const apiHash = tgApiHashInput.value.trim();
  const phoneNumber = tgPhoneInput.value.trim();

  try {
    const res = await fetch('/api/telegram/connect', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': csrfToken
      },
      body: JSON.stringify({ apiId, apiHash, phoneNumber })
    });

    const data = await res.json();
    tgRequestCodeBtn.disabled = false;
    tgRequestCodeBtn.textContent = 'Request Code';

    if (res.ok && data.success) {
      tgVerifyStep = true;
      tgRequestCodeForm.style.display = 'none';
      tgVerifyCodeForm.style.display = 'block';
      tgPasswordGroup.style.display = 'none';
      tgCodeInput.value = '';
      tgPasswordInput.value = '';
    } else {
      tgRequestError.textContent = data.error || 'Failed to request verification code';
      tgRequestError.style.display = 'block';
    }
  } catch (err) {
    tgRequestCodeBtn.disabled = false;
    tgRequestCodeBtn.textContent = 'Request Code';
    tgRequestError.textContent = 'Server communication error';
    tgRequestError.style.display = 'block';
  }
}

async function handleTgVerifyCode(e) {
  e.preventDefault();
  tgVerifyError.style.display = 'none';
  tgVerifyCodeBtn.disabled = true;
  tgVerifyCodeBtn.textContent = 'Verifying...';

  const phoneCode = tgCodeInput.value.trim();
  const password = tgPasswordInput.value.trim();

  try {
    const res = await fetch('/api/telegram/verify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': csrfToken
      },
      body: JSON.stringify({ phoneCode, password })
    });

    const data = await res.json();
    tgVerifyCodeBtn.disabled = false;
    tgVerifyCodeBtn.textContent = 'Link Telegram';

    if (res.ok) {
      if (data.success) {
        tgVerifyStep = false;
        tgVerifyCodeForm.style.display = 'none';
        tgRequestCodeForm.style.display = 'block';
        
        // Clear inputs
        tgApiIdInput.value = '';
        tgApiHashInput.value = '';
        tgPhoneInput.value = '';
        tgCodeInput.value = '';
        tgPasswordInput.value = '';
        
        // Refresh status & load groups
        await checkStatus();
        fetchChats();
      } else if (data.requiresPassword) {
        // Show 2FA password field
        tgPasswordGroup.style.display = 'block';
        tgVerifyError.textContent = 'Two-step verification password is required.';
        tgVerifyError.style.display = 'block';
      } else {
        tgVerifyError.textContent = data.error || 'Verification failed';
        tgVerifyError.style.display = 'block';
      }
    } else {
      tgVerifyError.textContent = data.error || 'Verification failed';
      tgVerifyError.style.display = 'block';
    }
  } catch (err) {
    tgVerifyCodeBtn.disabled = false;
    tgVerifyCodeBtn.textContent = 'Link Telegram';
    tgVerifyError.textContent = 'Server communication error';
    tgVerifyError.style.display = 'block';
  }
}

function handleTgBackToConnect() {
  tgVerifyStep = false;
  tgVerifyError.style.display = 'none';
  tgVerifyCodeForm.style.display = 'none';
  tgRequestCodeForm.style.display = 'block';
}

function switchPlatform(platform) {
  if (currentPlatform === platform) return;
  currentPlatform = platform;
  
  // Update platform tab highlights
  if (currentPlatform === 'whatsapp') {
    btnPlatformWA.classList.add('active');
    btnPlatformTG.classList.remove('active');
    chatsSectionTitle.textContent = 'WhatsApp Groups';
  } else {
    btnPlatformWA.classList.remove('active');
    btnPlatformTG.classList.add('active');
    chatsSectionTitle.textContent = 'Telegram Groups';
  }

  // Refresh lists
  fetchChats();
  
  // If we have open active screen, reset to dashboard since chats switched
  showDashboard();
  
  // Hide QR code overlay if we switched to Telegram and WhatsApp is disconnected
  checkStatus();
}
