# V4 Acrylic UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the approved V4 acrylic UI with Monitor, Chat, and Settings modes, including CSS-level glass, light/dark/system theme selection, and reduced transparency/contrast controls.

**Architecture:** Keep the existing single-page Tauri/Vite app, but extract pure UI state helpers into `src/ui-state.js` so theme, route, and chat migration logic can be tested in Node. Keep Monitor mode structurally aligned with the current session page while upgrading Chat and Settings rendering in `src/main.js` and replacing the CSS token system in `src/styles.css`.

**Tech Stack:** Vite, vanilla JavaScript ES modules, CSS custom properties, localStorage, Tauri invoke APIs, Node test scripts.

---

## File Structure

- Create `src/ui-state.js`: pure helper functions for route normalization, theme computation, settings normalization, chat conversation migration, and chat mutations.
- Create `tests/ui-state.test.mjs`: Node tests for the pure helper functions.
- Modify `package.json`: add `test:ui` and update test coverage workflow.
- Modify `src/main.js`: integrate helpers, rename route labels to Monitor/Chat/Settings, add appearance settings UI, upgrade Chat mode to two-pane conversations, and apply theme attributes.
- Modify `src/styles.css`: replace dark-only tokens with V4 acrylic light/dark tokens, add glass strength, reduced transparency, increased contrast, Monitor/Chat/Settings layouts, and responsive behavior.

## Task 1: Add Pure UI State Tests

**Files:**
- Create: `tests/ui-state.test.mjs`
- Modify: `package.json`

- [ ] **Step 1: Write failing tests for route, settings, theme, and chat migration**

Create `tests/ui-state.test.mjs`:

```js
import assert from "node:assert/strict";
import {
  appendChatMessageToState,
  computeTheme,
  createConversation,
  normalizeChatState,
  normalizeRoute,
  normalizeUserSettings,
} from "../src/ui-state.js";

const normalizedSettings = normalizeUserSettings({
  showBadge: false,
  importedPets: [{ id: "pet-1", src: "pet.png", name: "Pixel" }],
  renamedPets: { tuxie: "Tux" },
});

assert.equal(normalizedSettings.showBadge, false);
assert.equal(normalizedSettings.showStatus, true);
assert.equal(normalizedSettings.currentPetId, "tuxie");
assert.equal(normalizedSettings.appearanceMode, "system");
assert.equal(normalizedSettings.reduceTransparency, false);
assert.equal(normalizedSettings.increaseContrast, false);
assert.equal(normalizedSettings.glassStrength, "medium");
assert.equal(normalizedSettings.importedPets.length, 1);
assert.equal(normalizedSettings.renamedPets.tuxie, "Tux");

assert.equal(normalizeRoute("sessions"), "monitor");
assert.equal(normalizeRoute("monitor"), "monitor");
assert.equal(normalizeRoute("chat"), "chat");
assert.equal(normalizeRoute("unknown"), "monitor");

assert.equal(computeTheme("light", true), "light");
assert.equal(computeTheme("dark", false), "dark");
assert.equal(computeTheme("system", true), "dark");
assert.equal(computeTheme("system", false), "light");

const migratedChat = normalizeChatState([
  { role: "user", text: "现在状态如何？", timestamp: "2026-05-23T00:00:00.000Z" },
  { role: "assistant", text: "当前没有待审批。", timestamp: "2026-05-23T00:01:00.000Z" },
]);

assert.equal(migratedChat.conversations.length, 1);
assert.equal(migratedChat.conversations[0].title, "现在状态如何？");
assert.equal(migratedChat.conversations[0].messages.length, 2);
assert.equal(migratedChat.selectedConversationId, migratedChat.conversations[0].id);

const emptyChat = normalizeChatState(null);
assert.equal(emptyChat.conversations.length, 1);
assert.equal(emptyChat.conversations[0].title, "新对话");
assert.equal(emptyChat.conversations[0].messages.length, 0);

const conversation = createConversation("审批风险解释");
assert.equal(conversation.title, "审批风险解释");
assert.deepEqual(conversation.messages, []);

const withMessage = appendChatMessageToState(emptyChat, "user", "审批是什么？", "2026-05-23T00:02:00.000Z");
const selected = withMessage.conversations.find((item) => item.id === withMessage.selectedConversationId);
assert.equal(selected.messages.length, 1);
assert.equal(selected.messages[0].role, "user");
assert.equal(selected.messages[0].text, "审批是什么？");
assert.equal(selected.title, "审批是什么？");

console.log("ui-state: ok");
```

- [ ] **Step 2: Add the npm script**

Modify `package.json` scripts to include:

```json
"test:ui": "node tests/ui-state.test.mjs"
```

Keep existing scripts unchanged.

- [ ] **Step 3: Run test to verify it fails**

Run:

```bash
pnpm test:ui
```

Expected: FAIL with an import error because `src/ui-state.js` does not exist.

- [ ] **Step 4: Commit failing test**

```bash
git add package.json tests/ui-state.test.mjs
git commit -m "test: add V4 UI state coverage"
```

## Task 2: Implement UI State Helpers

**Files:**
- Create: `src/ui-state.js`
- Test: `tests/ui-state.test.mjs`

- [ ] **Step 1: Create helper module**

Create `src/ui-state.js`:

```js
export const defaultAppearanceSettings = {
  appearanceMode: "system",
  reduceTransparency: false,
  increaseContrast: false,
  glassStrength: "medium",
};

export const defaultUserSettings = {
  showBadge: true,
  showStatus: true,
  currentPetId: "tuxie",
  importedPets: [],
  renamedPets: {},
  ...defaultAppearanceSettings,
};

export function normalizeRoute(route) {
  if (route === "sessions" || route === "monitor") return "monitor";
  if (route === "chat" || route === "settings") return route;
  return "monitor";
}

export function normalizeAppearanceMode(value) {
  return value === "light" || value === "dark" || value === "system" ? value : "system";
}

export function normalizeGlassStrength(value) {
  return value === "low" || value === "high" || value === "medium" ? value : "medium";
}

export function normalizePet(pet) {
  if (!pet?.id) return null;
  const kind = pet.kind === "atlas" ? "atlas" : "image";
  const src = pet.src || "";
  const assetPath = pet.assetPath || "";
  if (!src && !assetPath) return null;

  return {
    id: pet.id,
    name: pet.name || "Imported Pet",
    kind,
    source: pet.source || "imported",
    src,
    assetPath,
    columns: Number(pet.columns) || 8,
    rows: Number(pet.rows) || 9,
    width: Number(pet.width) || 128,
    height: Number(pet.height) || 139,
  };
}

export function normalizeUserSettings(settings = {}) {
  return {
    ...defaultUserSettings,
    ...settings,
    currentPetId: settings.currentPetId || "tuxie",
    importedPets: Array.isArray(settings.importedPets)
      ? settings.importedPets.map(normalizePet).filter(Boolean)
      : [],
    renamedPets: settings.renamedPets && typeof settings.renamedPets === "object" ? settings.renamedPets : {},
    appearanceMode: normalizeAppearanceMode(settings.appearanceMode),
    reduceTransparency: Boolean(settings.reduceTransparency),
    increaseContrast: Boolean(settings.increaseContrast),
    glassStrength: normalizeGlassStrength(settings.glassStrength),
  };
}

export function computeTheme(appearanceMode, systemPrefersDark) {
  const mode = normalizeAppearanceMode(appearanceMode);
  if (mode === "light" || mode === "dark") return mode;
  return systemPrefersDark ? "dark" : "light";
}

export function conversationTitleFromText(text) {
  const title = String(text || "").trim().replace(/\s+/g, " ").slice(0, 24);
  return title || "新对话";
}

export function createConversation(title = "新对话", timestamp = new Date().toISOString()) {
  const id = `conversation-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return {
    id,
    title: conversationTitleFromText(title),
    messages: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function normalizeMessage(message = {}) {
  const text = String(message.text || message.message || "").trim().slice(0, 1200);
  if (!text) return null;
  return {
    id: String(message.id || `chat-${Date.now()}-${Math.random().toString(36).slice(2)}`),
    role: message.role === "user" ? "user" : "assistant",
    text,
    timestamp: message.timestamp || new Date().toISOString(),
  };
}

export function normalizeConversation(conversation = {}) {
  const messages = Array.isArray(conversation.messages)
    ? conversation.messages.map(normalizeMessage).filter(Boolean).slice(-120)
    : [];
  const firstUserMessage = messages.find((message) => message.role === "user");
  const timestamp = conversation.createdAt || messages[0]?.timestamp || new Date().toISOString();
  const id = String(conversation.id || `conversation-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  return {
    id,
    title: conversationTitleFromText(conversation.title || firstUserMessage?.text || "新对话"),
    messages,
    createdAt: timestamp,
    updatedAt: conversation.updatedAt || messages[messages.length - 1]?.timestamp || timestamp,
  };
}

export function normalizeChatState(value) {
  if (Array.isArray(value)) {
    const messages = value.map(normalizeMessage).filter(Boolean).slice(-120);
    const timestamp = messages[0]?.timestamp || new Date().toISOString();
    const conversation = normalizeConversation({
      title: messages.find((message) => message.role === "user")?.text || "新对话",
      messages,
      createdAt: timestamp,
      updatedAt: messages[messages.length - 1]?.timestamp || timestamp,
    });
    return {
      conversations: [conversation],
      selectedConversationId: conversation.id,
    };
  }

  const conversations = Array.isArray(value?.conversations)
    ? value.conversations.map(normalizeConversation).filter(Boolean).slice(-50)
    : [];
  if (!conversations.length) {
    const conversation = createConversation("新对话");
    return {
      conversations: [conversation],
      selectedConversationId: conversation.id,
    };
  }

  const selectedConversationId = conversations.some((item) => item.id === value?.selectedConversationId)
    ? value.selectedConversationId
    : conversations[0].id;

  return {
    conversations,
    selectedConversationId,
  };
}

export function selectedConversation(chatState) {
  return chatState.conversations.find((item) => item.id === chatState.selectedConversationId) || chatState.conversations[0];
}

export function appendChatMessageToState(chatState, role, text, timestamp = new Date().toISOString()) {
  const state = normalizeChatState(chatState);
  const message = normalizeMessage({ role, text, timestamp });
  if (!message) return state;
  const current = selectedConversation(state);
  const nextConversation = {
    ...current,
    title: current.messages.length ? current.title : conversationTitleFromText(message.text),
    messages: [...current.messages, message].slice(-120),
    updatedAt: timestamp,
  };
  return {
    ...state,
    conversations: state.conversations.map((conversation) => (
      conversation.id === current.id ? nextConversation : conversation
    )),
    selectedConversationId: current.id,
  };
}
```

- [ ] **Step 2: Run UI state test**

Run:

```bash
pnpm test:ui
```

Expected: PASS and prints `ui-state: ok`.

- [ ] **Step 3: Commit helper implementation**

```bash
git add src/ui-state.js tests/ui-state.test.mjs package.json
git commit -m "feat: add V4 UI state helpers"
```

## Task 3: Integrate Theme, Route, and Settings State

**Files:**
- Modify: `src/main.js`
- Test: `tests/ui-state.test.mjs`

- [ ] **Step 1: Import helpers and remove duplicated defaults**

At the top of `src/main.js`, add:

```js
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
```

Remove the local `defaultUserSettings`, local `normalizeUserSettings`, and local `normalizePet` definitions. Keep existing `SPRITE_COLUMNS`, `SPRITE_ROWS`, `PET_WIDTH`, and `PET_HEIGHT` constants because animation code still uses them.

- [ ] **Step 2: Rename routes and settings categories**

Replace route items:

```js
const routeItems = [
  { id: "monitor", title: "监控" },
  { id: "chat", title: "聊天" },
  { id: "settings", title: "设置" },
];
```

Replace setting sections:

```js
const settingSections = [
  { id: "appearance", title: "外观", subtitle: "主题与毛玻璃" },
  { id: "display", title: "显示", subtitle: "宠物标记与位置" },
  { id: "pet", title: "宠物", subtitle: "导入与切换" },
  { id: "integrations", title: "集成", subtitle: "工具检测与跳转" },
];
```

Initialize state with:

```js
route: normalizeRoute("monitor"),
selectedSetting: "appearance",
chatState: loadChatState(),
```

Remove `chatMessages`.

- [ ] **Step 3: Add chat storage and theme helpers in `src/main.js`**

Replace `loadChatMessages` / `saveChatMessages` with:

```js
function loadChatState() {
  return normalizeChatState(readJsonStorage(CHAT_STORAGE_KEY, null));
}

function saveChatState() {
  writeJsonStorage(CHAT_STORAGE_KEY, state.chatState);
}
```

Add:

```js
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
```

Call `syncThemeAttributes()` at the start of `render()`.

- [ ] **Step 4: Update route usage**

Change render branch to:

```js
${state.route === "monitor" ? renderMonitor() : state.route === "chat" ? renderChat() : renderSettings()}
```

Rename `renderSessions()` to `renderMonitor()`. Update internal class names only if CSS task requires it; existing `.sessions-layout` can stay during integration.

Change all assignments of `"sessions"` to `"monitor"`, except compatibility reads that pass through `normalizeRoute()`.

In `handlePetPointerUp`, use:

```js
if (!wasMoved) {
  if (!state.open) state.route = approvalSession() ? "monitor" : normalizeRoute(state.route);
  state.open = !state.open;
  state.actionMenuOpen = false;
  render();
}
```

In `syncApprovalPopup`, set:

```js
state.route = "monitor";
```

- [ ] **Step 5: Add system theme listener**

Before the initial `render()` call, add:

```js
systemThemeQuery?.addEventListener?.("change", () => {
  if (state.userSettings.appearanceMode === "system") render();
});
```

- [ ] **Step 6: Run tests and build**

Run:

```bash
pnpm test:ui
pnpm test:approval
pnpm build
```

Expected: all pass.

- [ ] **Step 7: Commit integration**

```bash
git add src/main.js src/ui-state.js tests/ui-state.test.mjs package.json
git commit -m "feat: integrate V4 route and theme state"
```

## Task 4: Add Appearance Settings UI

**Files:**
- Modify: `src/main.js`

- [ ] **Step 1: Add render helpers for segmented controls**

Add near `renderSettingToggle`:

```js
function renderSegmentedSetting(label, description, key, options) {
  return `
    <div class="setting-line segmented-setting">
      <span>
        <b>${label}</b>
        <small>${description}</small>
      </span>
      <span class="segmented-control" role="group" aria-label="${escapeHtml(label)}">
        ${options.map((option) => `
          <button
            type="button"
            class="${state.userSettings[key] === option.value ? "selected" : ""}"
            data-setting-value="${key}"
            data-setting-next="${option.value}"
          >
            ${option.label}
          </button>
        `).join("")}
      </span>
    </div>
  `;
}

function renderAppearancePanel() {
  return `
    <div class="settings-panel-head">
      <h2>外观</h2>
      <p>选择面板主题，也可以跟随系统自动切换。</p>
    </div>
    <div class="setting-group">
      ${renderSegmentedSetting("主题", "控制浅色、深色或跟随系统。", "appearanceMode", [
        { value: "light", label: "浅色" },
        { value: "dark", label: "深色" },
        { value: "system", label: "跟随系统" },
      ])}
      ${renderSegmentedSetting("毛玻璃强度", "调节面板背景的模糊与饱和度。", "glassStrength", [
        { value: "low", label: "低" },
        { value: "medium", label: "中" },
        { value: "high", label: "高" },
      ])}
      ${renderSettingToggle("降低透明度", "关闭大面积毛玻璃，提升可读性和性能。", "reduceTransparency")}
      ${renderSettingToggle("增强对比度", "提高文字、边框和状态标签对比度。", "increaseContrast")}
    </div>
    <div class="theme-preview-strip" aria-hidden="true">
      <span><b>浅色预览</b><small>瓷白毛玻璃</small></span>
      <span><b>深色预览</b><small>烟黑毛玻璃</small></span>
    </div>
  `;
}
```

- [ ] **Step 2: Use Appearance panel in `renderSettingsPanel`**

At the start of `renderSettingsPanel(id)`, add:

```js
if (id === "appearance") return renderAppearancePanel();
```

- [ ] **Step 3: Handle segmented setting clicks**

In the click handler, before `target.dataset.settingAction`, add:

```js
if (target.dataset.settingValue) {
  state.userSettings[target.dataset.settingValue] = target.dataset.settingNext;
  saveUserSettings();
  render();
  return;
}
```

- [ ] **Step 4: Run verification**

Run:

```bash
pnpm test:ui
pnpm build
```

Expected: both pass.

- [ ] **Step 5: Commit**

```bash
git add src/main.js
git commit -m "feat: add V4 appearance settings"
```

## Task 5: Implement V4 Acrylic CSS Tokens and Modes

**Files:**
- Modify: `src/styles.css`

- [ ] **Step 1: Replace root token block**

Replace the current `:root` block with a light/dark attribute token system:

```css
:root {
  color-scheme: light;
  --text-primary: oklch(0.22 0.018 235);
  --text-strong: oklch(0.15 0.02 235);
  --text-secondary: oklch(0.46 0.018 235);
  --text-muted: oklch(0.62 0.014 235);
  --surface-panel: oklch(0.98 0.012 230 / 0.68);
  --surface-raised: oklch(0.995 0.008 230 / 0.58);
  --surface-hover: oklch(0.93 0.018 230 / 0.7);
  --surface-sunken: oklch(0.9 0.018 230 / 0.52);
  --line: oklch(0.42 0.02 235 / 0.14);
  --line-strong: oklch(0.42 0.02 235 / 0.24);
  --accent: oklch(0.58 0.12 215);
  --accent-soft: oklch(0.75 0.095 215 / 0.2);
  --accent-ink: oklch(0.98 0.01 230);
  --attention: oklch(0.7 0.12 78);
  --attention-soft: oklch(0.82 0.09 78 / 0.22);
  --success: oklch(0.62 0.12 155);
  --info: oklch(0.62 0.12 235);
  --violet: oklch(0.62 0.11 300);
  --danger: oklch(0.6 0.16 28);
  --danger-soft: oklch(0.74 0.12 28 / 0.18);
  --radius: 12px;
  --control-radius: 8px;
  --glass-blur: 22px;
  --glass-saturate: 1.35;
  --shadow-panel: 0 28px 80px oklch(0.32 0.04 235 / 0.22), 0 1px 0 oklch(1 0 0 / 0.35) inset;
  font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", system-ui, sans-serif;
  background: transparent;
  color: var(--text-primary);
}

:root[data-theme="dark"] {
  color-scheme: dark;
  --text-primary: oklch(0.91 0.012 235);
  --text-strong: oklch(0.98 0.008 235);
  --text-secondary: oklch(0.74 0.014 235);
  --text-muted: oklch(0.58 0.014 235);
  --surface-panel: oklch(0.19 0.018 235 / 0.66);
  --surface-raised: oklch(0.25 0.02 235 / 0.58);
  --surface-hover: oklch(0.31 0.024 235 / 0.66);
  --surface-sunken: oklch(0.12 0.016 235 / 0.5);
  --line: oklch(0.94 0.01 235 / 0.14);
  --line-strong: oklch(0.94 0.01 235 / 0.24);
  --accent: oklch(0.72 0.12 215);
  --accent-soft: oklch(0.72 0.12 215 / 0.18);
  --accent-ink: oklch(0.13 0.02 235);
  --attention: oklch(0.78 0.12 78);
  --attention-soft: oklch(0.78 0.12 78 / 0.18);
  --success: oklch(0.74 0.12 155);
  --info: oklch(0.74 0.12 235);
  --violet: oklch(0.76 0.11 300);
  --danger: oklch(0.72 0.16 28);
  --danger-soft: oklch(0.72 0.16 28 / 0.16);
  --shadow-panel: 0 30px 84px oklch(0.05 0.02 235 / 0.58), 0 1px 0 oklch(1 0 0 / 0.08) inset;
}

:root[data-glass-strength="low"] {
  --glass-blur: 14px;
  --glass-saturate: 1.15;
}

:root[data-glass-strength="high"] {
  --glass-blur: 34px;
  --glass-saturate: 1.55;
}

:root[data-reduce-transparency="true"] {
  --surface-panel: oklch(0.98 0.012 230);
  --surface-raised: oklch(0.995 0.008 230);
  --surface-hover: oklch(0.93 0.018 230);
  --surface-sunken: oklch(0.9 0.018 230);
  --glass-blur: 0px;
  --glass-saturate: 1;
}

:root[data-theme="dark"][data-reduce-transparency="true"] {
  --surface-panel: oklch(0.19 0.018 235);
  --surface-raised: oklch(0.25 0.02 235);
  --surface-hover: oklch(0.31 0.024 235);
  --surface-sunken: oklch(0.12 0.016 235);
}

:root[data-increase-contrast="true"] {
  --line: var(--line-strong);
  --text-muted: var(--text-secondary);
}
```

- [ ] **Step 2: Update global text token references**

Replace old token usage:

```css
var(--ink) -> var(--text-primary)
var(--ink-strong) -> var(--text-strong)
var(--ink-soft) -> var(--text-secondary)
var(--ink-muted) -> var(--text-muted)
var(--surface) -> var(--surface-sunken)
var(--surface-raised) -> var(--surface-raised)
var(--surface-hover) -> var(--surface-hover)
var(--red) -> var(--danger)
var(--green) -> var(--success)
var(--blue) -> var(--info)
var(--violet) -> var(--violet)
```

- [ ] **Step 3: Update panel and menu acrylic surfaces**

Change `.pet-panel` to:

```css
.pet-panel {
  position: absolute;
  display: none;
  width: min(760px, calc(100vw - 32px));
  max-height: min(640px, calc(100vh - 112px));
  padding: 10px;
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: var(--surface-panel);
  box-shadow: var(--shadow-panel);
  pointer-events: auto;
  transform-origin: bottom right;
  backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-saturate));
  -webkit-backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-saturate));
}
```

Use the same acrylic pattern for `.pet-action-menu`, `.session-detail`, `.session-summary`, `.session-history`, `.settings-panel`, `.chat-thread`, `.chat-head`, and `.chat-composer textarea`.

- [ ] **Step 4: Run build**

Run:

```bash
pnpm build
```

Expected: PASS.

- [ ] **Step 5: Commit acrylic CSS base**

```bash
git add src/styles.css
git commit -m "style: add V4 acrylic theme tokens"
```

## Task 6: Upgrade Chat to Independent Conversation Mode

**Files:**
- Modify: `src/main.js`
- Modify: `src/styles.css`
- Test: `tests/ui-state.test.mjs`

- [ ] **Step 1: Replace chat message append logic**

Replace `appendChatMessage` with:

```js
function appendChatMessage(role, text) {
  const previous = state.chatState;
  state.chatState = appendChatMessageToState(state.chatState, role, text);
  if (sameData(previous, state.chatState)) return null;
  saveChatState();
  return selectedConversation(state.chatState).messages.at(-1);
}
```

- [ ] **Step 2: Add conversation actions**

Add:

```js
function createNewChatConversation() {
  const conversation = createConversation("新对话");
  state.chatState = {
    conversations: [conversation, ...state.chatState.conversations].slice(0, 50),
    selectedConversationId: conversation.id,
  };
  state.chatDraft = "";
  saveChatState();
}

function selectChatConversation(id) {
  if (!state.chatState.conversations.some((conversation) => conversation.id === id)) return;
  state.chatState.selectedConversationId = id;
  state.chatDraft = "";
  saveChatState();
}
```

- [ ] **Step 3: Replace `renderChat`**

Render two panes:

```js
function renderChat() {
  const pet = currentPet();
  const conversation = selectedConversation(state.chatState);
  const messages = conversation.messages.length
    ? conversation.messages
    : [{
        id: "chat-empty",
        role: "assistant",
        text: `我是 ${pet.name}。你可以像 ChatGPT 一样和我连续对话，也可以问我当前工具状态。`,
        timestamp: new Date().toISOString(),
      }];
  const attentionCount = state.sessions.filter(
    (item) => item.needsApproval || item.needsInput || item.phase === "approval" || item.phase === "input",
  ).length;
  const activeCount = state.sessions.filter((item) => item.phase === "processing").length;

  return `
    <section class="chat-layout" aria-label="${escapeHtml(pet.name)} 聊天">
      <aside class="chat-sidebar">
        <div class="chat-sidebar-head">
          <h2>对话</h2>
          <button type="button" data-chat-new>新对话</button>
        </div>
        <input class="chat-search" type="search" placeholder="搜索对话" aria-label="搜索对话" />
        <div class="chat-conversation-list">
          ${state.chatState.conversations.map((item) => `
            <button
              class="${item.id === conversation.id ? "selected" : ""}"
              type="button"
              data-chat-select="${item.id}"
            >
              <b>${escapeHtml(item.title)}</b>
              <small>${item.messages.at(-1)?.text ? escapeHtml(item.messages.at(-1).text) : "还没有消息"}</small>
            </button>
          `).join("")}
        </div>
        <div class="chat-monitor-strip">
          <span class="${attentionCount ? "attention" : ""}">${attentionCount} 待处理</span>
          <span>${activeCount} 运行中</span>
        </div>
      </aside>
      <div class="chat-stage">
        <header class="chat-stage-head">
          <div>
            <h2>Tuxie Chat</h2>
            <p>${escapeHtml(conversation.title)}</p>
          </div>
          <span class="assistant-pill">本地助手</span>
          <span class="assistant-pill">上下文独立</span>
        </header>
        <div class="chat-thread" aria-live="polite">
          ${messages.map(renderChatMessage).join("")}
        </div>
        <form class="chat-composer" data-chat-form>
          <textarea
            data-chat-input
            rows="2"
            maxlength="1200"
            placeholder="给 Tuxie 发消息..."
          >${escapeHtml(state.chatDraft)}</textarea>
          <button class="primary" type="submit" aria-label="发送">发送</button>
          <small>Enter 换行 · ⌘ Enter 发送</small>
        </form>
      </div>
    </section>
  `;
}
```

- [ ] **Step 4: Add click handlers**

In the click handler before settings actions:

```js
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
```

- [ ] **Step 5: Add CSS for two-pane chat**

Add focused classes to `src/styles.css`:

```css
.chat-layout {
  display: grid;
  grid-template-columns: 210px minmax(0, 1fr);
  gap: 10px;
  height: min(458px, calc(100vh - 184px));
  min-height: 0;
}

.chat-sidebar,
.chat-stage {
  min-width: 0;
  min-height: 0;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: var(--surface-raised);
  backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-saturate));
  -webkit-backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-saturate));
}
```

Replace the existing chat layout block from `.chat-layout` through the last `.chat-composer small` rule with:

```css
.chat-layout {
  display: grid;
  grid-template-columns: 210px minmax(0, 1fr);
  gap: 10px;
  height: min(458px, calc(100vh - 184px));
  min-height: 0;
}

.chat-sidebar,
.chat-stage {
  min-width: 0;
  min-height: 0;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: var(--surface-raised);
  backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-saturate));
  -webkit-backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-saturate));
}

.chat-sidebar {
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr) auto;
  gap: 10px;
  padding: 12px;
}

.chat-sidebar-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.chat-sidebar-head h2,
.chat-stage-head h2 {
  margin: 0;
  color: var(--text-strong);
  font-size: 16px;
  letter-spacing: 0;
}

.chat-sidebar-head button,
.chat-composer button {
  border: 1px solid var(--accent);
  border-radius: var(--control-radius);
  background: var(--accent);
  color: var(--accent-ink);
}

.chat-search {
  width: 100%;
  border: 1px solid var(--line);
  border-radius: var(--control-radius);
  background: var(--surface-sunken);
  color: var(--text-primary);
  padding: 9px 10px;
}

.chat-conversation-list {
  display: grid;
  align-content: start;
  gap: 6px;
  overflow: auto;
  min-height: 0;
}

.chat-conversation-list button {
  display: grid;
  gap: 4px;
  width: 100%;
  border: 1px solid transparent;
  border-radius: var(--control-radius);
  background: transparent;
  color: var(--text-primary);
  padding: 9px;
  text-align: left;
}

.chat-conversation-list button.selected,
.chat-conversation-list button:hover {
  border-color: var(--line);
  background: var(--surface-hover);
}

.chat-conversation-list small {
  overflow: hidden;
  color: var(--text-muted);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chat-monitor-strip {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  color: var(--text-secondary);
  font-size: 12px;
}

.chat-monitor-strip span {
  border: 1px solid var(--line);
  border-radius: 999px;
  background: var(--surface-sunken);
  padding: 4px 8px;
}

.chat-monitor-strip .attention {
  border-color: color-mix(in oklch, var(--attention), transparent 50%);
  background: var(--attention-soft);
  color: var(--text-strong);
}

.chat-stage {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  overflow: hidden;
}

.chat-stage-head {
  display: flex;
  align-items: center;
  gap: 8px;
  border-bottom: 1px solid var(--line);
  padding: 12px;
}

.chat-stage-head p {
  margin: 3px 0 0;
  color: var(--text-secondary);
  font-size: 12px;
}

.assistant-pill {
  border: 1px solid var(--line);
  border-radius: 999px;
  background: var(--surface-sunken);
  color: var(--text-secondary);
  padding: 4px 8px;
  font-size: 12px;
}

.chat-thread {
  display: grid;
  align-content: start;
  gap: 10px;
  min-height: 0;
  overflow: auto;
  padding: 14px;
}

.chat-message {
  display: flex;
}

.chat-message.user {
  justify-content: flex-end;
}

.chat-bubble {
  max-width: min(78%, 430px);
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--surface-sunken);
  color: var(--text-primary);
  padding: 10px 12px;
}

.chat-message.user .chat-bubble {
  border-color: color-mix(in oklch, var(--accent), transparent 45%);
  background: var(--accent-soft);
}

.chat-bubble p {
  margin: 0;
  white-space: pre-wrap;
}

.chat-time {
  display: block;
  margin-top: 6px;
  color: var(--text-muted);
  font-size: 11px;
}

.chat-composer {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
  border-top: 1px solid var(--line);
  padding: 12px;
}

.chat-composer textarea {
  min-width: 0;
  resize: vertical;
  border: 1px solid var(--line);
  border-radius: var(--control-radius);
  background: var(--surface-sunken);
  color: var(--text-primary);
  padding: 10px 12px;
  backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-saturate));
  -webkit-backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-saturate));
}

.chat-composer small {
  grid-column: 1 / -1;
  color: var(--text-muted);
  font-size: 11px;
}
```

- [ ] **Step 6: Run verification**

Run:

```bash
pnpm test:ui
pnpm build
```

Expected: both pass.

- [ ] **Step 7: Commit**

```bash
git add src/main.js src/styles.css src/ui-state.js tests/ui-state.test.mjs
git commit -m "feat: add V4 independent chat mode"
```

## Task 7: Polish Settings, Monitor, and Responsive Behavior

**Files:**
- Modify: `src/main.js`
- Modify: `src/styles.css`

- [ ] **Step 1: Ensure Monitor copy and route labels are final**

Search `src/main.js` for `const routeItems` and make the block exactly:

```js
const routeItems = [
  { id: "monitor", title: "监控" },
  { id: "chat", title: "聊天" },
  { id: "settings", title: "设置" },
];
```

Search `src/main.js` for `会话动态`; the string must still be present in `renderMonitor()`. Search for `个会话`; the session count string must still be present in the monitor list header.

- [ ] **Step 2: Add responsive rules**

Update the media query to include:

```css
@media (max-width: 760px) {
  .chat-layout,
  .sessions-layout,
  .settings-layout {
    grid-template-columns: minmax(0, 1fr);
    height: auto;
    max-height: calc(100vh - 126px);
    overflow: auto;
  }

  .chat-sidebar {
    max-height: 190px;
  }

  .chat-composer {
    grid-template-columns: minmax(0, 1fr);
  }
}
```

- [ ] **Step 3: Run all automated checks**

Run:

```bash
pnpm test:ui
pnpm test:approval
pnpm build
```

Expected: all pass.

- [ ] **Step 4: Start dev server for manual review**

Run:

```bash
pnpm exec vite --host 127.0.0.1 --port 5174 --strictPort
```

Expected: app is available at `http://127.0.0.1:5174/`.

- [ ] **Step 5: Manual verification checklist**

Open `http://127.0.0.1:5174/` in the browser preview and complete this checklist:

- Pet click opens Monitor when approval exists.
- Pet click opens last used mode when no approval exists.
- Monitor layout matches current session structure.
- Chat has sidebar and conversation stage.
- New chat creates a new empty conversation.
- Existing flat chat data migrates to one default conversation.
- Settings has Appearance, Display, Pet, and Integrations.
- Light, Dark, and Follow System change attributes and UI immediately.
- Reduce Transparency removes blur-heavy surfaces.
- Increased Contrast makes borders and text stronger.
- Existing approval buttons still call the same actions.
- Existing pet import/rename/select/remove still works.
- Existing integration refresh/focus still works.

- [ ] **Step 6: Commit final polish**

```bash
git add src/main.js src/styles.css src/ui-state.js tests/ui-state.test.mjs package.json
git commit -m "polish: complete V4 acrylic UI"
```

## Self-Review Notes

- Spec coverage: routes, Monitor structure, Chat first-class mode, Appearance settings, theme attributes, CSS acrylic, reduced transparency, increased contrast, and verification are covered.
- Scope: native Tauri vibrancy remains out of scope and is not included in implementation tasks.
- Type consistency: theme fields are `appearanceMode`, `reduceTransparency`, `increaseContrast`, and `glassStrength`; chat state is `conversations` plus `selectedConversationId`.
- Test strategy: pure state helpers get Node tests; existing approval flow remains covered by `pnpm test:approval`; UI rendering is verified by build plus manual browser review.
