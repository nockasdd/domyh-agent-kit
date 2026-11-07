#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# AWF Session Hook: Auto-Persist Session Context
# Fires on Stop (agent finished) and SessionEnd (window closed / crash) —
# SessionEnd is the safety net for sessions that die before Stop fires.
# Compatible with: Claude Code, OpenAI Codex, Cursor, VS Code Copilot
#
# v2.1: Stop-loop safe — checks stop_hook_active, never emits additionalContext
#       on Stop/SessionEnd (which would block turn ending in Claude Code/Codex),
#       and updates session state in-place without unbounded file growth.
# ═══════════════════════════════════════════════════════════════

set -uo pipefail

# Drain stdin (Stop/SessionEnd may or may not send input)
STDIN_JSON=$(cat 2>/dev/null || true)

# Guard against Stop/SubagentStop re-entrancy loops in Claude Code / Codex:
# If stop_hook_active is true, return immediately so we never block turn termination.
if echo "$STDIN_JSON" | grep -qE '"stop_hook_active"[[:space:]]*:[[:space:]]*true' 2>/dev/null; then
  echo '{}'
  exit 0
fi

HOOK_EVENT="Stop"
case "$STDIN_JSON" in
  *SessionEnd*) HOOK_EVENT="SessionEnd" ;;
esac

# ── Check AWF installation ─────────────────────────────────
MEMORY_DIR=""
for candidate in ".agent/memory" ".claude/memory" ".cursor/memory"; do
  if [ -d "$candidate" ]; then
    MEMORY_DIR="$candidate"
    break
  fi
done

if [ -z "$MEMORY_DIR" ]; then
  echo '{}'
  exit 0
fi

SESSION_FILE="$MEMORY_DIR/session.md"
SNAPSHOT_FILE="$MEMORY_DIR/CONTEXT_SNAPSHOT.md"
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || date +"%Y-%m-%dT%H:%M:%SZ")

# ── Gather git context ────────────────────────────────────
BRANCH=$(git branch --show-current 2>/dev/null || echo "unknown")
DIRTY_COUNT=$(git status --porcelain 2>/dev/null | wc -l | tr -d ' ' || echo "0")
GIT_STATUS="clean"
if [ "$DIRTY_COUNT" -gt 0 ] 2>/dev/null; then
  GIT_STATUS="${DIRTY_COUNT} uncommitted"
fi

# Get changed files (max 10)
CHANGED_FILES=$(git status --porcelain 2>/dev/null | head -10 | sed 's/^...//') || true

# Get recent commits (last 3)
RECENT_COMMITS=$(git log --oneline -3 --no-decorate 2>/dev/null) || true

# ── Update session.md (in-place auto-save block to prevent bloat) ──
if [ -f "$SESSION_FILE" ]; then
  SESSION_SECTION="## Auto-Saved State (AWF Hook)
- **Updated**: $TIMESTAMP ($HOOK_EVENT)
- **Branch**: $BRANCH
- **Git**: $GIT_STATUS"
  if [ -n "$CHANGED_FILES" ]; then
    SESSION_SECTION="${SESSION_SECTION}
- **Files changed**:
$(echo "$CHANGED_FILES" | while IFS= read -r f; do [ -n "$f" ] && echo "  - $f"; done)"
  fi
  if [ -n "$RECENT_COMMITS" ]; then
    SESSION_SECTION="${SESSION_SECTION}
- **Recent commits**:
$(echo "$RECENT_COMMITS" | while IFS= read -r c; do [ -n "$c" ] && echo "  - $c"; done)"
  fi

  if grep -q "## Auto-Saved State (AWF Hook)" "$SESSION_FILE" 2>/dev/null; then
    sed -i '/## Auto-Saved State (AWF Hook)/,/^## [^A]/{ /^## [^A]/!d; }' "$SESSION_FILE" 2>/dev/null || true
    echo "$SESSION_SECTION" >> "$SESSION_FILE"
  else
    echo "" >> "$SESSION_FILE"
    echo "$SESSION_SECTION" >> "$SESSION_FILE"
  fi
fi

# ── Update CONTEXT_SNAPSHOT.md with latest state ──────────
if [ -f "$SNAPSHOT_FILE" ]; then
  SNAPSHOT_SECTION="## Session State (auto-updated $TIMESTAMP)

### Git Status
- Branch: $BRANCH
- Status: $GIT_STATUS
"
  if [ -n "$CHANGED_FILES" ]; then
    SNAPSHOT_SECTION="${SNAPSHOT_SECTION}
### Modified Files
$(echo "$CHANGED_FILES" | while IFS= read -r f; do [ -n "$f" ] && echo "- $f"; done)
"
  fi
  if [ -n "$RECENT_COMMITS" ]; then
    SNAPSHOT_SECTION="${SNAPSHOT_SECTION}
### Recent Commits
$(echo "$RECENT_COMMITS" | while IFS= read -r c; do [ -n "$c" ] && echo "- $c"; done)
"
  fi

  if grep -q "## Session State (auto-updated" "$SNAPSHOT_FILE" 2>/dev/null; then
    sed -i '/## Session State (auto-updated/,/^## [^S]/{ /^## [^S]/!d; }' "$SNAPSHOT_FILE" 2>/dev/null || true
    echo "$SNAPSHOT_SECTION" >> "$SNAPSHOT_FILE"
  else
    echo "" >> "$SNAPSHOT_FILE"
    echo "$SNAPSHOT_SECTION" >> "$SNAPSHOT_FILE"
  fi
fi

# ── Trigger auto-cleanup via HSA MCP if available ─────────
if [ -n "${HSA_MCP_PORT:-}" ] && [ "$HOOK_EVENT" = "SessionEnd" ]; then
  curl -s -X POST "http://127.0.0.1:$HSA_MCP_PORT/cleanup" --max-time 3 > /dev/null 2>&1 || true
fi

# ── Output JSON ────────────────────────────────────────────
# IMPORTANT: Do NOT output hookSpecificOutput or additionalContext on Stop/SessionEnd.
# In Claude Code & Codex, returning additionalContext from a Stop hook is interpreted
# as "Stop hook feedback" that blocks the turn from ending and forces a new LLM turn.
echo '{}'
exit 0
