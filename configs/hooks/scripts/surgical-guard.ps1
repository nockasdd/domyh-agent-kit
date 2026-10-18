#!/usr/bin/env pwsh
# surgical-guard.ps1 — PreToolUse hook enforcing SACRED_RULES.xml SURGICAL_001
#
# Triggers warning when an agent attempts to:
#   1. Edit > 50 lines in a single tool call (potential scope creep)
#   2. Modify > 5 files in a single batch (sweeping refactor without confirmation)
#   3. Delete files outside declared scope
#
# Override: set DOMYH_SURGICAL_OVERRIDE=1 to bypass (for legitimate large refactors).

param()

$ErrorActionPreference = "SilentlyContinue"

$payload = $null
try {
    $stdin = [Console]::In.ReadToEnd()
    if ($stdin) { $payload = $stdin | ConvertFrom-Json }
} catch {
    Write-Output '{"continue":true}'
    exit 0
}

if (-not $payload) {
    Write-Output '{"continue":true}'
    exit 0
}

if ($env:DOMYH_SURGICAL_OVERRIDE -eq "1") {
    Write-Output '{"continue":true}'
    exit 0
}

$tool = if ($payload.tool_name) { $payload.tool_name } else { $payload.tool }
$params = if ($payload.tool_input) { $payload.tool_input } else { $payload.params }
if (-not $params) {
    Write-Output '{"continue":true}'
    exit 0
}

$filePath = $params.file_path
if (-not $filePath) { $filePath = $params.TargetFile }
if (-not $filePath) { $filePath = $params.path }
if (-not $filePath -and $params.files -and $params.files.Count -gt 0) { $filePath = $params.files[0] }
if (-not $filePath) { $filePath = "target file" }

$warnings = @()

# ─── Check 1: Single-edit line count & style imposition ───
if ($tool -in @("Edit", "Write", "MultiEdit", "editFiles", "createFile", "write_to_file", "replace_file_content", "multi_replace_file_content")) {
    $oldStr = if ($params.old_string) { $params.old_string } elseif ($params.TargetContent) { $params.TargetContent } else { "" }
    $newStr = if ($params.new_string) { $params.new_string } elseif ($params.ReplacementContent) { $params.ReplacementContent } elseif ($params.CodeContent) { $params.CodeContent } elseif ($params.content) { $params.content } else { "" }
    $oldLines = if ($oldStr) { ($oldStr -split "`n").Count } else { 0 }
    $newLines = if ($newStr) { ($newStr -split "`n").Count } else { 0 }
    $delta = [Math]::Abs($newLines - $oldLines)

    if ($delta -gt 50) {
        $warnings += "[surgical-guard] SURGICAL_001 violation risk: editing $delta lines in $filePath (>50 lines suggests scope creep; ensure fix is at Producing Boundary)."
    }

    if ($oldStr -and $newStr) {
        $normalizedOld = $oldStr -replace '\s+', '' -replace '"', "'" -replace '`', "'"
        $normalizedNew = $newStr -replace '\s+', '' -replace '"', "'" -replace '`', "'"
        if ($normalizedOld -eq $normalizedNew -and $oldStr -ne $newStr) {
            $warnings += "[surgical-guard] SC-002 detected: style-only change (quotes/whitespace) in $filePath. Match existing style EXACTLY."
        }
    }
}

# ─── Check 2: Multi-file batch detection ───
if ($params.edits -and $params.edits.Count -gt 5) {
    $warnings += "[surgical-guard] Multi-file batch: $($params.edits.Count) edits in single call (>5 changes suggests sweeping refactor)."
}

# ─── Check 3: File deletion outside scope ───
if ($tool -in @("Bash", "runTerminalCommand", "execute", "run_command")) {
    $cmd = if ($params.command) { $params.command } elseif ($params.CommandLine) { $params.CommandLine } else { "" }
    if ($cmd -match "rm\s+(-rf?\s+|-fr?\s+)?[^\s|;&]+") {
        $target = $matches[0] -replace "rm\s+(-rf?\s+|-fr?\s+)?", ""
        $warnings += "[surgical-guard] DESTRUCTIVE: rm command targets '$target'. SAFE_001 requires explicit user confirmation."
    }
}

if ($warnings.Count -gt 0) {
    $out = @{
        hookSpecificOutput = @{
            hookEventName = "PreToolUse"
            additionalContext = ($warnings -join " ")
        }
    } | ConvertTo-Json -Depth 3 -Compress
    Write-Output $out
    exit 0
}

Write-Output '{"continue":true}'
exit 0
