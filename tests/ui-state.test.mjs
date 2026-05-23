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
assert.equal(normalizeUserSettings(null).appearanceMode, "system");
assert.equal(defaultUserSettings.currentPetId, "tuxie");

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
assert.match(mainSource, /from "\.\/ui-state\.js";/);
assert.match(mainSource, /route:\s*normalizeRoute\("monitor"\)/);
assert.match(mainSource, /selectedSetting:\s*"appearance"/);
assert.match(mainSource, /chatState:\s*loadChatState\(\)/);
assert.match(mainSource, /if \(id === "appearance"\)/);
assert.match(mainSource, /<h2>外观<\/h2>/);
assert.match(mainSource, /sameData\(previous,\s*state\.chatState\)/);
assert.match(mainSource, /function createNewChatConversation\(\)/);
assert.match(mainSource, /function selectChatConversation\(id\)/);
assert.match(mainSource, /class="chat-sidebar"/);
assert.match(mainSource, /data-chat-new/);
assert.match(mainSource, /data-chat-select="\$\{item\.id\}"/);
assert.match(mainSource, /class="assistant-pill">上下文独立<\/span>/);
assert.match(mainSource, /if \(target\.dataset\.chatNew !== undefined\)/);
assert.match(mainSource, /if \(target\.dataset\.chatSelect\)/);
const selectChatConversationSource = mainSource.match(/function selectChatConversation\(id\) \{[\s\S]*?\n\}/)?.[0] || "";
assert.ok(selectChatConversationSource);
assert.doesNotMatch(selectChatConversationSource, /state\.chatDraft\s*=/);
assert.match(stylesSource, /\.chat-bubble p\s*{[\s\S]*overflow-wrap:\s*anywhere;[\s\S]*}/);
assert.doesNotMatch(mainSource, /messages\.length === previousMessageCount/);
assert.doesNotMatch(mainSource, /chatMessages:\s*loadChatMessages\(\)/);
assert.doesNotMatch(mainSource, /function normalizeChatMessages\(/);
assert.doesNotMatch(mainSource, /function normalizeUserSettings\(/);
assert.doesNotMatch(mainSource, /function normalizePet\(/);

console.log("ui-state: ok");
