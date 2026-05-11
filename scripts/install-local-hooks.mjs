#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";

function shellQuote(value) {
  return `'${String(value).replaceAll("'", `'\\''`)}'`;
}

function parseArgs(argv) {
  const options = {
    root: process.env.PHOENIX_PET_HOME || path.join(os.homedir(), ".phoenix-pet"),
    repoRoot: process.cwd(),
    codexHooksPath: path.join(os.homedir(), ".codex", "hooks.json"),
    claudeHooksPath: path.join(os.homedir(), ".claude", "hooks", "phoenix-pet.json"),
  };

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    switch (current) {
      case "--root":
        options.root = argv[index + 1];
        index += 1;
        break;
      case "--repo-root":
        options.repoRoot = argv[index + 1];
        index += 1;
        break;
      case "--codex-hooks-path":
        options.codexHooksPath = argv[index + 1];
        index += 1;
        break;
      case "--claude-hooks-path":
        options.claudeHooksPath = argv[index + 1];
        index += 1;
        break;
      default:
        break;
    }
  }

  return options;
}

function writeExecutable(filePath, templatePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(
    filePath,
    `#!/usr/bin/env bash
set -euo pipefail

exec bash ${shellQuote(templatePath)} "$@"
`,
    { mode: 0o755 },
  );
}

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function removePhoenixHooks(entries) {
  return entries
    .map((entry) => ({
      ...entry,
      hooks: (entry.hooks || []).filter((hook) => !String(hook.command || "").includes("phoenix-pet-")),
    }))
    .filter((entry) => entry.hooks.length);
}

function commandHook(commandPath, eventName, timeout) {
  const hook = {
    command: `${commandPath} ${eventName}`,
    type: "command",
  };
  if (timeout) hook.timeout = timeout;
  return hook;
}

function upsertCodexEvent(config, eventName, commandPath, bridgeEvent, timeout) {
  config.hooks ||= {};
  config.hooks[eventName] = [
    ...removePhoenixHooks(config.hooks[eventName] || []),
    {
      matcher: "*",
      hooks: [commandHook(commandPath, bridgeEvent, timeout)],
    },
  ];
}

function installCodexHooks(filePath, commandPath) {
  const config = readJson(filePath, { hooks: {} });
  upsertCodexEvent(config, "PermissionRequest", commandPath, "approval_requested", 86_400);
  upsertCodexEvent(config, "PostToolUse", commandPath, "progress");
  upsertCodexEvent(config, "PreToolUse", commandPath, "progress");
  upsertCodexEvent(config, "SessionEnd", commandPath, "removed");
  upsertCodexEvent(config, "SessionStart", commandPath, "started");
  upsertCodexEvent(config, "Stop", commandPath, "completed");
  upsertCodexEvent(config, "UserPromptSubmit", commandPath, "progress");

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(config, null, 2)}\n`);
}

function matcherEntry(commandPath, eventName, matcher = "*", timeout) {
  return {
    matcher,
    hooks: [commandHook(commandPath, eventName, timeout)],
  };
}

function installClaudeHooks(filePath, commandPath) {
  const config = {
    hooks: {
      Notification: [matcherEntry(commandPath, "progress")],
      PermissionRequest: [matcherEntry(commandPath, "approval_requested", "*", 86_400)],
      PostToolUse: [matcherEntry(commandPath, "progress")],
      PreCompact: [matcherEntry(commandPath, "progress", "auto"), matcherEntry(commandPath, "progress", "manual")],
      PreToolUse: [matcherEntry(commandPath, "progress")],
      SessionEnd: [matcherEntry(commandPath, "removed")],
      SessionStart: [matcherEntry(commandPath, "started")],
      Stop: [matcherEntry(commandPath, "completed")],
      SubagentStop: [matcherEntry(commandPath, "completed")],
      UserPromptSubmit: [matcherEntry(commandPath, "progress")],
    },
  };

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(config, null, 2)}\n`);
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const root = path.resolve(options.root);
  const repoRoot = path.resolve(options.repoRoot);
  const binDir = path.join(root, "bin");
  const codexHook = path.join(binDir, "phoenix-pet-codex-hook");
  const claudeHook = path.join(binDir, "phoenix-pet-claude-hook");
  const codexTemplate = path.join(repoRoot, "templates", "hooks", "codex-hook.sh");
  const claudeTemplate = path.join(repoRoot, "templates", "hooks", "claude-hook.sh");

  writeExecutable(codexHook, codexTemplate);
  writeExecutable(claudeHook, claudeTemplate);
  installCodexHooks(path.resolve(options.codexHooksPath), codexHook);
  installClaudeHooks(path.resolve(options.claudeHooksPath), claudeHook);

  console.log(
    JSON.stringify(
      {
        root,
        installed: {
          codexHook,
          claudeHook,
          codexHooks: path.resolve(options.codexHooksPath),
          claudeHooks: path.resolve(options.claudeHooksPath),
        },
      },
      null,
      2,
    ),
  );
}

main();
