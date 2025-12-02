# Railway CLI Wrapper Script - DevOps Tool
# Provides convenient interface for Railway deployment operations

param(
    [Parameter(Position=0)]
    [string]$Command,

    [Parameter(Position=1, ValueFromRemainingArguments=$true)]
    [string[]]$Args
)

$ErrorActionPreference = "Continue"

# Colors
function Write-Color {
    param([string]$Text, [string]$Color = "White")
    Write-Host $Text -ForegroundColor $Color
}

# Check if Railway CLI is installed
function Test-RailwayCLI {
    try {
        $null = railway --version 2>&1
        return $true
    } catch {
        return $false
    }
}

# Display usage
function Show-Usage {
    Write-Color "Railway CLI Wrapper - DevOps Tool" "Green"
    Write-Host ""
    Write-Color "USAGE:" "Cyan"
    Write-Host "    .\railway.wrapper.ps1 <command> [options]"
    Write-Host ""
    Write-Color "COMMANDS:" "Cyan"
    Write-Host "    logs [--service NAME] [-f]     View service logs"
    Write-Host "    db [-c QUERY] [-f FILE]        Database operations"
    Write-Host "    status                         Show project status"
    Write-Host "    services                       List all services"
    Write-Host "    deploy [--service NAME]        Deploy services"
    Write-Host "    deployments                    View deployment history"
    Write-Host "    env [--service NAME]           View environment variables"
    Write-Host "    restart --service NAME         Restart a service"
    Write-Host "    link                           Link to Railway project"
    Write-Host "    open                           Open Railway dashboard"
    Write-Host "    help                           Show this help"
    Write-Host ""
    Write-Color "EXAMPLES:" "Cyan"
    Write-Host "    .\railway.wrapper.ps1 logs --service chat-service"
    Write-Host "    .\railway.wrapper.ps1 db -c '\dt'"
    Write-Host "    .\railway.wrapper.ps1 db -f migrations/005_add_subscriptions_table.sql"
    Write-Host "    .\railway.wrapper.ps1 deploy"
    Write-Host ""
}

# Main logic
if (-not (Test-RailwayCLI)) {
    Write-Color "Error: Railway CLI not found. Install with: npm install -g @railway/cli" "Red"
    exit 1
}

switch ($Command) {
    "logs" {
        Write-Color "Fetching logs..." "Yellow"
        $logArgs = @()
        $i = 0
        while ($i -lt $Args.Count) {
            switch ($Args[$i]) {
                "--service" {
                    $i++
                    $logArgs += "--service"
                    $logArgs += $Args[$i]
                }
                "-f" {
                    $logArgs += "--follow"
                }
                default {
                    $logArgs += $Args[$i]
                }
            }
            $i++
        }
        railway logs @logArgs
    }

    "db" {
        # Parse db-specific arguments
        $query = $null
        $file = $null
        $i = 0
        while ($i -lt $Args.Count) {
            switch ($Args[$i]) {
                "-c" {
                    $i++
                    $query = $Args[$i]
                }
                "-f" {
                    $i++
                    $file = $Args[$i]
                }
            }
            $i++
        }

        if ($query) {
            Write-Color "Running query..." "Yellow"
            Write-Host $query
            Write-Host ""
            echo $query | railway connect postgres
        } elseif ($file) {
            if (Test-Path $file) {
                Write-Color "Running SQL file: $file" "Yellow"
                Get-Content $file -Raw | railway connect postgres
            } else {
                Write-Color "Error: File not found: $file" "Red"
                exit 1
            }
        } else {
            Write-Color "Connecting to database..." "Yellow"
            railway connect postgres
        }
    }

    "status" {
        Write-Color "Project Status:" "Green"
        railway status
    }

    "services" {
        Write-Color "Services:" "Green"
        railway status
    }

    "deploy" {
        Write-Color "Deploying..." "Yellow"
        railway up $Args
    }

    "deployments" {
        Write-Color "Deployment History:" "Green"
        railway deployment $Args
    }

    "env" {
        Write-Color "Environment Variables:" "Green"
        railway variables $Args
    }

    "restart" {
        Write-Color "Restarting service..." "Yellow"
        railway redeploy $Args
    }

    "service" {
        Write-Color "Linking service..." "Yellow"
        railway service $Args
    }

    "link" {
        Write-Color "Linking to Railway project..." "Yellow"
        railway link
    }

    "open" {
        Write-Color "Opening Railway dashboard..." "Green"
        railway open
    }

    "help" {
        Show-Usage
    }

    "" {
        Show-Usage
    }

    default {
        Write-Color "Unknown command: $Command" "Red"
        Write-Host "Run '.\railway.wrapper.ps1 help' for usage"
        exit 1
    }
}
