/**
 * Status command for the passthrough tunnel
 *
 * Checks if the launchd service is loaded and running,
 * and displays tunnel connection information.
 */

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { execa } from "execa";

import { loadConfig, getPlistPath, configExists, DEFAULTS } from "../config.js";

/**
 * Check the status of the passthrough tunnel
 */
export async function status(): Promise<void> {
    // Check if configured
    if (!configExists()) {
        console.log("Status: NOT CONFIGURED");
        console.log("");
        console.log("Run 'setup' first to configure the tunnel.");
        return;
    }

    const config = await loadConfig();
    if (!config) {
        console.log("Status: CONFIG ERROR");
        console.log("");
        console.log("Configuration file exists but could not be read.");
        return;
    }

    console.log("--- Passthrough Tunnel Status ---");
    console.log("");

    // Display configuration
    console.log("Configuration:");
    console.log(`  VPS address:  ${config.tunnelUser}@${config.vpsAddress}:${config.vpsPort}`);
    console.log(`  Tunnel port:  ${config.tunnelPort}`);
    console.log(`  SSH key:      ${config.keyPath}`);
    console.log(`  Key exists:   ${existsSync(config.keyPath) ? "yes" : "NO - run setup again"}`);
    console.log("");

    // Check LaunchAgent status
    const plistPath = getPlistPath();
    const plistExists = existsSync(plistPath);
    console.log(`LaunchAgent:    ${plistExists ? "installed" : "NOT INSTALLED"}`);

    if (plistExists) {
        try {
            const { stdout } = await execa("launchctl", ["list"], { reject: false });
            const isLoaded = stdout.includes(DEFAULTS.plistLabel);
            console.log(`Service:        ${isLoaded ? "RUNNING" : "STOPPED"}`);
        } catch {
            console.log("Service:        UNKNOWN (could not query launchctl)");
        }
    }

    // Check for autossh process
    try {
        const { stdout } = await execa("pgrep", ["-f", `autossh.*${config.vpsAddress}`], {
            reject: false,
        });
        const pids = stdout.trim().split("\n").filter(Boolean);
        if (pids.length > 0) {
            console.log(`Process:        ACTIVE (PID: ${pids.join(", ")})`);
        } else {
            console.log("Process:        NOT RUNNING");
        }
    } catch {
        console.log("Process:        UNKNOWN (could not query processes)");
    }

    console.log("");

    // Show recent logs if available
    const logFile = "/tmp/syncreeper-passthrough.err.log";
    if (existsSync(logFile)) {
        try {
            const logContent = await readFile(logFile, "utf-8");
            const lines = logContent.trim().split("\n");
            const recentLines = lines.slice(-5);
            if (recentLines.length > 0 && recentLines[0]) {
                console.log("Recent log entries (stderr):");
                for (const line of recentLines) {
                    console.log(`  ${line}`);
                }
                console.log("");
            }
        } catch {
            // Ignore log read errors
        }
    }

    // Connection instructions
    console.log("To connect from VPS to this machine:");
    console.log(`  ssh <your-user>@localhost -p ${config.tunnelPort}`);
    console.log("");
}
