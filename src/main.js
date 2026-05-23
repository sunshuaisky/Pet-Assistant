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
  { id: "appearance", title: "外观", subtitle: "主题与毛玻璃" },
  { id: "display", title: "显示", subtitle: "宠物标记与位置" },
  { id: "pet", title: "宠物", subtitle: "导入与切换" },
  { id: "integrations", title: "集成", subtitle: "工具检测与跳转" },
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
  return `<span class="provider-mark" aria-hidden="true">${escapeHtml(initials)}</span>`;
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
  root.dataset.glassStrength = state.userSettings.glassStrength;
  root.dataset.reduceTransparency = String(state.userSettings.reduceTransparency);
  root.dataset.increaseContrast = String(state.userSettings.increaseContrast);
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
        <header class="panel-header">
          <div class="panel-title">
            <strong>${escapeHtml(pet.name)}</strong>
            <span>${escapeHtml(phaseLabel(session.phase))} · ${escapeHtml(sessionDisplayTitle(session))}</span>
          </div>
          <nav aria-label="面板视图">
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
          <button class="panel-close" type="button" data-panel-close aria-label="关闭功能面板">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M18 6 6 18"></path>
              <path d="m6 6 12 12"></path>
            </svg>
          </button>
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
  const previousConversation = selectedConversation(state.chatState);
  const previousMessageCount = previousConversation?.messages.length || 0;
  state.chatState = appendChatMessageToState(state.chatState, role, text);
  const currentConversation = selectedConversation(state.chatState);
  const message = currentConversation?.messages[currentConversation.messages.length - 1] || null;
  if (!message || currentConversation.messages.length === previousMessageCount) return null;
  saveChatState();
  return message;
}

function petChatReply(text) {
  const session = selectedSession();
  const lower = text.toLowerCase();
  if (/审批|批准|拒绝|approval/.test(lower)) {
    return session.needsApproval || session.phase === "approval"
      ? `我看到 ${providerName(session.provider)} 正在等审批。你可以回到“会话”页查看详情，再选择批准、允许本次会话或拒绝。`
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

function submitChatMessage() {
  const input = chatInput();
  const text = (input?.value || state.chatDraft).trim();
  if (!text) return;
  appendChatMessage("user", text);
  state.chatDraft = "";
  appendChatMessage("assistant", petChatReply(text));
  render();
}

function renderChat() {
  const pet = currentPet();
  const conversation = selectedConversation(state.chatState);
  const messages = conversation?.messages.length
    ? conversation.messages
    : [
        {
          id: "chat-empty",
          role: "assistant",
          text: `我是 ${pet.name}，可以帮你快速查看会话、审批、集成和宠物设置。`,
          timestamp: new Date().toISOString(),
        },
      ];

  return `
    <section class="chat-layout" aria-label="${escapeHtml(pet.name)} 聊天">
      <div class="chat-head">
        ${renderPetPreview(pet)}
        <div>
          <h2>和 ${escapeHtml(pet.name)} 聊天</h2>
          <p>轻量助手，先处理状态问答；后续可以接入真实模型。</p>
        </div>
      </div>
      <div class="chat-thread" aria-live="polite">
        ${messages.map(renderChatMessage).join("")}
      </div>
      <form class="chat-composer" data-chat-form>
        <textarea
          data-chat-input
          rows="2"
          maxlength="1200"
          placeholder="问问当前状态、审批、集成或宠物设置..."
        >${escapeHtml(state.chatDraft)}</textarea>
        <button class="primary" type="submit">发送</button>
      </form>
    </section>
  `;
}

function renderChatMessage(message) {
  return `
    <article class="chat-message ${message.role}">
      <div class="chat-bubble">
        <span>${message.role === "user" ? "你" : escapeHtml(currentPet().name)}</span>
        <p>${escapeHtml(message.text)}</p>
      </div>
    </article>
  `;
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
    <div class="sessions-layout">
      <div class="session-list" aria-label="会话列表">
        <div class="session-list-head">
          <span>${state.sessions.length || 0} 个会话</span>
          <b>${attentionCount ? `${attentionCount} 个待处理` : activeCount ? `${activeCount} 个运行中` : "状态稳定"}</b>
        </div>
        ${
          state.sessions.length
            ? state.sessions.map(renderSessionRow).join("")
            : `<div class="empty-state">
                <strong>还没有捕获到会话</strong>
                <span>启动 Codex、Claude Code 或 Gemini 后，这里会显示审批、输入和运行状态。</span>
              </div>`
        }
      </div>
      <article class="session-detail">
        <div class="session-detail-scroll">
          ${renderSessionSummary(selected)}
          ${renderSessionHistory(selected)}
        </div>
        ${renderSessionActions(selected, needsApproval, canFocus)}
      </article>
    </div>
  `;
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
      <footer class="approval-actions">
        ${renderApprovalNotice(session)}
        <div class="approval-buttons">
          <button class="primary" data-approve="${session.id}">批准</button>
          <button class="primary" data-approve-session="${session.id}">本次会话允许</button>
          <button class="danger" data-reject="${session.id}">拒绝</button>
        </div>
      </footer>
    `;
  }

  if (canFocus) {
    return `
      <footer>
        <button class="primary" data-focus="${session.id}">跳回现场</button>
      </footer>
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
  return `
    <button class="session-row ${session.id === state.selectedId ? "selected" : ""}" data-select="${session.id}">
      ${renderProviderMark(session.provider)}
      <span class="row-body">
        <strong>${escapeHtml(sessionDisplayTitle(session))}</strong>
        <small>${escapeHtml(sessionSubtitle(session))}</small>
      </span>
      <span class="phase ${session.phase}">${phaseLabel(session.phase)}</span>
    </button>
  `;
}

function renderSettings() {
  const selected = settingSections.find((section) => section.id === state.selectedSetting) ?? settingSections[0];
  return `
    <div class="settings-layout">
      <aside>
        ${settingSections.map((section) => `
          <button class="${section.id === selected.id ? "selected" : ""}" data-setting="${section.id}">
            <b>${section.title}</b>
            <small>${section.subtitle}</small>
          </button>
        `).join("")}
      </aside>
      <section class="settings-panel">
        ${renderSettingsPanel(selected.id)}
      </section>
    </div>
  `;
}

function renderSettingsPanel(id) {
  if (id === "pet") {
    return `
      <div class="settings-panel-head">
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
      <div class="settings-panel-head">
        <h2>集成</h2>
        <p>检查本机 AI 工具，并在需要时跳回对应应用。</p>
      </div>
      <div class="integration-list">
        ${state.integrations.map(renderIntegrationRow).join("")}
      </div>
      <div class="settings-actions">
        <button class="primary" type="button" data-setting-action="refresh-integrations">刷新集成状态</button>
      </div>
      <p class="setting-caption">当前集成会检测本机应用/CLI 是否安装和运行；桌面应用可以跳回，CLI 目前只能检测进程，还不能定位到具体终端窗口。</p>
    `;
  }
  return `
    <div class="settings-panel-head">
      <h2>显示</h2>
      <p>控制桌面宠物在平时和提醒场景中的信息密度。</p>
    </div>
    <div class="setting-group">
      ${renderSettingToggle("显示会话徽标", "showBadge", "在宠物旁标记待审批或运行中的会话数量。")}
      ${renderSettingToggle("显示状态标签", "showStatus", "保留一个短标签，方便扫一眼知道当前状态。")}
    </div>
    <div class="settings-actions">
      <button class="primary" type="button" data-setting-action="reset-position">重置到右下角</button>
    </div>
  `;
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
    <label class="setting-line">
      <span>
        <b>${label}</b>
        ${description ? `<small>${description}</small>` : ""}
      </span>
      <input type="checkbox" data-setting-toggle="${key}" ${state.userSettings[key] ? "checked" : ""} />
    </label>
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
  const signature = `${messages.length}:${latest?.id || ""}`;
  if (!force && signature === lastChatScrollSignature) return;
  lastChatScrollSignature = signature;

  window.requestAnimationFrame(() => {
    const thread = document.querySelector(".chat-thread");
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
    if (!state.open) state.route = approvalSession() ? "monitor" : normalizeRoute(state.route);
    state.open = !state.open;
    state.actionMenuOpen = false;
    render();
  }
}

document.addEventListener("click", async (event) => {
  const target = event.target.closest?.("button");
  if (!target) return;
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
  const key = event.target.dataset?.settingToggle;
  if (!key) return;

  state.userSettings[key] = event.target.checked;
  saveUserSettings();
  render();
});

document.addEventListener("input", (event) => {
  if (event.target.dataset?.chatInput === undefined) return;
  state.chatDraft = event.target.value;
});

document.addEventListener("submit", (event) => {
  if (event.target.dataset?.chatForm === undefined) return;
  event.preventDefault();
  submitChatMessage();
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
  if (event.target.dataset?.chatInput !== undefined && event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
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
    state.open = !state.open;
    state.actionMenuOpen = false;
    render();
  }
});
window.addEventListener("resize", () => {
  state.petPosition = clampPetPosition(state.petPosition);
  render();
});

if (listen) {
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
window.setInterval(refreshSessions, SESSION_POLL_MS);
window.setInterval(refreshSessionHistory, SESSION_HISTORY_POLL_MS);
