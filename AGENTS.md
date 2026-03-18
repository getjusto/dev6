# AGENTS

This is an electron app made for Engineer in Justo company to help them develop and organize code

## Project

- App: `dev6`
- Stack: Electron, Vite, React, TypeScript
- UI base: Tailwind CSS v4 and shadcn-style components
- Packaging: `electron-builder`
- Updates: `electron-updater`
- Distribution target: macOS only

## Development

- Package manager: `pnpm`
- Start dev app: `pnpm dev`
- Lint: `pnpm lint`
- Build: `pnpm build`
- Package mac app: `pnpm dist:mac`

## callDev5

`callDev5(command)` is a Node.js function in `electron/main.ts` that runs `./dev5 <command> --json` inside the configured `servicesPath` directory (the `getjusto/justo-services` repo). It returns parsed JSON.

- **Location**: `electron/main.ts`
- **Signature**: `callDev5(command: string): unknown`
- **Behavior**: Runs `./dev5 <command> --json` synchronously via `execSync` in the services folder, parses and returns the JSON output.
- **Requires**: `servicesPath` to be configured in settings (set during the welcome screen).
- **Usage**: Call from IPC handlers in the main process. Expose results to the renderer via `ipcMain.handle`.

Example — adding a new IPC handler that calls dev5:

```ts
// in electron/main.ts, inside app.whenReady()
ipcMain.handle('dev5:list-services', () => {
  return callDev5('list-services')
})
```

Then expose in `electron/preload.ts` and add types in `src/vite-env.d.ts`.

## Notes

- Keep the renderer minimal unless a concrete UI direction is agreed first.
- Prefer shadcn-style primitives in `src/components/ui`.
- Preserve the compact macOS-style density configured in `src/index.css`.
- Do not introduce platform targets other than macOS without explicit approval.
