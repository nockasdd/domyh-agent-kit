# ═══════════════════════════════════════════════════════════════
# AWF Session Hook: Auto-Persist Session Context (PowerShell)
# Fires on Stop (agent finished) and SessionEnd (window closed / crash) —
# SessionEnd is the safety net for sessions that die before Stop fires.
# Compatible with: Claude Code, OpenAI Codex, Cursor, VS Code Copilot (Windows)
#
# v2.1: Stop-loop safe — checks stop_hook_active, never emits additionalContext
#       on Stop/SessionEnd (which would block turn ending in Claude Code/Codex),
#       and updates session state in-place without unbounded file growth.
# ═══════════════════════════════════════════════════════════════

$ErrorActionPreference = "SilentlyContinue"

# Drain stdin
$stdinJson = ""
try { $stdinJson = [Console]::In.ReadToEnd() } catch {}

# Guard against Stop/SubagentStop re-entrancy loops in Claude Code / Codex:
# If stop_hook_active is true, return immediately so we never block turn termination.
if ($stdinJson -match '"stop_hook_active"\s*:\s*true') {
    Write-Output '{}'
    exit 0
}

$hookEvent = "Stop"
if ($stdinJson -match "SessionEnd") { $hookEvent = "SessionEnd" }

# ── Check AWF installation ─────────────────────────────────
$memoryDir = $null
foreach ($candidate in @(".agent\memory", ".claude\memory", ".cursor\memory")) {
    if (Test-Path $candidate) {
        $memoryDir = $candidate
        break
    }
}

if (-not $memoryDir) {
    Write-Output '{}'
    exit 0
}

$sessionFile = Join-Path $memoryDir "session.md"
$snapshotFile = Join-Path $memoryDir "CONTEXT_SNAPSHOT.md"
$timestamp = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")

# ── Gather git context ────────────────────────────────────
$branch = git branch --show-current 2>$null
if (-not $branch) { $branch = "unknown" }

$dirtyCount = 0
$gitStatus = "clean"
$changedFiles = @()
try {
    $porcelain = git status --porcelain 2>$null
    if ($porcelain) {
        $lines = $porcelain -split "`n" | Where-Object { $_ -match '\S' }
        $dirtyCount = $lines.Count
        $gitStatus = "$dirtyCount uncommitted"
        $changedFiles = $lines | ForEach-Object { ($_ -replace '^\s*\S+\s+', '').Trim() } | Select-Object -First 10
    }
} catch {}

# ── Gather recent commits (last 3) ───────────────────────
$recentCommits = @()
try {
    $logOutput = git log --oneline -3 --no-decorate 2>$null
    if ($logOutput) {
        $recentCommits = $logOutput -split "`n" | Where-Object { $_ -match '\S' } | Select-Object -First 3
    }
} catch {}

# ── Update session.md (in-place auto-save block to prevent bloat) ──
if (Test-Path $sessionFile) {
    $entry = @"
## Auto-Saved State (AWF Hook)
- **Updated**: $timestamp ($hookEvent)
- **Branch**: $branch
- **Git**: $gitStatus
"@
    if ($changedFiles.Count -gt 0) {
        $fileList = ($changedFiles | ForEach-Object { "  - $_" }) -join "`n"
        $entry += "`n- **Files changed**:`n$fileList"
    }
    if ($recentCommits.Count -gt 0) {
        $commitList = ($recentCommits | ForEach-Object { "  - $_" }) -join "`n"
        $entry += "`n- **Recent commits**:`n$commitList"
    }
    $entry += "`n"

    $existingSession = Get-Content $sessionFile -Raw -ErrorAction SilentlyContinue
    if ($existingSession -match '(?s)## Auto-Saved State \(AWF Hook\)(.+?)(?=## |\z)') {
        $updatedSession = $existingSession -replace '(?s)## Auto-Saved State \(AWF Hook\)(.+?)(?=## |\z)', $entry
        Set-Content $sessionFile $updatedSession -NoNewline -ErrorAction SilentlyContinue
    } else {
        Add-Content $sessionFile "`n$entry" -ErrorAction SilentlyContinue
    }
}

# ── Update CONTEXT_SNAPSHOT.md with latest state ──────────
if (Test-Path $snapshotFile) {
    $snapshotContent = @"
## Session State (auto-updated $timestamp)

### Git Status
- Branch: $branch
- Status: $gitStatus

"@
    if ($changedFiles.Count -gt 0) {
        $snapshotContent += "### Modified Files`n"
        foreach ($f in $changedFiles) {
            $snapshotContent += "- $f`n"
        }
        $snapshotContent += "`n"
    }
    if ($recentCommits.Count -gt 0) {
        $snapshotContent += "### Recent Commits`n"
        foreach ($c in $recentCommits) {
            $snapshotContent += "- $c`n"
        }
    }

    $existing = Get-Content $snapshotFile -Raw -ErrorAction SilentlyContinue
    if ($existing -match '(?s)## Session State \(auto-updated.*?\)(.+?)(?=## |\z)') {
        $updated = $existing -replace '(?s)## Session State \(auto-updated.*?\)(.+?)(?=## |\z)', $snapshotContent
        Set-Content $snapshotFile $updated -NoNewline -ErrorAction SilentlyContinue
    } else {
        Add-Content $snapshotFile "`n$snapshotContent" -ErrorAction SilentlyContinue
    }
}

# ── Trigger auto-cleanup via HSA MCP if available ─────────
$hsaPort = $env:HSA_MCP_PORT
if ($hsaPort -and $hookEvent -eq "SessionEnd") {
    try {
        Invoke-RestMethod -Uri "http://127.0.0.1:$hsaPort/cleanup" -Method POST -TimeoutSec 3 2>$null | Out-Null
    } catch {}
}

# ── Output JSON ────────────────────────────────────────────
# IMPORTANT: Do NOT output hookSpecificOutput or additionalContext on Stop/SessionEnd.
# In Claude Code & Codex, returning additionalContext from a Stop hook is interpreted
# as "Stop hook feedback" that blocks the turn from ending and forces a new LLM turn.
Write-Output '{}'
exit 0
