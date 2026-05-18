import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { decisionPath, readSessions, upsertSession, writeDecision, writeSessions } from "../scripts/bridge-store.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "phoenix-pet-approval-"));
process.env.PHOENIX_PET_HOME = tempRoot;

function waitFor(predicate, label) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const timer = setInterval(() => {
      try {
        const value = predicate();
        if (value) {
          clearInterval(timer);
          resolve(value);
        } else if (Date.now() - started > 4000) {
          clearInterval(timer);
          reject(new Error(`Timed out waiting for ${label}`));
        }
      } catch (error) {
        clearInterval(timer);
        reject(error);
      }
    }, 50);
  });
}

function collectProcess(child) {
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });
  return new Promise((resolve, reject) => {
    child.on("exit", (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`child exited ${code}: ${stderr}`));
    });
  });
}

const payload = {
  session_id: "approval-flow-test",
  cwd: repoRoot,
  hook_event_name: "PermissionRequest",
  tool_name: "exec_command",
  tool_input: { cmd: "touch approved.txt" },
};

const child = spawn(
  process.execPath,
  [path.join(repoRoot, "scripts", "map-hook-event.mjs"), "approval_requested", "--provider", "codex", "--quiet", "1"],
  {
    cwd: repoRoot,
    env: {
      ...process.env,
      PHOENIX_PET_HOME: tempRoot,
      PHOENIX_PET_APPROVAL_TIMEOUT_MS: "5000",
      PHOENIX_PET_APPROVAL_POLL_MS: "50",
    },
    stdio: ["pipe", "pipe", "pipe"],
  },
);

const outputPromise = collectProcess(child);
child.stdin.end(`${JSON.stringify(payload)}\n`);

await waitFor(() => readSessions("codex").find((session) => session.sessionId === "approval-flow-test"), "pending session");
let sessions = readSessions("codex");
assert.equal(sessions[0].phase, "need_approval");
assert.equal(sessions[0].needsApproval, true);
assert.equal(sessions[0].title, "审批：touch approved.txt");

upsertSession("codex", {
  sessionId: "approval-flow-test",
  provider: "codex",
  projectName: "Phoenix-Pet",
  cwd: repoRoot,
  title: "Phoenix-Pet",
  latestMessage: "codex event: progress",
  unreadCount: 0,
  lastActivityAt: new Date().toISOString(),
  phase: "working",
  needsApproval: false,
  needsInput: false,
});
sessions = readSessions("codex");
assert.equal(sessions[0].phase, "need_approval");
assert.equal(sessions[0].needsApproval, true);
assert.equal(sessions[0].title, "审批：touch approved.txt");

writeDecision("codex", "approval-flow-test", "approve", "Approved by test");
assert.ok(fs.existsSync(decisionPath("codex", "approval-flow-test")));

const { stdout } = await outputPromise;
const response = JSON.parse(stdout);
assert.deepEqual(response, {
  hookSpecificOutput: {
    hookEventName: "PermissionRequest",
    decision: {
      behavior: "allow",
    },
  },
});

sessions = readSessions("codex");
assert.equal(sessions[0].phase, "working");
assert.equal(sessions[0].needsApproval, false);
assert.equal(sessions[0].latestMessage, "Approved from Phoenix Pet");

writeSessions("codex", [
  {
    sessionId: "related-working-session",
    provider: "codex",
    projectName: "Related",
    cwd: path.join(tempRoot, "Related"),
    title: "Related",
    latestMessage: "codex event: progress",
    unreadCount: 0,
    lastActivityAt: new Date().toISOString(),
    phase: "working",
    needsApproval: false,
    needsInput: false,
  },
]);

const relatedChild = spawn(
  process.execPath,
  [path.join(repoRoot, "scripts", "map-hook-event.mjs"), "approval_requested", "--provider", "codex", "--quiet", "1"],
  {
    cwd: repoRoot,
    env: {
      ...process.env,
      PHOENIX_PET_HOME: tempRoot,
      PHOENIX_PET_APPROVAL_TIMEOUT_MS: "5000",
      PHOENIX_PET_APPROVAL_POLL_MS: "50",
    },
    stdio: ["pipe", "pipe", "pipe"],
  },
);
const relatedPromise = collectProcess(relatedChild);
relatedChild.stdin.end(
  `${JSON.stringify({
    cwd: path.join(tempRoot, "Related"),
    hook_event_name: "PermissionRequest",
    tool_name: "exec_command",
    tool_input: { cmd: "touch related.txt" },
  })}\n`,
);

await waitFor(
  () => readSessions("codex").find((session) => session.sessionId === "related-working-session" && session.needsApproval),
  "related pending session",
);
sessions = readSessions("codex");
assert.equal(sessions.length, 1);
assert.equal(sessions[0].sessionId, "related-working-session");
assert.equal(sessions[0].phase, "need_approval");

writeDecision("codex", "related-working-session", "approve_session", "Allowed for this session by test");
await relatedPromise;

const autoAllowedChild = spawn(
  process.execPath,
  [path.join(repoRoot, "scripts", "map-hook-event.mjs"), "approval_requested", "--provider", "codex", "--quiet", "1"],
  {
    cwd: repoRoot,
    env: {
      ...process.env,
      PHOENIX_PET_HOME: tempRoot,
      PHOENIX_PET_APPROVAL_TIMEOUT_MS: "5000",
      PHOENIX_PET_APPROVAL_POLL_MS: "50",
    },
    stdio: ["pipe", "pipe", "pipe"],
  },
);
const autoAllowedPromise = collectProcess(autoAllowedChild);
autoAllowedChild.stdin.end(
  `${JSON.stringify({
    cwd: path.join(tempRoot, "Related"),
    hook_event_name: "PermissionRequest",
    tool_name: "exec_command",
    tool_input: { cmd: "touch auto-allowed.txt" },
  })}\n`,
);
const autoAllowed = JSON.parse((await autoAllowedPromise).stdout);
assert.deepEqual(autoAllowed, {
  hookSpecificOutput: {
    hookEventName: "PermissionRequest",
    decision: {
      behavior: "allow",
    },
  },
});

const promptChild = spawn(
  process.execPath,
  [path.join(repoRoot, "scripts", "map-hook-event.mjs"), "input_requested", "--provider", "codex", "--quiet", "1"],
  {
    cwd: repoRoot,
    env: {
      ...process.env,
      PHOENIX_PET_HOME: tempRoot,
    },
    stdio: ["pipe", "pipe", "pipe"],
  },
);
const promptPromise = collectProcess(promptChild);
promptChild.stdin.end(
  `${JSON.stringify({
    session_id: "user-prompt-submit-test",
    cwd: repoRoot,
    hook_event_name: "UserPromptSubmit",
    prompt: "实现一个功能",
  })}\n`,
);
await promptPromise;

sessions = readSessions("codex");
const promptSession = sessions.find((session) => session.sessionId === "user-prompt-submit-test");
assert.equal(promptSession.phase, "working");
assert.equal(promptSession.needsInput, false);

fs.rmSync(tempRoot, { recursive: true, force: true });
console.log("approval-hook-flow: ok");
