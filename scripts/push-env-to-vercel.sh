#!/usr/bin/env bash
#
# Push the API's environment into Vercel, for Production and Preview.
#
# Run this yourself — it reads a file of live secrets and hands them to
# another service, which is a thing that should happen under your own hands
# and your own `vercel login`, not somebody else's.
#
#   ./scripts/push-env-to-vercel.sh ~/Downloads/priority-api.env
#
# It is idempotent: an existing value is removed and re-added, so running it
# twice is safe and re-running it after editing one line is the way to change
# that line.
#
# What it deliberately does NOT do: print any value. The names are echoed so
# you can see progress; the values go straight from the file into `vercel env
# add` over a pipe and never reach your terminal, your scrollback, or a log.
set -euo pipefail

FILE="${1:-}"
if [[ -z "$FILE" || ! -f "$FILE" ]]; then
  echo "usage: $0 <path-to-env-file>" >&2
  exit 1
fi

command -v vercel >/dev/null 2>&1 || {
  echo "The Vercel CLI is not installed. Either:" >&2
  echo "  npm i -g vercel && vercel login" >&2
  echo "or paste the file into Settings → Environment Variables in the dashboard." >&2
  exit 1
}

# NODE_ENV is Vercel's to set, and setting it by hand is how a production
# deployment ends up believing it is a development one — which in this API
# means secrets fall back to defaults instead of refusing to start.
SKIP=(NODE_ENV PORT VERCEL VERCEL_ENV)

while IFS= read -r line || [[ -n "$line" ]]; do
  # Blank lines and comments.
  [[ -z "${line//[[:space:]]/}" ]] && continue
  [[ "$line" =~ ^[[:space:]]*# ]] && continue
  [[ "$line" != *=* ]] && continue

  key="${line%%=*}"
  key="${key//[[:space:]]/}"
  value="${line#*=}"

  # Strip one layer of surrounding quotes — a .env file written by hand has
  # them on some lines and not others, and Vercel stores what it is given, so
  # a stray quote becomes part of the password.
  [[ "$value" == \"*\" && ${#value} -ge 2 ]] && value="${value:1:${#value}-2}"
  [[ "$value" == \'*\' && ${#value} -ge 2 ]] && value="${value:1:${#value}-2}"

  skip=false
  for s in "${SKIP[@]}"; do [[ "$key" == "$s" ]] && skip=true; done
  $skip && { echo "  skip   $key (Vercel sets this)"; continue; }

  for target in production preview; do
    # Remove first so this can be re-run. A missing variable makes `rm` fail,
    # which is fine and expected on the first pass.
    vercel env rm "$key" "$target" --yes >/dev/null 2>&1 || true
    printf '%s' "$value" | vercel env add "$key" "$target" >/dev/null 2>&1
  done
  echo "  set    $key  (production, preview)"
done < "$FILE"

echo
echo "Done. Redeploy so the functions pick them up:"
echo "  vercel --prod=false"
echo "or push any commit to the branch."
