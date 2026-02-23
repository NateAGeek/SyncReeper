#
# SyncReeper Installation Script for Windows
#
# Run with: .\install.ps1
# Or: powershell -ExecutionPolicy Bypass -File install.ps1
#

$ErrorActionPreference = "Stop"

# Colors
function Write-Info { param($msg) Write-Host "[INFO] " -ForegroundColor Blue -NoNewline; Write-Host $msg }
function Write-Success { param($msg) Write-Host "[SUCCESS] " -ForegroundColor Green -NoNewline; Write-Host $msg }
function Write-Warn { param($msg) Write-Host "[WARN] " -ForegroundColor Yellow -NoNewline; Write-Host $msg }
function Write-Error { param($msg) Write-Host "[ERROR] " -ForegroundColor Red -NoNewline; Write-Host $msg; exit 1 }

# Check if command exists
function Test-Command {
    param($cmd)
    return [bool](Get-Command $cmd -ErrorAction SilentlyContinue)
}

# Get Node.js major version
function Get-NodeVersion {
    if (Test-Command "node") {
        $version = node --version
        $major = $version -replace 'v(\d+)\..*', '$1'
        return [int]$major
    }
    return 0
}

# Check for winget
function Test-Winget {
    return Test-Command "winget"
}

# Check for choco
function Test-Choco {
    return Test-Command "choco"
}

# Install with winget
function Install-WithWinget {
    param($package, $name)
    Write-Info "Installing $name with winget..."
    winget install --id $package --accept-package-agreements --accept-source-agreements
}

# Install with choco
function Install-WithChoco {
    param($package, $name)
    Write-Info "Installing $name with Chocolatey..."
    choco install $package -y
}

# Install Node.js
function Install-NodeJS {
    Write-Info "Installing Node.js..."
    
    if (Test-Winget) {
        Install-WithWinget "OpenJS.NodeJS.LTS" "Node.js"
    } elseif (Test-Choco) {
        Install-WithChoco "nodejs-lts" "Node.js"
    } else {
        Write-Warn "Neither winget nor Chocolatey found."
        Write-Warn "Please install Node.js manually from https://nodejs.org"
        Write-Warn "Then re-run this script."
        exit 1
    }
    
    # Refresh PATH
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
    
    Write-Success "Node.js installed"
}

# Install Git
function Install-Git {
    Write-Info "Installing Git..."
    
    if (Test-Winget) {
        Install-WithWinget "Git.Git" "Git"
    } elseif (Test-Choco) {
        Install-WithChoco "git" "Git"
    } else {
        Write-Warn "Please install Git manually from https://git-scm.com"
        exit 1
    }
    
    # Refresh PATH
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
    
    Write-Success "Git installed"
}

# Install Pulumi
function Install-Pulumi {
    Write-Info "Installing Pulumi..."
    
    if (Test-Winget) {
        Install-WithWinget "Pulumi.Pulumi" "Pulumi"
    } elseif (Test-Choco) {
        Install-WithChoco "pulumi" "Pulumi"
    } else {
        Write-Info "Installing Pulumi via official installer..."
        iex ((New-Object System.Net.WebClient).DownloadString('https://get.pulumi.com/install.ps1'))
    }
    
    # Refresh PATH
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
    $env:Path = "$env:USERPROFILE\.pulumi\bin;$env:Path"
    
    Write-Success "Pulumi installed"
}

# Main
function Main {
    Write-Host ""
    Write-Host "==========================================" -ForegroundColor Cyan
    Write-Host "       SyncReeper Installation Script     " -ForegroundColor Cyan
    Write-Host "==========================================" -ForegroundColor Cyan
    Write-Host ""
    
    Write-Info "Detected OS: Windows"
    
    # Check prerequisites
    Write-Host ""
    Write-Info "Checking prerequisites..."
    Write-Host ""
    
    # Check Git
    if (Test-Command "git") {
        $gitVersion = git --version
        Write-Success "Git is installed ($gitVersion)"
    } else {
        Install-Git
    }
    
    # Check Node.js
    $nodeVersion = Get-NodeVersion
    if ($nodeVersion -ge 18) {
        Write-Success "Node.js is installed (v$nodeVersion)"
    } else {
        if ($nodeVersion -gt 0) {
            Write-Warn "Node.js v$nodeVersion found, but v18+ is required"
        }
        Install-NodeJS
    }
    
    # Check npm
    if (Test-Command "npm") {
        $npmVersion = npm --version
        Write-Success "npm is installed ($npmVersion)"
    } else {
        Write-Error "npm not found. Please reinstall Node.js."
    }
    
    # Check/install pnpm
    if (Test-Command "pnpm") {
        $pnpmVersion = pnpm --version
        Write-Success "pnpm is installed ($pnpmVersion)"
    } else {
        Write-Info "Installing pnpm..."
        npm install -g pnpm
        # Refresh PATH
        $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
        Write-Success "pnpm installed"
    }
    
    # Check Pulumi
    if (Test-Command "pulumi") {
        $pulumiVersion = pulumi version
        Write-Success "Pulumi is installed ($pulumiVersion)"
    } else {
        Install-Pulumi
    }
    
    # Verify Pulumi
    if (-not (Test-Command "pulumi")) {
        $env:Path = "$env:USERPROFILE\.pulumi\bin;$env:Path"
        if (-not (Test-Command "pulumi")) {
            Write-Error "Pulumi installation failed. Please install manually from https://www.pulumi.com/docs/get-started/install/"
        }
    }
    
    Write-Host ""
    Write-Success "All prerequisites installed!"
    Write-Host ""
    
    # Install npm dependencies
    Write-Host "==========================================" -ForegroundColor Cyan
    Write-Host "       Installing Dependencies            " -ForegroundColor Cyan
    Write-Host "==========================================" -ForegroundColor Cyan
    Write-Host ""
    
    Write-Info "Installing all workspace dependencies..."
    pnpm install
    Write-Success "Dependencies installed"
    
    Write-Host ""
    Write-Info "Building project..."
    pnpm run build
    Write-Success "Project built successfully"
    
    Write-Host ""
    Write-Info "Linking syncreeper CLI globally..."
    Push-Location packages/cli
    pnpm link --global
    Pop-Location
    Write-Success "syncreeper command is now available globally"
    
    Write-Host ""
    Write-Info "Running lint and format checks..."
    pnpm run check
    Write-Success "All checks passed"
    
    # Setup Pulumi
    Write-Host ""
    Write-Host "==========================================" -ForegroundColor Cyan
    Write-Host "       Pulumi Setup                       " -ForegroundColor Cyan
    Write-Host "==========================================" -ForegroundColor Cyan
    Write-Host ""
    
    # Check if already logged in
    $pulumiUser = pulumi whoami 2>$null
    if ($LASTEXITCODE -eq 0) {
        Write-Success "Already logged in to Pulumi as: $pulumiUser"
    } else {
        Write-Info "Setting up Pulumi with local backend..."
        Write-Info "(No Pulumi Cloud account required)"
        Write-Host ""
        pulumi login --local
        Write-Success "Pulumi configured with local backend"
    }
    
    # Run interactive setup
    Write-Host ""
    Write-Host "==========================================" -ForegroundColor Cyan
    Write-Host "       SyncReeper Configuration           " -ForegroundColor Cyan
    Write-Host "==========================================" -ForegroundColor Cyan
    Write-Host ""
    
    Write-Info "Starting interactive setup..."
    Write-Host ""
    
    pnpm run setup
    
    # Done
    Write-Host ""
    Write-Host "==========================================" -ForegroundColor Cyan
    Write-Host "       Installation Complete!             " -ForegroundColor Cyan
    Write-Host "==========================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Success "SyncReeper has been installed and configured!"
    Write-Host ""
    Write-Host "Next steps:" -ForegroundColor White
    Write-Host ""
    Write-Host "  1. Review your configuration:" -ForegroundColor White
    Write-Host "     pulumi config" -ForegroundColor Blue
    Write-Host ""
    Write-Host "  2. SSH into your VPS and deploy:" -ForegroundColor White
    Write-Host "     pulumi up" -ForegroundColor Blue
    Write-Host ""
    Write-Host "  3. Get your VPS Syncthing device ID:" -ForegroundColor White
    Write-Host "     pnpm run get-device-id" -ForegroundColor Blue
    Write-Host ""
    Write-Host "  4. Add the device ID to Syncthing on your other machines" -ForegroundColor White
    Write-Host ""
    Write-Host "For more information, see README.md" -ForegroundColor Gray
    Write-Host ""
}

# Run main
Main
