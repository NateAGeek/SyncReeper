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

const MACOS_SYNCTHING_SERVICE = "homebrew.mxcl.syncthing";

function getServiceStatusCommand(): { command: string; args: string[] } {
    if (isLinux()) {
        return asServiceUser("systemctl", ["--user", "status", "syncthing"]);
    }
    if (isMacOS()) {
        return { command: "launchctl", args: ["list", MACOS_SYNCTHING_SERVICE] };
    }
    return { command: "echo", args: ["unsupported"] };
}

function getPrimaryUnit(): { unit: string; userLevel: boolean; launchctlLabel?: string } {
    if (isLinux()) {
        return { unit: "syncthing", userLevel: true };
    }
    if (isMacOS()) {
        return {
            unit: "syncthing",
            userLevel: true,
            launchctlLabel: MACOS_SYNCTHING_SERVICE,
        };
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
    const [detailsRefreshTrigger, setDetailsRefreshTrigger] = useState(0);

    // Service actions
    const primary = getPrimaryUnit();
    const serviceAction = useServiceAction({
        ...primary,
        onSuccess: () => {
            serviceStatus.refresh();
            setDetailsRefreshTrigger((previousTrigger) => previousTrigger + 1);
        },
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
                    timeout: 10000,
                });
                if (!cancelled && result.exitCode === 0) {
                    const match = result.stdout.match(/"myID"\s*:\s*"([^"]+)"/);
                    if (match?.[1]) {
                        setDeviceId(match[1]);
                    } else {
                        setDeviceId("unable to parse");
                    }
                } else if (!cancelled) {
                    setDeviceId("unavailable");
                }
            } catch {
                if (!cancelled) setDeviceId("unavailable");
            }

            // Get connections
            const showConnsCmd = asServiceUser("syncthing", ["cli", "show", "connections"]);
            try {
                const result = await execa(showConnsCmd.command, showConnsCmd.args, {
                    reject: false,
                    timeout: 10000,
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
                    const errorMessage =
                        result.stderr.trim() || result.stdout.trim() || "unknown error";
                    setConnectionLines([
                        "  Unable to fetch Syncthing connections:",
                        ...errorMessage.split("\n").map((errorLine) => `  ${errorLine}`),
                    ]);
                }
            } catch {
                if (!cancelled) setConnectionLines(["  Failed to fetch connections"]);
            }

            if (!cancelled) setIsLoadingDetails(false);
        }

        fetchDetails();

        return () => {
            cancelled = true;
        };
    }, [refreshTrigger, detailsRefreshTrigger]);

    return (
        <Box flexDirection="column" gap={1}>
            <Box flexDirection="column">
                <Box gap={1}>
                    <Text bold>Service:</Text>
                    <StatusBadge status={serviceStatus.status} />
                </Box>

                <Box gap={1}>
                    <Text bold>This Device:</Text>
                    <Text>{deviceId}</Text>
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
