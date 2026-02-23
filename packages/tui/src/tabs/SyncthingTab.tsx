import React, { useState, useEffect, useRef } from "react";
import { Box, Text } from "ink";
import { StatusBadge } from "../components/StatusBadge.js";
import { LogViewer } from "../components/LogViewer.js";
import { useServiceStatus } from "../hooks/useServiceStatus.js";
import { useServiceAction } from "../hooks/useServiceAction.js";
import { isLinux, isMacOS } from "@syncreeper/shared";
import { asServiceUser } from "../utils/userCommand.utils.js";
import { execa } from "execa";
import type { TabActionProps } from "../types.js";

function getServiceStatusCommand(): { command: string; args: string[] } {
    if (isLinux()) {
        return asServiceUser("systemctl", ["--user", "status", "syncthing"]);
    }
    if (isMacOS()) {
        return { command: "launchctl", args: ["list", "syncthing"] };
    }
    return { command: "echo", args: ["unsupported"] };
}

function getPrimaryUnit(): { unit: string; userLevel: boolean; launchctlLabel?: string } {
    if (isLinux()) {
        return { unit: "syncthing", userLevel: true };
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
}: TabActionProps): React.ReactElement {
    const svcCmd = getServiceStatusCommand();
    const serviceStatus = useServiceStatus(svcCmd.command, svcCmd.args, refreshTrigger);

    const [deviceId, setDeviceId] = useState<string>("loading...");
    const [connectionLines, setConnectionLines] = useState<string[]>([]);
    const [isLoadingDetails, setIsLoadingDetails] = useState(true);

    // Service actions
    const primary = getPrimaryUnit();
    const serviceAction = useServiceAction({
        ...primary,
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

            // Get device ID — syncthing cli needs to run as the service user too
            const showSystemCmd = asServiceUser("syncthing", ["cli", "show", "system"]);
            try {
                const result = await execa(showSystemCmd.command, showSystemCmd.args, {
                    reject: false,
                });
                if (!cancelled && result.exitCode === 0) {
                    const match = result.stdout.match(/"myID"\s*:\s*"([^"]+)"/);
                    if (match?.[1]) {
                        setDeviceId(match[1]);
                    } else {
                        setDeviceId("unable to parse");
                    }
                }
            } catch {
                if (!cancelled) setDeviceId("unavailable");
            }

            // Get connections
            const showConnsCmd = asServiceUser("syncthing", ["cli", "show", "connections"]);
            try {
                const result = await execa(showConnsCmd.command, showConnsCmd.args, {
                    reject: false,
                });
                if (!cancelled && result.exitCode === 0) {
                    const lines: string[] = [];
                    try {
                        const data = JSON.parse(result.stdout);
                        const connections = data.connections ?? {};
                        for (const [id, conn] of Object.entries(connections)) {
                            const c = conn as { connected?: boolean; address?: string };
                            const shortId = id.substring(0, 7) + "...";
                            const status = c.connected ? "Connected" : "Disconnected";
                            const addr = c.address ?? "N/A";
                            lines.push(`  ${shortId}  ${status.padEnd(14)}  ${addr}`);
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

            if (!cancelled) setIsLoadingDetails(false);
        }

        fetchDetails();
    }, [refreshTrigger]);

    return (
        <Box flexDirection="column" gap={1}>
            <Box flexDirection="column">
                <Box gap={1}>
                    <Text bold>Service:</Text>
                    <StatusBadge status={serviceStatus.status} />
                </Box>

                <Box gap={1}>
                    <Text bold>This Device:</Text>
                    <Text>
                        {deviceId.length > 50 ? deviceId.substring(0, 50) + "..." : deviceId}
                    </Text>
                </Box>

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
        </Box>
    );
}
