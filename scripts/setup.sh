#!/usr/bin/env bash
set -euo pipefail

test -f .env || cp .env.example .env
npm install

api_key="$(sed -n 's/^JUNGLEGRID_API_KEY=//p' .env | tail -n 1)"
if [[ -z "$api_key" && -t 0 ]]; then
  read -r -s -p 'Jungle Grid API key: ' api_key
  printf '\n'
  printf '\nJUNGLEGRID_API_KEY=%s\n' "$api_key" >> .env
fi

if [[ -z "$api_key" ]]; then
  printf 'JUNGLEGRID_API_KEY is required. Add it to .env and rerun npm run setup.\n' >&2
  exit 1
fi

JUNGLEGRID_API_KEY="$api_key" npx tsx src/cli/verify-setup.ts
printf 'Setup complete. Run npm run dev.\n'
