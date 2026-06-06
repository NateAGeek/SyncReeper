import React, { useState, useEffect, useRef } from "react";
import { Box, Text } from "ink";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { StatusBadge } from "../components/StatusBadge.js";
import { LogViewer } from "../components/LogViewer.js";
import { useServiceStatus } from "../hooks/useServiceStatus.js";
import { useServiceAction } from "../hooks/useServiceAction.js";
import { isLinux, isMacOS } from "@syncreeper/shared";
import { execa } from "execa";
import { asSystemService } from "../utils/userCommand.utils.js";
import type { TabActionProps } from "../types.js";

/**
 * Constants mirrored from @syncreeper/node-passthrough/src/config.ts.
 * Kept in sync deliberately to avoid pulling node-passthrough as a TUI dep.
 */
const PASSTHROUGH_LABEL = "com.syncreeper.passthrough";
const PASSTHROUGH_DAEMON_PATH = `/Library/LaunchDaemons/${PASSTHROUGH_LABEL}.plist`;
const PASSTHROUGH_LEGACY_AGENT_PATH = join(
    homedir(),
    "Library",
    "LaunchAgents",
    `${PASSTHROUGH_LABEL}.plist`
);
const PASSTHROUGH_CONFIG_PATH = join(homedir(), ".config", "syncreeper", "passthrough.json");
const PASSTHROUGH_LOG_ERR = "/var/log/syncreeper/passthrough.err.log";

interface PassthroughClientConfig {
    vpsAddress: string;
    vpsPort: number;
    tunnelPort: number;
    keyPath: string;
    tunnelUser: string;
}

interface MacInstallState {
    daemonInstalled: boolean;
    legacyAgentInstalled: boolean;
    configFound: boolean;
    config: PassthroughClientConfig | null;
    autosshPid: string | null;
}

async function loadPassthroughConfig(): Promise<PassthroughClientConfig | null> {
    if (!existsSync(PASSTHROUGH_CONFIG_PATH)) return null;
    try {
        const raw = await readFile(PASSTHROUGH_CONFIG_PATH, "utf-8");
        return JSON.parse(raw) as PassthroughClientConfig;
    } catch {
        return null;
    }
}

async function findAutosshPid(vpsAddress: string | undefined): Promise<string | null> {
    const pattern = vpsAddress ? `autossh.*${vpsAddress}` : "autossh";
    const result = await execa("pgrep", ["-f", pattern], { reject: false });
    if (result.exitCode === 0) {
        const first = result.stdout.split("\n").find((l) => l.trim().length > 0);
        return first ? first.trim() : null;
    }
    return null;
}

export function PassthroughTab({
    refreshTrigger,
    scrollOffset,
    serviceActionTrigger,
    onActionUpdate,
}: TabActionProps): React.ReactElement {
    const [userExists, setUserExists] = useState<boolean | null>(null);
    const [tunnelPort, setTunnelPort] = useState<string>("2222");
    const [connections, setConnections] = useState<string[]>([]);
    const [logLines, setLogLines] = useState<string[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [macState, setMacState] = useState<MacInstallState>({
        daemonInstalled: false,
        legacyAgentInstalled: false,
        configFound: false,
        config: null,
        autosshPid: null,
    });

    // macOS service status (LaunchDaemon, system domain)
    const macServiceStatus = useServiceStatus(
        "launchctl",
        ["list", PASSTHROUGH_LABEL],
        refreshTrigger
    );

    // macOS service action — system-level launchctl kickstart -k system/<label>
    const macServiceAction = useServiceAction({
        unit: PASSTHROUGH_LABEL,
        userLevel: false,
        launchctlLabel: PASSTHROUGH_LABEL,
        onSuccess: macServiceStatus.refresh,
    });

    const lastSeq = useRef(0);
    useEffect(() => {
        if (!isMacOS()) return;
        if (serviceActionTrigger.seq > lastSeq.current) {
            lastSeq.current = serviceActionTrigger.seq;
            macServiceAction.run(serviceActionTrigger.action);
        }
    }, [serviceActionTrigger.seq]);

    useEffect(() => {
        if (!isMacOS()) return;
        onActionUpdate(macServiceAction.actionStatus, macServiceAction.message);
    }, [macServiceAction.actionStatus, macServiceAction.message]);

    useEffect(() => {
        let cancelled = false;

        async function fetchStatus(): Promise<void> {
            setIsLoading(true);

            if (isLinux()) {
                // Check if passthrough user exists
                try {
                    const result = await execa("id", ["passthrough"], { reject: false });
                    if (!cancelled) setUserExists(result.exitCode === 0);
                } catch {
                    if (!cancelled) setUserExists(false);
                }

                // Check active connections on tunnel port
                try {
                    const result = await execa(
                        "ss",
                        ["-tnp", "state", "established", `( sport = :${tunnelPort} )`],
                        { reject: false }
                    );
                    if (!cancelled && result.exitCode === 0) {
                        const lines = result.stdout
                            .split("\n")
                            .filter((l) => l.trim().length > 0)
                            .slice(1); // skip header
                        setConnections(
                            lines.length > 0
                                ? lines.map((l) => `  ${l.trim()}`)
                                : ["  No active connections"]
                        );
                    }
                } catch {
                    if (!cancelled) setConnections(["  Unable to check connections"]);
                }

                // Fetch recent SSH logs mentioning passthrough
                try {
                    const logCmd = asSystemService("journalctl", [
                        "-u",
                        "sshd",
                        "-n",
                        "50",
                        "--no-pager",
                        "--grep",
                        "passthrough",
                    ]);
                    const result = await execa(logCmd.command, logCmd.args, {
                        reject: false,
                    });
                    if (!cancelled && result.exitCode === 0 && result.stdout.trim()) {
                        setLogLines(result.stdout.split("\n"));
                    } else if (!cancelled) {
                        // Try alternative: search auth log
                        const altCmd = asSystemService("bash", [
                            "-c",
                            "grep passthrough /var/log/auth.log 2>/dev/null | tail -50",
                        ]);
                        const altResult = await execa(altCmd.command, altCmd.args, {
                            reject: false,
                        });
                        if (!cancelled && altResult.stdout.trim()) {
                            setLogLines(altResult.stdout.split("\n"));
                        } else if (!cancelled) {
                            setLogLines(["No passthrough log entries found"]);
                        }
                    }
                } catch {
                    if (!cancelled) setLogLines(["Unable to fetch logs"]);
                }
            } else if (isMacOS()) {
                // Inspect on-start config: plist install state + JSON config + autossh PID
                const daemonInstalled = existsSync(PASSTHROUGH_DAEMON_PATH);
                const legacyAgentInstalled = existsSync(PASSTHROUGH_LEGACY_AGENT_PATH);
                const config = await loadPassthroughConfig();
                const configFound = config !== null;
                const autosshPid = await findAutosshPid(config?.vpsAddress);

                if (cancelled) return;

                setMacState({
                    daemonInstalled,
                    legacyAgentInstalled,
                    configFound,
                    config,
                    autosshPid,
                });
                setUserExists(null);
                setTunnelPort(config ? String(config.tunnelPort) : "2222");

                // Tail the err log if it exists and is readable
                if (existsSync(PASSTHROUGH_LOG_ERR)) {
                    const tail = await execa(
                        "tail",
                        ["-n", "50", PASSTHROUGH_LOG_ERR],
                        { reject: false }
                    );
                    if (!cancelled) {
                        if (tail.exitCode === 0 && tail.stdout.trim()) {
                            setLogLines(tail.stdout.split("\n"));
                        } else if (tail.stderr.toLowerCase().includes("permission")) {
                            setLogLines([
                                "Log file exists but is not readable (needs sudo).",
                                `Path: ${PASSTHROUGH_LOG_ERR}`,
                            ]);
                        } else {
                            setLogLines(["No recent log entries"]);
                        }
                    }
                } else if (!cancelled) {
                    setLogLines([
                        "Log file not found — daemon may never have started.",
                        `Expected: ${PASSTHROUGH_LOG_ERR}`,
                    ]);
                }

                if (!cancelled) {
                    setConnections([]);
                }
            }

            if (!cancelled) setIsLoading(false);
        }

        fetchStatus();

        return () => {
            cancelled = true;
        };
    }, [refreshTrigger, tunnelPort]);

    // --- macOS rendering branch -------------------------------------------
    if (isMacOS()) {
        const { daemonInstalled, legacyAgentInstalled, configFound, config, autosshPid } =
            macState;

        // Determine the "on-start config" install state:
        // - installed   : LaunchDaemon plist present at /Library/LaunchDaemons
        // - legacy      : only legacy LaunchAgent present (needs migration)
        // - missing     : neither present (run `syncreeper-passthrough setup`)
        let installLabel: string;
        let installColor: "green" | "yellow" | "red";
        if (daemonInstalled) {
            installLabel = "Installed (LaunchDaemon)";
            installColor = "green";
        } else if (legacyAgentInstalled) {
            installLabel = "Legacy LaunchAgent — migration needed";
            installColor = "yellow";
        } else {
            installLabel = "Not installed";
            installColor = "red";
        }

        return (
            <Box flexDirection="column" gap={1}>
                <Box flexDirection="column">
                    <Box gap={1}>
                        <Text bold>On-start config:</Text>
                        <Text color={installColor}>{installLabel}</Text>
                    </Box>

                    <Box gap={1}>
                        <Text bold>Plist path:</Text>
                        <Text dimColor>
                            {daemonInstalled
                                ? PASSTHROUGH_DAEMON_PATH
                                : legacyAgentInstalled
                                  ? PASSTHROUGH_LEGACY_AGENT_PATH
                                  : `${PASSTHROUGH_DAEMON_PATH} (expected)`}
                        </Text>
                    </Box>

                    <Box gap={1}>
                        <Text bold>Service:</Text>
                        {isLoading ? (
                            <Text color="yellow">checking...</Text>
                        ) : (
                            <StatusBadge status={macServiceStatus.status} />
                        )}
                    </Box>

                    <Box gap={1}>
                        <Text bold>Client config:</Text>
                        {configFound && config ? (
                            <Text>
                                {config.tunnelUser}@{config.vpsAddress}:{config.vpsPort} →
                                tunnel :{config.tunnelPort}
                            </Text>
                        ) : (
                            <Text color="red">missing ({PASSTHROUGH_CONFIG_PATH})</Text>
                        )}
                    </Box>

                    <Box gap={1}>
                        <Text bold>autossh PID:</Text>
                        <Text>{autosshPid ?? "not running"}</Text>
                    </Box>

                    <Box marginTop={1} flexDirection="column">
                        <Text dimColor>
                            s/x/R targets: {PASSTHROUGH_LABEL} (system domain — needs sudo)
                        </Text>
                        {!daemonInstalled && (
                            <Text dimColor>
                                Run `syncreeper-passthrough setup` to install the on-start
                                config.
                            </Text>
                        )}
                    </Box>
                </Box>

                <LogViewer
                    lines={logLines}
                    scrollOffset={scrollOffset}
                    title="Passthrough err log (tail)"
                    isLoading={isLoading}
                />
            </Box>
        );
    }

    // --- Linux rendering branch (unchanged) -------------------------------
    return (
        <Box flexDirection="column" gap={1}>
            <Box flexDirection="column">
                <Box gap={1}>
                    <Text bold>Passthrough User:</Text>
                    {isLoading ? (
                        <Text color="yellow">checking...</Text>
                    ) : userExists === true ? (
                        <StatusBadge status="active" />
                    ) : userExists === false ? (
                        <Text dimColor>Not configured</Text>
                    ) : (
                        <Text dimColor>N/A</Text>
                    )}
                </Box>

                <Box gap={1}>
                    <Text bold>Tunnel Port:</Text>
                    <Text>{tunnelPort}</Text>
                </Box>

                <Box marginTop={1}>
                    <Text dimColor>No controllable service on this tab</Text>
                </Box>
            </Box>

            <Box flexDirection="column">
                <Text bold dimColor>
                    {"── Connections "}
                    {"─".repeat(55)}
                </Text>
                {connections.map((line, i) => (
                    <Text key={i}>{line}</Text>
                ))}
            </Box>

            {logLines.length > 0 && (
                <LogViewer
                    lines={logLines}
                    scrollOffset={scrollOffset}
                    title="Passthrough Logs"
                    isLoading={isLoading}
                />
            )}
        </Box>
    );
}
