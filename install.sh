#!/bin/bash
#
# SyncReeper Installation Script
#
# This script installs all prerequisites and sets up SyncReeper.
# Run with: curl -fsSL https://raw.githubusercontent.com/yourusername/SyncReeper/main/install.sh | bash
# Or locally: ./install.sh
#

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

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
    if command_exists node; then
        node --version | sed 's/v//' | cut -d. -f1
    else
        echo "0"
    fi
}

# Install Node.js
install_nodejs() {
    info "Installing Node.js..."
    
    case $OS in
        debian)
            curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
            sudo apt-get install -y nodejs
            ;;
        fedora)
            sudo dnf install -y nodejs npm
            ;;
        arch)
            sudo pacman -S --noconfirm nodejs npm
            ;;
        macos)
            if command_exists brew; then
                brew install node
            else
                error "Homebrew not found. Install from https://brew.sh first, or install Node.js manually."
            fi
            ;;
        windows)
            warn "Please install Node.js manually from https://nodejs.org"
            warn "Then re-run this script."
            exit 1
            ;;
        *)
            error "Unsupported OS. Please install Node.js 18+ manually."
            ;;
    esac
    
    success "Node.js $(node --version) installed"
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
    
    success "Pulumi $(pulumi version) installed"
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
    
    # Check Git
    if command_exists git; then
        success "Git is installed ($(git --version | cut -d' ' -f3))"
    else
        install_git
    fi
    
    # Check Node.js
    NODE_VERSION=$(get_node_version)
    if [[ "$NODE_VERSION" -ge 18 ]]; then
        success "Node.js is installed (v$NODE_VERSION)"
    else
        if [[ "$NODE_VERSION" -gt 0 ]]; then
            warn "Node.js v$NODE_VERSION found, but v18+ is required"
        fi
        install_nodejs
    fi
    
    # Check npm
    if command_exists npm; then
        success "npm is installed ($(npm --version))"
    else
        error "npm not found. Please reinstall Node.js."
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
    
    info "Installing main project dependencies..."
    npm install
    success "Main dependencies installed"
    
    info "Installing sync application dependencies..."
    cd sync
    npm install
    cd ..
    success "Sync dependencies installed"
    
    echo ""
    info "Building project..."
    npm run build:all
    success "Project built successfully"
    
    echo ""
    info "Running lint and format checks..."
    npm run check
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
    
    # Run interactive setup
    echo ""
    echo "=========================================="
    echo "       SyncReeper Configuration           "
    echo "=========================================="
    echo ""
    
    info "Starting interactive setup..."
    echo ""
    
    npm run setup
    
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
    echo "  2. SSH into your VPS and deploy:"
    echo "     ${BLUE}pulumi up${NC}"
    echo ""
    echo "  3. Get your VPS Syncthing device ID:"
    echo "     ${BLUE}npm run get-device-id${NC}"
    echo ""
    echo "  4. Add the device ID to Syncthing on your other machines"
    echo ""
    echo "For more information, see README.md"
    echo ""
}

# Run main function
main "$@"
