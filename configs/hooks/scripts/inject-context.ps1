# ═══════════════════════════════════════════════════════════════
# AWF SessionStart Hook: Project Context Injection (PowerShell)
# ═══════════════════════════════════════════════════════════════

$ErrorActionPreference = "SilentlyContinue"

# Drain stdin to prevent EPIPE on Windows
try { [Console]::In.ReadToEnd() | Out-Null } catch {}

# Read project info
$projectInfo = Split-Path -Leaf (Get-Location)
if (-not $projectInfo) { $projectInfo = "workspace" }
if (Test-Path "package.json") {
    $pkg = Get-Content "package.json" -Raw | ConvertFrom-Json
    if ($pkg.name -and $pkg.version) {
        $projectInfo = "$($pkg.name) v$($pkg.version)"
    } elseif ($pkg.name) {
        $projectInfo = "$($pkg.name)"
    }
}

# Git branch
$branch = git branch --show-current 2>$null
if (-not $branch) { $branch = "unknown" }

$lastCommit = git log -1 --format="%s" 2>$null
if (-not $lastCommit) { $lastCommit = "N/A" }

# Runtime version
$nodeVer = node -v 2>$null
if (-not $nodeVer) { $nodeVer = "not installed" }

# AWF version
$awfVer = "unknown"
$statePath = ".agent/memory/state.json"
if (Test-Path $statePath) {
    $state = Get-Content $statePath -Raw | ConvertFrom-Json
    if ($state.awfVersion) { $awfVer = $state.awfVersion }
}

$ctx = "AWF Session | Project: $projectInfo | Branch: $branch | Last commit: $lastCommit | Node: $nodeVer | AWF: $awfVer"
$output = @{
    hookSpecificOutput = @{
        hookEventName = "SessionStart"
        additionalContext = $ctx
    }
} | ConvertTo-Json -Depth 3 -Compress
Write-Output $output
exit 0
