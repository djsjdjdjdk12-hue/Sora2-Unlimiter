import MTProto from "https://cdn.jsdelivr.net/npm/@mtproto/core@1.2.1/dist/mtproto.es.js";

const sessionForm = document.getElementById("session-form");
const apiIdInput = document.getElementById("api-id");
const apiHashInput = document.getElementById("api-hash");
const phoneInput = document.getElementById("phone-input");
const sessionResult = document.getElementById("session-result");
const codeBlock = document.getElementById("code-block");
const codeInput = document.getElementById("code-input");
const codeSubmit = document.getElementById("code-submit");

const chatList = document.getElementById("chat-list");
const chatsCard = document.getElementById("chats-card");
const adminCard = document.getElementById("admin-card");
const scanButton = document.getElementById("scan-button");
const downloadButton = document.getElementById("download-button");
const downloadCsvButton = document.getElementById("download-csv");
const statusChip = document.getElementById("status-chip");
const resultsSection = document.getElementById("results");
const resultsTitle = document.getElementById("results-title");
const msgCount = document.getElementById("msg-count");
const userCount = document.getElementById("user-count");
const userList = document.getElementById("user-list");
const limitInput = document.getElementById("limit-input");
const daysInput = document.getElementById("days-input");
const dcFilter = document.getElementById("dc-filter");
const dedupe = document.getElementById("dedupe");
const minLengthInput = document.getElementById("min-length");
const keywordFilter = document.getElementById("keyword-filter");
const skipBots = document.getElementById("skip-bots");
const skipService = document.getElementById("skip-service");
const allowForwards = document.getElementById("allow-forwards");
const requireMedia = document.getElementById("require-media");
const requireUsername = document.getElementById("require-username");

let mtproto = null;
let currentPhone = "";
let phoneCodeHash = "";
let dialogs = [];
let users = [];
let chats = [];
let selectedDialog = null;
let lastResult = [];

const storage = {
  get(key) {
    return localStorage.getItem(key);
  },
  set(key, value) {
    localStorage.setItem(key, value);
  },
  remove(key) {
    localStorage.removeItem(key);
  },
};

function setStatus(text, tone = "muted") {
  statusChip.hidden = !text;
  statusChip.textContent = text;
  statusChip.classList.remove("pill--warn", "pill--ok");
  if (tone === "warn") statusChip.classList.add("pill--warn");
  if (tone === "ok") statusChip.classList.add("pill--ok");
}

async function createClient(apiId, apiHash) {
  mtproto = new MTProto({
    api_id: Number(apiId),
    api_hash: apiHash.trim(),
    storageOptions: { instance: storage },
  });
}

async function sendCode() {
  const apiId = apiIdInput.value.trim();
  const apiHash = apiHashInput.value.trim();
  const phone = phoneInput.value.trim();

  if (!apiId || !apiHash || !phone) return;
  await createClient(apiId, apiHash);
  currentPhone = phone;

  setStatus("Запрашиваем код...");
  const result = await mtproto.call("auth.sendCode", {
    phone_number: phone,
    settings: { _: "codeSettings" },
  });
  phoneCodeHash = result.phone_code_hash;
  codeBlock.hidden = false;
  sessionResult.hidden = false;
  sessionResult.innerHTML = `Код отправлен на <strong>${phone}</strong>. Введите его для входа.`;
  setStatus("Код отправлен. Проверь Telegram", "ok");
}

async function signIn() {
  const code = codeInput.value.trim();
  if (!code || !mtproto) return;
  setStatus("Подтверждаем код...");
  try {
    await mtproto.call("auth.signIn", {
      phone_code: code,
      phone_number: currentPhone,
      phone_code_hash: phoneCodeHash,
    });
    sessionResult.innerHTML = `Успешный вход для <strong>${currentPhone}</strong>. Сессия сохранена в браузере.`;
    setStatus("Авторизованы", "ok");
    await loadDialogs();
  } catch (error) {
    if (error.error_message === "SESSION_PASSWORD_NEEDED") {
      setStatus("Нужен пароль 2FA. Отключи или добавь обработчик", "warn");
    } else {
      setStatus(`Ошибка: ${error.error_message || error.message}`, "warn");
    }
  }
}

function dialogPeerToInput(peer) {
  if (peer._ === "peerUser") {
    const user = users.find((u) => u.id === peer.user_id);
    if (!user) return null;
    return { _: "inputPeerUser", user_id: user.id, access_hash: user.access_hash };
  }
  if (peer._ === "peerChat") {
    return { _: "inputPeerChat", chat_id: peer.chat_id };
  }
  if (peer._ === "peerChannel") {
    const chat = chats.find((c) => c.id === peer.channel_id);
    if (!chat) return null;
    return { _: "inputPeerChannel", channel_id: chat.id, access_hash: chat.access_hash };
  }
  return null;
}

function renderChatList() {
  chatList.innerHTML = "";
  dialogs.forEach((dialog) => {
    const title = dialog.title || dialog.entityTitle;
    const li = document.createElement("li");
    li.className = "chat-item";
    li.innerHTML = `
      <div class="chat-meta">
        <div class="chat-dot"></div>
        <div>
          <div><strong>${title}</strong></div>
          <div class="muted">${dialog.messageCount || 0} сообщений</div>
        </div>
      </div>
      <button class="btn ghost">Выбрать</button>
    `;
    li.querySelector("button").addEventListener("click", () => selectChat(dialog));
    chatList.appendChild(li);
  });
}

function selectChat(dialog) {
  selectedDialog = dialog;
  Array.from(chatList.querySelectorAll("li")).forEach((item) => item.classList.remove("active"));
  const index = dialogs.indexOf(dialog);
  const li = chatList.children[index];
  if (li) li.classList.add("active");
  scanButton.disabled = false;
  downloadButton.disabled = true;
  downloadCsvButton.disabled = true;
  resultsSection.hidden = true;
  setStatus(`Выбран чат: ${dialog.title}`);
}

function buildScanOptions() {
  const limit = Math.min(Math.max(parseInt(limitInput.value, 10) || 0, 50), 1000);
  limitInput.value = limit;
  const keywords = keywordFilter.value
    .split(",")
    .map((k) => k.trim().toLowerCase())
    .filter(Boolean);
  const days = Math.max(Number(daysInput.value) || 0, 0);
  return {
    limit,
    onlyDc1: dcFilter.checked,
    dedupe: dedupe.checked,
    minLength: Math.max(Number(minLengthInput.value) || 0, 0),
    keywords,
    skipBots: skipBots.checked,
    skipService: skipService.checked,
    allowForwards: allowForwards.checked,
    requireMedia: requireMedia.checked,
    requireUsername: requireUsername.checked,
    days,
  };
}

function filterMessage(message, options) {
  const { onlyDc1, minLength, keywords, skipBots, skipService, allowForwards, requireMedia, requireUsername, days } = options;
  if (skipService && message._ !== "message") return false;
  if (!allowForwards && message.fwd_from) return false;
  if (requireMedia && !message.media) return false;
  if (minLength > 0 && (message.message || "").length < minLength) return false;
  if (keywords.length > 0) {
    const text = (message.message || "").toLowerCase();
    const hasKeyword = keywords.some((k) => text.includes(k));
    if (!hasKeyword) return false;
  }
  if (days > 0) {
    const cutoff = Date.now() - days * 86_400_000;
    const msgDateMs = (message.date || 0) * 1000;
    if (msgDateMs < cutoff) return false;
  }

  const sender = resolveSender(message.from_id);
  if (!sender) return false;
  if (requireUsername && !sender.username) return false;
  if (skipBots && sender.username?.toLowerCase().endsWith("bot")) return false;
  if (onlyDc1 && sender.photo && sender.photo.dc_id && sender.photo.dc_id !== 1) return false;
  return true;
}

function resolveSender(from) {
  if (!from) return null;
  if (from._ === "peerUser" || typeof from === "number") {
    const id = from.user_id || from;
    return users.find((u) => u.id === id);
  }
  if (from._ === "peerChannel") {
    const id = from.channel_id;
    return chats.find((c) => c.id === id);
  }
  if (from._ === "peerChat") {
    const id = from.chat_id;
    return chats.find((c) => c.id === id);
  }
  return null;
}

function buildSenderRecords(messages, options) {
  const filtered = messages.filter((m) => filterMessage(m, options));
  const senders = filtered.map((message) => {
    const sender = resolveSender(message.from_id) || {};
    return {
      username: sender.username || `id${sender.id || "unknown"}`,
      id: sender.id,
      dc: sender.photo?.dc_id || "?",
      message: message.message || "",
      date: message.date,
      hasMedia: Boolean(message.media),
    };
  });
  return options.dedupe
    ? Array.from(new Map(senders.map((s) => [s.username, s])).values())
    : senders;
}

function renderResults(dialog, result, analyzedCount) {
  resultsTitle.textContent = `${dialog.title} — дата-центр 1 фильтр: ${dcFilter.checked ? "вкл" : "выкл"}`;
  msgCount.textContent = `${analyzedCount} сообщений просмотрено`;
  userCount.textContent = `${result.length} отправителей`;
  userList.innerHTML = "";

  result.forEach((user) => {
    const li = document.createElement("li");
    const date = user.date ? new Date(user.date * 1000).toLocaleString() : "";
    li.innerHTML = `
      <div><strong>${user.username}</strong><div class="muted">${date}</div></div>
      <span>DC ${user.dc}</span>
    `;
    userList.appendChild(li);
  });

  resultsSection.hidden = false;
  downloadButton.disabled = result.length === 0;
  downloadCsvButton.disabled = result.length === 0;
  setStatus(`Сформировано: ${result.length} пользователей`, "ok");
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

function downloadCsv(users) {
  const lines = ["username,id,dc,date,has_media"];
  users.forEach((u) => {
    lines.push(`${u.username},${u.id || ""},${u.dc || ""},${u.date || ""},${u.hasMedia}`);
  });
  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "parsed-users.csv";
  a.click();
  URL.revokeObjectURL(url);
}

async function loadDialogs() {
  setStatus("Загружаем диалоги...");
  const response = await mtproto.call("messages.getDialogs", {
    offset_peer: { _: "inputPeerEmpty" },
    offset_date: 0,
    offset_id: 0,
    limit: 50,
    hash: 0,
  });
  dialogs = response.dialogs || [];
  users = response.users || [];
  chats = response.chats || [];

  dialogs = dialogs.map((dialog) => {
    const peer = dialog.peer;
    if (peer._ === "peerUser") {
      const user = users.find((u) => u.id === peer.user_id);
      return {
        ...dialog,
        title: user?.first_name || user?.username || `user ${peer.user_id}`,
        entityTitle: user?.username,
        messageCount: dialog.top_message,
      };
    }
    if (peer._ === "peerChat" || peer._ === "peerChannel") {
      const chat = chats.find((c) => c.id === (peer.chat_id || peer.channel_id));
      return {
        ...dialog,
        title: chat?.title || `chat ${peer.chat_id || peer.channel_id}`,
        entityTitle: chat?.username,
        messageCount: dialog.top_message,
      };
    }
    return dialog;
  });

  renderChatList();
  chatsCard.hidden = false;
  adminCard.hidden = false;
  setStatus("Диалоги готовы. Выберите чат", "ok");
}

async function scanChat() {
  if (!selectedDialog) return;
  scanButton.disabled = true;
  setStatus("Сканируем...");
  const options = buildScanOptions();
  const peer = dialogPeerToInput(selectedDialog.peer);
  if (!peer) {
    setStatus("Не удалось построить peer", "warn");
    scanButton.disabled = false;
    return;
  }
  const history = await mtproto.call("messages.getHistory", {
    peer,
    limit: options.limit,
    add_offset: 0,
    offset_id: 0,
    offset_date: 0,
    max_id: 0,
    min_id: 0,
    hash: 0,
  });
  const messages = history.messages || [];
  users = history.users?.length ? history.users : users;
  chats = history.chats?.length ? history.chats : chats;
  const senderRecords = buildSenderRecords(messages, options);
  lastResult = senderRecords;
  renderResults(selectedDialog, senderRecords, messages.length);
  scanButton.disabled = false;
}

sessionForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    await sendCode();
  } catch (error) {
    setStatus(`Ошибка: ${error.error_message || error.message}`, "warn");
  }
});

codeSubmit.addEventListener("click", async () => {
  try {
    await signIn();
  } catch (error) {
    setStatus(`Ошибка: ${error.error_message || error.message}`, "warn");
  }
});

scanButton.addEventListener("click", () => {
  scanChat();
});

downloadButton.addEventListener("click", () => {
  if (!lastResult.length) return;
  downloadText(lastResult);
});

downloadCsvButton.addEventListener("click", () => {
  if (!lastResult.length) return;
  downloadCsv(lastResult);
});

window.addEventListener("load", () => {
  const savedApiId = localStorage.getItem("api_id");
  const savedApiHash = localStorage.getItem("api_hash");
  if (savedApiId) apiIdInput.value = savedApiId;
  if (savedApiHash) apiHashInput.value = savedApiHash;
  apiIdInput.addEventListener("change", () => storage.set("api_id", apiIdInput.value.trim()));
  apiHashInput.addEventListener("change", () => storage.set("api_hash", apiHashInput.value.trim()));
});
