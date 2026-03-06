import React, { useState, useEffect, useRef } from "react";
import { Box, Text } from "ink";
import { StatusBadge } from "../components/StatusBadge.js";
import { LogViewer } from "../components/LogViewer.js";
import { useServiceStatus } from "../hooks/useServiceStatus.js";
import { useServiceAction } from "../hooks/useServiceAction.js";
import { isLinux, isMacOS } from "@syncreeper/shared";
import { execa } from "execa";
import { asSystemService } from "../utils/userCommand.utils.js";
import type { TabActionProps } from "../types.js";

export function SecurityTab({
    refreshTrigger,
    scrollOffset,
    serviceActionTrigger,
    onActionUpdate,
}: TabActionProps): React.ReactElement {
    const [firewallLines, setFirewallLines] = useState<string[]>([]);
    const [blockedIps, setBlockedIps] = useState<string[]>([]);
    const [autoUpdateInfo, setAutoUpdateInfo] = useState<string>("checking...");
    const [isLoading, setIsLoading] = useState(true);

    // SSHGuard status
    const sshguardCmd = isLinux()
        ? asSystemService("systemctl", ["status", "sshguard"])
        : { command: "echo", args: ["n/a"] };
    const sshguardStatus = useServiceStatus(sshguardCmd.command, sshguardCmd.args, refreshTrigger);

    // Service action targets SSHGuard (system-level)
    const serviceAction = useServiceAction({
        unit: "sshguard",
        userLevel: false,
        onSuccess: sshguardStatus.refresh,
    });

    const lastSeq = useRef(0);
    useEffect(() => {
        if (serviceActionTrigger.seq > lastSeq.current && isLinux()) {
            lastSeq.current = serviceActionTrigger.seq;
            serviceAction.run(serviceActionTrigger.action);
        }
    }, [serviceActionTrigger.seq]);

    useEffect(() => {
        onActionUpdate(serviceAction.actionStatus, serviceAction.message);
    }, [serviceAction.actionStatus, serviceAction.message]);

    useEffect(() => {
        let cancelled = false;

        async function fetchSecurity(): Promise<void> {
            setIsLoading(true);

            if (isLinux()) {
                // Firewall status
                try {
                    const ufwCmd = asSystemService("ufw", ["status", "verbose"]);
                    const result = await execa(ufwCmd.command, ufwCmd.args, { reject: false });
                    if (!cancelled && result.exitCode === 0) {
                        setFirewallLines(result.stdout.split("\n").filter((l) => l.trim()));
                    } else if (!cancelled) {
                        const stderr = result.stderr?.toLowerCase() ?? "";
                        if (
                            stderr.includes("a password is required") ||
                            stderr.includes("permission denied") ||
                            stderr.includes("sudo: a terminal is required")
                        ) {
                            setFirewallLines(["UFW status requires root privileges"]);
                        } else {
                            setFirewallLines(["UFW not available or not running"]);
                        }
                    }
                } catch {
                    if (!cancelled) setFirewallLines(["Unable to check firewall status"]);
                }

                // SSHGuard blocked IPs
                try {
                    // Try nftables first, then iptables — both may need root
                    const nftCmd = asSystemService("bash", [
                        "-c",
                        "nft list table sshguard 2>/dev/null || iptables -L sshguard -n 2>/dev/null",
                    ]);
                    const result = await execa(nftCmd.command, nftCmd.args, {
                        reject: false,
                    });
                    if (!cancelled && result.exitCode === 0 && result.stdout.trim()) {
                        const ipMatches = result.stdout.match(
                            /\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/g
                        );
                        if (ipMatches && ipMatches.length > 0) {
                            setBlockedIps(ipMatches.map((ip) => `  ${ip}`));
                        } else {
                            setBlockedIps(["  No IPs currently blocked"]);
                        }
                    } else if (!cancelled) {
                        setBlockedIps(["  Unable to query blocked IPs"]);
                    }
                } catch {
                    if (!cancelled) setBlockedIps(["  Unable to query blocked IPs"]);
                }

                // Auto-updates
                try {
                    const autoUpdCmd = asSystemService("systemctl", [
                        "status",
                        "unattended-upgrades",
                    ]);
                    const result = await execa(autoUpdCmd.command, autoUpdCmd.args, {
                        reject: false,
                    });
                    if (!cancelled) {
                        if (result.exitCode === 0) {
                            setAutoUpdateInfo("enabled (active)");
                        } else if (result.exitCode === 3) {
                            setAutoUpdateInfo("enabled (inactive)");
                        } else {
                            const stderr = result.stderr?.toLowerCase() ?? "";
                            if (
                                stderr.includes("a password is required") ||
                                stderr.includes("permission denied") ||
                                stderr.includes("sudo: a terminal is required")
                            ) {
                                setAutoUpdateInfo("requires root privileges");
                            } else {
                                setAutoUpdateInfo("not installed");
                            }
                        }
                    }
                } catch {
                    if (!cancelled) setAutoUpdateInfo("unable to check");
                }
            } else if (isMacOS()) {
                // macOS: pf firewall
                try {
                    const result = await execa("pfctl", ["-s", "rules"], { reject: false });
                    if (!cancelled && result.stdout.trim()) {
                        setFirewallLines(result.stdout.split("\n").filter((l) => l.trim()));
                    } else if (!cancelled) {
                        setFirewallLines(["No pf rules found"]);
                    }
                } catch {
                    if (!cancelled) setFirewallLines(["Unable to check firewall"]);
                }

                if (!cancelled) {
                    setBlockedIps(["  macOS uses pfctl -t sshguard -T show"]);
                    setAutoUpdateInfo("N/A (macOS)");
                }
            }

            if (!cancelled) setIsLoading(false);
        }

        fetchSecurity();
    }, [refreshTrigger]);

    // Combine all security info into log lines for scrolling
    const allLines = [
        "-- SSHGuard Blocked IPs --",
        ...blockedIps,
        "",
        "-- Firewall Rules --",
        ...firewallLines,
    ];

    return (
        <Box flexDirection="column" gap={1}>
            <Box flexDirection="column">
                <Box gap={1}>
                    <Text bold>SSHGuard:</Text>
                    <StatusBadge status={sshguardStatus.status} />
                    {blockedIps.length > 0 && !blockedIps[0]?.includes("No IPs") && (
                        <Text dimColor>({blockedIps.length} blocked IPs)</Text>
                    )}
                </Box>

                <Box gap={1}>
                    <Text bold>Auto-Updates:</Text>
                    <Text>{autoUpdateInfo}</Text>
                </Box>

                {isLinux() && (
                    <Box marginTop={1}>
                        <Text dimColor>s/x/R targets: sshguard</Text>
                    </Box>
                )}
            </Box>

            <LogViewer
                lines={allLines}
                scrollOffset={scrollOffset}
                title="Security Details"
                isLoading={isLoading}
            />
        </Box>
    );
}
