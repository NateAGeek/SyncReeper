/**
 * Linux package installation service
 *
 * Installs all required packages via apt-get in a single operation.
 * Also installs Node.js via NVM for the sync application.
 */

import type * as pulumi from "@pulumi/pulumi";
import { runCommand } from "../../lib/command";
import type { SetupPackagesOptions, SetupPackagesResult } from "./types";

/**
 * List of apt packages to install
 *
 * All packages are installed in a single apt operation to:
 * 1. Eliminate apt lock contention between services
 * 2. Reduce total installation time
 * 3. Ensure consistent package state
 */
const APT_PACKAGES = [
    // Security
    "ufw", // Firewall
    "sshguard", // Brute-force protection
    "unattended-upgrades", // Automatic security updates

    // Syncthing
    "syncthing", // File synchronization

    // Development tools
    "git", // Version control
    "curl", // HTTP client (needed for NVM)
    "ca-certificates", // SSL certificates
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
 * Sets up all required packages on Linux via apt-get
 * Also installs Node.js via NVM
 */
export function setupPackagesLinux(options: SetupPackagesOptions = {}): SetupPackagesResult {
    const { dependsOn = [] } = options;
    const resources: pulumi.Resource[] = [];

    // Update apt cache and install all packages in one operation
    const packageList = APT_PACKAGES.join(" ");
    const installPackages = runCommand({
        name: "install-apt-packages",
        create: `
            export DEBIAN_FRONTEND=noninteractive
            apt-get update
            apt-get install -y ${packageList}
            echo "Installed packages: ${packageList}"
        `.trim(),
        dependsOn,
    });
    resources.push(installPackages);

    // Install NVM and Node.js
    // NVM is installed to /usr/local so it's available system-wide
    const installNodejs = runCommand({
        name: "install-nodejs-nvm",
        create: `
            # Install NVM system-wide
            export NVM_DIR="/usr/local/nvm"
            mkdir -p "$NVM_DIR"
            
            # Download and install NVM
            curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v${NVM_VERSION}/install.sh | bash
            
            # Load NVM and install Node.js
            export NVM_DIR="/usr/local/nvm"
            [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
            
            nvm install ${NODE_VERSION}
            nvm use ${NODE_VERSION}
            nvm alias default ${NODE_VERSION}
            
            # Create symlink for system-wide access
            NODE_PATH=$(which node)
            ln -sf "$NODE_PATH" /usr/local/bin/node
            NPM_PATH=$(which npm)
            ln -sf "$NPM_PATH" /usr/local/bin/npm
            
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
            which ufw && echo "UFW: OK"
            which sshguard && echo "SSHGuard: OK"
            which syncthing && echo "Syncthing: OK"
            which git && echo "Git: OK"
            /usr/local/bin/node --version && echo "Node.js: OK"
            echo "All packages verified successfully"
        `.trim(),
        dependsOn: [installNodejs],
    });
    resources.push(verifyPackages);

    return { resources };
}
