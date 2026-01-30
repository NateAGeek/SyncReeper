/**
 * Packages Service - Consolidated package installation
 *
 * Installs ALL required system packages in a single apt operation.
 * This approach:
 * 1. Eliminates apt lock contention between services
 * 2. Runs apt-get update only once
 * 3. Provides clear separation between install and configure phases
 *
 * External repositories (NodeSource, Syncthing) are added before the install.
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
 * All packages required by SyncReeper services
 */
const REQUIRED_PACKAGES = [
    // Firewall
    "ufw",
    // Brute-force protection
    "sshguard",
    // Auto-updates
    "unattended-upgrades",
    "apt-listchanges",
    // Node.js (from NodeSource repo)
    "nodejs",
    // Syncthing (from Syncthing repo)
    "syncthing",
] as const;

/**
 * APT lock timeout in seconds (5 minutes)
 * Fallback in case unattended-upgrades is running in the background
 */
const APT_LOCK_TIMEOUT = 300;

/**
 * Generates the command to add external APT repositories
 * - NodeSource for Node.js 20.x
 * - Syncthing stable channel
 */
function generateAddRepositoriesCommand(): string {
    return `
# Add NodeSource repository for Node.js 20.x
if [ ! -f /etc/apt/sources.list.d/nodesource.list ]; then
    echo "Adding NodeSource repository..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
else
    echo "NodeSource repository already configured"
fi

# Add Syncthing repository
if [ ! -f /etc/apt/sources.list.d/syncthing.list ]; then
    echo "Adding Syncthing repository..."
    mkdir -p /etc/apt/keyrings
    curl -fsSL https://syncthing.net/release-key.gpg | gpg --dearmor -o /etc/apt/keyrings/syncthing.gpg
    echo "deb [signed-by=/etc/apt/keyrings/syncthing.gpg] https://apt.syncthing.net/ syncthing stable" | tee /etc/apt/sources.list.d/syncthing.list
else
    echo "Syncthing repository already configured"
fi

echo "External repositories configured"
`.trim();
}

/**
 * Generates the command to install all packages
 */
function generateInstallCommand(): string {
    const packageList = REQUIRED_PACKAGES.join(" ");

    return `
echo "Updating package lists..."
apt-get -o DPkg::Lock::Timeout=${APT_LOCK_TIMEOUT} update

echo "Installing packages: ${packageList}"
DEBIAN_FRONTEND=noninteractive apt-get -o DPkg::Lock::Timeout=${APT_LOCK_TIMEOUT} install -y ${packageList}

echo "Verifying installations..."
ufw --version
sshguard -v || echo "sshguard installed"
node --version
npm --version
syncthing --version

echo "All packages installed successfully"
`.trim();
}

/**
 * Generates the cleanup command for package removal
 */
function generateCleanupCommand(): string {
    return `
# Remove Syncthing repo
apt-get remove -y syncthing || true
rm -f /etc/apt/sources.list.d/syncthing.list
rm -f /etc/apt/keyrings/syncthing.gpg

# Note: We don't remove NodeSource repo or other packages
# as they might be needed by other services

echo "Cleanup complete"
`.trim();
}

/**
 * Sets up all required packages in a single operation
 *
 * This is the first phase of the deployment - all services
 * should depend on this completing before configuring themselves.
 */
export function setupPackages(options: SetupPackagesOptions = {}): SetupPackagesResult {
    const { dependsOn = [] } = options;
    const resources: pulumi.Resource[] = [];

    // Step 1: Add external repositories
    const addRepos = runCommand({
        name: "add-apt-repositories",
        create: generateAddRepositoriesCommand(),
        dependsOn,
    });
    resources.push(addRepos);

    // Step 2: Install all packages in one operation
    const installPackages = runCommand({
        name: "install-all-packages",
        create: generateInstallCommand(),
        delete: generateCleanupCommand(),
        dependsOn: [addRepos],
    });
    resources.push(installPackages);

    return { resources };
}

export { REQUIRED_PACKAGES };
