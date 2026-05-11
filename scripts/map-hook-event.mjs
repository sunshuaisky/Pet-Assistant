#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import {
  clearDecision,
  removeSession,
  updateSession,
  upsertSession,
  waitForDecision,
} from "./bridge-store.mjs";

function parseArgs(argv) {
  const [eventName = "progress", ...rest] = argv;
  const options = {};

  for (let index = 0; index < rest.length; index += 1) {
    const current = rest[index];
    if (!current.startsWith("--")) continue;
    options[current.slice(2)] = rest[index + 1];
    index += 1;
  }

  return { eventName, options };
}

function readPayload() {
  try {
    if (process.stdin.isTTY) return {};
    const raw = fs.readFileSync(0, "utf8");
    return raw.trim() ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function collectScopes(payload) {
  const root = asObject(payload);
  return [
    root,
    asObject(root.data),
    asObject(root.event_data),
    asObject(root.context),
    asObject(root.session),
    asObject(root.metadata),
    asObject(root.tool),
  ];
}

function pick(scopes, keys) {
  for (const scope of scopes) {
    for (const key of keys) {
      const value = scope[key];
      if (value !== undefined && value !== null && value !== "") return value;
    }
  }
  return undefined;
}

function normalizeEventName(eventName, payload) {
  const scopes = collectScopes(payload);
  const source = pick(scopes, [
    "hook_event_name",
    "hookEventName",
    "event",
    "event_name",
    "type",
    "status",
    "kind",
    "hook_event",
  ]) || eventName;

  switch (String(source)) {
    case "PermissionRequest":
    case "approval":
    case "tool_approval":
    case "approval_required":
    case "tool_permission_request":
    case "permission_request":
      return "approval_requested";
    case "UserPromptSubmit":
      return "progress";
    case "input":
    case "question":
    case "ask_user":
    case "user_input_required":
      return "input_requested";
    case "Stop":
    case "complete":
    case "completed":
    case "finished":
    case "task_finished":
      return "completed";
    case "error":
    case "failed":
    case "task_failed":
      return "failed";
    case "SessionEnd":
    case "archived":
    case "removed":
    case "session_removed":
      return "removed";
    case "SessionStart":
    case "start":
    case "started":
    case "session_started":
      return "started";
    default:
      return eventName;
  }
}

function hashFallback(value) {
  return crypto.createHash("sha1").update(String(value || "session")).digest("hex").slice(0, 12);
}

function pickSessionId(provider, payload, options, cwd) {
  const scopes = collectScopes(payload);
  return (
    options["session-id"] ||
    pick(scopes, [
      "sessionId",
      "session_id",
      "threadId",
      "thread_id",
      "conversationId",
      "conversation_id",
      "runId",
      "run_id",
      "tool_use_id",
      "toolUseId",
      "id",
    ]) ||
    process.env.PHOENIX_PET_SESSION_ID ||
    process.env.CODEX_SESSION_ID ||
    process.env.CLAUDE_SESSION_ID ||
    `${provider}-${hashFallback(cwd)}`
  );
}

function mapEventToSessionState(eventName) {
  switch (eventName) {
    case "approval_requested":
      return { phase: "need_approval", needsApproval: true, needsInput: false };
    case "input_requested":
      return { phase: "need_input", needsApproval: false, needsInput: true };
    case "completed":
      return { phase: "done", needsApproval: false, needsInput: false };
    case "failed":
      return { phase: "error", needsApproval: false, needsInput: false };
    default:
      return { phase: "working", needsApproval: false, needsInput: false };
  }
}

function textPreview(value) {
  if (value === undefined || value === null || value === "") return "";
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return text.length > 180 ? `${text.slice(0, 177)}...` : text;
}

function providerDisplayName(provider) {
  return provider === "claude" ? "Claude Code" : "Codex";
}

function isGenericSessionTitle(provider, title) {
  const value = String(title || "").trim().toLowerCase();
  const providerName = providerDisplayName(provider).toLowerCase();
  return [
    "codex session",
    "codex 会话",
    "claude session",
    "claude code session",
    "claude 会话",
    "claude code 会话",
    `${providerName} session`,
    `${providerName} 会话`,
  ].includes(value);
}

function optionTitle(options, scopes, provider) {
  const title =
    options.title ||
    pick(scopes, [
      "title",
      "sessionTitle",
      "session_title",
      "conversationTitle",
      "conversation_title",
      "chatTitle",
      "chat_title",
      "task",
      "summary",
      "branch",
      "label",
      "headline",
    ]);

  return title && !isGenericSessionTitle(provider, title) ? textPreview(title) : undefined;
}

function defaultSessionTitle(provider, eventName, projectName, toolName, toolInput) {
  if (eventName === "approval_requested" && toolName) {
    const command = toolInput && typeof toolInput === "object" ? toolInput.cmd || toolInput.command : "";
    return `审批：${command ? textPreview(command) : toolName}`;
  }

  if (eventName === "input_requested") return "等待输入";
  return projectName || `${providerDisplayName(provider)} 会话`;
}

function buildSession(provider, eventName, payload, options) {
  const scopes = collectScopes(payload);
  const cwd =
    options.cwd ||
    pick(scopes, ["cwd", "workingDirectory", "working_directory", "projectPath", "project_path"]) ||
    process.env.CODEX_CWD ||
    process.env.CLAUDE_CWD ||
    process.cwd();
  const sessionId = String(pickSessionId(provider, payload, options, cwd));
  const toolName = pick(scopes, ["tool_name", "toolName", "tool"]);
  const toolInput = pick(scopes, ["tool_input", "toolInput", "input"]);
  const state = mapEventToSessionState(eventName);
  const projectName =
    options["project-name"] ||
    pick(scopes, ["projectName", "project_name", "workspaceName", "workspace_name"]) ||
    path.basename(cwd);
  const title = optionTitle(options, scopes, provider) || defaultSessionTitle(provider, eventName, projectName, toolName, toolInput);
  const message =
    options.message ||
    pick(scopes, [
      "latestMessage",
      "latest_message",
      "message",
      "statusMessage",
      "status_message",
      "displayMessage",
      "display_message",
      "subtitle",
      "summary",
      "prompt",
    ]) ||
    (eventName === "approval_requested" && toolName
      ? `Approval requested for ${toolName}${toolInput ? `: ${textPreview(toolInput)}` : ""}`
      : undefined) ||
    `${provider} event: ${eventName}`;

  return {
    sessionId,
    provider,
    projectName,
    cwd,
    title,
    latestMessage: message,
    unreadCount: Number(pick(scopes, ["unreadCount", "unread_count", "pendingCount", "pending_count"]) || 0),
    lastActivityAt:
      pick(scopes, ["lastActivityAt", "last_activity_at", "timestamp", "occurredAt", "occurred_at"]) ||
      new Date().toISOString(),
    ...state,
  };
}

function permissionOutput(decision) {
  const approved = ["approve", "approved", "allow", "allowed"].includes(String(decision?.decision || "").toLowerCase());
  const body = {
    behavior: approved ? "allow" : "deny",
  };

  if (!approved) {
    body.message = decision?.message || "Denied from Phoenix Pet.";
  }

  return {
    hookSpecificOutput: {
      hookEventName: "PermissionRequest",
      decision: body,
    },
  };
}

async function main() {
  const { eventName, options } = parseArgs(process.argv.slice(2));
  const provider = options.provider || process.env.PHOENIX_PET_PROVIDER || "codex";
  const quiet = options.quiet === "1" || options.quiet === "true";
  const payload = readPayload();
  const normalizedEvent = normalizeEventName(eventName, payload);

  if (normalizedEvent === "removed") {
    const session = buildSession(provider, normalizedEvent, payload, options);
    removeSession(provider, session.sessionId);
    return;
  }

  const session = buildSession(provider, normalizedEvent, payload, options);

  if (normalizedEvent === "approval_requested") {
    clearDecision(provider, session.sessionId);
  }

  upsertSession(provider, session);

  if (normalizedEvent !== "approval_requested") {
    return;
  }

  const decision = await waitForDecision(provider, session.sessionId);
  const approved = ["approve", "approved", "allow", "allowed"].includes(String(decision.decision || "").toLowerCase());
  updateSession(provider, session.sessionId, {
    phase: approved ? "working" : "error",
    needsApproval: false,
    needsInput: false,
    latestMessage: approved ? "Approved from Phoenix Pet" : decision.message || "Denied from Phoenix Pet",
  });

  process.stdout.write(`${JSON.stringify(permissionOutput(decision))}\n`);
}

main().catch((error) => {
  const quiet = process.argv.includes("--quiet");
  if (quiet && process.argv.includes("approval_requested")) {
    process.stdout.write(
      `${JSON.stringify(
        permissionOutput({
          decision: "deny",
          message: error instanceof Error ? error.message : String(error),
        }),
      )}\n`,
    );
    return;
  }

  if (!quiet) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
});
