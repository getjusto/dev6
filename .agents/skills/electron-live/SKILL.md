---
name: electron-live
description: Inspect the actual window of a running Electron app through its Chrome DevTools Protocol endpoint without opening a separate Chrome browser. Use when the user wants to inspect what is visible in the live Electron app, capture screenshots, read current DOM text, or debug a running Electron renderer directly.
---

# Electron Live Inspection

Use this skill when the user wants the real Electron app window, not a standalone browser tab.

## Preconditions

- The Electron app must expose a remote debugging port.
- In `dev6` development, the default port is `9222`.
- Prefer the bundled script over `agent-browser open ...` when the task is to inspect the live app.

## Workflow

1. List available targets:

```bash
node .agents/skills/electron-live/scripts/electron-cdp.mjs targets
```

2. Inspect the app target:

```bash
node .agents/skills/electron-live/scripts/electron-cdp.mjs inspect
```

This returns JSON with the current URL, title, visible body text, and an HTML snippet.

3. Capture a screenshot when visual confirmation matters:

```bash
node .agents/skills/electron-live/scripts/electron-cdp.mjs screenshot /tmp/electron-live.png
```

Then inspect the image locally if needed.

4. If multiple targets exist, narrow by title or URL:

```bash
node .agents/skills/electron-live/scripts/electron-cdp.mjs targets --match localhost
node .agents/skills/electron-live/scripts/electron-cdp.mjs inspect --match localhost
```

5. For ad hoc checks, evaluate JavaScript in the live renderer:

```bash
node .agents/skills/electron-live/scripts/electron-cdp.mjs eval "document.body.innerText"
```

## Target Selection Rules

- Ignore targets whose title is `DevTools`.
- Prefer `type: page`.
- If multiple app pages remain, choose the first one whose URL or title matches the user request.

## Notes

- If the target list is empty, confirm the app is running and listening on the CDP port.
- If the app is running but there is no CDP port, add `app.commandLine.appendSwitch('remote-debugging-port', '9222')` in the main process for development.
- Do not claim you saw the Electron app if you only opened the Vite URL in Chrome. Use the CDP target from the Electron process itself.
