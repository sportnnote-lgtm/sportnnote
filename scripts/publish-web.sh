#!/usr/bin/env bash
# Publish the web app (iPhone pilot) to EAS Hosting → https://sportnnote.expo.app
#
# Builds against the LIVE backend: reads EXPO_PUBLIC_* from .env.local, or from
# .env.local.bak (where the live keys are parked while local dev runs in demo
# mode). Never prints the values. Usage:
#   scripts/publish-web.sh            # production (sportnnote.expo.app)
#   scripts/publish-web.sh --preview  # a throwaway preview URL instead
set -euo pipefail
cd "$(dirname "$0")/.."

ENV_FILE=""
for f in .env.local .env.local.bak; do [ -f "$f" ] && { ENV_FILE="$f"; break; }; done
[ -n "$ENV_FILE" ] || { echo "No .env.local / .env.local.bak with live keys found." >&2; exit 1; }

# Load only EXPO_PUBLIC_* lines, into this process's environment.
# (macOS ships bash 3.2, where `source <(…)` silently reads nothing — so read
# line by line, stripping optional surrounding quotes.)
while IFS= read -r line; do
  key="${line%%=*}"; val="${line#*=}"
  val="${val%\"}"; val="${val#\"}"; val="${val%\'}"; val="${val#\'}"
  export "$key=$val"
done < <(grep -E '^EXPO_PUBLIC_[A-Z0-9_]+=' "$ENV_FILE")
[ -n "${EXPO_PUBLIC_SUPABASE_URL:-}" ] || { echo "EXPO_PUBLIC_SUPABASE_URL missing in $ENV_FILE" >&2; exit 1; }
[ -n "${EXPO_PUBLIC_FIREBASE_API_KEY:-}" ] || echo "note: no EXPO_PUBLIC_FIREBASE_* — SMS phone verification will be off in this build"

rm -rf dist
# EXPO_NO_DOTENV: use exactly the variables loaded above, not whatever .env* is
# present. --clear: Metro's transform cache does NOT notice env changes, so a
# build right after a demo build would otherwise ship without the live keys.
EXPO_NO_DOTENV=1 npx expo export --platform web --clear

# Guard: never publish a build that silently fell back to demo mode.
host="${EXPO_PUBLIC_SUPABASE_URL#https://}"
if ! grep -rqF "$host" dist/_expo/static/js; then
  echo "ABORT: the build doesn't contain the live Supabase URL (would run in demo mode)." >&2
  exit 1
fi
echo "✓ build contains the live backend URL"
if [ "${1:-}" = "--preview" ]; then
  npx eas-cli deploy --non-interactive --no-source-maps
else
  npx eas-cli deploy --prod --non-interactive --no-source-maps
fi
