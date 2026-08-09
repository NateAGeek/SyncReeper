/**
 * Uninstall command for the passthrough tunnel
 *
 * Removes the LaunchDaemon plist and optionally the SSH keys, config,
 * log directory, and power management settings.
 * Requires sudo for daemon and power management operations.
 */

import { existsSync } from "node:fs";
import { unlink } from "node:fs/promises";
import { confirm } from "@inquirer/prompts";
import { execa } from "execa";

import {
    loadConfig,
    getPlistPath,
    getConfigPath,
    getLegacyPlistPath,
    DEFAULTS,
} from "../config.js";

/**
 * Uninstall the passthrough tunnel
 */
export async function uninstall(): Promise<void> {
    console.log("--- Uninstall Passthrough Tunnel ---");
    console.log("");

    const config = await loadConfig();
    const plistPath = getPlistPath();
    const legacyPlistPath = getLegacyPlistPath();
    const configPath = getConfigPath();

    // Step 1: Unload and remove LaunchDaemon
    if (existsSync(plistPath)) {
        console.log("Stopping and removing LaunchDaemon...");
        try {
            await execa("sudo", ["launchctl", "unload", plistPath], { stdio: "inherit" });
        } catch {
            // May not be loaded
        }
        try {
            await execa("sudo", ["rm", plistPath], { stdio: "inherit" });
            console.log("LaunchDaemon removed.");
        } catch {
            console.error(`Failed to remove plist. You may need to remove it manually:`);
            console.error(`  sudo rm ${plistPath}`);
        }
    } else {
        console.log("LaunchDaemon not found (already removed).");
    }

    // Step 1b: Clean up legacy LaunchAgent if it still exists
    if (existsSync(legacyPlistPath)) {
        console.log("\nLegacy LaunchAgent found. Removing...");
        try {
            await execa("launchctl", ["unload", legacyPlistPath]);
        } catch {
            // May not be loaded
        }
        try {
            await unlink(legacyPlistPath);
            console.log("Legacy LaunchAgent removed.");
        } catch {
            console.log(`Note: Could not remove legacy plist. Remove manually:`);
            console.log(`  rm ${legacyPlistPath}`);
        }
    }

    // Step 2: Optionally remove SSH keys
    if (config?.keyPath && existsSync(config.keyPath)) {
        const removeKeys = await confirm({
            message: `Remove SSH keypair at ${config.keyPath}?`,
            default: false,
        });

        if (removeKeys) {
            await unlink(config.keyPath);
            const pubKeyPath = `${config.keyPath}.pub`;
            if (existsSync(pubKeyPath)) {
                await unlink(pubKeyPath);
            }
            console.log("SSH keypair removed.");
        } else {
            console.log("SSH keypair preserved.");
        }
    }

    // Step 3: Remove config file
    if (existsSync(configPath)) {
        await unlink(configPath);
        console.log("Configuration file removed.");
    }

    // Step 4: Clean up log directory
    if (existsSync(DEFAULTS.logDir)) {
        const removeLogs = await confirm({
            message: `Remove log directory at ${DEFAULTS.logDir}?`,
            default: true,
        });

        if (removeLogs) {
            try {
                await execa("sudo", ["rm", "-rf", DEFAULTS.logDir], { stdio: "inherit" });
                console.log("Log directory removed.");
            } catch {
                console.log(`Note: Could not remove log directory. Remove manually:`);
                console.log(`  sudo rm -rf ${DEFAULTS.logDir}`);
            }
        }
    }

    // Step 5: Optionally revert power management settings
    const revertPower = await confirm({
        message: "Revert power management settings to macOS defaults?",
        default: false,
    });

    if (revertPower) {
        console.log("\nReverting power settings to macOS defaults...\n");

        const defaults: Array<[string, string, string]> = [
            ["sleep", "1", "System sleep restored"],
            ["disksleep", "10", "Disk sleep restored (10 minutes)"],
            ["tcpkeepalive", "1", "TCP keepalive (kept enabled)"],
            ["powernap", "1", "Power Nap restored"],
            ["womp", "1", "Wake on LAN (kept enabled)"],
        ];

        for (const [flag, value, description] of defaults) {
            try {
                await execa("sudo", ["pmset", "-a", flag, value], { stdio: "inherit" });
                console.log(`  ${description}: OK`);
            } catch {
                console.log(`  ${description}: FAILED (try: sudo pmset -a ${flag} ${value})`);
            }
        }
        console.log("");
    }

    console.log("");
    console.log("Passthrough tunnel uninstalled.");
    console.log("");
    console.log("Note: The 'passthrough' user on the VPS is managed by Pulumi.");
    console.log("To remove it, set syncreeper:passthrough-enabled to false and run 'pulumi up'.");
    console.log("");
}
