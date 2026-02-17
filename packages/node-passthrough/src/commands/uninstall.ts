/**
 * Uninstall command for the passthrough tunnel
 *
 * Removes the launchd plist and optionally the SSH keys and config.
 */

import { existsSync } from "node:fs";
import { unlink } from "node:fs/promises";
import { confirm } from "@inquirer/prompts";
import { execa } from "execa";

import { loadConfig, getPlistPath, getConfigPath } from "../config.js";

/**
 * Uninstall the passthrough tunnel
 */
export async function uninstall(): Promise<void> {
    console.log("--- Uninstall Passthrough Tunnel ---");
    console.log("");

    const config = await loadConfig();
    const plistPath = getPlistPath();
    const configPath = getConfigPath();

    // Step 1: Unload and remove LaunchAgent
    if (existsSync(plistPath)) {
        console.log("Stopping and removing LaunchAgent...");
        try {
            await execa("launchctl", ["unload", plistPath]);
        } catch {
            // May not be loaded
        }
        await unlink(plistPath);
        console.log("LaunchAgent removed.");
    } else {
        console.log("LaunchAgent not found (already removed).");
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

    console.log("");
    console.log("Passthrough tunnel uninstalled.");
    console.log("");
    console.log("Note: The 'passthrough' user on the VPS is managed by Pulumi.");
    console.log("To remove it, set syncreeper:passthrough-enabled to false and run 'pulumi up'.");
    console.log("");
}
