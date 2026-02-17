/**
 * Stop command for the passthrough tunnel
 *
 * Unloads the launchd plist to stop the autossh tunnel.
 */

import { existsSync } from "node:fs";
import { execa } from "execa";

import { getPlistPath } from "../config.js";

/**
 * Stop the passthrough tunnel
 */
export async function stop(): Promise<void> {
    const plistPath = getPlistPath();

    if (!existsSync(plistPath)) {
        console.log("Passthrough tunnel is not installed.");
        return;
    }

    try {
        await execa("launchctl", ["unload", plistPath]);
        console.log("Passthrough tunnel stopped.");
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        if (msg.includes("Could not find specified service")) {
            console.log("Passthrough tunnel is not running.");
        } else {
            console.error("Failed to stop tunnel:", msg);
            process.exit(1);
        }
    }
}
