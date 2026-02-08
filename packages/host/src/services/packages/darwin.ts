/**
 * macOS package installation service
 *
 * Installs all required packages via Homebrew.
 * Also installs Node.js via NVM for the sync application.
 * Assumes Homebrew is already installed (see install.sh).
 */

import type * as pulumi from "@pulumi/pulumi";
import { runCommand } from "../../lib/command";
import type { SetupPackagesOptions, SetupPackagesResult } from "./types";

/**
 * List of Homebrew packages to install
 *
 * Note: Some packages differ from Linux:
 * - No UFW (using pf for firewall)
 * - No unattended-upgrades (macOS handles its own updates)
 * - No Node.js (installed via NVM for consistency with Linux)
 */
const BREW_PACKAGES = [
    // Security
    "sshguard", // Brute-force protection (uses pf backend on macOS)

    // Syncthing
    "syncthing", // File synchronization

    // Development tools
    "git", // Version control
    "curl", // HTTP client (needed for NVM)
];

/**
 * Node.js version to install via NVM
 */
const NODE_VERSION = "22";

/**
 * NVM version to install
 */
const NVM_VERSION = "0.40.1";

/**
 * Sets up all required packages on macOS via Homebrew
 * Also installs Node.js via NVM
 */
export function setupPackagesDarwin(options: SetupPackagesOptions = {}): SetupPackagesResult {
    const { dependsOn = [] } = options;
    const resources: pulumi.Resource[] = [];

    // Update Homebrew and install all packages
    const packageList = BREW_PACKAGES.join(" ");
    const installPackages = runCommand({
        name: "install-brew-packages",
        create: `
            # Update Homebrew
            brew update
            
            # Install packages
            brew install ${packageList}
            
            echo "Installed packages: ${packageList}"
        `.trim(),
        dependsOn,
    });
    resources.push(installPackages);

    // Install NVM and Node.js
    // NVM is installed to ~/.nvm (user-level on macOS)
    const installNodejs = runCommand({
        name: "install-nodejs-nvm",
        create: `
            # Set NVM directory
            export NVM_DIR="$HOME/.nvm"
            mkdir -p "$NVM_DIR"
            
            # Download and install NVM if not already installed
            if [ ! -s "$NVM_DIR/nvm.sh" ]; then
                echo "Installing NVM..."
                curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v${NVM_VERSION}/install.sh | bash
            else
                echo "NVM already installed"
            fi
            
            # Load NVM
            export NVM_DIR="$HOME/.nvm"
            [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
            
            # Install Node.js
            nvm install ${NODE_VERSION}
            nvm use ${NODE_VERSION}
            nvm alias default ${NODE_VERSION}
            
            # Create symlink in ~/.local/bin for easy access
            mkdir -p "$HOME/.local/bin"
            NODE_PATH="$NVM_DIR/versions/node/$(nvm current)/bin/node"
            NPM_PATH="$NVM_DIR/versions/node/$(nvm current)/bin/npm"
            ln -sf "$NODE_PATH" "$HOME/.local/bin/node"
            ln -sf "$NPM_PATH" "$HOME/.local/bin/npm"
            
            # Verify installation
            echo "Node.js version: $(node --version)"
            echo "npm version: $(npm --version)"
        `.trim(),
        dependsOn: [installPackages],
    });
    resources.push(installNodejs);

    // Verify all packages are installed
    const verifyPackages = runCommand({
        name: "verify-packages",
        create: `
            echo "Verifying package installation..."
            which sshguard && echo "SSHGuard: OK"
            which syncthing && echo "Syncthing: OK"
            which git && echo "Git: OK"
            
            # Load NVM to verify Node.js
            export NVM_DIR="$HOME/.nvm"
            [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
            node --version && echo "Node.js: OK"
            
            echo "All packages verified successfully"
        `.trim(),
        dependsOn: [installNodejs],
    });
    resources.push(verifyPackages);

    return { resources };
}
