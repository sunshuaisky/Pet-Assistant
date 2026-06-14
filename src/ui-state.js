export const defaultAppearanceSettings = {
  appearanceMode: "system",
};

export const defaultUserSettings = {
  showBadge: true,
  showStatus: true,
  currentPetId: "tuxie",
  userAvatar: "",
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

const stableTimestamp = new Date(0).toISOString();

function stableIdPart(value) {
  const text = String(value || "").trim().replace(/\s+/g, " ");
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash * 31) + text.charCodeAt(index)) >>> 0;
  }
  const slug = text.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 12);
  return `${slug || "text"}-${hash.toString(36)}`;
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
  const input = settings && typeof settings === "object" ? settings : {};
  return {
    ...defaultUserSettings,
    showBadge: input.showBadge ?? defaultUserSettings.showBadge,
    showStatus: input.showStatus ?? defaultUserSettings.showStatus,
    currentPetId: input.currentPetId || "tuxie",
    userAvatar: typeof input.userAvatar === "string" && input.userAvatar.startsWith("data:image/")
      ? input.userAvatar.slice(0, 3_000_000)
      : "",
    importedPets: Array.isArray(input.importedPets)
      ? input.importedPets.map(normalizePet).filter(Boolean)
      : [],
    renamedPets: input.renamedPets && typeof input.renamedPets === "object" ? input.renamedPets : {},
    appearanceMode: normalizeAppearanceMode(input.appearanceMode),
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

export function normalizeMessage(message = {}, index = 0) {
  const input = message && typeof message === "object" ? message : {};
  const text = String(input.text || input.message || "").trim().slice(0, 1200);
  if (!text) return null;
  const role = input.role === "user" ? "user" : "assistant";
  return {
    id: String(input.id || `chat-${index}-${role}-${stableIdPart(text)}`),
    role,
    text,
    timestamp: input.timestamp || stableTimestamp,
  };
}

export function normalizeConversation(conversation = {}, index = 0) {
  const input = conversation && typeof conversation === "object" ? conversation : {};
  const messages = Array.isArray(input.messages)
    ? input.messages.map(normalizeMessage).filter(Boolean).slice(-120)
    : [];
  const firstUserMessage = messages.find((message) => message.role === "user");
  const title = conversationTitleFromText(input.title || firstUserMessage?.text || "新对话");
  const timestamp = input.createdAt || messages[0]?.timestamp || stableTimestamp;
  const id = String(input.id || `conversation-${index}-${stableIdPart(title || messages[0]?.text)}`);
  return {
    id,
    title,
    messages,
    createdAt: timestamp,
    updatedAt: input.updatedAt || messages[messages.length - 1]?.timestamp || timestamp,
  };
}

export function normalizeChatState(value) {
  if (Array.isArray(value)) {
    const messages = value.map(normalizeMessage).filter(Boolean).slice(-120);
    const timestamp = messages[0]?.timestamp || stableTimestamp;
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

  const normalizedConversations = Array.isArray(value?.conversations)
    ? value.conversations.map(normalizeConversation).filter(Boolean)
    : [];
  const firstEmptyConversation = normalizedConversations.find(
    (conversation) => conversation.title === "新对话" && conversation.messages.length === 0,
  );
  const conversations = normalizedConversations.filter(
    (conversation) => (
      conversation.title !== "新对话"
      || conversation.messages.length > 0
      || conversation.id === firstEmptyConversation?.id
    ),
  );
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
  const message = normalizeMessage({
    id: `chat-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    role,
    text,
    timestamp,
  });
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
