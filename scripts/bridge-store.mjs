import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const providers = ["codex", "claude"];

export function bridgeRoot() {
  return process.env.PHOENIX_PET_HOME || path.join(os.homedir(), ".phoenix-pet");
}

export function providerRoot(provider) {
  return path.join(bridgeRoot(), "providers", provider);
}

export function sessionsPath(provider) {
  return path.join(providerRoot(provider), "sessions.json");
}

export function decisionPath(provider, sessionId) {
  return path.join(providerRoot(provider), "decisions", `${safeSessionFileName(sessionId)}.json`);
}

export function sessionAllowsPath(provider) {
  return path.join(providerRoot(provider), "session-allows.json");
}

export function safeSessionFileName(sessionId) {
  const safe = String(sessionId || "")
    .replace(/[^A-Za-z0-9._-]/g, "_")
    .replace(/^_+|_+$/g, "");
  return safe || "session";
}

export function readSessions(provider) {
  try {
    const raw = fs.readFileSync(sessionsPath(provider), "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function writeSessions(provider, sessions) {
  const filePath = sessionsPath(provider);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(sessions, null, 2)}\n`);
}

export function upsertSession(provider, nextSession) {
  const sessions = readSessions(provider);
  const index = sessions.findIndex((session) => session.sessionId === nextSession.sessionId);

  if (index === -1) {
    sessions.push(nextSession);
  } else {
    sessions[index] = mergeSession(sessions[index], nextSession);
  }

  sessions.sort((left, right) => String(right.lastActivityAt || "").localeCompare(String(left.lastActivityAt || "")));
  writeSessions(provider, sessions);
}

function mergeSession(current, nextSession) {
  if (current?.needsApproval && !nextSession?.needsApproval) {
    return {
      ...current,
      ...nextSession,
      phase: current.phase || "need_approval",
      needsApproval: true,
      needsInput: false,
      latestMessage: current.latestMessage || nextSession.latestMessage,
      title: current.title || nextSession.title,
    };
  }

  if (current?.needsInput && !nextSession?.needsApproval && !nextSession?.needsInput) {
    return {
      ...current,
      ...nextSession,
      phase: current.phase || "need_input",
      needsApproval: false,
      needsInput: true,
      latestMessage: current.latestMessage || nextSession.latestMessage,
      title: current.title || nextSession.title,
    };
  }

  return { ...current, ...nextSession };
}

export function updateSession(provider, sessionId, update) {
  const sessions = readSessions(provider);
  const index = sessions.findIndex((session) => session.sessionId === sessionId);
  if (index === -1) return false;

  sessions[index] = {
    ...sessions[index],
    ...update,
    lastActivityAt: update.lastActivityAt || new Date().toISOString(),
  };
  writeSessions(provider, sessions);
  return true;
}

export function removeSession(provider, sessionId) {
  writeSessions(
    provider,
    readSessions(provider).filter((session) => session.sessionId !== sessionId),
  );
}

export function clearDecision(provider, sessionId) {
  try {
    fs.unlinkSync(decisionPath(provider, sessionId));
  } catch {
    // Nothing to clear.
  }
}

export function writeDecision(provider, sessionId, decision, message = "") {
  const filePath = decisionPath(provider, sessionId);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(
    filePath,
    `${JSON.stringify(
      {
        decision,
        message,
        decidedAt: new Date().toISOString(),
      },
      null,
      2,
    )}\n`,
  );
}

export function readSessionAllows(provider) {
  try {
    const parsed = JSON.parse(fs.readFileSync(sessionAllowsPath(provider), "utf8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function writeSessionAllows(provider, allows) {
  const filePath = sessionAllowsPath(provider);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(allows, null, 2)}\n`);
}

export function allowSession(provider, sessionId, cwd = "") {
  const allows = readSessionAllows(provider);
  const next = {
    sessionId,
    cwd,
    allowedAt: new Date().toISOString(),
  };
  const index = allows.findIndex((entry) => entry.sessionId === sessionId);
  if (index === -1) {
    allows.push(next);
  } else {
    allows[index] = { ...allows[index], ...next };
  }
  writeSessionAllows(provider, allows);
}

export function isSessionAllowed(provider, sessionId, cwd = "") {
  const normalizedCwd = String(cwd || "").trim();
  return readSessionAllows(provider).some((entry) => {
    if (entry.sessionId === sessionId) return true;
    return normalizedCwd && String(entry.cwd || "").trim() === normalizedCwd;
  });
}

export async function waitForDecision(provider, sessionId, options = {}) {
  const timeoutMs = Number(options.timeoutMs || process.env.PHOENIX_PET_APPROVAL_TIMEOUT_MS || 86_400_000);
  const pollMs = Number(options.pollMs || process.env.PHOENIX_PET_APPROVAL_POLL_MS || 250);
  const deadline = Date.now() + timeoutMs;
  const filePath = decisionPath(provider, sessionId);

  while (Date.now() < deadline) {
    try {
      const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
      clearDecision(provider, sessionId);
      return parsed;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, pollMs));
    }
  }

  return {
    decision: "deny",
    message: "Phoenix Pet approval timed out.",
    timedOut: true,
  };
}
