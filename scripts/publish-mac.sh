#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

LOCAL_ENV_FILE="$ROOT_DIR/scripts/release-env.local.sh"
if [ -f "$LOCAL_ENV_FILE" ]; then
  # shellcheck disable=SC1090
  source "$LOCAL_ENV_FILE"
fi

export CSC_NAME="${CSC_NAME:-Developer ID Application: Orionsoft SpA (3CZ24HA8DS)}"

if [ -z "${APPLE_APP_SPECIFIC_PASSWORD:-}" ] && [ -n "${APPLE_PASSWORD:-}" ]; then
  export APPLE_APP_SPECIFIC_PASSWORD="$APPLE_PASSWORD"
fi

required_vars=(
  APPLE_ID
  APPLE_APP_SPECIFIC_PASSWORD
  APPLE_TEAM_ID
)

for var_name in "${required_vars[@]}"; do
  if [ -z "${!var_name:-}" ]; then
    echo "Missing required environment variable: $var_name" >&2
    exit 1
  fi
done

if [ -z "${GH_TOKEN:-}" ]; then
  GH_TOKEN="$(gh auth token)"
  export GH_TOKEN
fi

VERSION="$(node -p "require('./package.json').version")"

echo "Publishing dev6 $VERSION to GitHub Releases"
echo "Using signing identity: $CSC_NAME"

pnpm publish:mac
