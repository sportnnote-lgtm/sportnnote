#!/usr/bin/env bash
# Push a JS-only update to installed Android APKs (EAS Update, channel "preview").
# Phones download it on next open and run it on the open after that.
#
# Only for changes WITHOUT new native modules/config — those need a new APK
# (`npx eas-cli build -p android --profile preview`). Builds against the LIVE
# backend from .env.local / .env.local.bak and refuses to publish a demo build.
# Usage: scripts/publish-android-ota.sh "What changed"
set -euo pipefail
cd "$(dirname "$0")/.."
MSG="${1:?Usage: scripts/publish-android-ota.sh \"What changed\"}"

ENV_FILE=""
for f in .env.local .env.local.bak; do [ -f "$f" ] && { ENV_FILE="$f"; break; }; done
[ -n "$ENV_FILE" ] || { echo "No .env.local / .env.local.bak with live keys found." >&2; exit 1; }
while IFS= read -r line; do
  key="${line%%=*}"; val="${line#*=}"
  val="${val%\"}"; val="${val#\"}"; val="${val%\'}"; val="${val#\'}"
  export "$key=$val"
done < <(grep -E '^EXPO_PUBLIC_SUPABASE_[A-Z0-9_]+=' "$ENV_FILE")
[ -n "${EXPO_PUBLIC_SUPABASE_URL:-}" ] || { echo "EXPO_PUBLIC_SUPABASE_URL missing in $ENV_FILE" >&2; exit 1; }

# hermesc (the Android bytecode compiler) — its macOS binary has gone missing
# from node_modules before; fail early with the fix rather than mid-build.
[ -x node_modules/hermes-compiler/hermesc/osx-bin/hermesc ] || {
  echo "ABORT: node_modules/hermes-compiler/hermesc/osx-bin/hermesc is missing — run: npm ci" >&2; exit 1; }

rm -rf dist-ota
EXPO_NO_DOTENV=1 npx expo export --platform android --clear --output-dir dist-ota

host="${EXPO_PUBLIC_SUPABASE_URL#https://}"
# Search the bytecode file directly (a `strings | grep -q` pipe can trip
# pipefail with SIGPIPE and report a false "missing").
if ! LC_ALL=C grep -qaF "$host" dist-ota/_expo/static/js/android/*.hbc; then
  echo "ABORT: the bundle doesn't contain the live Supabase URL (would run in demo mode)." >&2
  exit 1
fi
echo "✓ bundle contains the live backend URL"

npx eas-cli update --channel preview --environment preview --platform android \
  --skip-bundler --input-dir dist-ota --message "$MSG" --non-interactive
