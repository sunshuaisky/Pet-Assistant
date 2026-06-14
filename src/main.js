import "./styles.css";
import tuxieEating16 from "./assets/pets/tuxie/eating-16.webp";
import tuxiePlayBall16 from "./assets/pets/tuxie/play-ball-16.webp";
import tuxiePlayWand16 from "./assets/pets/tuxie/play-wand-16.webp";
import tuxieSleeping16 from "./assets/pets/tuxie/sleeping-16.webp";
import tuxieSpritesheet from "./assets/pets/tuxie/spritesheet.webp";
import {
  appendChatMessageToState,
  computeTheme,
  createConversation,
  defaultUserSettings,
  normalizeChatState,
  normalizeRoute,
  normalizeUserSettings,
  selectedConversation,
} from "./ui-state.js";

const invoke = window.__TAURI__?.core?.invoke;
const convertFileSrc = window.__TAURI__?.core?.convertFileSrc;
const listen = window.__TAURI__?.event?.listen;
const tauriWindowApi = window.__TAURI__?.window;
const appWindow = tauriWindowApi?.getCurrentWindow?.();
const appRoot = document.querySelector("#app");

const providerTitles = {
  claude: "Claude Code",
  codex: "Codex",
  "codex-cli": "Codex CLI",
  cursor: "Cursor",
  gemini: "Gemini CLI",
  opencode: "OpenCode",
  qoder: "Qoder",
  qwen: "Qwen Code",
};

const providerInitials = {
  claude: "CC",
  codex: "CX",
  "codex-cli": "CLI",
  cursor: "CU",
  gemini: "G",
  opencode: "OC",
  qoder: "QD",
  qwen: "QW",
};

const fallbackSessions = [];

const fallbackIntegrations = [
  {
    id: "codex",
    name: "Codex",
    kind: "桌面应用",
    status: "preview",
    message: "浏览器预览无法检测本机集成",
    installed: false,
    running: false,
    focusable: true,
  },
];

const SPRITE_COLUMNS = 8;
const SPRITE_ROWS = 9;
const PET_WIDTH = 128;
const PET_HEIGHT = 139;
const PET_MARGIN = 56;
const PET_DRAG_HOLD_MS = 180;
const PET_DRAG_DISTANCE = 7;
const PASS_THROUGH_POLL_MS = 180;
const SESSION_POLL_MS = 5000;
const SESSION_HISTORY_POLL_MS = 3500;
const PET_POSITION_STORAGE_KEY = "phoenix-pet-position";
const SETTINGS_STORAGE_KEY = "phoenix-pet-settings";
const CHAT_STORAGE_KEY = "phoenix-pet-chat";
const EMPTY_HISTORY = [];
const MAX_CHAT_IMAGES = 4;
const MAX_CHAT_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_USER_AVATAR_BYTES = 2 * 1024 * 1024;

const builtInPets = [
  {
    id: "tuxie",
    name: "Tuxie",
    kind: "atlas",
    source: "built-in",
    src: tuxieSpritesheet,
    columns: SPRITE_COLUMNS,
    rows: SPRITE_ROWS,
    width: PET_WIDTH,
    height: PET_HEIGHT,
  },
];

const settingSections = [
  { id: "appearance", title: "外观", subtitle: "主题" },
  { id: "display", title: "显示", subtitle: "宠物标记与位置" },
  { id: "pet", title: "宠物", subtitle: "导入与切换" },
  { id: "integrations", title: "集成", subtitle: "工具检测与跳转" },
  { id: "chatApi", title: "聊天 API", subtitle: "OpenAI 兼容接口" },
];

const routeItems = [
  { id: "monitor", title: "监控" },
  { id: "chat", title: "聊天" },
  { id: "settings", title: "设置" },
];

const petAnimations = {
  "running-right": { row: 1, frames: 8, durations: [120, 120, 120, 120, 120, 120, 120, 220], label: "向右跑" },
  "running-left": { row: 2, frames: 8, durations: [120, 120, 120, 120, 120, 120, 120, 220], label: "向左跑" },
  "play-wand": {
    row: 0,
    frames: 16,
    columns: 16,
    rows: 1,
    builtInSrc: tuxiePlayWand16,
    fallbackRow: 3,
    fallbackFrames: 8,
    fallbackDurations: [150, 145, 145, 150, 155, 155, 150, 220],
    durations: [140, 125, 115, 115, 120, 125, 135, 140, 140, 135, 125, 120, 125, 135, 145, 170],
    loops: 3,
    label: "玩逗猫棒",
  },
  "play-ball": {
    row: 0,
    frames: 16,
    columns: 16,
    rows: 1,
    builtInSrc: tuxiePlayBall16,
    fallbackRow: 4,
    fallbackFrames: 8,
    fallbackDurations: [150, 145, 145, 150, 155, 155, 150, 210],
    durations: [125, 110, 110, 105, 105, 110, 115, 115, 115, 115, 115, 120, 125, 135, 145, 165],
    loops: 3,
    label: "玩球",
  },
  eating: {
    row: 0,
    frames: 16,
    columns: 16,
    rows: 1,
    builtInSrc: tuxieEating16,
    fallbackRow: 6,
    fallbackFrames: 8,
    fallbackDurations: [170, 160, 160, 170, 170, 180, 165, 230],
    durations: [150, 135, 125, 120, 125, 130, 140, 150, 135, 125, 125, 135, 150, 165, 175, 190],
    loops: 3,
    label: "吃饭",
  },
  sleeping: {
    row: 0,
    frames: 16,
    columns: 16,
    rows: 1,
    builtInSrc: tuxieSleeping16,
    fallbackRow: 5,
    fallbackFrames: 8,
    fallbackDurations: [260, 250, 250, 260, 270, 270, 260, 520],
    durations: [360, 340, 330, 330, 340, 360, 380, 390, 390, 380, 360, 345, 335, 335, 350, 430],
    label: "睡觉",
  },
  thinking: {
    row: 8,
    frames: 6,
    sequence: [0, 1, 2, 3, 4, 5, 4, 3, 2, 1],
    durations: [190, 180, 180, 190, 200, 300, 200, 190, 180, 190],
    label: "思考",
  },
};

const closedPetSequence = ["play-wand", "play-ball", "eating", "sleeping"];

function defaultPetPosition() {
  return {
    x: Math.max(PET_MARGIN, window.innerWidth - PET_WIDTH - PET_MARGIN),
    y: Math.max(PET_MARGIN, window.innerHeight - PET_HEIGHT - PET_MARGIN),
  };
}

function clampPetPosition(position) {
  return {
    x: Math.min(Math.max(PET_MARGIN, position.x), Math.max(PET_MARGIN, window.innerWidth - PET_WIDTH - PET_MARGIN)),
    y: Math.min(Math.max(PET_MARGIN, position.y), Math.max(PET_MARGIN, window.innerHeight - PET_HEIGHT - PET_MARGIN)),
  };
}

function readJsonStorage(key, fallbackValue) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallbackValue;
  } catch {
    return fallbackValue;
  }
}

function writeJsonStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage can fail in restricted browser contexts; keep runtime state usable.
  }
}

function loadPetPosition() {
  const saved = readJsonStorage(PET_POSITION_STORAGE_KEY, null);
  if (Number.isFinite(saved?.x) && Number.isFinite(saved?.y)) {
    return clampPetPosition(saved);
  }
  return defaultPetPosition();
}

function savePetPosition(position) {
  writeJsonStorage(PET_POSITION_STORAGE_KEY, clampPetPosition(position));
}

function loadUserSettings() {
  const saved = readJsonStorage(SETTINGS_STORAGE_KEY, null);
  return normalizeUserSettings({ ...defaultUserSettings, ...(saved || {}) });
}

function saveUserSettings() {
  writeJsonStorage(SETTINGS_STORAGE_KEY, state.userSettings);
}

function loadChatState() {
  const chatState = normalizeChatState(readJsonStorage(CHAT_STORAGE_KEY, null));
  if (chatState.conversations.length) return chatState;
  const conversation = createConversation("新对话");
  return {
    conversations: [conversation],
    selectedConversationId: conversation.id,
  };
}

function saveChatState() {
  writeJsonStorage(CHAT_STORAGE_KEY, state.chatState);
}

function normalizeImportedPet(pet) {
  return normalizeUserSettings({ importedPets: [pet] }).importedPets[0] || null;
}

function petLibrary() {
  return [...builtInPets, ...state.userSettings.importedPets].map((pet) => ({
    ...pet,
    name: state.userSettings.renamedPets[pet.id] || pet.name,
  }));
}

function currentPet() {
  return petLibrary().find((pet) => pet.id === state.userSettings.currentPetId) || builtInPets[0];
}

function rawPetById(id) {
  return [...builtInPets, ...state.userSettings.importedPets].find((pet) => pet.id === id);
}

function setPetName(id, name) {
  const pet = rawPetById(id);
  const trimmedName = name.trim().replace(/\s+/g, " ").slice(0, 32);
  if (!pet || !trimmedName) return false;

  if (trimmedName === pet.name) {
    delete state.userSettings.renamedPets[id];
  } else {
    state.userSettings.renamedPets[id] = trimmedName;
  }

  return true;
}

function providerName(provider) {
  return providerTitles[provider] ?? provider;
}

function isGenericSessionTitle(session) {
  const title = String(session.title ?? "").trim().toLowerCase();
  const providerLabel = providerName(session.provider).toLowerCase();
  return [
    "codex session",
    "codex 会话",
    "claude session",
    "claude 会话",
    "claude code session",
    "claude code 会话",
    `${providerLabel} session`,
    `${providerLabel} 会话`,
  ].includes(title);
}

function isGenericSessionMessage(session) {
  const message = String(session.message ?? "").trim().toLowerCase();
  return !message || message === `${session.provider} event: progress` || message === `${session.provider} event: completed`;
}

function projectNameFromCwd(cwd) {
  const normalized = String(cwd ?? "").trim().replace(/\/+$/, "");
  if (!normalized) return "";
  return normalized.split("/").filter(Boolean).pop() || normalized;
}

function sessionDisplayTitle(session) {
  const cwdProject = projectNameFromCwd(session.cwd);
  if (cwdProject) return cwdProject;

  const project = String(session.project ?? "").trim();
  if (project && project !== "终端") return project;

  return `${providerName(session.provider)} 会话`;
}

function sessionSubtitle(session) {
  const title = sessionDisplayTitle(session);
  return [session.kind, session.updatedAt, session.message]
    .filter((value) => value && value !== title)
    .join(" · ");
}

function renderProviderMark(provider) {
  const title = providerName(provider);
  const initials = providerInitials[provider] || title.slice(0, 2).toUpperCase();
  return `<span class="app-icon" aria-hidden="true">${escapeHtml(initials)}</span>`;
}

function commitPetRename(id, value) {
  if (!setPetName(id, value)) {
    return false;
  }

  state.renamingPetId = "";
  saveUserSettings();
  return true;
}

function cssAttributeValue(value) {
  const text = String(value ?? "");
  return window.CSS?.escape ? CSS.escape(text) : text.replace(/["\\]/g, "\\$&");
}

function petNameInput(id) {
  return document.querySelector(`[data-pet-name-input="${cssAttributeValue(id)}"]`);
}

function petAssetSource(pet) {
  if (pet.src) return pet.src;
  if (pet.assetPath && convertFileSrc) return convertFileSrc(pet.assetPath);
  return pet.assetPath || "";
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => (
    {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[character]
  ));
}

const state = {
  open: false,
  route: normalizeRoute("monitor"),
  selectedId: "codex-local",
  selectedSetting: "appearance",
  sessions: fallbackSessions,
  integrations: fallbackIntegrations,
  historyBySessionId: {},
  historyLoadingId: "",
  petPosition: loadPetPosition(),
  userSettings: loadUserSettings(),
  chatState: loadChatState(),
  chatDraft: "",
  chatSearch: "",
  chatSending: false,
  chatAttachments: [],
  chatAttachmentError: "",
  chatStreamRequestId: "",
  chatStreamMessageId: "",
  chatApiActiveModel: "",
  chatApiRequestedModel: "",
  chatApiConfig: {
    enabled: false,
    baseUrl: "https://api.openai.com/v1",
    apiKey: "",
    model: "gpt-4.1-mini",
    systemPrompt: "你是 Phoenix Pet 的聊天助手。回答简洁、准确。",
    hasApiKey: false,
  },
  chatApiStatus: "",
  chatApiBusy: false,
  petAction: "sleeping",
  dragAction: null,
  actionMenuOpen: false,
  renamingPetId: "",
};

const systemThemeQuery = window.matchMedia?.("(prefers-color-scheme: dark)");

function effectiveTheme() {
  return computeTheme(state.userSettings.appearanceMode, Boolean(systemThemeQuery?.matches));
}

function syncThemeAttributes() {
  const root = document.documentElement;
  root.dataset.theme = effectiveTheme();
  root.dataset.appearanceMode = state.userSettings.appearanceMode;
}

function phaseLabel(phase) {
  return {
    approval: "待审批",
    input: "待输入",
    processing: "运行中",
    completed: "已完成",
    failed: "已失败",
    archived: "已归档",
    waiting: "未运行",
  }[phase] ?? "空闲";
}

function phaseTone(phase) {
  return {
    approval: "attention",
    input: "input",
    processing: "processing",
    completed: "success",
    failed: "danger",
    archived: "muted",
    waiting: "idle",
  }[phase] ?? "idle";
}

function integrationStatusLabel(status) {
  return {
    running: "运行中",
    installed: "已安装，未运行",
    missing: "未安装",
    preview: "预览模式",
  }[status] ?? status;
}

function activeSession() {
  return (
    state.sessions.find((session) => session.needsApproval || session.phase === "approval") ||
    state.sessions.find((session) => session.needsInput || session.phase === "input") ||
    state.sessions.find((session) => session.phase === "processing") ||
    state.sessions[0] ||
    {
      id: "no-active-integration",
      provider: "codex",
      title: "未检测到运行中的工具",
      project: "集成",
      kind: "未知",
      phase: "waiting",
      message: "请在集成设置中刷新状态，或先启动 Codex / Claude Code / Gemini 等工具",
      updatedAt: "刚刚",
      source: "empty",
      needsApproval: false,
      needsInput: false,
    }
  );
}

function selectedSession() {
  return state.sessions.find((session) => session.id === state.selectedId) || activeSession();
}

function integrationForSession(session) {
  if (session.provider === "codex" && String(session.kind || "").includes("CLI")) {
    return state.integrations.find((integration) => integration.id === "codex-cli");
  }

  return state.integrations.find((integration) => integration.id === session.provider);
}

function effectiveIntegrationForSession(session) {
  const integration = integrationForSession(session);
  if (session.source === "hook" && String(session.kind || "").includes("CLI")) {
    return integration?.kind === "CLI" ? integration : undefined;
  }
  return integration;
}

function sameData(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function approvalSession(sessions = state.sessions) {
  return sessions.find((session) => session.needsApproval || session.phase === "approval");
}

function pendingUserActionSession(sessions = state.sessions) {
  return (
    sessions.find((session) => session.needsApproval || session.phase === "approval") ||
    sessions.find((session) => session.needsInput || session.phase === "input")
  );
}

function setSessions(sessions, useFallback = false) {
  const nextSessions = asArray(sessions);
  const previousSessions = state.sessions;
  const previousSelectedId = state.selectedId;
  const previousRoute = state.route;
  const previousOpen = state.open;
  const previousActionMenuOpen = state.actionMenuOpen;
  state.sessions = nextSessions.length || !useFallback ? nextSessions : fallbackSessions;
  if (!state.sessions.some((session) => session.id === state.selectedId)) {
    state.selectedId = activeSession().id;
  }
  syncApprovalPopup();
  return (
    !sameData(previousSessions, state.sessions) ||
    previousSelectedId !== state.selectedId ||
    previousRoute !== state.route ||
    previousOpen !== state.open ||
    previousActionMenuOpen !== state.actionMenuOpen
  );
}

function setIntegrations(integrations, useFallback = false) {
  const nextIntegrations = asArray(integrations);
  const previousIntegrations = state.integrations;
  state.integrations = nextIntegrations.length || !useFallback ? nextIntegrations : fallbackIntegrations;
  return !sameData(previousIntegrations, state.integrations);
}

let sessionsRefreshing = false;
let integrationsRefreshing = false;
let sessionsRefreshQueued = false;
let lastAutoOpenedApprovalId = "";

function syncApprovalPopup() {
  const approval = approvalSession();
  if (!approval) {
    lastAutoOpenedApprovalId = "";
    return;
  }

  if (approval.id === lastAutoOpenedApprovalId) return;

  lastAutoOpenedApprovalId = approval.id;
  state.selectedId = approval.id;
  state.route = "monitor";
  state.open = true;
  state.actionMenuOpen = false;
}

async function refreshSessions() {
  if (sessionsRefreshing) {
    sessionsRefreshQueued = true;
    return;
  }

  sessionsRefreshing = true;
  sessionsRefreshQueued = false;
  let changed = false;
  try {
    changed = setSessions(invoke ? await invoke("list_sessions") : fallbackSessions, true);
  } catch (error) {
    console.error("Failed to refresh sessions", error);
    changed = setSessions(fallbackSessions, true);
  } finally {
    sessionsRefreshing = false;
  }

  if (changed || !hasRendered) render();
  if (invoke) refreshSessionHistory(changed);
  if (sessionsRefreshQueued) refreshSessions();
}

async function refreshSessionHistory(force = false) {
  if (!invoke) return;

  const session = selectedSession();
  if (!session?.id || session.source === "empty") return;
  if (!force && state.historyLoadingId === session.id) return;

  state.historyLoadingId = session.id;
  try {
    const history = asArray(await invoke("list_session_history", {
      id: session.id,
      provider: session.provider,
      sessionId: session.sessionId,
      cwd: session.cwd,
    }));
    if (state.historyLoadingId !== session.id) return;

    const previous = state.historyBySessionId[session.id] || EMPTY_HISTORY;
    state.historyBySessionId = {
      ...state.historyBySessionId,
      [session.id]: history,
    };
    if (!sameData(previous, state.historyBySessionId[session.id])) render();
  } catch {
    if (state.historyLoadingId === session.id) {
      state.historyBySessionId = {
        ...state.historyBySessionId,
        [session.id]: [],
      };
    }
  } finally {
    if (state.historyLoadingId === session.id) state.historyLoadingId = "";
  }
}

async function refreshIntegrations() {
  if (integrationsRefreshing) return;
  integrationsRefreshing = true;
  let changed = false;
  try {
    changed = setIntegrations(invoke ? await invoke("list_integrations") : fallbackIntegrations, true);
  } catch (error) {
    console.error("Failed to refresh integrations", error);
    changed = setIntegrations(fallbackIntegrations, true);
  } finally {
    integrationsRefreshing = false;
  }

  if (changed || !hasRendered) render();
}

async function focusSession(id) {
  try {
    if (invoke) await invoke("focus_session", { id });
    state.open = false;
    state.actionMenuOpen = false;
  } catch (error) {
    console.error("Failed to focus session", error);
  }
  render();
}

async function decideSession(id, approved) {
  try {
    if (invoke) await invoke(approved ? "approve_session" : "reject_session", { id });
    state.open = false;
    state.actionMenuOpen = false;
    await refreshSessions();
  } catch (error) {
    console.error("Failed to decide session", error);
  }
  render();
}

async function allowSessionApprovals(id) {
  try {
    if (invoke) await invoke("approve_session_for_session", { id });
    state.open = false;
    state.actionMenuOpen = false;
    await refreshSessions();
  } catch (error) {
    console.error("Failed to allow session approvals", error);
  }
  render();
}

async function quitApp() {
  try {
    if (invoke) {
      await invoke("quit_app");
      return;
    }
    await appWindow?.close?.();
  } catch (error) {
    console.error("Failed to quit app", error);
  }
}

function petPanelPlacement(position) {
  const horizontal = position.x > window.innerWidth / 2 ? "align-right" : "align-left";
  const vertical = position.y > window.innerHeight / 2 ? "above" : "below";
  return `${horizontal} ${vertical}`;
}

function renderPetActionMenu() {
  const pet = currentPet();
  return `
    <div class="pet-action-menu" role="menu" aria-label="打开 ${escapeHtml(pet.name)} 设置">
      <button
        class="menu-command ${state.route === "settings" && state.selectedSetting === "pet" && state.open ? "active" : ""}"
        type="button"
        role="menuitem"
        data-panel-route="settings"
        data-setting-target="pet"
      >
        切换宠物
      </button>
      <span class="menu-separator" aria-hidden="true"></span>
      <button
        class="menu-command ${state.route === "chat" && state.open ? "active" : ""}"
        type="button"
        role="menuitem"
        data-panel-route="chat"
      >
        聊天
      </button>
      <span class="menu-separator" aria-hidden="true"></span>
      <button
        class="menu-command ${state.route === "settings" && state.open ? "active" : ""}"
        type="button"
        role="menuitem"
        data-panel-route="settings"
      >
        设置
      </button>
      <span class="menu-separator" aria-hidden="true"></span>
      <button
        class="menu-command danger"
        type="button"
        role="menuitem"
        data-app-quit
      >
        退出
      </button>
    </div>
  `;
}

function renderPanelPetAvatar(pet) {
  const source = escapeHtml(petAssetSource(pet));
  const atlasStyle = pet.kind === "atlas"
    ? `background-image: url('${source}'); background-size: ${38 * pet.columns}px ${38 * pet.rows}px;`
    : `background-image: url('${source}');`;
  return `<span class="avatar ${pet.kind === "atlas" ? "atlas" : "image"}" style="${atlasStyle}" aria-hidden="true"></span>`;
}

function renderMiniAvatar(pet) {
  const source = escapeHtml(petAssetSource(pet));
  const style = pet.kind === "atlas"
    ? `background-image: url('${source}'); background-size: ${32 * pet.columns}px ${32 * pet.rows}px;`
    : `background-image: url('${source}');`;
  return `<span class="mini-avatar ${pet.kind === "atlas" ? "atlas" : "image"}" style="${style}" aria-hidden="true"></span>`;
}

function renderPetHub(session) {
  const pet = currentPet();
  const attentionCount = state.sessions.filter(
    (item) => item.needsApproval || item.needsInput || item.phase === "approval" || item.phase === "input",
  ).length;
  const badge = attentionCount || state.sessions.filter((item) => item.phase === "processing").length;
  const position = clampPetPosition(state.petPosition);
  state.petPosition = position;
  return `
    <section
      class="pet-hub ${state.open ? "is-open" : ""} ${panelOpening ? "is-opening" : ""} ${state.actionMenuOpen ? "show-actions" : ""} ${petPanelPlacement(position)}"
      style="--pet-x: ${position.x}px; --pet-y: ${position.y}px;"
    >
      <button class="pet-trigger" type="button" aria-label="打开 ${escapeHtml(pet.name)} 功能面板">
        <span class="pet-sprite" aria-hidden="true"></span>
        ${
          state.userSettings.showBadge
            ? `<span class="pet-badge ${attentionCount ? "attention" : ""}">${badge}</span>`
            : ""
        }
        ${state.userSettings.showStatus ? `<span class="pet-status">${phaseLabel(session.phase)}</span>` : ""}
      </button>
      ${state.actionMenuOpen ? renderPetActionMenu() : ""}
      <div class="pet-panel" role="dialog" aria-label="${escapeHtml(pet.name)} 功能面板">
        <header class="topbar">
          <section class="identity">
            ${renderPanelPetAvatar(pet)}
            <div>
              <strong>${escapeHtml(pet.name)}</strong>
              <span><i class="online" aria-hidden="true"></i>在线 · 心情 ☺ · 能量 87%</span>
            </div>
          </section>
          <nav class="tabs" aria-label="页面">
            ${routeItems.map((item) => `
              <button
                type="button"
                class="${state.route === item.id ? "active" : ""}"
                data-panel-route="${item.id}"
              >
                ${item.title}
              </button>
            `).join("")}
          </nav>
          <button class="close" type="button" data-panel-close aria-label="关闭">×</button>
        </header>
        ${state.route === "monitor" ? renderMonitor() : state.route === "chat" ? renderChat() : renderSettings()}
      </div>
    </section>
  `;
}

function chatInput() {
  return document.querySelector("[data-chat-input]");
}

function appendChatMessage(role, text) {
  const previous = state.chatState;
  state.chatState = appendChatMessageToState(state.chatState, role, text);
  if (sameData(previous, state.chatState)) return null;
  saveChatState();
  return selectedConversation(state.chatState).messages.at(-1);
}

function updateChatMessage(id, text) {
  const conversation = selectedConversation(state.chatState);
  const message = conversation?.messages.find((item) => item.id === id);
  if (!message || !text || message.text === text) return;
  message.text = text.slice(0, 12000);
  message.timestamp = new Date().toISOString();
  conversation.updatedAt = message.timestamp;
  saveChatState();
}

function chatAttachmentSummary(text, attachments) {
  return [text, attachments.length ? `[附加 ${attachments.length} 张图片]` : ""].filter(Boolean).join("\n");
}

function buildChatApiMessages(attachments) {
  const messages = selectedConversation(state.chatState).messages
    .filter((message) => message.role === "user" || message.role === "assistant")
    .map((message) => ({ role: message.role, content: message.text }));
  if (!attachments.length || !messages.length) return messages;
  const latest = messages[messages.length - 1];
  latest.content = [
    { type: "text", text: latest.content.replace(/\n?\[附加 \d+ 张图片\]$/, "") || "请查看图片。" },
    ...attachments.map((attachment) => ({
      type: "image_url",
      image_url: { url: attachment.dataUrl },
    })),
  ];
  return messages;
}

function readChatImage(file) {
  return new Promise((resolve, reject) => {
    if (!file?.type?.startsWith("image/")) return reject(new Error("只能上传图片"));
    if (file.size > MAX_CHAT_IMAGE_BYTES) return reject(new Error("单张图片不能超过 10MB"));
    const reader = new FileReader();
    reader.onload = () => resolve({
      id: globalThis.crypto?.randomUUID?.() || `image-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      name: file.name || "粘贴的图片",
      dataUrl: String(reader.result || ""),
    });
    reader.onerror = () => reject(new Error("无法读取图片"));
    reader.readAsDataURL(file);
  });
}

async function addChatImages(files) {
  state.chatAttachmentError = "";
  const available = MAX_CHAT_IMAGES - state.chatAttachments.length;
  if (available <= 0) {
    state.chatAttachmentError = "最多附加 4 张图片";
    render();
    return;
  }
  try {
    const attachments = await Promise.all([...files].slice(0, available).map(readChatImage));
    state.chatAttachments = [...state.chatAttachments, ...attachments];
    if (files.length > available) state.chatAttachmentError = "最多附加 4 张图片";
  } catch (error) {
    state.chatAttachmentError = String(error);
  }
  render();
}

function createNewChatConversation() {
  const current = selectedConversation(state.chatState);
  if (current?.messages.length === 0 && current.title === "新对话") {
    state.chatState.selectedConversationId = current.id;
    state.chatDraft = "";
    state.chatSearch = "";
    saveChatState();
    return;
  }

  const conversation = createConversation("新对话");
  state.chatState = {
    conversations: [conversation, ...state.chatState.conversations],
    selectedConversationId: conversation.id,
  };
  state.chatDraft = "";
  state.chatSearch = "";
  saveChatState();
}

function selectChatConversation(id) {
  if (!state.chatState.conversations.some((conversation) => conversation.id === id)) return;
  state.chatState.selectedConversationId = id;
  saveChatState();
}

function petChatReply(text) {
  const session = selectedSession();
  const lower = text.toLowerCase();
  if (/审批|批准|拒绝|approval/.test(lower)) {
    return session.needsApproval || session.phase === "approval"
      ? `我看到 ${providerName(session.provider)} 正在等审批。你可以回到“监控”页查看详情，再选择批准、允许本次会话或拒绝。`
      : "当前没有待审批事项。你可以继续工作，我会在有审批或输入请求时提醒你。";
  }
  if (/状态|运行|会话|进度/.test(lower)) {
    return `现在选中的会话是“${sessionDisplayTitle(session)}”，状态是“${phaseLabel(session.phase)}”。${session.message || "暂时没有新的状态消息。"}`;
  }
  if (/集成|工具|codex|claude|gemini|cursor/.test(lower)) {
    const running = state.integrations.filter((integration) => integration.running).length;
    const installed = state.integrations.filter((integration) => integration.installed).length;
    return `我检测到 ${running} 个正在运行的集成，${installed} 个已安装集成。需要跳回工具时，可以去“设置”的“集成”页操作。`;
  }
  if (/宠物|名字|外观|导入/.test(lower)) {
    return `当前宠物是 ${currentPet().name}。你可以在“设置”的“宠物”页改名、切换或导入新的宠物文件。`;
  }
  return "我可以帮你看会话状态、审批提醒、集成检测和宠物设置。你也可以直接问我“现在状态如何”或“有没有待审批”。";
}

async function submitChatMessage() {
  const input = chatInput();
  const text = (input?.value || state.chatDraft).trim();
  const attachments = [...state.chatAttachments];
  if ((!text && !attachments.length) || state.chatSending) return;
  appendChatMessage("user", chatAttachmentSummary(text, attachments));
  state.chatDraft = "";
  state.chatAttachments = [];
  state.chatAttachmentError = "";

  if (!state.chatApiConfig.enabled) {
    appendChatMessage("assistant", attachments.length ? "图片需要启用支持视觉能力的聊天 API 后才能发送。" : petChatReply(text));
    render();
    return;
  }

  state.chatSending = true;
  state.chatStreamRequestId = globalThis.crypto?.randomUUID?.() || `chat-${Date.now()}`;
  state.chatStreamMessageId = "";
  render();
  try {
    if (!invoke) throw new Error("桌面 API 不可用");
    const response = await invoke("send_chat_message", {
      messages: buildChatApiMessages(attachments),
      requestId: state.chatStreamRequestId,
    });
    state.chatApiRequestedModel = response.requestedModel || state.chatApiConfig.model;
    state.chatApiActiveModel = response.model || state.chatApiRequestedModel;
    if (state.chatStreamMessageId) updateChatMessage(state.chatStreamMessageId, response.content);
    else appendChatMessage("assistant", response.content || String(response));
  } catch (error) {
    appendChatMessage("assistant", `API 请求失败：${String(error)}`);
  } finally {
    state.chatSending = false;
    state.chatStreamRequestId = "";
    state.chatStreamMessageId = "";
    render();
  }
}

function renderChat() {
  const pet = currentPet();
  const conversation = selectedConversation(state.chatState);
  const searchQuery = state.chatSearch.trim().toLowerCase();
  const conversations = searchQuery
    ? state.chatState.conversations.filter((item) => {
        const latest = item.messages.at(-1)?.text || "";
        return `${item.title} ${latest}`.toLowerCase().includes(searchQuery);
      })
    : state.chatState.conversations;
  const messages = conversation.messages.length
    ? conversation.messages
    : [{
        id: "chat-empty",
        role: "assistant",
        text: `我是 ${pet.name}。你可以像 ChatGPT 一样和我连续对话，也可以问我当前工具状态。`,
        timestamp: new Date().toISOString(),
      }];
  const visibleMessages = state.chatSending && !state.chatStreamMessageId
    ? [...messages, {
        id: "chat-thinking",
        role: "assistant",
        text: "",
        thinking: true,
        timestamp: new Date().toISOString(),
      }]
    : messages;
  return `
    <section class="view chat active" data-view="chat">
      <aside class="sidebar">
        <div class="side-head">
          <strong>对话</strong>
          <span><button class="mini-button" type="button" data-chat-new>新对话 ＋</button></span>
        </div>
        <input
          class="search"
          type="search"
          placeholder="⌕　搜索对话"
          aria-label="搜索对话"
          data-chat-search
          value="${escapeHtml(state.chatSearch)}"
        />
        <div class="chat-list">
          ${conversations.length ? conversations.map((item) => `
            <button
              class="chat-item ${item.id === conversation.id ? "active" : ""}"
              type="button"
              data-chat-select="${escapeHtml(item.id)}"
            >
              <div>
                <b>${escapeHtml(item.title)}</b>
                <small>${item.messages.at(-1)?.text ? escapeHtml(item.messages.at(-1).text) : "还没有消息"}</small>
              </div>
              <span class="time">${formatShortTime(item.updatedAt)}</span>
            </button>
          `).join("") : `<div class="chat-search-empty">没有匹配的对话</div>`}
        </div>
      </aside>
      <section class="chat-main">
        <div class="chat-title">${escapeHtml(pet.name)} Chat</div>
        <div class="messages" aria-live="polite">
          ${visibleMessages.map(renderChatMessage).join("")}
        </div>
        <form class="composer" data-chat-form>
          ${state.chatAttachments.length ? `
            <div class="chat-attachments">
              ${state.chatAttachments.map((attachment) => `
                <span class="chat-attachment">
                  <img src="${attachment.dataUrl}" alt="${escapeHtml(attachment.name)}" />
                  <button type="button" data-chat-attachment-remove="${attachment.id}" aria-label="移除图片">×</button>
                </span>
              `).join("")}
            </div>
          ` : ""}
          ${state.chatAttachmentError ? `<span class="chat-attachment-error">${escapeHtml(state.chatAttachmentError)}</span>` : ""}
          <textarea
            data-chat-input
            rows="2"
            maxlength="1200"
            placeholder="${state.chatSending ? "正在等待 API 回复..." : `给 ${escapeHtml(pet.name)} 发消息...`}"
            ${state.chatSending ? "disabled" : ""}
          >${escapeHtml(state.chatDraft)}</textarea>
          <div class="composer-tools">
            <input data-chat-image-input type="file" accept="image/*" multiple hidden />
            <button class="composer-icon" type="button" data-chat-image-open aria-label="上传图片" title="上传图片">
              <span class="image-upload-icon" aria-hidden="true"></span>
            </button>
            <button class="send" type="submit" aria-label="发送" ${state.chatSending ? "disabled" : ""}>➤</button>
          </div>
        </form>
      </section>
    </section>
  `;
}

function formatShortTime(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  const now = new Date();
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  if (date.toDateString() === now.toDateString()) return `${hours}:${minutes}`;
  return "昨天";
}

function renderChatMessage(message) {
  const pet = currentPet();
  const time = message.timestamp ? new Date(message.timestamp).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }) : "";
  if (message.thinking) {
    return `
      <article class="message thinking">
        ${renderMiniAvatar(pet)}
        <div class="message-body">
          <span class="time">${time}</span>
          <div class="bubble" aria-label="正在思考">
            <span class="thinking-dots" aria-hidden="true"><i></i><i></i><i></i></span>
          </div>
        </div>
      </article>
    `;
  }
  if (message.role === "user") {
    return `
      <article class="message user">
        <div class="message-body">
          <span class="time">${time}</span>
          <div class="bubble"><p>${escapeHtml(message.text)}</p></div>
        </div>
        ${renderUserAvatar()}
      </article>
    `;
  }
  return `
    <article class="message">
      ${renderMiniAvatar(pet)}
      <div class="message-body">
        <span class="time">${time}</span>
        <div class="bubble"><p>${escapeHtml(message.text)}</p></div>
      </div>
    </article>
  `;
}

function renderUserAvatar(className = "person") {
  const avatar = state.userSettings.userAvatar;
  if (avatar) return `<span class="${className} user-avatar"><img src="${avatar}" alt="用户头像" /></span>`;
  return `<span class="${className} default-user-avatar" aria-label="默认用户头像"><i></i></span>`;
}

function renderMonitor() {
  const selected = selectedSession();
  const integration = effectiveIntegrationForSession(selected);
  const canFocus = integration?.focusable && (integration.running || integration.installed);
  const needsApproval = selected.needsApproval || selected.phase === "approval";
  const activeCount = state.sessions.filter((session) => session.phase === "processing").length;
  const attentionCount = state.sessions.filter(
    (session) => session.needsApproval || session.needsInput || session.phase === "approval" || session.phase === "input",
  ).length;
  return `
    <section class="view monitor active" data-view="monitor">
      <aside class="sidebar">
        <div class="side-head">
          <strong>${state.sessions.length || 0} 个会话</strong>
          <span><b class="pending-dot">●</b> ${attentionCount ? `${attentionCount} 个待处理` : activeCount ? `${activeCount} 个运行中` : "状态稳定"}</span>
        </div>
        <div class="session-list">
        ${
          state.sessions.length
            ? state.sessions.map(renderSessionRow).join("")
            : `<div class="empty-state">
                <strong>还没有捕获到会话</strong>
                <span>启动 Codex、Claude Code 或 Gemini 后，这里会显示审批、输入和运行状态。</span>
              </div>`
        }
        </div>
      </aside>
      <section class="stage">
        ${renderSessionHistory(selected)}
        ${renderApprovalWarning(selected)}
        ${renderSessionActions(selected, needsApproval, canFocus)}
      </section>
    </section>
  `;
}

function renderCurrentCard(session) {
  const integration = effectiveIntegrationForSession(session);
  const status = session.needsApproval || session.needsInput ? "需要你处理" : phaseLabel(session.phase);
  const statusTagClass = session.needsApproval || session.phase === "approval" ? "warn"
    : session.phase === "processing" ? "info"
    : session.phase === "completed" ? "ok" : "";
  const integrationStatus = integration ? integrationStatusLabel(integration.status) : "界面状态";
  const integrationTagClass = integration?.running ? "ok" : integration?.installed ? "ok" : "";
  return `
    <article class="current-card">
      ${renderProviderMark(session.provider)}
      <div>
        <h2>${escapeHtml(sessionDisplayTitle(session))}</h2>
        <p>${escapeHtml(providerName(session.provider))} · ${escapeHtml(session.kind || integration?.kind || "会话")}</p>
        <p>${escapeHtml(session.message || "等待新的事件。")}</p>
      </div>
      <div class="status-row">
        <span class="tag ${statusTagClass}">${escapeHtml(status)}</span>
        <span class="tag ${integrationTagClass}">${escapeHtml(integrationStatus)}</span>
        <span class="tag">${escapeHtml(session.updatedAt || "刚刚")}</span>
      </div>
    </article>
  `;
}

function renderApprovalWarning(session) {
  if (!session.needsApproval && session.phase !== "approval") return "";
  return `<div class="warning">ⓘ 以上操作需要你的审批才能继续执行。</div>`;
}

function renderSessionSummary(session) {
  const integration = effectiveIntegrationForSession(session);
  const tone = phaseTone(session.phase);
  const status = session.needsApproval || session.needsInput ? "需要你处理" : phaseLabel(session.phase);
  return `
    <section class="session-summary ${tone}">
      <div class="detail-topline">
        ${renderProviderMark(session.provider)}
        <div>
          <span>${escapeHtml(providerName(session.provider))} · ${escapeHtml(session.kind || integration?.kind || "会话")}</span>
          <h2>${escapeHtml(sessionDisplayTitle(session))}</h2>
        </div>
      </div>
      <p class="session-current-message">${escapeHtml(session.message || "等待新的事件。")}</p>
      <div class="status-strip" aria-label="会话状态摘要">
        <span><b>${escapeHtml(status)}</b>状态</span>
        <span><b>${escapeHtml(integration ? integrationStatusLabel(integration.status) : "界面状态")}</b>集成</span>
        <span><b>${escapeHtml(session.updatedAt || "刚刚")}</b>更新</span>
      </div>
    </section>
  `;
}

function renderSessionActions(session, needsApproval, canFocus) {
  if (needsApproval) {
    return `
      <div class="actions">
        <button class="action primary" data-approve="${session.id}">批准</button>
        <button class="action" data-approve-session="${session.id}">本次会话允许</button>
        <button class="action danger" data-reject="${session.id}">拒绝</button>
      </div>
    `;
  }

  if (canFocus) {
    return `
      <div class="actions">
        <button class="action primary" data-focus="${session.id}">跳回现场</button>
      </div>
    `;
  }

  return "";
}

function renderSessionHistory(session) {
  const history = state.historyBySessionId[session.id] || [];
  const isLoading = state.historyLoadingId === session.id;

  return `
    <section class="session-history" aria-label="当前会话历史消息">
      <header class="history-header">
        <span>会话动态</span>
        <small>${history.length ? `${history.length} 条` : isLoading ? "读取中" : "暂无记录"}</small>
      </header>
      <div class="history-list">
        ${
          history.length
            ? history.map(renderHistoryItem).join("")
            : `<div class="history-empty">${isLoading ? "正在读取会话历史" : "还没有可展示的历史消息"}</div>`
        }
      </div>
    </section>
  `;
}

function renderHistoryItem(item) {
  if (item.kind === "patch" || item.kind === "command" || item.role === "tool") {
    return renderToolHistoryItem(item);
  }

  const role = item.title || historyRoleLabel(item.role);
  const message = item.role === "assistant" ? renderHighlightedMessage(item.message) : escapeHtml(item.message);
  return `
    <article class="history-item message ${item.role || "event"}">
      <div class="history-meta">
        <strong>${escapeHtml(role)}</strong>
        ${item.timestamp ? `<time>${escapeHtml(shortTime(item.timestamp))}</time>` : ""}
      </div>
      <p class="message-content">${message}</p>
    </article>
  `;
}

function renderHighlightedMessage(message) {
  return String(message || "")
    .split(/(`[^`]+`)/g)
    .map((part) => {
      if (part.startsWith("`") && part.endsWith("`")) {
        return `<code>${escapeHtml(part.slice(1, -1))}</code>`;
      }
      return renderHighlightedPaths(part);
    })
    .join("");
}

function renderHighlightedPaths(value) {
  return String(value || "")
    .split(/((?:\.{0,2}\/)?(?:[\w.-]+\/)+[\w.-]+\.[A-Za-z0-9]+(?::\d+)?|[\w.-]+\.[A-Za-z0-9]+(?::\d+)?)/g)
    .map((part) => (looksLikePath(part) ? `<code>${escapeHtml(part)}</code>` : escapeHtml(part)))
    .join("");
}

function looksLikePath(value) {
  const text = String(value || "");
  return /(?:\/|^)[\w.-]+\.[A-Za-z0-9]+(?::\d+)?$/.test(text);
}

function renderToolHistoryItem(item) {
  const detail = String(item.detail || "").trim();
  const legacyMessage = String(item.message || "");
  const hasStructuredDetail = Boolean(detail);
  const fallbackDetail = !hasStructuredDetail && legacyMessage.includes("\n") ? legacyMessage : "";
  const visibleDetail = detail || fallbackDetail;
  const title = item.title || toolHistoryTitle(item);
  const summary = toolHistorySummary(item, fallbackDetail ? firstLine(legacyMessage) : legacyMessage, visibleDetail);
  return `
    <article class="history-item tool ${item.kind || "event"} ${item.status || ""}">
      <div class="tool-head">
        <span class="tool-kind">${escapeHtml(title)}</span>
        <span class="tool-summary">${escapeHtml(summary)}</span>
        <span class="tool-meta">
          ${item.status ? `<span class="tool-status">${escapeHtml(toolStatusLabel(item.status))}</span>` : ""}
          ${item.timestamp ? `<time>${escapeHtml(shortTime(item.timestamp))}</time>` : ""}
        </span>
      </div>
      ${visibleDetail ? renderToolDetail(item, visibleDetail) : ""}
    </article>
  `;
}

function renderToolDetail(item, detail) {
  if (item.kind !== "patch") {
    return `<pre>${escapeHtml(detail)}</pre>`;
  }

  const lines = String(detail || "").split(/\r?\n/);
  return `
    <pre class="patch-detail">${lines.map(renderPatchLine).join("")}</pre>
  `;
}

function renderPatchLine(line) {
  const className = patchLineClass(line);
  return `<span class="${className}">${escapeHtml(line || " ")}</span>`;
}

function patchLineClass(line) {
  if (line.startsWith("+") && !line.startsWith("+++")) return "patch-line patch-added";
  if (line.startsWith("-") && !line.startsWith("---")) return "patch-line patch-removed";
  if (line.startsWith("@@")) return "patch-line patch-hunk";
  if (line.startsWith("***")) return "patch-line patch-meta";
  return "patch-line";
}

function toolHistoryTitle(item) {
  if (item.kind === "patch") return "代码修改";
  if (item.kind === "command") return "运行命令";
  return historyRoleLabel(item.role);
}

function toolHistorySummary(item, message, detail) {
  const summary = String(message || "").trim() || firstLine(detail);
  if (summary) return summary;
  if (item.status) return toolStatusLabel(item.status);
  return "无详细内容";
}

function toolStatusLabel(status) {
  return {
    completed: "已完成",
    failed: "失败",
    error: "失败",
    cancelled: "已取消",
    running: "运行中",
  }[status] ?? status;
}

function firstLine(value) {
  return String(value || "").split(/\r?\n/).find((line) => line.trim()) || "";
}

function shortTime(timestamp) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return timestamp;
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function historyRoleLabel(role) {
  return {
    user: "你",
    assistant: "Codex",
    tool: "工具",
    event: "事件",
  }[role] ?? "消息";
}

function renderApprovalNotice(session) {
  const detail = session.message || "等待审批详情";
  return `
    <div class="approval-notice">
      <strong>等待审批</strong>
      <span>${escapeHtml(providerName(session.provider))} 正在等待允许或拒绝本次操作。</span>
      <p>${escapeHtml(detail)}</p>
    </div>
  `;
}

function renderSessionFacts(session) {
  const integration = effectiveIntegrationForSession(session);
  const facts = [
    ["检测来源", session.source === "hook" ? "真实 hook 桥接" : integration ? "本机进程与安装路径" : "当前界面状态"],
    ["检测状态", integration ? integrationStatusLabel(integration.status) : phaseLabel(session.phase)],
    ["工具类型", session.kind || integration?.kind || session.project],
    ["检测结果", integration?.message || session.message],
  ];

  if (session.cwd) {
    facts.push(["工作目录", session.cwd]);
  }

  if (session.needsApproval || session.phase === "approval") {
    facts.push(["审批状态", "等待批准或拒绝"]);
  }

  if (integration) {
    facts.push([
      "跳回能力",
      integration.focusable
        ? integration.running || integration.installed
          ? "可跳回桌面应用"
          : "未检测到可跳回目标"
        : "CLI 只能检测进程",
    ]);
  }

  return `
    <dl class="session-facts">
      ${facts.map(([label, value]) => `
        <div>
          <dt>${escapeHtml(label)}</dt>
          <dd>${escapeHtml(value)}</dd>
        </div>
      `).join("")}
    </dl>
  `;
}

function renderSessionRow(session) {
  const tagClass = session.needsApproval || session.phase === "approval" ? "warn"
    : session.needsInput || session.phase === "input" ? "info"
    : session.phase === "processing" ? "info"
    : session.phase === "completed" ? "ok" : "";
  return `
    <button class="session ${session.id === state.selectedId ? "active" : ""}" data-select="${session.id}">
      ${renderProviderMark(session.provider)}
      <div>
        <b>${escapeHtml(sessionDisplayTitle(session))}</b>
        <small>${escapeHtml(sessionSubtitle(session))}</small>
      </div>
      <span class="tag ${tagClass}">${phaseLabel(session.phase)}</span>
    </button>
  `;
}

function renderSettings() {
  const selected = settingSections.find((section) => section.id === state.selectedSetting) ?? settingSections[0];
  return `
    <section class="view settings active" data-view="settings">
      <aside class="settings-side">
        <nav class="settings-nav">
          ${settingSections.map((section) => `
            <button class="${section.id === selected.id ? "active" : ""}" data-setting="${section.id}">
              <i>${sectionIcon(section.id)}</i> ${section.title}
            </button>
          `).join("")}
        </nav>
      </aside>
      <section class="settings-main">
        ${renderSettingsPanel(selected.id)}
      </section>
    </section>
  `;
}

function sectionIcon(id) {
  return { appearance: "◔", display: "▱", pet: "♣", integrations: "✣", chatApi: "⌁" }[id] || "◔";
}

function renderSettingsPanel(id) {
  if (id === "appearance") return renderAppearancePanel();
  if (id === "chatApi") return renderChatApiPanel();
  if (id === "pet") {
    return `
      <div class="settings-title">
        <h2>宠物</h2>
        <p>管理当前外观、名称和导入资源。</p>
      </div>
      <div class="pet-library">
        ${petLibrary().map(renderPetRow).join("")}
      </div>
      <div class="settings-actions">
        <button class="primary" type="button" data-setting-action="import-pet">导入宠物文件</button>
      </div>
      <p class="setting-caption">Codex pet.json / spritesheet.webp / PNG / WEBP / GIF / JPG</p>
    `;
  }
  if (id === "integrations") {
    return `
      <div class="settings-title">
        <h2>集成</h2>
        <p>检查本机 AI 工具，并在需要时跳回对应应用。</p>
      </div>
      <div class="integration-list">
        ${state.integrations.map(renderIntegrationRow).join("")}
      </div>
      <div class="settings-actions integrations-actions">
        <button class="primary" type="button" data-setting-action="refresh-integrations">刷新集成状态</button>
      </div>
      <p class="setting-caption">当前集成会检测本机应用/CLI 是否安装和运行；桌面应用可以跳回，CLI 目前只能检测进程，还不能定位到具体终端窗口。</p>
    `;
  }
  return `
    <div class="settings-title">
      <h2>显示</h2>
      <p>控制桌面宠物在平时和提醒场景中的信息密度。</p>
    </div>
    ${renderSettingToggle("显示会话徽标", "showBadge", "在宠物旁标记待审批或运行中的会话数量。")}
    ${renderSettingToggle("显示状态标签", "showStatus", "保留一个短标签，方便扫一眼知道当前状态。")}
    <div class="setting-row avatar-setting">
      <span>
        <strong>用户头像</strong>
        <p>用于聊天中的用户消息，支持 PNG、JPEG、WEBP 或 GIF。</p>
      </span>
      <div class="avatar-setting-actions">
        ${renderUserAvatar("avatar-setting-preview")}
        <input data-user-avatar-input type="file" accept="image/*" hidden />
        <button type="button" data-setting-action="upload-user-avatar">更换</button>
        <button type="button" data-setting-action="reset-user-avatar" ${state.userSettings.userAvatar ? "" : "disabled"}>恢复默认</button>
      </div>
    </div>
    <div class="settings-actions">
      <button class="primary" type="button" data-setting-action="reset-position">重置到右下角</button>
    </div>
  `;
}

function renderChatApiPanel() {
  const config = state.chatApiConfig;
  return `
    <div class="settings-title">
      <h2>聊天 API</h2>
      <p>连接 OpenAI 兼容接口，用于聊天页的连续对话。</p>
    </div>
    <div class="api-config-form">
      <label class="setting-row compact">
        <span>
          <strong>启用聊天 API</strong>
          <p>关闭时继续使用内置的本地回复。</p>
        </span>
        <input type="checkbox" data-chat-api-field="enabled" ${config.enabled ? "checked" : ""} />
      </label>
      <label class="api-field">
        <span>API Base URL</span>
        <input type="url" data-chat-api-field="baseUrl" value="${escapeHtml(config.baseUrl)}" placeholder="https://api.openai.com/v1" />
      </label>
      <label class="api-field">
        <span>API Key</span>
        <input type="password" data-chat-api-field="apiKey" value="${escapeHtml(config.apiKey)}" placeholder="${config.hasApiKey ? "已保存，留空则保持不变" : "sk-..."}" autocomplete="off" />
      </label>
      <label class="api-field">
        <span>模型</span>
        <input type="text" data-chat-api-field="model" value="${escapeHtml(config.model)}" placeholder="gpt-4.1-mini" />
      </label>
      <label class="api-field">
        <span>系统提示词</span>
        <textarea rows="4" data-chat-api-field="systemPrompt">${escapeHtml(config.systemPrompt)}</textarea>
      </label>
    </div>
    <div class="settings-actions">
      <button class="primary" type="button" data-setting-action="save-chat-api" ${state.chatApiBusy ? "disabled" : ""}>保存配置</button>
      <button type="button" data-setting-action="test-chat-api" ${state.chatApiBusy ? "disabled" : ""}>测试连接</button>
    </div>
    ${state.chatApiStatus ? `<p class="api-status">${escapeHtml(state.chatApiStatus)}</p>` : ""}
    <p class="setting-caption">API Key 由桌面端保存在应用数据目录中，不会写入浏览器本地存储。</p>
  `;
}

async function refreshChatApiConfig() {
  if (!invoke) return;
  try {
    const config = await invoke("get_chat_api_config");
    state.chatApiConfig = { ...state.chatApiConfig, ...config, apiKey: "" };
    if (state.route === "settings" && state.selectedSetting === "chatApi") render();
  } catch (error) {
    state.chatApiStatus = `读取配置失败：${String(error)}`;
  }
}

async function saveChatApiSettings({ test = false } = {}) {
  if (!invoke || state.chatApiBusy) return;
  state.chatApiBusy = true;
  state.chatApiStatus = test ? "正在保存并测试连接..." : "正在保存...";
  render();
  try {
    const config = await invoke("save_chat_api_config", {
      config: {
        enabled: state.chatApiConfig.enabled,
        baseUrl: state.chatApiConfig.baseUrl,
        apiKey: state.chatApiConfig.apiKey || null,
        model: state.chatApiConfig.model,
        systemPrompt: state.chatApiConfig.systemPrompt,
      },
    });
    state.chatApiConfig = { ...state.chatApiConfig, ...config, apiKey: "" };
    if (test) {
      const response = await invoke("test_chat_api_config");
      state.chatApiStatus = `连接成功：${response}`;
    } else {
      state.chatApiStatus = "配置已保存";
    }
  } catch (error) {
    state.chatApiStatus = `${test ? "连接测试失败" : "保存失败"}：${String(error)}`;
  } finally {
    state.chatApiBusy = false;
    render();
  }
}

function renderPetRow(pet) {
  const selected = pet.id === currentPet().id;
  const editing = state.renamingPetId === pet.id;
  const kindLabel = pet.kind === "atlas" ? "动作集" : "图片";
  const sourceLabel = pet.source === "built-in" ? "内置" : "导入";

  return `
    <article class="pet-row ${selected ? "selected" : ""}">
      ${renderPetPreview(pet)}
      ${
        editing
          ? `<div class="pet-name-editor">
              <input
                type="text"
                maxlength="32"
                value="${escapeHtml(pet.name)}"
                data-pet-name-input="${pet.id}"
                aria-label="宠物名称"
                autofocus
              />
              <small>${sourceLabel} · ${kindLabel}</small>
            </div>`
          : `<div>
              <strong>${escapeHtml(pet.name)}</strong>
              <small>${sourceLabel} · ${kindLabel}</small>
            </div>`
      }
      <span class="integration-status ${selected ? "running" : "installed"}">${selected ? "当前" : "可用"}</span>
      <span class="pet-row-actions">
        ${
          editing
            ? `<button type="button" data-pet-rename-save="${pet.id}">保存</button>
              <button type="button" data-pet-rename-cancel="${pet.id}">取消</button>`
            : `<button type="button" data-pet-rename-start="${pet.id}">改名</button>
              <button type="button" data-pet-select="${pet.id}" ${selected ? "disabled" : ""}>
                ${selected ? "使用中" : "切换"}
              </button>
              ${
                pet.source === "imported"
                  ? `<button class="pet-remove" type="button" data-pet-remove="${pet.id}">移除</button>`
                  : ""
              }`
        }
      </span>
    </article>
  `;
}

function renderPetPreview(pet) {
  const source = escapeHtml(petAssetSource(pet));
  if (pet.kind === "atlas") {
    return `
      <span
        class="pet-preview atlas"
        style="background-image: url('${source}'); background-size: ${38 * pet.columns}px ${42 * pet.rows}px;"
        aria-hidden="true"
      ></span>
    `;
  }

  return `
    <span
      class="pet-preview image"
      style="background-image: url('${source}');"
      aria-hidden="true"
    ></span>
  `;
}

function renderIntegrationRow(integration) {
  const canFocus = integration.focusable && (integration.running || integration.installed);
  return `
    <article class="integration-row">
      ${renderProviderMark(integration.id)}
      <div>
        <strong>${escapeHtml(integration.name)}</strong>
        <small>${escapeHtml(integration.kind)} · ${escapeHtml(integration.message)}</small>
      </div>
      <span class="integration-status ${integration.status}">${integrationStatusLabel(integration.status)}</span>
      <button type="button" data-integration-focus="${integration.id}" ${canFocus ? "" : "disabled"}>
        跳回
      </button>
    </article>
  `;
}

function renderSettingToggle(label, key, description = "") {
  return `
    <label class="setting-row compact">
      <span>
        <strong>${label}</strong>
        ${description ? `<p>${description}</p>` : ""}
      </span>
      <input type="checkbox" data-setting-toggle="${key}" ${state.userSettings[key] ? "checked" : ""} />
    </label>
  `;
}

function renderSegmentedSetting(label, description, key, options) {
  return `
    <div class="setting-row">
      <label>${label}</label>
      <div class="triple" role="group" aria-label="${escapeHtml(label)}">
        ${options.map((option) => `
          <button
            type="button"
            class="${state.userSettings[key] === option.value ? "active" : ""}"
            data-setting-value="${key}"
            data-setting-next="${option.value}"
          >
            ${option.label}
          </button>
        `).join("")}
      </div>
      <span></span>
    </div>
  `;
}

function renderAppearancePanel() {
  return `
    <div class="settings-title">
      <h2>外观</h2>
      <p>选择面板主题，也可以跟随系统自动切换</p>
    </div>
    ${renderSegmentedSetting("主题", "控制浅色、深色或跟随系统。", "appearanceMode", [
      { value: "light", label: "☼　浅色" },
      { value: "dark", label: "☾　深色" },
      { value: "system", label: "▱　跟随系统" },
    ])}
    <div class="theme-preview-strip" aria-hidden="true">
      ${renderThemePreview("light", "浅色预览")}
      ${renderThemePreview("dark", "深色预览")}
    </div>
  `;
}

function renderThemePreview(tone, label) {
  return `
    <div class="theme-preview-card theme-preview-${tone}">
      <strong class="theme-preview-label">${label}</strong>
      <div class="theme-preview-window">
        <div class="preview-traffic-lights">
          <i></i><i></i><i></i>
        </div>
        <div class="preview-shell">
          <aside>
            <span class="preview-nav-selected"><b></b><em>会话</em></span>
            <span><b></b><em></em></span>
            <span><b></b><em></em></span>
            <span><b></b><em></em></span>
          </aside>
          <main>
            <span class="preview-title-line"></span>
            <span class="preview-accent-line"></span>
            <span class="preview-body-line"></span>
            <div class="preview-content-box"></div>
          </main>
        </div>
      </div>
    </div>
  `;
}

let lastRenderedOpenState = state.open;
let panelOpening = false;
let hasRendered = false;
let lastHistoryScrollSignature = "";
let lastChatScrollSignature = "";

function render() {
  syncThemeAttributes();
  if (!appRoot) return;

  const session = activeSession();
  panelOpening = state.open && !lastRenderedOpenState;
  const shouldCheckHistoryScroll = panelOpening || state.route === "monitor";
  appRoot.innerHTML = `
    <main class="app">
      ${renderPetHub(session)}
    </main>
  `;
  lastRenderedOpenState = state.open;
  panelOpening = false;
  hasRendered = true;
  startPetAnimator();
  syncPetBehavior();
  syncHistoryScroll(shouldCheckHistoryScroll);
  syncChatScroll(panelOpening || state.route === "chat");
}

function syncHistoryScroll(force = false) {
  if (!state.open || state.route !== "monitor") return;

  const session = selectedSession();
  const history = state.historyBySessionId[session.id] || [];
  const latest = history[history.length - 1];
  const signature = `${session.id}:${history.length}:${latest?.timestamp || ""}:${latest?.message || ""}`;
  if (!force && signature === lastHistoryScrollSignature) return;
  lastHistoryScrollSignature = signature;

  window.requestAnimationFrame(() => {
    const historyList = document.querySelector(".history-list");
    if (!historyList) return;
    historyList.scrollTop = historyList.scrollHeight;
  });
}

function syncChatScroll(force = false) {
  if (!state.open || state.route !== "chat") return;

  const messages = selectedConversation(state.chatState)?.messages || [];
  const latest = messages[messages.length - 1];
  const signature = `${messages.length}:${latest?.id || ""}:${latest?.text?.length || 0}`;
  if (!force && signature === lastChatScrollSignature) return;
  lastChatScrollSignature = signature;

  window.requestAnimationFrame(() => {
    const thread = document.querySelector(".messages");
    if (!thread) return;
    thread.scrollTop = thread.scrollHeight;
    chatInput()?.focus();
  });
}

let spriteTimer = null;
let petBehaviorTimer = null;
let spriteFrame = 0;
let spriteMode = "";
let spritePetId = "";
let lastBehaviorOpenState = null;

function activePetAction() {
  if (state.dragAction) return state.dragAction;
  if (state.open) return "thinking";
  return state.petAction || "sleeping";
}

function animationSequence(animation) {
  return animation.sequence || Array.from({ length: animation.frames }, (_, index) => index);
}

function animationStepDuration(animation, sequenceIndex) {
  const frame = animationSequence(animation)[sequenceIndex] ?? 0;
  return animation.durations[sequenceIndex] ?? animation.durations[frame] ?? 140;
}

function canUseBuiltInActionStrip(animation, pet) {
  return Boolean(animation.builtInSrc && pet.id === "tuxie" && pet.source === "built-in");
}

function resolvePetAnimation(animation, pet) {
  if (canUseBuiltInActionStrip(animation, pet)) {
    return {
      ...animation,
      src: animation.builtInSrc,
      row: animation.row ?? 0,
      columns: animation.columns || animation.frames,
      rows: animation.rows || 1,
    };
  }

  return {
    ...animation,
    src: petAssetSource(pet),
    row: animation.fallbackRow ?? animation.row,
    frames: animation.fallbackFrames || Math.min(animation.frames, pet.columns),
    durations: animation.fallbackDurations || animation.durations,
    sequence: animation.fallbackSequence ?? animation.sequence,
    columns: pet.columns,
    rows: pet.rows,
  };
}

function paintPetFrame() {
  const sprite = document.querySelector(".pet-sprite");
  if (!sprite) return;

  const pet = currentPet();
  const source = petAssetSource(pet);
  if (pet.kind !== "atlas") {
    spritePetId = pet.id;
    spriteMode = "image";
    spriteFrame = 0;
    sprite.classList.add("pet-image");
    sprite.style.backgroundImage = `url("${source}")`;
    sprite.style.backgroundSize = "contain";
    sprite.style.backgroundPosition = "center";
    window.clearTimeout(spriteTimer);
    return;
  }

  const mode = activePetAction();
  const animation = resolvePetAnimation(petAnimations[mode] || petAnimations.sleeping, pet);
  const sequence = animationSequence(animation);
  if (spritePetId !== pet.id || spriteMode !== mode) {
    spritePetId = pet.id;
    spriteMode = mode;
    spriteFrame = 0;
  }

  const rect = sprite.getBoundingClientRect();
  const cellWidth = rect.width || PET_WIDTH;
  const cellHeight = rect.height || PET_HEIGHT;
  sprite.classList.remove("pet-image");
  sprite.style.backgroundImage = `url("${animation.src || source}")`;
  sprite.style.backgroundSize = `${cellWidth * animation.columns}px ${cellHeight * animation.rows}px`;
  sprite.style.backgroundPosition = `${-(sequence[spriteFrame] ?? 0) * cellWidth}px ${-animation.row * cellHeight}px`;
  const duration = animationStepDuration(animation, spriteFrame);
  spriteFrame = (spriteFrame + 1) % sequence.length;

  window.clearTimeout(spriteTimer);
  spriteTimer = window.setTimeout(paintPetFrame, duration);
}

function startPetAnimator(reset = false) {
  if (reset) {
    spritePetId = "";
    spriteMode = "";
    spriteFrame = 0;
  }
  window.clearTimeout(spriteTimer);
  paintPetFrame();
}

function clearPetBehaviorTimer() {
  window.clearTimeout(petBehaviorTimer);
  petBehaviorTimer = null;
}

function setPetAction(action) {
  const nextAction = petAnimations[action] ? action : "sleeping";
  if (state.petAction === nextAction) return;
  state.petAction = nextAction;
  startPetAnimator(true);
}

function animationDuration(action) {
  const animation = resolvePetAnimation(petAnimations[action] || petAnimations.sleeping, currentPet());
  const cycleDuration = animationSequence(animation)
    .reduce((duration, _frame, index) => duration + animationStepDuration(animation, index), 0);
  return cycleDuration * (animation.loops || 1);
}

function canRunClosedPetBehavior() {
  return !state.open && !state.dragAction && currentPet().kind === "atlas";
}

function nextClosedPetAction(action) {
  const index = closedPetSequence.indexOf(action);
  return closedPetSequence[(index + 1) % closedPetSequence.length] || closedPetSequence[0];
}

function schedulePetBehavior({ preferActivity = false } = {}) {
  clearPetBehaviorTimer();

  if (state.dragAction) return;

  if (state.open) {
    setPetAction("thinking");
    return;
  }

  if (currentPet().kind !== "atlas") return;

  if (preferActivity || !closedPetSequence.includes(state.petAction)) {
    setPetAction(closedPetSequence[0]);
  }

  petBehaviorTimer = window.setTimeout(() => {
    if (!canRunClosedPetBehavior()) return;
    setPetAction(nextClosedPetAction(state.petAction));
    schedulePetBehavior();
  }, animationDuration(state.petAction));
}

function syncPetBehavior() {
  const wasOpen = lastBehaviorOpenState;
  const firstSync = wasOpen === null;
  const justClosed = wasOpen === true && !state.open;
  lastBehaviorOpenState = state.open;
  schedulePetBehavior({ preferActivity: !state.open && (firstSync || justClosed) });
}

function setDragAction(action) {
  if (state.dragAction === action) return;
  state.dragAction = action;
  startPetAnimator(true);
}

function interactiveRects() {
  return [".pet-trigger", ".pet-panel", ".pet-action-menu"]
    .map((selector) => document.querySelector(selector))
    .filter(Boolean)
    .map((element) => element.getBoundingClientRect())
    .filter((rect) => rect.width > 0 && rect.height > 0);
}

async function updateCursorPassThrough() {
  if (!appWindow || !tauriWindowApi?.cursorPosition) return;
  if (cursorPassThroughUpdating) return;

  cursorPassThroughUpdating = true;
  try {
    const [cursor, origin, scaleFactor] = await Promise.all([
      tauriWindowApi.cursorPosition(),
      appWindow.outerPosition(),
      appWindow.scaleFactor(),
    ]);
    const x = (cursor.x - origin.x) / scaleFactor;
    const y = (cursor.y - origin.y) / scaleFactor;
    const overInteractive = interactiveRects().some(
      (rect) => x >= rect.left - 2 && x <= rect.right + 2 && y >= rect.top - 2 && y <= rect.bottom + 2,
    );
    await appWindow.setIgnoreCursorEvents(!overInteractive && !petDrag);
  } catch {
    // In browser preview, Tauri window APIs are not available.
  } finally {
    cursorPassThroughUpdating = false;
  }
}

let cursorPassThroughUpdating = false;

async function configureOverlayWindow() {
  if (!appWindow) return;

  for (const task of [
    () => appWindow.setShadow(false),
    () => appWindow.setAlwaysOnTop(true),
    () => appWindow.setSkipTaskbar(true),
    () => appWindow.setBackgroundColor("#00000000"),
    () => appWindow.setSimpleFullscreen(true),
    () => appWindow.setIgnoreCursorEvents(false),
  ]) {
    try {
      await task();
    } catch {
      // Browser preview and platform-specific window APIs should not break the UI.
    }
  }
  window.setInterval(updateCursorPassThrough, PASS_THROUGH_POLL_MS);
  updateCursorPassThrough();
}

let petDrag = null;

function petHubElement() {
  return document.querySelector(".pet-hub");
}

function petTriggerElement() {
  return document.querySelector(".pet-trigger");
}

function applyPetPosition(position) {
  state.petPosition = clampPetPosition(position);
  const hub = petHubElement();
  if (!hub) return;
  hub.style.setProperty("--pet-x", `${state.petPosition.x}px`);
  hub.style.setProperty("--pet-y", `${state.petPosition.y}px`);
}

function togglePetPanelFromTrigger() {
  if (!state.open) {
    const pending = pendingUserActionSession();
    if (pending) {
      state.selectedId = pending.id;
      state.route = "monitor";
    } else {
      state.route = normalizeRoute(state.route);
    }
  }
  state.open = !state.open;
  state.actionMenuOpen = false;
}

function handlePetPointerDown(event) {
  const trigger = event.target.closest?.(".pet-trigger");
  if (!trigger || event.button !== 0) return;

  event.preventDefault();
  state.actionMenuOpen = false;
  const position = clampPetPosition(state.petPosition);
  petDrag = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    offsetX: event.clientX - position.x,
    offsetY: event.clientY - position.y,
    moved: false,
    dragging: false,
    timer: window.setTimeout(() => {
      if (!petDrag) return;
      petDrag.dragging = true;
      state.open = false;
      state.actionMenuOpen = false;
      setDragAction("running-right");
      const hub = petHubElement();
      hub?.classList.add("is-dragging");
      hub?.classList.remove("is-open", "show-actions");
      trigger.classList.add("is-dragging");
    }, PET_DRAG_HOLD_MS),
  };
  trigger.setPointerCapture?.(event.pointerId);
}

function handlePetPointerMove(event) {
  if (!petDrag || event.pointerId !== petDrag.pointerId) return;

  const distance = Math.hypot(event.clientX - petDrag.startX, event.clientY - petDrag.startY);
  if (!petDrag.dragging) {
    petDrag.moved = distance > PET_DRAG_DISTANCE;
    if (petDrag.moved) {
      window.clearTimeout(petDrag.timer);
      petDrag.dragging = true;
      state.open = false;
      state.actionMenuOpen = false;
      const hub = petHubElement();
      hub?.classList.add("is-dragging");
      hub?.classList.remove("is-open", "show-actions");
      petTriggerElement()?.classList.add("is-dragging");
    } else {
      return;
    }
  }

  const deltaX = event.clientX - petDrag.startX;
  if (deltaX < -2) {
    setDragAction("running-left");
  } else if (deltaX > 2) {
    setDragAction("running-right");
  } else {
    setDragAction(state.dragAction === "running-left" ? "running-left" : "running-right");
  }

  if (!petDrag.moved) {
    petDrag.moved = true;
  }

  applyPetPosition({
    x: event.clientX - petDrag.offsetX,
    y: event.clientY - petDrag.offsetY,
  });
}

function handlePetPointerUp(event) {
  if (!petDrag || event.pointerId !== petDrag.pointerId) return;

  window.clearTimeout(petDrag.timer);
  const wasDragging = petDrag.dragging;
  const wasMoved = petDrag.moved;
  const trigger = event.target.closest?.(".pet-trigger") || petTriggerElement();
  trigger?.releasePointerCapture?.(event.pointerId);
  trigger?.classList.remove("is-dragging");
  petHubElement()?.classList.remove("is-dragging");

  petDrag = null;
  state.dragAction = null;
  if (wasDragging) {
    state.petAction = "sleeping";
    savePetPosition(state.petPosition);
    render();
    return;
  }
  if (!wasMoved) {
    togglePetPanelFromTrigger();
    render();
  }
}

document.addEventListener("click", async (event) => {
  const target = event.target.closest?.("button");
  if (!target) return;
  if (target.dataset.chatImageOpen !== undefined) {
    document.querySelector("[data-chat-image-input]")?.click();
    return;
  }
  if (target.dataset.chatAttachmentRemove) {
    state.chatAttachments = state.chatAttachments.filter((attachment) => attachment.id !== target.dataset.chatAttachmentRemove);
    state.chatAttachmentError = "";
    render();
    return;
  }
  if (target.closest?.("[data-chat-form]")) return;

  if (target.dataset.panelClose !== undefined) {
    state.open = false;
    state.actionMenuOpen = false;
    render();
    return;
  }
  if (target.dataset.appQuit !== undefined) {
    await quitApp();
    return;
  }
  if (target.dataset.panelRoute) {
    state.route = normalizeRoute(target.dataset.panelRoute);
    if (target.dataset.settingTarget) state.selectedSetting = target.dataset.settingTarget;
    state.open = true;
    state.actionMenuOpen = false;
    render();
    return;
  }
  if (target.dataset.chatNew !== undefined) {
    createNewChatConversation();
    render();
    return;
  }
  if (target.dataset.chatSelect) {
    selectChatConversation(target.dataset.chatSelect);
    render();
    return;
  }
  if (target.dataset.petRenameStart) {
    state.renamingPetId = target.dataset.petRenameStart;
    state.route = "settings";
    state.selectedSetting = "pet";
    state.open = true;
    render();
    return;
  }
  if (target.dataset.petRenameCancel) {
    state.renamingPetId = "";
    render();
    return;
  }
  if (target.dataset.petRenameSave) {
    const id = target.dataset.petRenameSave;
    const input = petNameInput(id);
    commitPetRename(id, input?.value || "");
    render();
    return;
  }
  if (target.dataset.petSelect) {
    const pet = petLibrary().find((item) => item.id === target.dataset.petSelect);
    if (pet) {
      state.userSettings.currentPetId = pet.id;
      state.petAction = "sleeping";
      state.dragAction = null;
      state.renamingPetId = "";
      state.route = "settings";
      state.selectedSetting = "pet";
      state.open = true;
      saveUserSettings();
      startPetAnimator(true);
    }
    render();
    return;
  }
  if (target.dataset.petRemove) {
    const removed = state.userSettings.importedPets.find((pet) => pet.id === target.dataset.petRemove);
    state.userSettings.importedPets = state.userSettings.importedPets.filter((pet) => pet.id !== target.dataset.petRemove);
    delete state.userSettings.renamedPets[target.dataset.petRemove];
    if (state.userSettings.currentPetId === target.dataset.petRemove) {
      state.userSettings.currentPetId = "tuxie";
      state.petAction = "sleeping";
      state.dragAction = null;
    }
    state.renamingPetId = "";
    state.route = "settings";
    state.selectedSetting = "pet";
    state.open = true;
    saveUserSettings();
    render();
    return;
  }
  if (target.dataset.settingValue) {
    state.userSettings[target.dataset.settingValue] = target.dataset.settingNext;
    saveUserSettings();
    render();
    return;
  }
  if (target.dataset.settingAction === "import-pet") {
    if (!invoke) {
      return;
    }

    try {
      const imported = normalizeImportedPet({ ...(await invoke("import_pet_asset")), source: "imported" });
      if (!imported) throw new Error("导入结果无效");

      state.userSettings.importedPets = [
        ...state.userSettings.importedPets.filter((pet) => pet.id !== imported.id),
        imported,
      ];
      state.userSettings.currentPetId = imported.id;
      state.petAction = "sleeping";
      state.dragAction = null;
      state.renamingPetId = "";
      state.route = "settings";
      state.selectedSetting = "pet";
      state.open = true;
      saveUserSettings();
      startPetAnimator(true);
    } catch (error) {
      if (!String(error).includes("已取消")) console.error("Failed to import pet", error);
    }

    render();
    return;
  }
  if (target.dataset.settingAction === "reset-position") {
    state.petPosition = defaultPetPosition();
    savePetPosition(state.petPosition);
    render();
    return;
  }
  if (target.dataset.settingAction === "upload-user-avatar") {
    document.querySelector("[data-user-avatar-input]")?.click();
    return;
  }
  if (target.dataset.settingAction === "reset-user-avatar") {
    state.userSettings.userAvatar = "";
    saveUserSettings();
    render();
    return;
  }
  if (target.dataset.settingAction === "save-chat-api") {
    await saveChatApiSettings();
    return;
  }
  if (target.dataset.settingAction === "test-chat-api") {
    await saveChatApiSettings({ test: true });
    return;
  }
  if (target.dataset.integrationFocus) {
    await focusSession(`${target.dataset.integrationFocus}-local`);
    return;
  }
  if (target.dataset.approve) {
    await decideSession(target.dataset.approve, true);
    return;
  }
  if (target.dataset.approveSession) {
    await allowSessionApprovals(target.dataset.approveSession);
    return;
  }
  if (target.dataset.reject) {
    await decideSession(target.dataset.reject, false);
    return;
  }
  if (target.dataset.settingAction === "refresh-integrations") {
    await refreshIntegrations();
    await refreshSessions();
    state.route = "settings";
    state.selectedSetting = "integrations";
    state.open = true;
    render();
    return;
  }
  if (target.dataset.setting) {
    state.selectedSetting = target.dataset.setting;
    state.route = "settings";
    render();
    return;
  }
  if (target.dataset.select) {
    state.selectedId = target.dataset.select;
    state.route = "monitor";
    render();
    refreshSessionHistory(true);
    return;
  }
  if (target.dataset.focus) await focusSession(target.dataset.focus);
  render();
});

document.addEventListener("change", (event) => {
  if (event.target.dataset?.userAvatarInput !== undefined) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file?.type?.startsWith("image/") || file.size > MAX_USER_AVATAR_BYTES) return;
    const reader = new FileReader();
    reader.onload = () => {
      state.userSettings.userAvatar = String(reader.result || "");
      saveUserSettings();
      render();
    };
    reader.readAsDataURL(file);
    return;
  }
  if (event.target.dataset?.chatImageInput !== undefined) {
    addChatImages(event.target.files || []);
    event.target.value = "";
    return;
  }
  if (event.target.dataset?.chatApiField === "enabled") {
    state.chatApiConfig.enabled = event.target.checked;
    return;
  }
  const key = event.target.dataset?.settingToggle;
  if (!key) return;

  state.userSettings[key] = event.target.checked;
  saveUserSettings();
  render();
});

document.addEventListener("input", (event) => {
  const chatApiField = event.target.dataset?.chatApiField;
  if (chatApiField && chatApiField !== "enabled") {
    state.chatApiConfig[chatApiField] = event.target.value;
    return;
  }
  if (event.target.dataset?.chatSearch !== undefined) {
    state.chatSearch = event.target.value;
    render();
    return;
  }
  if (event.target.dataset?.chatInput === undefined) return;
  state.chatDraft = event.target.value;
});

document.addEventListener("submit", (event) => {
  if (event.target.dataset?.chatForm === undefined) return;
  event.preventDefault();
  submitChatMessage();
});

document.addEventListener("paste", (event) => {
  if (event.target.dataset?.chatInput === undefined) return;
  const images = [...(event.clipboardData?.items || [])]
    .filter((item) => item.type.startsWith("image/"))
    .map((item) => item.getAsFile())
    .filter(Boolean);
  if (!images.length) return;
  event.preventDefault();
  addChatImages(images);
});

document.addEventListener("pointerdown", handlePetPointerDown);
document.addEventListener("pointermove", handlePetPointerMove);
document.addEventListener("pointerup", handlePetPointerUp);
document.addEventListener("pointercancel", handlePetPointerUp);
document.addEventListener("contextmenu", (event) => {
  if (!event.target.closest?.(".pet-trigger")) return;
  event.preventDefault();
  state.actionMenuOpen = !state.actionMenuOpen;
  state.open = false;
  render();
});
document.addEventListener("keydown", (event) => {
  const renamePetId = event.target.dataset?.petNameInput;
  if (renamePetId && event.key === "Enter") {
    event.preventDefault();
    commitPetRename(renamePetId, event.target.value);
    render();
    return;
  }
  if (renamePetId && event.key === "Escape") {
    event.preventDefault();
    state.renamingPetId = "";
    render();
    return;
  }
  if (event.target.dataset?.chatInput !== undefined && event.key === "Enter" && !event.metaKey && !event.ctrlKey) {
    event.preventDefault();
    submitChatMessage();
    return;
  }
  if (event.key === "Escape" && (state.open || state.actionMenuOpen)) {
    state.open = false;
    state.actionMenuOpen = false;
    render();
  }
  if ((event.key === "Enter" || event.key === " ") && event.target.closest?.(".pet-trigger")) {
    event.preventDefault();
    togglePetPanelFromTrigger();
    render();
  }
});
window.addEventListener("resize", () => {
  state.petPosition = clampPetPosition(state.petPosition);
  render();
});

if (listen) {
  listen("chat://chunk", (event) => {
    const chunk = event.payload || {};
    if (!state.chatSending || chunk.requestId !== state.chatStreamRequestId || !chunk.delta) return;
    if (chunk.model) state.chatApiActiveModel = chunk.model;
    if (!state.chatStreamMessageId) {
      state.chatStreamMessageId = appendChatMessage("assistant", chunk.delta)?.id || "";
    } else {
      const message = selectedConversation(state.chatState).messages.find((item) => item.id === state.chatStreamMessageId);
      updateChatMessage(state.chatStreamMessageId, `${message?.text || ""}${chunk.delta}`);
    }
    render();
  });
  listen("sessions://changed", (event) => {
    if (setSessions(event.payload) || !hasRendered) render();
    refreshSessionHistory();
  });
}

systemThemeQuery?.addEventListener?.("change", () => {
  if (state.userSettings.appearanceMode === "system") render();
});

render();
configureOverlayWindow();
refreshIntegrations();
refreshSessions();
refreshSessionHistory();
refreshChatApiConfig();
window.setInterval(refreshSessions, SESSION_POLL_MS);
window.setInterval(refreshSessionHistory, SESSION_HISTORY_POLL_MS);
