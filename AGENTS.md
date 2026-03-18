# AGENTS

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

## Notes

- Keep the renderer minimal unless a concrete UI direction is agreed first.
- Prefer shadcn-style primitives in `src/components/ui`.
- Preserve the compact macOS-style density configured in `src/index.css`.
- Do not introduce platform targets other than macOS without explicit approval.
