import React, { useState, useEffect, useRef } from "react";
import { Box, Text } from "ink";
import { StatusBadge } from "../components/StatusBadge.js";
import { LogViewer } from "../components/LogViewer.js";
import { isLinux, isMacOS } from "@syncreeper/shared";
import { execa } from "execa";
import type { TabActionProps } from "../types.js";

export function PassthroughTab({
    refreshTrigger,
    scrollOffset,
}: TabActionProps): React.ReactElement {
    const [userExists, setUserExists] = useState<boolean | null>(null);
    const [tunnelPort, setTunnelPort] = useState<string>("2222");
    const [connections, setConnections] = useState<string[]>([]);
    const [logLines, setLogLines] = useState<string[]>([]);
    const [isLoading, setIsLoading] = useState(true);

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
                    const result = await execa(
                        "journalctl",
                        ["-u", "sshd", "-n", "50", "--no-pager", "--grep", "passthrough"],
                        { reject: false }
                    );
                    if (!cancelled && result.exitCode === 0 && result.stdout.trim()) {
                        setLogLines(result.stdout.split("\n"));
                    } else if (!cancelled) {
                        // Try alternative: search auth log
                        const altResult = await execa(
                            "bash",
                            ["-c", "grep passthrough /var/log/auth.log 2>/dev/null | tail -50"],
                            { reject: false }
                        );
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
                // On macOS, passthrough is managed by node-passthrough (separate package)
                if (!cancelled) {
                    setUserExists(null);
                    setConnections([
                        "  Passthrough on macOS is managed by syncreeper-passthrough CLI.",
                        "  Run: syncreeper-passthrough status",
                    ]);
                    setLogLines([]);
                }
            }

            if (!cancelled) setIsLoading(false);
        }

        fetchStatus();
    }, [refreshTrigger, tunnelPort]);

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
