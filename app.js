const sessionForm = document.getElementById("session-form");
const phoneInput = document.getElementById("phone-input");
const sessionName = document.getElementById("session-name");
const sessionResult = document.getElementById("session-result");
const chatList = document.getElementById("chat-list");
const chatsCard = document.getElementById("chats-card");
const adminCard = document.getElementById("admin-card");
const scanButton = document.getElementById("scan-button");
const downloadButton = document.getElementById("download-button");
const statusChip = document.getElementById("status-chip");
const resultsSection = document.getElementById("results");
const resultsTitle = document.getElementById("results-title");
const msgCount = document.getElementById("msg-count");
const userCount = document.getElementById("user-count");
const userList = document.getElementById("user-list");
const limitInput = document.getElementById("limit-input");
const dcFilter = document.getElementById("dc-filter");
const dedupe = document.getElementById("dedupe");
const minLengthInput = document.getElementById("min-length");
const keywordFilter = document.getElementById("keyword-filter");
const skipBots = document.getElementById("skip-bots");

let chats = [];
let currentSession = null;
let selectedChat = null;
let lastResult = [];

function randomChoice(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generateChatData() {
  const sampleUsers = [
    { username: "alpha", dc: 1 },
    { username: "beta", dc: 1 },
    { username: "gamma_bot", dc: 1 },
    { username: "delta", dc: 2 },
    { username: "omega", dc: 1 },
    { username: "matrix", dc: 3 },
    { username: "vector", dc: 1 },
    { username: "zen", dc: 1 },
    { username: "proxy", dc: 2 },
    { username: "lambda", dc: 1 },
  ];

  const topics = ["release", "update", "meeting", "alert", "beta", "game" , "launch", "patch", "event", "security"];

  const createMessages = (count) => {
    const messages = [];
    for (let i = 0; i < count; i++) {
      const sender = randomChoice(sampleUsers);
      const topic = randomChoice(topics);
      messages.push({
        id: i + 1,
        sender,
        text: `${topic} message #${i + 1}`,
        timestamp: Date.now() - Math.floor(Math.random() * 3_600_000 * 24),
      });
    }
    return messages;
  };

  chats = [
    { id: 101, title: "Game Dev", messages: createMessages(1200) },
    { id: 102, title: "Security Ops", messages: createMessages(960) },
    { id: 103, title: "Marketing", messages: createMessages(1110) },
    { id: 104, title: "Releases", messages: createMessages(870) },
    { id: 105, title: "Beta Squad", messages: createMessages(1300) },
  ];
}

function renderChatList() {
  chatList.innerHTML = "";
  chats.forEach((chat) => {
    const li = document.createElement("li");
    li.className = "chat-item";
    li.innerHTML = `
      <div class="chat-meta">
        <div class="chat-dot"></div>
        <div>
          <div><strong>${chat.title}</strong></div>
          <div class="muted">${chat.messages.length} сообщений</div>
        </div>
      </div>
      <button class="btn ghost" data-chat="${chat.id}">Выбрать</button>
    `;
    li.querySelector("button").addEventListener("click", () => selectChat(chat.id));
    chatList.appendChild(li);
  });
}

function selectChat(id) {
  selectedChat = chats.find((c) => c.id === id);
  if (!selectedChat) return;
  Array.from(chatList.querySelectorAll("li")).forEach((item) => item.classList.remove("active"));
  const button = chatList.querySelector(`button[data-chat="${id}"]`);
  if (button) button.closest("li").classList.add("active");
  scanButton.disabled = false;
  downloadButton.disabled = true;
  resultsSection.hidden = true;
  statusChip.hidden = false;
  statusChip.textContent = `Выбран чат: ${selectedChat.title}`;
}

function buildScanOptions() {
  const limit = Math.min(Math.max(parseInt(limitInput.value, 10) || 0, 50), 1000);
  limitInput.value = limit;

  const keywords = keywordFilter.value
    .split(",")
    .map((k) => k.trim().toLowerCase())
    .filter(Boolean);

  return {
    limit,
    onlyDc1: dcFilter.checked,
    dedupe: dedupe.checked,
    minLength: Math.max(Number(minLengthInput.value) || 0, 0),
    keywords,
    skipBots: skipBots.checked,
  };
}

function scanChatMessages(chat, options) {
  const { limit, onlyDc1, dedupe, minLength, keywords, skipBots } = options;
  const slice = chat.messages.slice(-limit);

  const passesFilters = (message) => {
    const sender = message.sender || {};
    if (onlyDc1 && sender.dc !== 1) return false;
    if (minLength > 0 && message.text.length < minLength) return false;
    if (skipBots && sender.username?.toLowerCase().endsWith("bot")) return false;
    if (keywords.length > 0) {
      const lower = message.text.toLowerCase();
      const hasKeyword = keywords.some((k) => lower.includes(k));
      if (!hasKeyword) return false;
    }
    return true;
  };

  const filtered = slice.filter(passesFilters);
  const usernames = filtered.map((m) => ({
    username: m.sender.username,
    dc: m.sender.dc,
    message: m.text,
  }));

  const deduped = dedupe
    ? Array.from(new Map(usernames.map((u) => [u.username, u])).values())
    : usernames;

  return {
    messagesAnalyzed: slice.length,
    senders: deduped,
  };
}

function renderResults(chat, result) {
  resultsTitle.textContent = `${chat.title} — дата-центр 1`;
  msgCount.textContent = `${result.messagesAnalyzed} сообщений просмотрено`;
  userCount.textContent = `${result.senders.length} отправителей`;
  userList.innerHTML = "";

  result.senders.forEach((user) => {
    const li = document.createElement("li");
    li.innerHTML = `
      <div><strong>${user.username}</strong></div>
      <span>DC ${user.dc}</span>
    `;
    userList.appendChild(li);
  });

  resultsSection.hidden = false;
  downloadButton.disabled = result.senders.length === 0;
  statusChip.textContent = `Сформировано: ${result.senders.length} пользователей`;
}

function downloadText(users) {
  const lines = users.map((u) => `${u.username} (dc ${u.dc})`);
  const blob = new Blob([lines.join("\n")], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "parsed-users.txt";
  a.click();
  URL.revokeObjectURL(url);
}

sessionForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const phone = phoneInput.value.trim();
  if (!phone) return;
  const name = sessionName.value.trim() || "anon";
  const sessionId = Math.random().toString(16).slice(2, 8).toUpperCase();
  currentSession = { phone, name, sessionId };
  sessionResult.hidden = false;
  sessionResult.innerHTML = `Сессия <strong>${name}</strong> активна · ID ${sessionId}`;
  generateChatData();
  renderChatList();
  chatsCard.hidden = false;
  adminCard.hidden = false;
  statusChip.hidden = false;
  statusChip.textContent = "Выбери чат для сканирования";
});

scanButton.addEventListener("click", () => {
  if (!selectedChat) return;
  const options = buildScanOptions();
  statusChip.textContent = "Сканируем...";
  scanButton.disabled = true;

  setTimeout(() => {
    const result = scanChatMessages(selectedChat, options);
    lastResult = result.senders;
    renderResults(selectedChat, result);
    scanButton.disabled = false;
  }, 300);
});

downloadButton.addEventListener("click", () => {
  if (!lastResult.length) return;
  downloadText(lastResult);
});

generateChatData();
renderChatList();
