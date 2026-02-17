/**
 * Start command for the passthrough tunnel
 *
 * Loads the launchd plist to start the autossh tunnel.
 */

import { existsSync } from "node:fs";
import { execa } from "execa";

import { loadConfig, getPlistPath, DEFAULTS } from "../config.js";
import { generatePlistFromConfig } from "./helpers.js";

/**
 * Start the passthrough tunnel
 */
export async function start(): Promise<void> {
    const config = await loadConfig();
    if (!config) {
        console.error("Error: Passthrough tunnel is not set up yet.");
        console.error("Run 'setup' first to configure the tunnel.");
        process.exit(1);
    }

    const plistPath = getPlistPath();

    if (!existsSync(plistPath)) {
        console.log("LaunchAgent plist not found. Regenerating...");
        await generatePlistFromConfig(config);
    }

    try {
        // Try to load (start) the agent
        await execa("launchctl", ["load", plistPath]);
        console.log("Passthrough tunnel started.");
        console.log(
            `Tunnel: localhost:${config.tunnelPort} on VPS -> localhost:22 on this machine`
        );
        console.log(`VPS: ${config.tunnelUser}@${config.vpsAddress}:${config.vpsPort}`);
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        if (msg.includes("already loaded") || msg.includes("service already loaded")) {
            console.log("Passthrough tunnel is already running.");
        } else {
            console.error("Failed to start tunnel:", msg);
            process.exit(1);
        }
    }
}
