#!/usr/bin/env bash
# surgical-guard.sh — PreToolUse hook enforcing SACRED_RULES.xml SURGICAL_001
#
# Triggers warning when an agent attempts to:
#   1. Edit > 50 lines in a single tool call (potential scope creep)
#   2. Modify > 5 files in a single batch
#   3. Delete files outside declared scope
#
# Override: set DOMYH_SURGICAL_OVERRIDE=1 to bypass.

set -uo pipefail

if [ "${DOMYH_SURGICAL_OVERRIDE:-}" = "1" ]; then
    echo '{"continue":true}'
    exit 0
fi

PAYLOAD=$(cat 2>/dev/null || true)
if [ -z "$PAYLOAD" ]; then
    echo '{"continue":true}'
    exit 0
fi

if ! command -v jq >/dev/null 2>&1; then
    echo '{"continue":true}'
    exit 0
fi

TOOL=$(echo "$PAYLOAD" | jq -r '.tool_name // .tool // empty' 2>/dev/null || echo "")
FILE_PATH=$(echo "$PAYLOAD" | jq -r '
  .tool_input.file_path //
  .tool_input.TargetFile //
  .tool_input.path //
  .tool_input.files[0] //
  .params.file_path //
  .params.TargetFile //
  .params.path //
  .params.files[0] //
  "target file"
' 2>/dev/null || echo "target file")

WARNINGS=""

# ─── Check 1: Single-edit line count & style imposition ───
case "$TOOL" in
    Edit|Write|MultiEdit|editFiles|createFile|write_to_file|replace_file_content|multi_replace_file_content)
        OLD_STR=$(echo "$PAYLOAD" | jq -r '.tool_input.old_string // .tool_input.TargetContent // .params.old_string // .params.TargetContent // ""' 2>/dev/null || echo "")
        NEW_STR=$(echo "$PAYLOAD" | jq -r '.tool_input.new_string // .tool_input.ReplacementContent // .tool_input.CodeContent // .tool_input.content // .params.new_string // .params.ReplacementContent // .params.CodeContent // .params.content // ""' 2>/dev/null || echo "")
        OLD_LINES=$(printf "%s" "$OLD_STR" | wc -l)
        NEW_LINES=$(printf "%s" "$NEW_STR" | wc -l)
        DELTA=$((NEW_LINES > OLD_LINES ? NEW_LINES - OLD_LINES : OLD_LINES - NEW_LINES))

        if [ "$DELTA" -gt 50 ]; then
            WARNINGS="${WARNINGS}[surgical-guard] SURGICAL_001 violation risk: editing ${DELTA} lines in ${FILE_PATH} (>50 lines suggests scope creep; ensure fix is at Producing Boundary). "
        fi

        if [ -n "$OLD_STR" ] && [ -n "$NEW_STR" ] && [ "$OLD_STR" != "$NEW_STR" ]; then
            NORM_OLD=$(printf "%s" "$OLD_STR" | tr -d '[:space:]' | tr '"`' "'")
            NORM_NEW=$(printf "%s" "$NEW_STR" | tr -d '[:space:]' | tr '"`' "'")
            if [ "$NORM_OLD" = "$NORM_NEW" ]; then
                WARNINGS="${WARNINGS}[surgical-guard] SC-002 detected: style-only change (quotes/whitespace) in ${FILE_PATH}. Match existing style EXACTLY. "
            fi
        fi
        ;;
esac

# ─── Check 2: Multi-file batch detection ───
EDIT_COUNT=$(echo "$PAYLOAD" | jq -r '(.tool_input.edits // .params.edits // []) | length' 2>/dev/null || echo "0")
if [ "${EDIT_COUNT:-0}" -gt 5 ]; then
    WARNINGS="${WARNINGS}[surgical-guard] Multi-file batch: ${EDIT_COUNT} edits in single call (>5 changes suggests sweeping refactor). "
fi

# ─── Check 3: File deletion outside scope ───
case "$TOOL" in
    Bash|runTerminalCommand|execute|run_command)
        CMD=$(echo "$PAYLOAD" | jq -r '.tool_input.command // .tool_input.CommandLine // .params.command // .params.CommandLine // empty' 2>/dev/null || echo "")
        if echo "$CMD" | grep -qE "rm\s+(-rf?|-fr?)?\s*[^|;&]+"; then
            TARGET=$(echo "$CMD" | grep -oE "rm\s+(-rf?|-fr?)?\s*[^|;&]+" | head -1)
            WARNINGS="${WARNINGS}[surgical-guard] DESTRUCTIVE: ${TARGET}. SAFE_001 requires explicit user confirmation. "
        fi
        ;;
esac

if [ -n "$WARNINGS" ]; then
    jq -n --arg ctx "$WARNINGS" '{hookSpecificOutput:{hookEventName:"PreToolUse",additionalContext:$ctx}}'
    exit 0
fi

echo '{"continue":true}'
exit 0
