# dev6

Private macOS Electron starter for `getjusto/dev6`.

## Stack

- Electron `41`
- React `19`
- TypeScript `5.9`
- Vite `8`
- `electron-builder` for packaging and publishing
- `electron-updater` for runtime updates
- Tailwind CSS `4`
- `shadcn/ui` conventions and component structure

## Scripts

- `pnpm dev`: run the Vite renderer and Electron shell together
- `pnpm build`: build renderer and Electron bundles
- `pnpm dist:mac`: create a local macOS package in `release/`
- `pnpm publish:mac`: build and publish release artifacts to GitHub Releases

## GitHub publishing

`electron-builder.yml` is set to publish to GitHub Releases for `getjusto/dev6`.

The authenticated publish flow uses:

- `GH_TOKEN`
- `APPLE_ID`
- `APPLE_APP_SPECIFIC_PASSWORD` or `APPLE_PASSWORD`
- `APPLE_TEAM_ID`
- optional `CSC_NAME` to select a specific signing identity from Keychain

For the simplest `electron-updater` setup, keep the release artifacts publicly downloadable. The repository itself can remain private only if you do not rely on GitHub-hosted auto-updates for end users.

For local publishing on the current maintainer machine, use:

- `pnpm release:mac`

That script reads the GitHub token from `gh auth token`, defaults `CSC_NAME` to `Developer ID Application: Orionsoft SpA (3CZ24HA8DS)`, and maps `APPLE_PASSWORD` to `APPLE_APP_SPECIFIC_PASSWORD` for compatibility with the existing `dev4` flow.

To keep Apple credentials out of git, copy:

- `scripts/release-env.local.example.sh`

to:

- `scripts/release-env.local.sh`

and fill in the local environment variables there. Files ending in `.local` are ignored by git in this repo.

## Shipping notes

Before production distribution on macOS, add:

- Apple Developer signing identity
- notarization credentials
- GitHub release token
- CI secrets for publishing and signing
