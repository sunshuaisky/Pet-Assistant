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
