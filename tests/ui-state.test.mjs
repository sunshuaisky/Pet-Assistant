import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  appendChatMessageToState,
  computeTheme,
  createConversation,
  defaultUserSettings,
  normalizeChatState,
  normalizeRoute,
  normalizeUserSettings,
  selectedConversation,
} from "../src/ui-state.js";

const normalizedSettings = normalizeUserSettings({
  showBadge: false,
  reduceTransparency: true,
  increaseContrast: true,
  glassStrength: "high",
  importedPets: [{ id: "pet-1", src: "pet.png", name: "Pixel" }],
  renamedPets: { tuxie: "Tux" },
});

assert.equal(normalizedSettings.showBadge, false);
assert.equal(normalizedSettings.showStatus, true);
assert.equal(normalizedSettings.currentPetId, "tuxie");
assert.equal(normalizedSettings.appearanceMode, "system");
assert.equal("reduceTransparency" in normalizedSettings, false);
assert.equal("increaseContrast" in normalizedSettings, false);
assert.equal("glassStrength" in normalizedSettings, false);
assert.equal(normalizedSettings.importedPets.length, 1);
assert.equal(normalizedSettings.renamedPets.tuxie, "Tux");
assert.equal(normalizeUserSettings(null).appearanceMode, "system");
assert.equal(defaultUserSettings.currentPetId, "tuxie");
assert.equal(defaultUserSettings.userAvatar, "");
assert.equal("apiKey" in defaultUserSettings, false);

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

const stableChatA = normalizeChatState([{ role: "user", text: "稳定吗？" }]);
const stableChatB = normalizeChatState([{ role: "user", text: "稳定吗？" }]);
assert.equal(stableChatA.selectedConversationId, stableChatB.selectedConversationId);
assert.equal(stableChatA.conversations[0].id, stableChatB.conversations[0].id);
assert.equal(stableChatA.conversations[0].messages[0].id, stableChatB.conversations[0].messages[0].id);

const emptyChat = normalizeChatState(null);
assert.equal(emptyChat.conversations.length, 1);
assert.equal(emptyChat.conversations[0].title, "新对话");
assert.equal(emptyChat.conversations[0].messages.length, 0);

const duplicateEmptyChat = normalizeChatState({
  conversations: [
    { id: "empty-1", title: "新对话", messages: [] },
    { id: "empty-2", title: "新对话", messages: [] },
  ],
  selectedConversationId: "empty-2",
});
assert.equal(duplicateEmptyChat.conversations.length, 1);
assert.equal(duplicateEmptyChat.conversations[0].id, "empty-1");

const conversation = createConversation("审批风险解释");
assert.equal(conversation.title, "审批风险解释");
assert.deepEqual(conversation.messages, []);

const withMessage = appendChatMessageToState(emptyChat, "user", "审批是什么？", "2026-05-23T00:02:00.000Z");
const selected = withMessage.conversations.find((item) => item.id === withMessage.selectedConversationId);
assert.equal(selected.messages.length, 1);
assert.equal(selected.messages[0].role, "user");
assert.equal(selected.messages[0].text, "审批是什么？");
assert.equal(selected.title, "审批是什么？");
assert.equal(selectedConversation(withMessage).id, selected.id);

const fixedTimestamp = "2026-05-23T00:03:00.000Z";
const cappedMessages = Array.from({ length: 120 }, (_, index) => ({
  id: `cap-${index}`,
  role: index % 2 ? "assistant" : "user",
  text: `第 ${index + 1} 条`,
  timestamp: `2026-05-23T00:${String(index).padStart(2, "0")}:00.000Z`,
}));
const cappedChat = normalizeChatState({
  conversations: [
    {
      id: "conversation-cap",
      title: "上限测试",
      messages: cappedMessages,
      createdAt: "2026-05-23T00:00:00.000Z",
      updatedAt: "2026-05-23T00:02:00.000Z",
    },
  ],
  selectedConversationId: "conversation-cap",
});
const cappedAppended = appendChatMessageToState(cappedChat, "user", "第 121 条", fixedTimestamp);
const cappedSelected = selectedConversation(cappedAppended);
assert.equal(cappedSelected.messages.length, 120);
assert.equal(cappedSelected.messages[cappedSelected.messages.length - 1].text, "第 121 条");
assert.equal(cappedSelected.messages[cappedSelected.messages.length - 1].timestamp, fixedTimestamp);
assert.notDeepEqual(cappedAppended, cappedChat);

const manyConversations = Array.from({ length: 51 }, (_, index) => ({
  id: `conversation-${index}`,
  title: `对话 ${index}`,
  messages: [],
  createdAt: `2026-05-23T01:${String(index).padStart(2, "0")}:00.000Z`,
  updatedAt: `2026-05-23T01:${String(index).padStart(2, "0")}:00.000Z`,
}));
const normalizedManyConversations = normalizeChatState({
  conversations: manyConversations,
  selectedConversationId: "conversation-0",
});
assert.equal(normalizedManyConversations.conversations.length, 51);
assert.equal(normalizedManyConversations.selectedConversationId, "conversation-0");

const mainSource = readFileSync(new URL("../src/main.js", import.meta.url), "utf8");
const stylesSource = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
const rustSource = readFileSync(new URL("../src-tauri/src/main.rs", import.meta.url), "utf8");
const sendChatCommandSource = rustSource.match(/async fn send_chat_message\([\s\S]*?\n\}/)?.[0] || "";
const petActionMenuSource = mainSource.match(/function renderPetActionMenu\(\) \{[\s\S]*?\n\}/)?.[0] || "";
assert.match(mainSource, /from "\.\/ui-state\.js";/);
assert.match(mainSource, /route:\s*normalizeRoute\("monitor"\)/);
assert.match(mainSource, /selectedSetting:\s*"appearance"/);
assert.match(mainSource, /chatState:\s*loadChatState\(\)/);
assert.match(mainSource, /if \(id === "appearance"\)/);
assert.match(mainSource, /if \(id === "chatApi"\)/);
assert.match(mainSource, /data-chat-api-field="apiKey"/);
assert.match(mainSource, /data-setting-action="save-chat-api"/);
assert.match(mainSource, /data-setting-action="test-chat-api"/);
assert.match(mainSource, /invoke\("send_chat_message"/);
assert.match(mainSource, /requestId/);
assert.match(mainSource, /listen\("chat:\/\/chunk"/);
assert.match(mainSource, /thinking:\s*true/);
assert.match(mainSource, /thinking-dots/);
assert.match(mainSource, /data-chat-image-input/);
assert.match(mainSource, /data-user-avatar-input/);
assert.match(mainSource, /data-setting-action="reset-user-avatar"/);
assert.match(mainSource, /function renderUserAvatar/);
assert.match(mainSource, /data-chat-attachment-remove/);
assert.match(mainSource, /clipboardData\?\.items/);
assert.match(mainSource, /event\.key === "Enter" && !event\.metaKey && !event\.ctrlKey/);
assert.doesNotMatch(mainSource, /<span>⌘<\/span>/);
assert.match(mainSource, /response\.requestedModel/);
assert.match(mainSource, /response\.model/);
assert.match(mainSource, /chatApiActiveModel/);
assert.match(mainSource, /invoke\("save_chat_api_config"/);
assert.match(mainSource, /invoke\("test_chat_api_config"/);
assert.doesNotMatch(mainSource, /state\.userSettings\.apiKey/);
assert.doesNotMatch(sendChatCommandSource, /聊天 API 尚未启用/);
assert.match(rustSource, /struct ChatApiReply/);
assert.match(rustSource, /struct ChatStreamChunk/);
assert.match(rustSource, /"stream": true/);
assert.match(rustSource, /app\.emit\(\s*"chat:\/\/chunk"/);
assert.match(rustSource, /requested_model:\s*config\.model\.clone\(\)/);
assert.match(stylesSource, /--chat-input-text:\s*oklch\(0\.12 0 0\)/);
assert.match(stylesSource, /\.composer textarea[\s\S]*color:\s*var\(--chat-input-text\)/);
assert.match(stylesSource, /\.bubble[\s\S]*font-size:\s*13px/);
assert.match(stylesSource, /@keyframes thinking-dot/);
assert.match(stylesSource, /\.messages > \.message\.user/);
assert.match(stylesSource, /\.tool-meta time[\s\S]*font-size:\s*8px/);
assert.match(mainSource, /<h2>外观<\/h2>/);
assert.match(mainSource, /theme-preview-window/);
assert.match(mainSource, /preview-traffic-lights/);
assert.doesNotMatch(mainSource, /毛玻璃强度/);
assert.doesNotMatch(mainSource, /降低透明度/);
assert.doesNotMatch(mainSource, /增强对比度/);
assert.doesNotMatch(mainSource, /glassStrength/);
assert.doesNotMatch(mainSource, /reduceTransparency/);
assert.doesNotMatch(mainSource, /increaseContrast/);
assert.match(mainSource, /sameData\(previous,\s*state\.chatState\)/);
assert.match(mainSource, /function createNewChatConversation\(\)/);
assert.match(mainSource, /function selectChatConversation\(id\)/);
assert.match(mainSource, /class="chat-list"/);
assert.match(mainSource, /data-chat-new/);
assert.match(mainSource, /data-chat-search/);
assert.match(mainSource, /state\.chatSearch/);
assert.match(mainSource, /data-chat-select="\$\{escapeHtml\(item\.id\)\}"/);
assert.doesNotMatch(mainSource, /本地助手/);
assert.doesNotMatch(mainSource, /上下文独立/);
assert.doesNotMatch(mainSource, /class="side-bottom"/);
assert.doesNotMatch(mainSource, /renderQuickAppearanceControls/);
assert.match(mainSource, /provider:\s*session\.provider/);
const renderSettingsSource = mainSource.match(/function renderSettings\(\) \{[\s\S]*?\n\}/)?.[0] || "";
assert.doesNotMatch(renderSettingsSource, /renderThemeSwitchButtons/);
assert.match(mainSource, /if \(target\.dataset\.chatNew !== undefined\)/);
assert.match(mainSource, /if \(target\.dataset\.chatSelect\)/);
const selectChatConversationSource = mainSource.match(/function selectChatConversation\(id\) \{[\s\S]*?\n\}/)?.[0] || "";
assert.ok(selectChatConversationSource);
assert.doesNotMatch(selectChatConversationSource, /state\.chatDraft\s*=/);
assert.match(petActionMenuSource, /data-panel-route="chat"/);
assert.match(petActionMenuSource, />\s*聊天\s*</);
assert.match(mainSource, /function togglePetPanelFromTrigger\(\)/);
assert.match(mainSource, /function pendingUserActionSession\(/);
const pendingUserActionSessionSource =
  mainSource.match(/function pendingUserActionSession\([^)]*\) \{[\s\S]*?\n\}/)?.[0] || "";
assert.match(pendingUserActionSessionSource, /needsApproval/);
assert.match(pendingUserActionSessionSource, /phase === "approval"/);
assert.match(pendingUserActionSessionSource, /needsInput/);
assert.match(pendingUserActionSessionSource, /phase === "input"/);
const togglePetPanelFromTriggerSource =
  mainSource.match(/function togglePetPanelFromTrigger\(\) \{[\s\S]*?\n\}/)?.[0] || "";
assert.match(togglePetPanelFromTriggerSource, /state\.selectedId\s*=\s*pending\.id/);
assert.match(mainSource, /handlePetPointerUp[\s\S]*togglePetPanelFromTrigger\(\)/);
assert.match(mainSource, /keydown[\s\S]*togglePetPanelFromTrigger\(\)/);
assert.doesNotMatch(mainSource, /回到“会话”页/);
assert.match(mainSource, /回到“监控”页/);
assert.match(stylesSource, /\.triple\s*{/);
assert.match(stylesSource, /\.triple button\.active\s*{/);
assert.match(stylesSource, /\.theme-preview-strip\s*{/);
assert.match(stylesSource, /\.theme-area\s*{/);
assert.doesNotMatch(stylesSource, /\.chat-icon\s*{/);
assert.match(stylesSource, /\.chat-item b\s*{[\s\S]*font-size:\s*11px;/);
assert.match(stylesSource, /--hover:/);
assert.match(stylesSource, /\.tabs button:hover:not\(\.active\)\s*{\s*background:\s*var\(--hover\);/);
assert.match(stylesSource, /\.theme-preview-light \.theme-preview-window\s*{/);
assert.match(stylesSource, /\.history-item\.message\s*{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\);/);
assert.match(stylesSource, /--code-surface:/);
assert.match(stylesSource, /:root\[data-theme="dark"\][\s\S]*--code-surface:/);
assert.match(stylesSource, /--code-surface:\s*oklch\(1 0 0\);/);
assert.match(stylesSource, /--code-surface-deep:\s*oklch\(1 0 0\);/);
assert.match(stylesSource, /\.history-item pre\s*{[\s\S]*background:\s*var\(--code-surface-deep\);/);
assert.doesNotMatch(stylesSource, /data-glass-strength/);
assert.doesNotMatch(stylesSource, /data-reduce-transparency/);
assert.doesNotMatch(stylesSource, /data-increase-contrast/);
assert.match(stylesSource, /\.avatar\s*{/);
assert.match(stylesSource, /\.bubble p\s*{[\s\S]*overflow-wrap:\s*anywhere;[\s\S]*}/);
assert.match(stylesSource, /\.tabs button\.active\s*{[\s\S]*background:\s*var\(--accent-soft\);[\s\S]*color:\s*var\(--accent\);[\s\S]*}/);
assert.doesNotMatch(mainSource, /messages\.length === previousMessageCount/);
assert.doesNotMatch(mainSource, /chatMessages:\s*loadChatMessages\(\)/);
assert.doesNotMatch(mainSource, /function normalizeChatMessages\(/);
assert.doesNotMatch(mainSource, /function normalizeUserSettings\(/);
assert.doesNotMatch(mainSource, /function normalizePet\(/);

console.log("ui-state: ok");
