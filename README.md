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
- `pnpm publish:mac`: build and publish release artifacts using the S3 config

## S3 publishing

`electron-builder.yml` is set to publish to S3 with:

- `DEV6_S3_BUCKET`
- `DEV6_S3_REGION`

For a truly private auto-update flow, plan the runtime fetch path before shipping. A private bucket typically needs one of these:

- a protected proxy endpoint
- signed URLs issued by your backend
- a distribution layer in front of S3

## Shipping notes

Before production distribution on macOS, add:

- Apple Developer signing identity
- notarization credentials
- CI secrets for publishing and signing
