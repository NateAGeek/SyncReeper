/**
 * Status command for the passthrough tunnel
 *
 * Checks if the LaunchDaemon is loaded and running,
 * displays tunnel connection information, and shows
 * power management status.
 */

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { execa } from "execa";

import {
    loadConfig,
    getPlistPath,
    configExists,
    DEFAULTS,
    getLogErrPath,
    getHealthLogPath,
    getWrapperScriptPath,
} from "../config.js";

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

    // Check LaunchDaemon status
    const plistPath = getPlistPath();
    const plistExists = existsSync(plistPath);
    console.log(`LaunchDaemon:   ${plistExists ? "installed" : "NOT INSTALLED"}`);

    if (plistExists) {
        try {
            // LaunchDaemons run in the system domain — requires sudo to query
            const { stdout } = await execa("sudo", ["launchctl", "list"], {
                reject: false,
                stdio: ["inherit", "pipe", "inherit"],
            });
            const isLoaded = stdout.includes(DEFAULTS.plistLabel);
            console.log(`Service:        ${isLoaded ? "RUNNING" : "STOPPED"}`);
        } catch {
            console.log("Service:        UNKNOWN (could not query launchctl — try with sudo)");
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

    // Show power management status
    await showPowerStatus();

    // Show recent logs if available
    const logFile = getLogErrPath();
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

    // Show tunnel health from structured event log
    await showTunnelHealth();

    // Connection instructions
    console.log("To connect from VPS to this machine:");
    console.log(`  ssh <your-user>@localhost -p ${config.tunnelPort}`);
    console.log("");
}

/**
 * Displays the current power management settings relevant to
 * always-on tunnel operation.
 */
async function showPowerStatus(): Promise<void> {
    console.log("Power management:");

    try {
        const { stdout } = await execa("pmset", ["-g", "custom"], { reject: false });

        const settings: Record<string, string> = {};
        for (const line of stdout.split("\n")) {
            const match = line.trim().match(/^(\w+)\s+(\d+)$/);
            if (match) {
                settings[match[1]] = match[2];
            }
        }

        const checks: Array<[string, string, string, string]> = [
            ["sleep", "0", "System sleep disabled", "System sleep ENABLED (tunnel may drop)"],
            ["disksleep", "0", "Disk sleep disabled", "Disk sleep enabled"],
            [
                "tcpkeepalive",
                "1",
                "TCP keepalive enabled",
                "TCP keepalive DISABLED (tunnel will drop on display sleep)",
            ],
            ["womp", "1", "Wake on LAN enabled", "Wake on LAN disabled"],
        ];

        for (const [key, expected, okMsg, warnMsg] of checks) {
            if (settings[key] !== undefined) {
                const isOk = settings[key] === expected;
                console.log(
                    `  ${isOk ? "OK" : "!!"} ${isOk ? okMsg : warnMsg} (${key}=${settings[key]})`
                );
            }
        }
    } catch {
        console.log("  Could not read power settings (pmset -g custom)");
    }

    console.log("");
}

interface HealthEvent {
    ts: string;
    event: string;
    status: string;
    restarts: number;
    detail: string;
}

/**
 * Reads and displays tunnel health from the structured event log.
 */
async function showTunnelHealth(): Promise<void> {
    const healthLog = getHealthLogPath();
    const wrapperScript = getWrapperScriptPath();

    console.log("Tunnel health monitoring:");
    console.log(`  Watchdog script: ${existsSync(wrapperScript) ? "installed" : "NOT INSTALLED"}`);

    if (!existsSync(healthLog)) {
        console.log("  Health log:      no data yet (watchdog may not have started)");
        console.log("");
        return;
    }

    try {
        const content = await readFile(healthLog, "utf-8");
        const lines = content.trim().split("\n").filter(Boolean);

        if (lines.length === 0) {
            console.log("  Health log:      empty");
            console.log("");
            return;
        }

        const events: HealthEvent[] = [];
        for (const line of lines) {
            try {
                events.push(JSON.parse(line) as HealthEvent);
            } catch {
                // Skip malformed lines
            }
        }

        if (events.length === 0) {
            console.log("  Health log:      no parseable events");
            console.log("");
            return;
        }

        const lastEvent = events[events.length - 1];
        const totalRestarts = lastEvent.restarts;

        const healthChecks = events.filter((e) => e.event === "health_check");
        const failedChecks = healthChecks.filter((e) => e.status === "fail");
        const restartEvents = events.filter((e) => e.event === "tunnel_restart");

        console.log(`  Total restarts:  ${totalRestarts}`);
        console.log(`  Health probes:   ${healthChecks.length} (${failedChecks.length} failed)`);

        if (restartEvents.length > 0) {
            const lastRestart = restartEvents[restartEvents.length - 1];
            console.log(`  Last restart:    ${lastRestart.ts} — ${lastRestart.detail}`);
        }

        const recentEvents = events.slice(-5);
        console.log("  Recent events:");
        for (const evt of recentEvents) {
            const icon = evt.status === "ok" ? "OK" : evt.status === "fail" ? "!!" : "??";
            console.log(`    ${icon} [${evt.ts}] ${evt.event}: ${evt.detail}`);
        }
    } catch {
        console.log("  Health log:      could not read (may need sudo)");
    }

    console.log("");
}
