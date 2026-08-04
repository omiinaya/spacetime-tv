#!/usr/bin/env bash
# Spacetime-TV backup/restore — single-user state snapshot.
#
# Backs up everything that is NOT in git and would otherwise be lost:
#   - server/.env                       (IPTV creds, admin key, STV_HOST)
#   - server/data/.encrypt_key          (Fernet key — REQUIRED to decrypt
#                                        stored provider passwords at rest)
#   - server/data/providers.json        (provider config)
#   - server/data/profiles.json         (profiles + PIN hashes)
#   - server/data/stream_hits.json      (per-stream hit counters)
#   - server/data/watch_progress.json   (continue-watching position)
#   - server/data/recordings/           (scheduled/recorded shows + meta)
#   - server/data/cache/                (image disk cache)
#   - server/epg_cache.json             (EPG schedule cache)
#
# Usage:
#   server/scripts/backup.sh                  → backups/backup-<ts>.tar.gz
#   server/scripts/backup.sh --restore /path/to/backup-<ts>.tar.gz
#
# Rotation: keeps the newest BACKUP_KEEP (default 14) archives.
# The archive is plain tar.gz — inspect with:
#   tar tzf backups/backup-<ts>.tar.gz
# NOTE: contains plaintext credentials + the Fernet key. Store it securely
# (restricted permissions; ideally off-machine). Do NOT commit to git.

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Script lives at <project>/server/scripts/backup.sh → ROOT is two up.
ROOT="$(cd "$HERE/../.." && pwd)"
SERVER_DIR="$ROOT/server"
BACKUP_DIR="$ROOT/backups"
BACKUP_KEEP="${BACKUP_KEEP:-14}"

usage() {
  sed -n '2,16p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
  exit 1
}

restore() {
  local archive="$1"
  if [ ! -f "$archive" ]; then
    echo "✗ backup archive not found: $archive" >&2
    exit 1
  fi
  # Back up the current state first (safety net) if any of it exists.
  [ -f "$SERVER_DIR/data/providers.json" ] || [ -f "$SERVER_DIR/epg_cache.json" ] \
    && { echo "→ snapshotting current state before restore..."; "$0"; }
  echo "→ restoring $archive into $SERVER_DIR"
  tar xzf "$archive" -C "$ROOT"
  echo "✓ restored. Restart spacetime-tv.service for the new state to load:"
  echo "    sudo systemctl restart spacetime-tv.service"
}

create() {
  mkdir -p "$BACKUP_DIR"
  local ts
  ts="$(date +%Y%m%d-%H%M%S)"
  local archive="$BACKUP_DIR/backup-$ts.tar.gz"

  # Presence checks — warn loudly if a critical file is missing.
  for f in "$SERVER_DIR/.env" "$SERVER_DIR/data/.encrypt_key" \
           "$SERVER_DIR/data/providers.json" "$SERVER_DIR/data/profiles.json"; do
    [ -f "$f" ] || echo "⚠  missing (state may be degraded): $f"
  done

  # Build file list: everything is gitignored and represents real state.
  local -a files=(".env")
  for d in ".encrypt_key" "providers.json" "profiles.json" \
           "stream_hits.json" "watch_progress.json" "recordings" "cache"; do
    [ -e "$SERVER_DIR/data/$d" ] && files+=("data/$d")
  done
  [ -e "$SERVER_DIR/epg_cache.json" ] && files+=("epg_cache.json")

  # Paths are relative to server/ so restore drops them back under server/.
  tar czf "$archive" -C "$SERVER_DIR" "${files[@]}"

  # Rotate old backups.
  ls -1t "$BACKUP_DIR"/backup-*.tar.gz 2>/dev/null | tail -n +$((BACKUP_KEEP + 1)) \
    | xargs -r rm -f

  echo "✓ backup → $archive ($(du -h "$archive" | cut -f1))"
  echo "  encrypted-at-rest keys + provider config + EPG included."
}

case "${1:-}" in
  --restore) [ $# -eq 2 ] || usage; restore "$2" ;;
  ""|--backup) create ;;
  *) usage ;;
esac