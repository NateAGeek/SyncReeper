/**
 * SyncReeper - Main Pulumi Orchestrator
 *
 * Configures a system (VPS or local macOS) to:
 * 1. Secure the system (firewall, SSHGuard, auto-updates)
 * 2. Clone and sync all GitHub repositories
 * 3. Sync repos across devices using Syncthing
 *
 * Deployment Phases:
 * 1. System Setup - Create user and directories
 * 2. Package Installation - Install required packages
 * 3. Security Hardening - Configure firewall, SSHGuard, auto-updates
 * 4. Application Services - Configure GitHub sync and Syncthing
 *
 * Supported Platforms:
 * - Linux (Ubuntu VPS) - Full security hardening with systemd services
 * - macOS (local) - Homebrew packages with launchd services
 *
 * Run with: pulumi up
 */

import { getConfig } from "./config/index";
import {
    logPlatformBanner,
    assertSupportedPlatform,
    isLinux,
    getPlatformDisplayName,
} from "./lib/platform";
import { getServiceUser, getPaths, getDefaultConfig } from "./config/types";

// Resources
import { createServiceUser } from "./resources/user";
import { createDirectories } from "./resources/directories";

// Services
import { setupPackages } from "./services/packages/index";
import { setupFirewall } from "./services/firewall/index";
import { setupSSH } from "./services/ssh/index";
import { setupSSHGuard } from "./services/sshguard/index";
import { setupAutoUpdates } from "./services/auto-updates/index";
import { setupGitHubSync } from "./services/github-sync/index";
import { setupSyncthing } from "./services/syncthing/index";

// ============================================================================
// Platform Check and Banner
// ============================================================================

// Log platform banner
logPlatformBanner();

// Ensure we're on a supported platform
assertSupportedPlatform();

// Get platform-aware configuration
const platformName = getPlatformDisplayName();
const serviceUserConfig = getServiceUser();
const pathsConfig = getPaths();

console.log(`Service user: ${serviceUserConfig.name}`);
console.log(`Home directory: ${serviceUserConfig.home}`);
console.log(`Repos path: ${getDefaultConfig().reposPath}`);
console.log("");

// Load configuration from Pulumi config
const config = getConfig();

// ============================================================================
// Phase 1: System Setup
// ============================================================================

// Create the service user (syncreeper on Linux, current user on macOS)
const serviceUser = createServiceUser();

// Create required directories
const directories = createDirectories({
    reposPath: config.sync.reposPath,
    dependsOn: [serviceUser.resource],
});

// ============================================================================
// Phase 2: Package Installation
// ============================================================================

// Install required packages (apt on Linux, Homebrew on macOS)
const packages = setupPackages({
    dependsOn: [serviceUser.resource],
});

// ============================================================================
// Phase 3: Security Hardening
// ============================================================================

// Configure firewall (UFW on Linux, pf on macOS)
const _firewall = setupFirewall({
    dependsOn: packages.resources,
});

// Harden SSH configuration (Linux only - on macOS, SSH is managed by System Preferences)
if (isLinux()) {
    const _ssh = setupSSH({
        authorizedKeys: config.ssh.authorizedKeys,
        dependsOn: [serviceUser.resource, ...packages.resources],
    });
}

// Setup SSHGuard for brute-force protection
const _sshguard = setupSSHGuard({
    dependsOn: packages.resources,
});

// Configure automatic security updates (Linux only - macOS handles its own updates)
const _autoUpdates = setupAutoUpdates({
    autoReboot: isLinux(), // Only auto-reboot on Linux VPS
    dependsOn: packages.resources,
});

// ============================================================================
// Phase 4: Application Services
// ============================================================================

// Setup GitHub repository sync
const _githubSync = setupGitHubSync({
    config,
    dependsOn: [directories.resource, ...packages.resources],
});

// Setup Syncthing for cross-device sync
const _syncthing = setupSyncthing({
    config,
    dependsOn: [directories.resource, ...packages.resources],
});

// ============================================================================
// Exports
// ============================================================================

// Generate platform-specific post-deployment instructions
function getPostDeploymentInstructions(): string {
    if (isLinux()) {
        return `
================================================================================
DEPLOYMENT COMPLETE - Linux VPS - Next Steps:
================================================================================

IMPORTANT: SSH ACCESS HAS BEEN HARDENED
- Password authentication is DISABLED
- Root login is DISABLED  
- Only the 'syncreeper' user can SSH in
- Connect with: ssh syncreeper@your-vps

1. TRIGGER INITIAL SYNC (required):
   The GitHub sync timer runs daily. To sync repositories immediately:
   
   sudo systemctl start syncreeper-sync.service
   
   Monitor progress with:
   journalctl -u syncreeper-sync -f

2. GET SYNCTHING DEVICE ID:
   Run this on your VPS to get the device ID for pairing:
   
   syncreeper-device-id

3. ACCESS SYNCTHING GUI:
   Create an SSH tunnel and open the web interface:
   
   ssh -L 8384:localhost:8384 syncreeper@your-vps
   Then open: http://localhost:8384

4. ADD VPS TO OTHER DEVICES:
   - Open Syncthing on your other devices
   - Add the VPS device using its device ID
   - Share the "repos" folder with it

================================================================================
`;
    }

    // macOS instructions
    return `
================================================================================
DEPLOYMENT COMPLETE - macOS - Next Steps:
================================================================================

1. TRIGGER INITIAL SYNC (required):
   The GitHub sync runs daily. To sync repositories immediately:
   
   ${pathsConfig.syncScript}

2. GET SYNCTHING DEVICE ID:
   Run this to get the device ID for pairing:
   
   ~/.local/bin/syncreeper-device-id

3. ACCESS SYNCTHING GUI:
   Open in your browser: http://localhost:8384

4. PAIR WITH OTHER DEVICES:
   - Open Syncthing on your other devices
   - Add this Mac using its device ID
   - Share the "repos" folder with it

5. MACOS AUTO-UPDATES:
   macOS handles system updates via System Preferences.
   Update Homebrew packages with: brew update && brew upgrade

================================================================================
`;
}

// Generate platform-specific commands
function getCommands(): Record<string, string> {
    if (isLinux()) {
        return {
            triggerSync: "sudo systemctl start syncreeper-sync.service",
            viewSyncLogs: "journalctl -u syncreeper-sync -f",
            getDeviceId: "syncreeper-device-id",
            checkFirewall: "sudo ufw status",
            checkSSH: "sudo sshd -T | grep -E 'passwordauthentication|permitrootlogin|allowusers'",
            checkSyncthing: `systemctl status syncthing@${serviceUser.username}`,
            checkSyncTimer: "systemctl list-timers syncreeper-sync.timer",
        };
    }

    // macOS commands
    return {
        triggerSync: pathsConfig.syncScript,
        viewSyncLogs: `tail -f ${pathsConfig.logDir}/sync.log`,
        getDeviceId: "~/.local/bin/syncreeper-device-id",
        checkFirewall: "sudo pfctl -s rules",
        checkSyncthing: "brew services list | grep syncthing",
        checkSyncTimer: "launchctl list | grep syncreeper",
    };
}

// Export useful information
export const outputs = {
    platform: platformName,
    serviceUser: serviceUser.username,
    reposPath: directories.reposPath,
    postDeploymentInstructions: getPostDeploymentInstructions(),
    commands: getCommands(),
};
