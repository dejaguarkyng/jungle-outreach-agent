#!/usr/bin/env bash
set -euo pipefail

test -f .env || cp .env.example .env
npm install
printf 'Setup complete. Review .env, then run npm run dev.\n'
