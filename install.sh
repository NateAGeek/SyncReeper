#!/bin/bash
#
# SyncReeper Installation Script
#
# This script installs all prerequisites and sets up SyncReeper.
# Run with: curl -fsSL https://raw.githubusercontent.com/NateAGeek/SyncReeper/main/install.sh | bash
# Or locally: ./install.sh
#

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Ensure common bin paths are in PATH (for freshly installed tools)
export PATH="$HOME/.pulumi/bin:$HOME/.local/bin:/usr/local/bin:$PATH"

# NVM configuration
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
NVM_VERSION="v0.40.1"
NODE_VERSION="20"

# Source NVM if available
load_nvm() {
    export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
    # Use || true to prevent set -e from exiting if NVM files don't exist
    [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" || true
    [ -s "$NVM_DIR/bash_completion" ] && . "$NVM_DIR/bash_completion" || true
}
load_nvm

# Print functions
info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1"
    exit 1
}

# Detect OS
detect_os() {
    if [[ "$OSTYPE" == "linux-gnu"* ]]; then
        if command -v apt-get &> /dev/null; then
            OS="debian"
        elif command -v dnf &> /dev/null; then
            OS="fedora"
        elif command -v pacman &> /dev/null; then
            OS="arch"
        else
            OS="linux"
        fi
    elif [[ "$OSTYPE" == "darwin"* ]]; then
        OS="macos"
    elif [[ "$OSTYPE" == "msys" ]] || [[ "$OSTYPE" == "cygwin" ]] || [[ "$OSTYPE" == "win32" ]]; then
        OS="windows"
    else
        OS="unknown"
    fi
    echo "$OS"
}

# Check if command exists
command_exists() {
    command -v "$1" &> /dev/null
}

# Get Node.js version
get_node_version() {
    load_nvm
    if command_exists node; then
        node --version | sed 's/v//' | cut -d. -f1
    else
        echo "0"
    fi
}

# Install NVM and Node.js
install_nvm() {
    info "Installing NVM ${NVM_VERSION} and Node.js ${NODE_VERSION}..."

    case $OS in
        debian|fedora|arch|macos|linux)
            # Install NVM
            curl -o- "https://raw.githubusercontent.com/nvm-sh/nvm/${NVM_VERSION}/install.sh" | bash

            # Load NVM for current session
            load_nvm

            # Install Node.js
            info "Installing Node.js ${NODE_VERSION} via NVM..."
            nvm install "${NODE_VERSION}"
            nvm alias default "${NODE_VERSION}"
            nvm use default
            ;;
        windows)
            warn "On Windows, install NVM for Windows:"
            warn "  1. Download from: https://github.com/coreybutler/nvm-windows/releases"
            warn "  2. Run the installer (nvm-setup.exe)"
            warn "  3. Open a NEW terminal (cmd or PowerShell) and run:"
            warn "       nvm install ${NODE_VERSION}"
            warn "       nvm use ${NODE_VERSION}"
            warn "  4. Re-run this script."
            exit 1
            ;;
        *)
            error "Unsupported OS. Please install NVM manually from https://github.com/nvm-sh/nvm"
            ;;
    esac

    success "Node.js $(node --version) installed via NVM"
}

# Install Pulumi
install_pulumi() {
    info "Installing Pulumi CLI..."

    if [[ "$OS" == "windows" ]]; then
        warn "On Windows, install Pulumi using:"
        warn "  choco install pulumi"
        warn "Or download from https://www.pulumi.com/docs/get-started/install/"
        exit 1
    fi

    curl -fsSL https://get.pulumi.com | sh

    # Add to PATH for current session
    export PATH="$HOME/.pulumi/bin:$PATH"

    # Also add to shell profile for future sessions
    SHELL_NAME=$(basename "$SHELL")
    PROFILE_FILE=""

    case $SHELL_NAME in
        bash)
            if [[ -f "$HOME/.bashrc" ]]; then
                PROFILE_FILE="$HOME/.bashrc"
            elif [[ -f "$HOME/.bash_profile" ]]; then
                PROFILE_FILE="$HOME/.bash_profile"
            fi
            ;;
        zsh)
            PROFILE_FILE="$HOME/.zshrc"
            ;;
        fish)
            PROFILE_FILE="$HOME/.config/fish/config.fish"
            ;;
    esac

    if [[ -n "$PROFILE_FILE" ]] && [[ -f "$PROFILE_FILE" ]]; then
        if ! grep -q '.pulumi/bin' "$PROFILE_FILE" 2>/dev/null; then
            echo '' >> "$PROFILE_FILE"
            echo '# Pulumi' >> "$PROFILE_FILE"
            echo 'export PATH="$HOME/.pulumi/bin:$PATH"' >> "$PROFILE_FILE"
            info "Added Pulumi to PATH in $PROFILE_FILE"
        fi
    fi

    success "Pulumi $(pulumi version) installed"
}

# Install Homebrew (macOS)
install_homebrew() {
    info "Installing Homebrew..."

    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

    # Add Homebrew to PATH for current session
    if [[ -f "/opt/homebrew/bin/brew" ]]; then
        # Apple Silicon
        eval "$(/opt/homebrew/bin/brew shellenv)"
    elif [[ -f "/usr/local/bin/brew" ]]; then
        # Intel Mac
        eval "$(/usr/local/bin/brew shellenv)"
    fi

    success "Homebrew $(brew --version | head -1) installed"
}

# Install Git
install_git() {
    info "Installing Git..."

    case $OS in
        debian)
            sudo apt-get update
            sudo apt-get install -y git
            ;;
        fedora)
            sudo dnf install -y git
            ;;
        arch)
            sudo pacman -S --noconfirm git
            ;;
        macos)
            # Git comes with Xcode Command Line Tools
            xcode-select --install 2>/dev/null || true
            ;;
        *)
            error "Please install Git manually."
            ;;
    esac

    success "Git $(git --version | cut -d' ' -f3) installed"
}

# Main installation
main() {
    echo ""
    echo "=========================================="
    echo "       SyncReeper Installation Script     "
    echo "=========================================="
    echo ""

    # Detect OS
    OS=$(detect_os)
    info "Detected OS: $OS"

    # Check and install prerequisites
    echo ""
    info "Checking prerequisites..."
    echo ""

    # macOS-specific: Check Homebrew first
    if [[ "$OS" == "macos" ]]; then
        if command_exists brew; then
            success "Homebrew is installed ($(brew --version | head -1 | cut -d' ' -f2))"
        else
            install_homebrew
        fi
    fi

    # Check Git
    if command_exists git; then
        success "Git is installed ($(git --version | cut -d' ' -f3))"
    else
        install_git
    fi

    # Check Node.js (via NVM)
    load_nvm
    NODE_VERSION_INSTALLED=$(get_node_version)
    if [[ "$NODE_VERSION_INSTALLED" -ge 18 ]]; then
        success "Node.js is installed (v$NODE_VERSION_INSTALLED) via NVM"
    else
        if [[ "$NODE_VERSION_INSTALLED" -gt 0 ]]; then
            warn "Node.js v$NODE_VERSION_INSTALLED found, but v18+ is required"
        fi
        install_nvm
    fi

    # Check npm (NVM provides npm with Node.js)
    load_nvm
    if command_exists npm; then
        success "npm is installed ($(npm --version))"
    else
        error "npm not found. Please reinstall Node.js via NVM: nvm install ${NODE_VERSION}"
    fi

    # Check/install pnpm
    if command_exists pnpm; then
        success "pnpm is installed ($(pnpm --version))"
    else
        info "Installing pnpm..."
        npm install -g pnpm
        success "pnpm installed ($(pnpm --version))"
    fi

    # Check Pulumi
    if command_exists pulumi; then
        success "Pulumi is installed ($(pulumi version))"
    else
        install_pulumi
    fi

    # Ensure Pulumi is in PATH
    if ! command_exists pulumi; then
        export PATH="$HOME/.pulumi/bin:$PATH"
        if ! command_exists pulumi; then
            error "Pulumi installation failed. Please install manually from https://www.pulumi.com/docs/get-started/install/"
        fi
    fi

    echo ""
    info "All prerequisites installed!"
    echo ""

    # Install npm dependencies
    echo "=========================================="
    echo "       Installing Dependencies            "
    echo "=========================================="
    echo ""

    info "Installing all workspace dependencies..."
    pnpm install
    success "Dependencies installed"

    echo ""
    info "Building project..."
    info "  - Building shared utilities..."
    info "  - Building Pulumi infrastructure code..."
    info "  - Bundling sync application with Rollup..."
    pnpm run build
    success "Project built successfully"

    # Verify the sync bundle was created
    if [ -f "packages/sync/dist/bundle.js" ]; then
        BUNDLE_SIZE=$(du -h packages/sync/dist/bundle.js | cut -f1)
        success "Sync app bundle created (${BUNDLE_SIZE})"
    else
        error "Sync app bundle not found at packages/sync/dist/bundle.js"
    fi

    echo ""
    info "Running lint and format checks..."
    pnpm run check
    success "All checks passed"

    # Setup Pulumi
    echo ""
    echo "=========================================="
    echo "       Pulumi Setup                       "
    echo "=========================================="
    echo ""

    # Check if already logged in
    if pulumi whoami &> /dev/null; then
        PULUMI_USER=$(pulumi whoami)
        success "Already logged in to Pulumi as: $PULUMI_USER"
    else
        info "Setting up Pulumi with local backend..."
        info "(No Pulumi Cloud account required)"
        echo ""
        pulumi login --local
        success "Pulumi configured with local backend"
    fi

    # Check for existing configuration
    echo ""
    echo "=========================================="
    echo "       SyncReeper Configuration           "
    echo "=========================================="
    echo ""

    EXISTING_CONFIG=false
    SKIP_SETUP=false

    # Check if a stack exists and has configuration
    if pulumi stack --show-name &> /dev/null; then
        STACK_NAME=$(pulumi stack --show-name 2>/dev/null)

        # Check for key configuration values
        GITHUB_USER=$(pulumi config get syncreeper:github-username 2>/dev/null || echo "")
        GITHUB_TOKEN=$(pulumi config get syncreeper:github-token 2>/dev/null || echo "")

        if [[ -n "$GITHUB_USER" ]] && [[ -n "$GITHUB_TOKEN" ]]; then
            EXISTING_CONFIG=true
            success "Found existing configuration in stack: $STACK_NAME"
            echo ""
            info "Current configuration:"
            echo "  GitHub Username:     $GITHUB_USER"
            echo "  GitHub Token:        [secret]"

            # Show other config values if they exist
            REPOS_PATH=$(pulumi config get syncreeper:repos-path 2>/dev/null || echo "/srv/repos")
            SYNC_SCHEDULE=$(pulumi config get syncreeper:sync-schedule 2>/dev/null || echo "daily")
            FOLDER_ID=$(pulumi config get syncreeper:syncthing-folder-id 2>/dev/null || echo "repos")

            echo "  Repos Path:          $REPOS_PATH"
            echo "  Sync Schedule:       $SYNC_SCHEDULE"
            echo "  Syncthing Folder ID: $FOLDER_ID"
            echo ""

            # Ask user what to do
            echo "What would you like to do?"
            echo ""
            echo "  1) Keep existing configuration and continue"
            echo "  2) Reconfigure from scratch (run setup wizard)"
            echo "  3) Exit installation"
            echo ""
            read -p "Enter choice [1-3] (default: 1): " CONFIG_CHOICE
            CONFIG_CHOICE=${CONFIG_CHOICE:-1}

            case $CONFIG_CHOICE in
                1)
                    SKIP_SETUP=true
                    success "Keeping existing configuration"
                    ;;
                2)
                    SKIP_SETUP=false
                    warn "Will reconfigure from scratch"
                    ;;
                3)
                    info "Exiting installation. Your existing configuration is preserved."
                    echo ""
                    echo "To deploy with existing config, run:"
                    echo "  ${BLUE}pulumi up${NC}"
                    echo ""
                    exit 0
                    ;;
                *)
                    warn "Invalid choice, keeping existing configuration"
                    SKIP_SETUP=true
                    ;;
            esac
        fi
    fi

    # Run setup if needed
    if [[ "$SKIP_SETUP" == "false" ]]; then
        info "Starting interactive setup..."
        echo ""
        pnpm run setup
    fi

    # Done
    echo ""
    echo "=========================================="
    echo "       Installation Complete!             "
    echo "=========================================="
    echo ""
    success "SyncReeper has been installed and configured!"
    echo ""
    echo "Next steps:"
    echo ""
    echo "  1. Review your configuration:"
    echo "     ${BLUE}pulumi config${NC}"
    echo ""

    if [[ "$OS" == "macos" ]]; then
        echo "  2. Deploy SyncReeper locally on this Mac:"
        echo "     ${BLUE}pulumi up${NC}"
        echo ""
        echo "  3. Get your Mac's Syncthing device ID:"
        echo "     ${BLUE}~/.local/bin/syncreeper-device-id${NC}"
        echo ""
        echo "  4. Access Syncthing GUI at:"
        echo "     ${BLUE}http://localhost:8384${NC}"
    else
        echo "  2. SSH into your VPS and deploy:"
        echo "     ${BLUE}pulumi up${NC}"
        echo ""
        echo "  3. Get your VPS Syncthing device ID:"
        echo "     ${BLUE}pnpm run get-device-id${NC}"
    fi

    echo ""
    echo "  Add the device ID to Syncthing on your other machines"
    echo ""
    echo "For more information, see README.md"
    echo ""
}

# Run main function
main "$@"
