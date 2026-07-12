/* ===== QueryDoc — Frontend Application ===== */

const API = {
  chat: '/api/chat',
  documents: '/api/documents',
  upload: '/api/documents/upload',
  status: '/api/status',
  settings: '/api/settings',
};

/* --- State --- */
const state = {
  currentView: 'chat',
  chats: JSON.parse(localStorage.getItem('qd_chats') || '[]'),
  activeChatId: null,
  settings: { top_k: 5, temperature: 0.7, max_tokens: 1024, min_similarity: 0.0 },
  isGenerating: false,
};

/* --- DOM refs --- */
const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

const els = {
  sidebar: $('#sidebar'),
  sidebarClose: $('#sidebarClose'),
  sidebarOverlay: $('#sidebarOverlay'),
  menuBtn: $('#menuBtn'),
  newChatBtn: $('#newChatBtn'),
  chatHistory: $('#chatHistory'),
  topbarTitle: $('#topbarTitle'),
  clearChatBtn: $('#clearChatBtn'),
  chatContainer: $('#chatContainer'),
  chatWelcome: $('#chatWelcome'),
  messages: $('#messages'),
  chatInput: $('#chatInput'),
  sendBtn: $('#sendBtn'),
  uploadZone: $('#uploadZone'),
  fileInput: $('#fileInput'),
  uploadProgressArea: $('#uploadProgressArea'),
  documentsList: $('#documentsList'),
  docsEmptyState: $('#docsEmptyState'),
  docCount: $('#docCount'),
  statusIndicator: $('#statusIndicator'),
  toastContainer: $('#toastContainer'),
};

/* ===== INIT ===== */
document.addEventListener('DOMContentLoaded', () => {
  initNavigation();
  initChat();
  initUpload();
  initSettings();
  loadStatus();
  loadSettings();

  if (state.chats.length > 0) {
    state.activeChatId = state.chats[0].id;
    renderChatHistory();
    loadChat(state.activeChatId);
  } else {
    newChat();
  }
});

/* ===== NAVIGATION ===== */
function initNavigation() {
  $$('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => switchView(btn.dataset.view));
  });

  els.menuBtn.addEventListener('click', () => {
    els.sidebar.classList.add('open');
    els.sidebarOverlay.classList.add('active');
  });

  els.sidebarClose.addEventListener('click', closeSidebar);
  els.sidebarOverlay.addEventListener('click', closeSidebar);

  els.clearChatBtn.addEventListener('click', clearChat);
}

function closeSidebar() {
  els.sidebar.classList.remove('open');
  els.sidebarOverlay.classList.remove('active');
}

function switchView(view) {
  state.currentView = view;
  $$('.view').forEach(v => v.classList.remove('active'));
  $(`#view${view.charAt(0).toUpperCase() + view.slice(1)}`).classList.add('active');

  $$('.nav-item').forEach(n => n.classList.remove('active'));
  $(`[data-view="${view}"]`).classList.add('active');

  const titles = { chat: 'Chat', documents: 'Documents', settings: 'Settings', about: 'About' };
  els.topbarTitle.textContent = titles[view] || 'QueryDoc';

  if (view === 'documents') loadDocuments();
  if (view === 'settings') loadStatus();

  closeSidebar();
}

/* ===== CHAT ===== */
function initChat() {
  els.chatInput.addEventListener('input', () => {
    els.sendBtn.disabled = !els.chatInput.value.trim() || state.isGenerating;
    autoResize(els.chatInput);
  });

  els.chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!els.sendBtn.disabled) sendMessage();
    }
  });

  els.sendBtn.addEventListener('click', sendMessage);
  els.newChatBtn.addEventListener('click', newChat);

  $$('.suggestion-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      els.chatInput.value = chip.dataset.query;
      els.sendBtn.disabled = false;
      sendMessage();
    });
  });
}

function newChat() {
  const chat = {
    id: 'chat_' + Date.now(),
    title: 'New Chat',
    messages: [],
    createdAt: new Date().toISOString(),
  };
  state.chats.unshift(chat);
  state.activeChatId = chat.id;
  saveChats();
  renderChatHistory();
  renderMessages();
}

function loadChat(chatId) {
  state.activeChatId = chatId;
  renderChatHistory();
  renderMessages();
}

function getActiveChat() {
  return state.chats.find(c => c.id === state.activeChatId);
}

function saveChats() {
  localStorage.setItem('qd_chats', JSON.stringify(state.chats));
}

function clearChat() {
  const chat = getActiveChat();
  if (chat) {
    chat.messages = [];
    chat.title = 'New Chat';
    saveChats();
    renderMessages();
    renderChatHistory();
  }
}

function renderChatHistory() {
  els.chatHistory.innerHTML = state.chats.map(c => `
    <div class="chat-history-item ${c.id === state.activeChatId ? 'active' : ''}" data-id="${c.id}">
      <svg class="hist-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
      ${escapeHtml(c.title)}
    </div>
  `).join('');

  els.chatHistory.querySelectorAll('.chat-history-item').forEach(item => {
    item.addEventListener('click', () => loadChat(item.dataset.id));
  });
}

function renderMessages() {
  const chat = getActiveChat();
  if (!chat || chat.messages.length === 0) {
    els.chatWelcome.style.display = 'flex';
    els.messages.innerHTML = '';
    return;
  }

  els.chatWelcome.style.display = 'none';
  els.messages.innerHTML = chat.messages.map((m, i) => renderMessage(m, i)).join('');

  // Add copy buttons to code blocks
  els.messages.querySelectorAll('pre').forEach(pre => {
    if (!pre.querySelector('.copy-code-btn')) {
      const btn = document.createElement('button');
      btn.className = 'copy-code-btn';
      btn.textContent = 'Copy';
      btn.onclick = () => {
        navigator.clipboard.writeText(pre.textContent.replace('Copy', '').trim());
        btn.textContent = 'Copied!';
        setTimeout(() => btn.textContent = 'Copy', 1500);
      };
      pre.style.position = 'relative';
      pre.appendChild(btn);
    }
  });

  scrollToBottom();
}

function renderMessage(msg, index) {
  const isUser = msg.role === 'user';
  const avatarContent = isUser ? '👤' : '✦';

  let sourcesHtml = '';
  if (!isUser && msg.sources && msg.sources.length > 0) {
    sourcesHtml = `
      <div class="sources-toggle" onclick="this.nextElementSibling.classList.toggle('open')">
        ▸ ${msg.sources.length} source${msg.sources.length > 1 ? 's' : ''} retrieved
      </div>
      <div class="sources-panel">
        ${msg.sources.map(s => `
          <div class="source-item">
            <span class="source-name">${escapeHtml(s.document)}</span>
            <span class="source-score">${(s.similarity_score * 100).toFixed(1)}%</span>
          </div>
        `).join('')}
      </div>
    `;
  }

  let actionsHtml = '';
  if (!isUser) {
    actionsHtml = `
      <div class="message-actions">
        <button class="msg-action-btn" onclick="copyMessage(${index})">📋 Copy</button>
        <button class="msg-action-btn" onclick="regenerateMessage(${index})">🔄 Regenerate</button>
      </div>
    `;
  }

  return `
    <div class="message message-${isUser ? 'user' : 'ai'}">
      <div class="message-avatar">${avatarContent}</div>
      <div class="message-content">
        <div class="message-role">${isUser ? 'You' : 'QueryDoc'}</div>
        <div class="message-text">${isUser ? escapeHtml(msg.content) : renderMarkdown(msg.content)}</div>
        ${sourcesHtml}
        ${actionsHtml}
      </div>
    </div>
  `;
}

async function sendMessage() {
  const query = els.chatInput.value.trim();
  if (!query || state.isGenerating) return;

  const chat = getActiveChat();
  if (!chat) return;

  // Add user message
  chat.messages.push({ role: 'user', content: query });
  if (chat.title === 'New Chat') {
    chat.title = query.length > 40 ? query.substring(0, 40) + '...' : query;
  }
  saveChats();
  renderMessages();
  renderChatHistory();

  els.chatInput.value = '';
  els.sendBtn.disabled = true;
  autoResize(els.chatInput);

  // Show loading
  state.isGenerating = true;
  const loadingEl = document.createElement('div');
  loadingEl.className = 'message message-ai';
  loadingEl.innerHTML = `
    <div class="message-avatar">✦</div>
    <div class="message-content">
      <div class="message-role">QueryDoc</div>
      <div class="loading-indicator"><div class="loading-dot"></div><div class="loading-dot"></div><div class="loading-dot"></div></div>
    </div>
  `;
  els.messages.appendChild(loadingEl);
  scrollToBottom();

  try {
    const res = await fetch(API.chat, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query,
        top_k: state.settings.top_k,
        temperature: state.settings.temperature,
        max_tokens: state.settings.max_tokens,
        min_similarity: state.settings.min_similarity,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || `Server error (${res.status})`);
    }

    const data = await res.json();
    chat.messages.push({
      role: 'assistant',
      content: data.response,
      sources: data.sources || [],
      metadata: data.metadata || {},
    });
    saveChats();
  } catch (err) {
    chat.messages.push({
      role: 'assistant',
      content: `⚠️ **Error:** ${err.message}\n\nPlease check that the server is running and your documents are indexed.`,
      sources: [],
    });
    saveChats();
    showToast(err.message, 'error');
  }

  state.isGenerating = false;
  renderMessages();
}

function copyMessage(index) {
  const chat = getActiveChat();
  if (chat && chat.messages[index]) {
    navigator.clipboard.writeText(chat.messages[index].content);
    showToast('Copied to clipboard', 'success');
  }
}

function regenerateMessage(index) {
  const chat = getActiveChat();
  if (!chat || state.isGenerating) return;

  // Find the user message before this AI message
  const userMsgIndex = index - 1;
  if (userMsgIndex < 0 || chat.messages[userMsgIndex].role !== 'user') return;

  // Remove the AI message
  chat.messages.splice(index, 1);
  saveChats();

  // Re-send the user query
  els.chatInput.value = chat.messages[userMsgIndex].content;
  // Remove the user message too since sendMessage will re-add it
  chat.messages.splice(userMsgIndex, 1);
  saveChats();
  renderMessages();
  sendMessage();
}

function scrollToBottom() {
  els.chatContainer.scrollTop = els.chatContainer.scrollHeight;
}

function autoResize(textarea) {
  textarea.style.height = 'auto';
  textarea.style.height = Math.min(textarea.scrollHeight, 150) + 'px';
}

/* ===== DOCUMENTS ===== */
function initUpload() {
  const zone = els.uploadZone;

  zone.addEventListener('click', () => els.fileInput.click());
  els.fileInput.addEventListener('change', handleFiles);

  zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('drag-over'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    zone.classList.remove('drag-over');
    if (e.dataTransfer.files.length) uploadFiles(e.dataTransfer.files);
  });
}

function handleFiles(e) {
  if (e.target.files.length) uploadFiles(e.target.files);
  e.target.value = '';
}

async function uploadFiles(fileList) {
  const files = Array.from(fileList);
  const allowed = ['.pdf', '.docx', '.txt', '.md'];

  for (const file of files) {
    const ext = '.' + file.name.split('.').pop().toLowerCase();
    if (!allowed.includes(ext)) {
      showToast(`Unsupported file type: ${ext}`, 'error');
      continue;
    }

    const progressId = 'prog_' + Date.now();
    els.uploadProgressArea.insertAdjacentHTML('beforeend', `
      <div class="upload-progress-item" id="${progressId}">
        <span class="file-name">${escapeHtml(file.name)}</span>
        <span class="upload-status processing">Processing...</span>
      </div>
    `);

    const formData = new FormData();
    formData.append('files', file);

    try {
      const res = await fetch(API.upload, { method: 'POST', body: formData });
      const data = await res.json();

      const el = document.getElementById(progressId);
      const result = data.results?.[0];

      if (result?.status === 'ready') {
        el.querySelector('.upload-status').textContent = `✓ ${result.chunk_count} chunks`;
        el.querySelector('.upload-status').className = 'upload-status success';
        showToast(`${file.name} indexed successfully`, 'success');
      } else {
        el.querySelector('.upload-status').textContent = '✗ Failed';
        el.querySelector('.upload-status').className = 'upload-status error';
        showToast(result?.message || 'Upload failed', 'error');
      }
    } catch (err) {
      const el = document.getElementById(progressId);
      if (el) {
        el.querySelector('.upload-status').textContent = '✗ Error';
        el.querySelector('.upload-status').className = 'upload-status error';
      }
      showToast(`Upload failed: ${err.message}`, 'error');
    }
  }

  loadDocuments();
  loadStatus();
}

async function loadDocuments() {
  try {
    const res = await fetch(API.documents);
    const data = await res.json();
    renderDocuments(data.documents || []);
  } catch {
    renderDocuments([]);
  }
}

function renderDocuments(docs) {
  els.docCount.textContent = `${docs.length} document${docs.length !== 1 ? 's' : ''}`;

  if (docs.length === 0) {
    els.docsEmptyState.style.display = 'flex';
    // Remove all doc-cards
    els.documentsList.querySelectorAll('.doc-card').forEach(c => c.remove());
    return;
  }

  els.docsEmptyState.style.display = 'none';

  const extIcons = { '.pdf': 'pdf', '.docx': 'docx', '.txt': 'txt', '.md': 'md' };

  els.documentsList.innerHTML = docs.map(doc => {
    const ext = doc.file_type || '.txt';
    const iconClass = extIcons[ext] || 'txt';
    return `
      <div class="doc-card">
        <div class="doc-icon ${iconClass}">${ext.replace('.', '').toUpperCase()}</div>
        <div class="doc-info">
          <div class="doc-name">${escapeHtml(doc.filename)}</div>
          <div class="doc-meta">
            <span>${doc.file_size_display || formatSize(doc.file_size)}</span>
            <span>${doc.chunk_count || 0} chunks</span>
            <span>${formatDate(doc.upload_date)}</span>
          </div>
        </div>
        <span class="doc-badge ${doc.status}">${doc.status}</span>
        <div class="doc-actions">
          <button class="doc-action-btn" onclick="reindexDoc('${doc.id}')" title="Re-index">🔄</button>
          <button class="doc-action-btn delete" onclick="deleteDoc('${doc.id}','${escapeHtml(doc.filename)}')" title="Delete">🗑️</button>
        </div>
      </div>
    `;
  }).join('');
}

async function deleteDoc(id, name) {
  if (!confirm(`Delete "${name}" and all its indexed data?`)) return;
  try {
    await fetch(`${API.documents}/${id}`, { method: 'DELETE' });
    showToast(`${name} deleted`, 'success');
    loadDocuments();
    loadStatus();
  } catch (err) {
    showToast('Delete failed', 'error');
  }
}

async function reindexDoc(id) {
  try {
    showToast('Re-indexing...', 'info');
    const res = await fetch(`${API.documents}/${id}/reindex`, { method: 'POST' });
    const data = await res.json();
    showToast(data.message || 'Re-indexed', 'success');
    loadDocuments();
    loadStatus();
  } catch (err) {
    showToast('Re-index failed', 'error');
  }
}

/* ===== SETTINGS ===== */
function initSettings() {
  const sliders = [
    { id: 'settingMinSim', key: 'min_similarity', valId: 'valMinSim', fmt: v => parseFloat(v).toFixed(2) },
    { id: 'settingTopK', key: 'top_k', valId: 'valTopK', fmt: v => parseInt(v) },
    { id: 'settingTemp', key: 'temperature', valId: 'valTemp', fmt: v => parseFloat(v).toFixed(2) },
  ];

  sliders.forEach(({ id, key, valId, fmt }) => {
    const slider = document.getElementById(id);
    const valEl = document.getElementById(valId);
    slider.addEventListener('input', () => {
      const val = fmt(slider.value);
      if (valEl) valEl.textContent = val;
      state.settings[key] = typeof val === 'string' ? parseFloat(val) : val;
      debounce(() => saveSettings(), 500)();
    });
  });

  const maxTokensInput = document.getElementById('settingMaxTokens');
  maxTokensInput.addEventListener('change', () => {
    state.settings.max_tokens = parseInt(maxTokensInput.value) || 1024;
    saveSettings();
  });
}

async function loadSettings() {
  try {
    const res = await fetch(API.settings);
    const data = await res.json();
    state.settings = { ...state.settings, ...data };
    applySettingsToUI();
  } catch { /* use defaults */ }
}

function applySettingsToUI() {
  const s = state.settings;
  document.getElementById('settingMinSim').value = s.min_similarity;
  document.getElementById('valMinSim').textContent = s.min_similarity.toFixed(2);
  document.getElementById('settingTopK').value = s.top_k;
  document.getElementById('valTopK').textContent = s.top_k;
  document.getElementById('settingTemp').value = s.temperature;
  document.getElementById('valTemp').textContent = s.temperature.toFixed(2);
  document.getElementById('settingMaxTokens').value = s.max_tokens;
}

async function saveSettings() {
  try {
    await fetch(API.settings, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(state.settings),
    });
  } catch { /* ignore */ }
}

/* ===== STATUS ===== */
async function loadStatus() {
  try {
    const res = await fetch(API.status);
    const data = await res.json();

    document.getElementById('statEmbModel').textContent = data.embedding_model || '—';
    document.getElementById('statLLMModel').textContent = data.llm_model || '—';
    document.getElementById('statDocCount').textContent = data.indexed_documents ?? '—';
    document.getElementById('statChunks').textContent = data.total_chunks ?? '—';
    document.getElementById('statVDBStatus').textContent = data.vector_db_status || '—';
    document.getElementById('statVDim').textContent = data.vector_dimension || '—';

    const dot = els.statusIndicator.querySelector('.status-dot');
    const text = els.statusIndicator.querySelector('.status-text');
    dot.className = 'status-dot online';
    text.textContent = 'Connected';
  } catch {
    const dot = els.statusIndicator.querySelector('.status-dot');
    const text = els.statusIndicator.querySelector('.status-text');
    dot.className = 'status-dot error';
    text.textContent = 'Disconnected';
  }
}

/* ===== MARKDOWN RENDERER ===== */
function renderMarkdown(text) {
  if (!text) return '';
  let html = escapeHtml(text);

  // Code blocks (``` ... ```)
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    return `<pre><code class="lang-${lang}">${code.trim()}</code></pre>`;
  });

  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Headers
  html = html.replace(/^#### (.+)$/gm, '<h4>$1</h4>');
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

  // Bold and italic
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

  // Unordered lists
  html = html.replace(/^[\-\*] (.+)$/gm, '<li>$1</li>');
  html = html.replace(/((?:<li>.*<\/li>\n?)+)/g, '<ul>$1</ul>');

  // Ordered lists
  html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');

  // Line breaks → paragraphs
  html = html.replace(/\n\n/g, '</p><p>');
  html = html.replace(/\n/g, '<br>');
  html = '<p>' + html + '</p>';

  // Clean up empty paragraphs
  html = html.replace(/<p>\s*<\/p>/g, '');
  html = html.replace(/<p>\s*(<h[1-4]>)/g, '$1');
  html = html.replace(/(<\/h[1-4]>)\s*<\/p>/g, '$1');
  html = html.replace(/<p>\s*(<pre>)/g, '$1');
  html = html.replace(/(<\/pre>)\s*<\/p>/g, '$1');
  html = html.replace(/<p>\s*(<ul>)/g, '$1');
  html = html.replace(/(<\/ul>)\s*<\/p>/g, '$1');

  return html;
}

/* ===== UTILITIES ===== */
function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  els.toastContainer.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('toast-out');
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

function formatSize(bytes) {
  if (!bytes) return '0 B';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}

function formatDate(isoStr) {
  if (!isoStr) return '';
  try {
    const d = new Date(isoStr);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch { return isoStr; }
}

let _debounceTimers = {};
function debounce(fn, ms) {
  return (...args) => {
    clearTimeout(_debounceTimers[fn]);
    _debounceTimers[fn] = setTimeout(() => fn(...args), ms);
  };
}

// Make functions available globally for onclick handlers
window.copyMessage = copyMessage;
window.regenerateMessage = regenerateMessage;
window.deleteDoc = deleteDoc;
window.reindexDoc = reindexDoc;
