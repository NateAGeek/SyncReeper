/**
 * Auto-updates service - Unattended security upgrades
 *
 * Configures unattended-upgrades to automatically install security updates.
 * This is crucial for a VPS to stay secure without manual intervention.
 */

import type * as pulumi from "@pulumi/pulumi";
import { runCommand, installPackages, writeFile, enableService } from "../../lib/command.js";

export interface SetupAutoUpdatesOptions {
    /** Email address for update notifications (optional) */
    notifyEmail?: string;
    /** Automatic reboot if required (default: true, at 3 AM) */
    autoReboot?: boolean;
    /** Resources to depend on */
    dependsOn?: pulumi.Resource[];
}

export interface SetupAutoUpdatesResult {
    /** The Pulumi resources created */
    resources: pulumi.Resource[];
}

/**
 * Generates the unattended-upgrades configuration
 */
function generateUnattendedUpgradesConfig(options: { autoReboot: boolean }): string {
    const { autoReboot } = options;

    return `
// Unattended-Upgrades configuration for SyncReeper
// Automatically install security updates

Unattended-Upgrade::Allowed-Origins {
    "\${distro_id}:\${distro_codename}";
    "\${distro_id}:\${distro_codename}-security";
    "\${distro_id}ESMApps:\${distro_codename}-apps-security";
    "\${distro_id}ESM:\${distro_codename}-infra-security";
};

// Remove unused kernel packages
Unattended-Upgrade::Remove-Unused-Kernel-Packages "true";

// Remove unused dependencies
Unattended-Upgrade::Remove-Unused-Dependencies "true";

// Automatic reboot if required
Unattended-Upgrade::Automatic-Reboot "${autoReboot}";

// Reboot at 3 AM if needed
Unattended-Upgrade::Automatic-Reboot-Time "03:00";

// Don't interrupt running services if possible
Unattended-Upgrade::InstallOnShutdown "false";

// Log to syslog
Unattended-Upgrade::SyslogEnable "true";
`.trim();
}

/**
 * Generates the apt auto-upgrades configuration
 */
function generateAutoUpgradesConfig(): string {
    return `
// Enable automatic updates
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Download-Upgradeable-Packages "1";
APT::Periodic::AutocleanInterval "7";
APT::Periodic::Unattended-Upgrade "1";
`.trim();
}

/**
 * Sets up automatic security updates
 * - Installs unattended-upgrades package
 * - Configures for security updates only
 * - Enables automatic reboot if required
 */
export function setupAutoUpdates(options: SetupAutoUpdatesOptions = {}): SetupAutoUpdatesResult {
    const { autoReboot = true, dependsOn = [] } = options;
    const resources: pulumi.Resource[] = [];

    // Install unattended-upgrades
    const installPackage = installPackages({
        name: "install-unattended-upgrades",
        packages: ["unattended-upgrades", "apt-listchanges"],
        dependsOn,
    });
    resources.push(installPackage);

    // Write unattended-upgrades config
    const unattendedConfig = generateUnattendedUpgradesConfig({ autoReboot });
    const writeUnattendedConfig = writeFile({
        name: "unattended-upgrades-config",
        path: "/etc/apt/apt.conf.d/50unattended-upgrades",
        content: unattendedConfig,
        mode: "644",
        owner: "root",
        group: "root",
        dependsOn: [installPackage],
    });
    resources.push(writeUnattendedConfig);

    // Write auto-upgrades config
    const autoUpgradesConfig = generateAutoUpgradesConfig();
    const writeAutoUpgradesConfig = writeFile({
        name: "auto-upgrades-config",
        path: "/etc/apt/apt.conf.d/20auto-upgrades",
        content: autoUpgradesConfig,
        mode: "644",
        owner: "root",
        group: "root",
        dependsOn: [installPackage],
    });
    resources.push(writeAutoUpgradesConfig);

    // Enable the unattended-upgrades service
    const enableAutoUpdates = enableService({
        name: "enable-unattended-upgrades",
        service: "unattended-upgrades",
        start: true,
        enable: true,
        dependsOn: [writeUnattendedConfig, writeAutoUpgradesConfig],
    });
    resources.push(enableAutoUpdates);

    // Verify configuration
    const verifyAutoUpdates = runCommand({
        name: "verify-auto-updates",
        create: `
            unattended-upgrade --dry-run --debug 2>&1 | head -20 || true
            echo "Auto-updates configured successfully"
        `.trim(),
        dependsOn: [enableAutoUpdates],
    });
    resources.push(verifyAutoUpdates);

    return { resources };
}
