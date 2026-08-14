import React, { useState, useEffect, useRef } from "react";
import { Box, Text } from "ink";
import { StatusBadge } from "../components/StatusBadge.js";
import { LogViewer } from "../components/LogViewer.js";
import { useServiceStatus } from "../hooks/useServiceStatus.js";
import { useServiceAction } from "../hooks/useServiceAction.js";
import { isLinux, isMacOS, DEFAULT_SERVICE_USER_LINUX } from "@syncreeper/shared";
import { asServiceUser } from "../utils/userCommand.utils.js";
import { execa } from "execa";
import type { TabActionProps } from "../types.js";
import { parseConfigList } from "../utils/config.utils.js";

function formatBytes(value: number | undefined): string {
    if (!value) return "0 B";
    const units = ["B", "KiB", "MiB", "GiB", "TiB"];
    const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
    return `${(value / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function formatDuration(seconds: number | undefined): string {
    if (!seconds) return "0m";
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return [days ? `${days}d` : "", hours ? `${hours}h` : "", `${minutes}m`]
        .filter(Boolean)
        .join(" ");
}

/**
 * Syncthing runs as a system-level templated unit (syncthing@<user>.service)
 * on this host, NOT as a user-level unit. The unit name includes the service
 * user (e.g. syncthing@syncreeper.service).
 */
function getSyncthingUnit(serviceUser = DEFAULT_SERVICE_USER_LINUX): {
    unit: string;
    userLevel: boolean;
} {
    if (isLinux()) {
        return {
            unit: `syncthing@${serviceUser}.service`,
            userLevel: false,
        };
    }
    return { unit: "syncthing", userLevel: true };
}

function getServiceStatusCommand(serviceUser = DEFAULT_SERVICE_USER_LINUX): {
    command: string;
    args: string[];
} {
    if (isLinux()) {
        const { unit } = getSyncthingUnit(serviceUser);
        // System-level unit: root can query directly, no wrapper needed
        return { command: "systemctl", args: ["status", unit] };
    }
    if (isMacOS()) {
        return { command: "launchctl", args: ["list", "syncthing"] };
    }
    return { command: "echo", args: ["unsupported"] };
}

function getPrimaryUnit(serviceUser = DEFAULT_SERVICE_USER_LINUX): {
    unit: string;
    userLevel: boolean;
    launchctlLabel?: string;
} {
    if (isLinux()) {
        return getSyncthingUnit(serviceUser);
    }
    if (isMacOS()) {
        return { unit: "syncthing", userLevel: true, launchctlLabel: "syncthing" };
    }
    return { unit: "syncthing", userLevel: true };
}

export function SyncthingTab({
    refreshTrigger,
    scrollOffset,
    serviceActionTrigger,
    onActionUpdate,
    config,
}: TabActionProps): React.ReactElement {
    const svcCmd = getServiceStatusCommand(config?.serviceUser);
    const serviceStatus = useServiceStatus(svcCmd.command, svcCmd.args, refreshTrigger);

    const [deviceId, setDeviceId] = useState<string>("loading...");
    const [localDetailLines, setLocalDetailLines] = useState<string[]>([]);
    const [connectionLines, setConnectionLines] = useState<string[]>([]);
    const [folderLines, setFolderLines] = useState<string[]>([]);
    const [diagnosticLines, setDiagnosticLines] = useState<string[]>([]);
    const [isLoadingDetails, setIsLoadingDetails] = useState(true);

    // Service actions
    const primary = getPrimaryUnit(config?.serviceUser);
    const serviceAction = useServiceAction({
        ...primary,
        serviceUser: config?.serviceUser,
        onSuccess: serviceStatus.refresh,
    });

    const lastSeq = useRef(0);
    useEffect(() => {
        if (serviceActionTrigger.seq > lastSeq.current) {
            lastSeq.current = serviceActionTrigger.seq;
            serviceAction.run(serviceActionTrigger.action);
        }
    }, [serviceActionTrigger.seq]);

    useEffect(() => {
        onActionUpdate(serviceAction.actionStatus, serviceAction.message);
    }, [serviceAction.actionStatus, serviceAction.message]);

    useEffect(() => {
        let cancelled = false;

        async function fetchDetails(): Promise<void> {
            setIsLoadingDetails(true);

            const runCli = async (args: string[]) => {
                const resolved = asServiceUser("syncthing", ["cli", ...args], config?.serviceUser);
                return execa(resolved.command, resolved.args, { reject: false });
            };

            // Get device ID — syncthing cli needs to run as the service user too
            try {
                const result = await runCli(["show", "system"]);
                if (!cancelled && result.exitCode === 0) {
                    const system = JSON.parse(result.stdout) as {
                        myID?: string;
                        uptime?: number;
                        cpuPercent?: number;
                        alloc?: number;
                        startTime?: string;
                        guiAddressUsed?: string;
                        discoveryEnabled?: boolean;
                        discoveryMethods?: number;
                        discoveryErrors?: Record<string, string>;
                        connectionServiceStatus?: Record<string, { error?: string | null }>;
                    };
                    setDeviceId(system.myID ?? "unable to parse");
                    const listenerErrors = Object.values(
                        system.connectionServiceStatus ?? {}
                    ).filter((listener) => listener.error).length;
                    setLocalDetailLines([
                        `Uptime: ${formatDuration(system.uptime)} | Started: ${system.startTime ?? "unknown"}`,
                        `CPU: ${system.cpuPercent?.toFixed(1) ?? "0"}% | Memory: ${formatBytes(system.alloc)}`,
                        `GUI/API: ${system.guiAddressUsed ?? "unknown"}`,
                        `Discovery: ${system.discoveryEnabled ? "enabled" : "disabled"} (${system.discoveryMethods ?? 0} methods)`,
                        `Listener errors: ${listenerErrors} | Discovery errors: ${Object.keys(system.discoveryErrors ?? {}).length}`,
                    ]);
                } else if (!cancelled) {
                    const reason = result.stderr.trim() || result.stdout.trim() || "unknown error";
                    setDeviceId("unavailable");
                    setLocalDetailLines([
                        `System query failed (exit ${result.exitCode}): ${reason}`,
                    ]);
                }
            } catch (reason) {
                if (!cancelled) {
                    setDeviceId("unavailable");
                    setLocalDetailLines([
                        reason instanceof Error
                            ? reason.message
                            : "Unable to query Syncthing system",
                    ]);
                }
            }

            // Get connections
            try {
                const result = await runCli(["show", "connections"]);
                if (!cancelled && result.exitCode === 0) {
                    const lines: string[] = [];
                    try {
                        const data = JSON.parse(result.stdout) as {
                            connections?: Record<
                                string,
                                {
                                    connected?: boolean;
                                    address?: string;
                                    clientVersion?: string;
                                    type?: string;
                                    startedAt?: string;
                                    inBytesTotal?: number;
                                    outBytesTotal?: number;
                                    paused?: boolean;
                                }
                            >;
                        };
                        const connections = data.connections ?? {};
                        const liveDeviceIds = new Set(Object.keys(connections));
                        const names = new Map<string, string>();
                        await Promise.all(
                            Object.keys(connections).map(async (id) => {
                                const nameResult = await runCli([
                                    "config",
                                    "devices",
                                    id,
                                    "name",
                                    "get",
                                ]);
                                if (nameResult.exitCode === 0)
                                    names.set(id, nameResult.stdout.trim());
                            })
                        );
                        for (const [id, conn] of Object.entries(connections)) {
                            const name = names.get(id) || "Unnamed device";
                            const status = conn.paused
                                ? "Paused"
                                : conn.connected
                                  ? "Connected"
                                  : "Disconnected";
                            lines.push(`  ${name} [${status}]`);
                            lines.push(`    ID: ${id}`);
                            lines.push(
                                `    ${conn.clientVersion || "version unknown"} | ${conn.type || "no transport"} | ${conn.address || "no current address"}`
                            );
                            lines.push(
                                `    In: ${formatBytes(conn.inBytesTotal)} | Out: ${formatBytes(conn.outBytesTotal)} | Since: ${conn.startedAt || "never"}`
                            );
                        }
                        for (const id of parseConfigList(
                            config?.values["syncreeper:syncthing-trusted-devices"]
                        )) {
                            if (!liveDeviceIds.has(id)) {
                                lines.push(`  Pending deployment [Disconnected]`);
                                lines.push(`    ID: ${id}`);
                                lines.push(
                                    "    Configured in Pulumi, not yet present in Syncthing"
                                );
                            }
                        }
                    } catch {
                        lines.push("  Unable to parse connection data");
                    }
                    if (lines.length === 0) {
                        lines.push("  No devices configured");
                    }
                    setConnectionLines(lines);
                } else if (!cancelled) {
                    setConnectionLines(["  syncthing CLI not available"]);
                }
            } catch {
                if (!cancelled) setConnectionLines(["  Failed to fetch connections"]);
            }

            try {
                const listResult = await runCli(["config", "folders", "list"]);
                if (listResult.exitCode !== 0) {
                    throw new Error(listResult.stderr.trim() || "Unable to list folders");
                }
                const folderIds = listResult.stdout
                    .split("\n")
                    .map((item) => item.trim())
                    .filter(Boolean);
                const lines = await Promise.all(
                    folderIds.map(async (id) => {
                        const [label, folderPath, type] = await Promise.all([
                            runCli(["config", "folders", id, "label", "get"]),
                            runCli(["config", "folders", id, "path", "get"]),
                            runCli(["config", "folders", id, "type", "get"]),
                        ]);
                        return `  ${label.stdout.trim() || id} (${id}) | ${type.stdout.trim() || "unknown"} | ${folderPath.stdout.trim() || "unknown path"}`;
                    })
                );
                if (!cancelled) setFolderLines(lines.length ? lines : ["  No folders configured"]);
            } catch (reason) {
                if (!cancelled) {
                    setFolderLines([
                        `  ${reason instanceof Error ? reason.message : "Unable to fetch folders"}`,
                    ]);
                }
            }

            try {
                const errorsResult = await runCli(["errors", "show"]);
                if (!cancelled) {
                    const output = errorsResult.stdout.trim() || errorsResult.stderr.trim();
                    setDiagnosticLines(
                        output
                            ? output.split("\n")
                            : ["  No pending Syncthing errors reported by the daemon"]
                    );
                }
            } catch (reason) {
                if (!cancelled) {
                    setDiagnosticLines([
                        reason instanceof Error ? reason.message : "Unable to fetch daemon errors",
                    ]);
                }
            }

            if (!cancelled) setIsLoadingDetails(false);
        }

        fetchDetails();

        return () => {
            cancelled = true;
        };
    }, [
        refreshTrigger,
        config?.serviceUser,
        config?.values["syncreeper:syncthing-trusted-devices"],
    ]);

    return (
        <Box flexDirection="column" gap={1}>
            <Box flexDirection="column">
                <Box gap={1}>
                    <Text bold>Service:</Text>
                    <StatusBadge status={serviceStatus.status} />
                </Box>

                {localDetailLines.map((line) => (
                    <Text key={line} dimColor>
                        {line}
                    </Text>
                ))}

                <Box gap={1}>
                    <Text bold>This Device:</Text>
                    <Text>
                        {deviceId.length > 50 ? deviceId.substring(0, 50) + "..." : deviceId}
                    </Text>
                </Box>

                {config && (
                    <Box gap={2}>
                        <Text>
                            <Text bold>Folder:</Text>{" "}
                            {config.values["syncreeper:syncthing-folder-id"] ?? "repos"}
                        </Text>
                        <Text>
                            <Text bold>Configured peers:</Text>{" "}
                            {(() => {
                                try {
                                    const value = JSON.parse(
                                        config.values["syncreeper:syncthing-trusted-devices"] ??
                                            "[]"
                                    ) as unknown;
                                    return Array.isArray(value) ? value.length : 0;
                                } catch {
                                    return 0;
                                }
                            })()}
                        </Text>
                    </Box>
                )}

                <Box marginTop={1}>
                    <Text dimColor>s/x/R targets: {primary.unit}</Text>
                </Box>
            </Box>

            <Box flexDirection="column">
                <Text bold dimColor>
                    {"── Connected Devices "}
                    {"─".repeat(50)}
                </Text>
                {isLoadingDetails ? (
                    <Text color="yellow"> Loading...</Text>
                ) : (
                    <LogViewer
                        lines={connectionLines}
                        scrollOffset={scrollOffset}
                        title="Devices"
                        maxVisible={15}
                    />
                )}
            </Box>

            <Box flexDirection="column">
                <Text bold dimColor>
                    {"── Shared Folders "}
                    {"─".repeat(52)}
                </Text>
                {folderLines.map((line) => (
                    <Text key={line}>{line}</Text>
                ))}
            </Box>

            <Box flexDirection="column">
                <Text bold dimColor>
                    {"── Diagnostics "}
                    {"─".repeat(54)}
                </Text>
                {diagnosticLines.map((line, index) => (
                    <Text
                        key={`${index}-${line}`}
                        color={line.includes("No pending") ? "green" : "yellow"}
                    >
                        {line}
                    </Text>
                ))}
            </Box>
        </Box>
    );
}
