/**
 * Packages Service - Sequential package installation with progress visibility
 *
 * Installs required system packages as individual Pulumi resources.
 * This approach:
 * 1. Provides per-package progress visibility during deployment
 * 2. Chains packages sequentially to avoid apt lock contention
 * 3. Runs apt-get update only once before all package installs
 * 4. Each package has its own install/verify and delete commands
 *
 * External repositories (Syncthing) are added before the install.
 */

import type * as pulumi from "@pulumi/pulumi";
import { runCommand } from "../../lib/command.js";

export interface SetupPackagesOptions {
    /** Resources to depend on */
    dependsOn?: pulumi.Resource[];
}

export interface SetupPackagesResult {
    /** The Pulumi resources created */
    resources: pulumi.Resource[];
}

/**
 * Definition for an APT package to install
 */
interface PackageDefinition {
    /** Package name for apt-get install */
    name: string;
    /** Command to verify installation (optional - some packages don't have CLI) */
    verify?: string;
}

/**
 * All packages required by SyncReeper services
 * Each package is installed as a separate Pulumi resource for better progress visibility
 * Note: Node.js is installed via NVM, not APT
 */
const REQUIRED_PACKAGES: PackageDefinition[] = [
    // Firewall
    { name: "ufw", verify: "ufw --version" },
    // Brute-force protection
    { name: "sshguard", verify: "sshguard -v || echo 'sshguard installed'" },
    // Auto-updates
    { name: "unattended-upgrades", verify: "dpkg -s unattended-upgrades | grep Status" },
    { name: "apt-listchanges", verify: "dpkg -s apt-listchanges | grep Status" },
    // Syncthing (from Syncthing repo)
    { name: "syncthing", verify: "syncthing --version" },
];

/**
 * NVM and Node.js version configuration
 */
const NVM_VERSION = "v0.40.1";
const NODE_VERSION = "20";

/**
 * APT lock timeout in seconds (5 minutes)
 * Fallback in case unattended-upgrades is running in the background
 */
const APT_LOCK_TIMEOUT = 300;

/**
 * Generates the command to add external APT repositories
 * - Syncthing stable-v2 channel (per https://apt.syncthing.net/)
 */
function generateAddRepositoriesCommand(): string {
    return `
# Add Syncthing repository
if [ ! -f /etc/apt/sources.list.d/syncthing.list ]; then
    echo "Adding Syncthing repository..."
    mkdir -p /etc/apt/keyrings
    curl -L -o /etc/apt/keyrings/syncthing-archive-keyring.gpg https://syncthing.net/release-key.gpg
    echo "deb [signed-by=/etc/apt/keyrings/syncthing-archive-keyring.gpg] https://apt.syncthing.net/ syncthing stable-v2" | tee /etc/apt/sources.list.d/syncthing.list

    # Pin Syncthing packages to prefer this repository over distribution packages
    printf "Package: *\\nPin: origin apt.syncthing.net\\nPin-Priority: 990\\n" | tee /etc/apt/preferences.d/syncthing.pref
else
    echo "Syncthing repository already configured"
fi

echo "External repositories configured"
`.trim();
}

/**
 * Generates the command to install NVM and Node.js system-wide
 * NVM is installed to /opt/nvm and configured for all users via /etc/profile.d
 */
function generateInstallNvmCommand(): string {
    return `
# Install NVM system-wide
export NVM_DIR="/opt/nvm"

if [ ! -d "\${NVM_DIR}" ]; then
    echo "Installing NVM ${NVM_VERSION} system-wide..."
    mkdir -p "\${NVM_DIR}"

    # Download and install NVM
    curl -fsSL "https://raw.githubusercontent.com/nvm-sh/nvm/${NVM_VERSION}/install.sh" | bash

    # Source NVM for current session
    [ -s "\${NVM_DIR}/nvm.sh" ] && . "\${NVM_DIR}/nvm.sh"

    # Install Node.js ${NODE_VERSION}.x and set as default
    echo "Installing Node.js ${NODE_VERSION}.x..."
    nvm install ${NODE_VERSION}
    nvm alias default ${NODE_VERSION}
    nvm use default

    # Create system-wide profile script for all users
    cat > /etc/profile.d/nvm.sh << 'NVMPROFILE'
export NVM_DIR="/opt/nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
[ -s "$NVM_DIR/bash_completion" ] && . "$NVM_DIR/bash_completion"
NVMPROFILE
    chmod +x /etc/profile.d/nvm.sh

    # Create symlinks for system-wide access (for non-interactive shells/services)
    NODE_PATH="$(nvm which default)"
    NODE_BIN_DIR="$(dirname "\${NODE_PATH}")"
    ln -sf "\${NODE_PATH}" /usr/local/bin/node
    ln -sf "\${NODE_BIN_DIR}/npm" /usr/local/bin/npm
    ln -sf "\${NODE_BIN_DIR}/npx" /usr/local/bin/npx

    echo "NVM and Node.js installed system-wide"
else
    echo "NVM already installed at \${NVM_DIR}"
    # Ensure Node is available
    [ -s "\${NVM_DIR}/nvm.sh" ] && . "\${NVM_DIR}/nvm.sh"

    # Check if Node ${NODE_VERSION}.x is installed
    if ! nvm ls ${NODE_VERSION} > /dev/null 2>&1; then
        echo "Installing Node.js ${NODE_VERSION}.x..."
        nvm install ${NODE_VERSION}
        nvm alias default ${NODE_VERSION}

        # Update symlinks
        NODE_PATH="$(nvm which default)"
        NODE_BIN_DIR="$(dirname "\${NODE_PATH}")"
        ln -sf "\${NODE_PATH}" /usr/local/bin/node
        ln -sf "\${NODE_BIN_DIR}/npm" /usr/local/bin/npm
        ln -sf "\${NODE_BIN_DIR}/npx" /usr/local/bin/npx
    fi
fi

echo "Node.js version: $(node --version)"
echo "NPM version: $(npm --version)"
`.trim();
}

/**
 * Generates the command to install a single package with verification
 */
function generateInstallSinglePackageCommand(pkg: PackageDefinition): string {
    const verifyCmd = pkg.verify ? `echo "Verifying ${pkg.name}..."\n${pkg.verify}` : "";
    return `
echo "Installing ${pkg.name}..."
DEBIAN_FRONTEND=noninteractive apt-get -o DPkg::Lock::Timeout=${APT_LOCK_TIMEOUT} install -y ${pkg.name}
${verifyCmd}
echo "${pkg.name} installed successfully"
`.trim();
}

/**
 * Generates the command to remove a single package
 * Syncthing has special handling to also remove its repository files
 */
function generateRemoveSinglePackageCommand(pkg: PackageDefinition): string {
    if (pkg.name === "syncthing") {
        return `
apt-get remove -y syncthing || true
rm -f /etc/apt/sources.list.d/syncthing.list
rm -f /etc/apt/keyrings/syncthing-archive-keyring.gpg
rm -f /etc/apt/preferences.d/syncthing.pref
echo "syncthing and its repository removed"
`.trim();
    }
    return `apt-get remove -y ${pkg.name} || true`;
}

/**
 * Generates the cleanup command for NVM removal
 */
function generateNvmCleanupCommand(): string {
    return `
rm -rf /opt/nvm
rm -f /etc/profile.d/nvm.sh
rm -f /usr/local/bin/node
rm -f /usr/local/bin/npm
rm -f /usr/local/bin/npx
echo "NVM and Node.js removed"
`.trim();
}

/**
 * Sets up all required packages with individual resources for each package
 *
 * Each package is installed as a separate Pulumi resource, chained sequentially
 * to avoid apt lock conflicts. This provides better progress visibility during deployment.
 *
 * This is the first phase of the deployment - all services
 * should depend on this completing before configuring themselves.
 */
export function setupPackages(options: SetupPackagesOptions = {}): SetupPackagesResult {
    const { dependsOn = [] } = options;
    const resources: pulumi.Resource[] = [];

    // Step 1: Add external repositories (Syncthing)
    const addRepos = runCommand({
        name: "add-apt-repositories",
        create: generateAddRepositoriesCommand(),
        dependsOn,
    });
    resources.push(addRepos);

    // Step 2: Run apt-get update once
    const aptUpdate = runCommand({
        name: "apt-update",
        create: `echo "Updating package lists..." && apt-get -o DPkg::Lock::Timeout=${APT_LOCK_TIMEOUT} update`,
        dependsOn: [addRepos],
    });
    resources.push(aptUpdate);

    // Step 3: Install each package sequentially
    let previousResource: pulumi.Resource = aptUpdate;
    for (const pkg of REQUIRED_PACKAGES) {
        const installPkg = runCommand({
            name: `install-pkg-${pkg.name}`,
            create: generateInstallSinglePackageCommand(pkg),
            delete: generateRemoveSinglePackageCommand(pkg),
            dependsOn: [previousResource],
        });
        resources.push(installPkg);
        previousResource = installPkg;
    }

    // Step 4: Install NVM and Node.js system-wide
    const installNvm = runCommand({
        name: "install-nvm-node",
        create: generateInstallNvmCommand(),
        delete: generateNvmCleanupCommand(),
        dependsOn: [previousResource],
    });
    resources.push(installNvm);

    return { resources };
}

export { REQUIRED_PACKAGES };
