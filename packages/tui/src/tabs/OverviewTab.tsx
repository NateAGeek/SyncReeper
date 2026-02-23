import React from "react";
import { Box, Text } from "ink";
import { StatusBadge } from "../components/StatusBadge.js";
import { useServiceStatus } from "../hooks/useServiceStatus.js";
import { useServiceAction } from "../hooks/useServiceAction.js";
import { isLinux, isMacOS } from "@syncreeper/shared";
import { asServiceUser } from "../utils/userCommand.utils.js";
import type { TabActionProps } from "../types.js";
import { useEffect, useRef } from "react";

interface ServiceRow {
    name: string;
    command: string;
    args: string[];
    /** systemd unit name for actions */
    unit: string;
    /** Whether this is a user-level service */
    userLevel: boolean;
    /** macOS launchctl label */
    launchctlLabel?: string;
}

function getServiceChecks(): ServiceRow[] {
    if (isLinux()) {
        const syncTimer = asServiceUser("systemctl", ["--user", "status", "syncreeper-sync.timer"]);
        const syncthing = asServiceUser("systemctl", ["--user", "status", "syncthing"]);

        return [
            {
                name: "GitHub Sync Timer",
                command: syncTimer.command,
                args: syncTimer.args,
                unit: "syncreeper-sync.timer",
                userLevel: true,
            },
            {
                name: "Syncthing",
                command: syncthing.command,
                args: syncthing.args,
                unit: "syncthing",
                userLevel: true,
            },
            {
                name: "SSHGuard",
                command: "systemctl",
                args: ["status", "sshguard"],
                unit: "sshguard",
                userLevel: false,
            },
            {
                name: "Firewall (UFW)",
                command: "ufw",
                args: ["status"],
                unit: "ufw",
                userLevel: false,
            },
            {
                name: "Auto-Updates",
                command: "systemctl",
                args: ["status", "unattended-upgrades"],
                unit: "unattended-upgrades",
                userLevel: false,
            },
        ];
    }

    if (isMacOS()) {
        return [
            {
                name: "GitHub Sync",
                command: "launchctl",
                args: ["list", "com.syncreeper.sync"],
                unit: "com.syncreeper.sync",
                userLevel: true,
                launchctlLabel: "com.syncreeper.sync",
            },
            {
                name: "Syncthing",
                command: "launchctl",
                args: ["list", "syncthing"],
                unit: "syncthing",
                userLevel: true,
                launchctlLabel: "syncthing",
            },
            {
                name: "Passthrough Tunnel",
                command: "launchctl",
                args: ["list", "com.syncreeper.passthrough"],
                unit: "com.syncreeper.passthrough",
                userLevel: true,
                launchctlLabel: "com.syncreeper.passthrough",
            },
        ];
    }

    return [];
}

function ServiceRowComponent({
    name,
    command,
    args,
    refreshTrigger,
}: ServiceRow & { refreshTrigger: number }): React.ReactElement {
    const { status, isLoading } = useServiceStatus(command, args, refreshTrigger);

    return (
        <Box gap={1}>
            <Box width={24}>
                <Text>{name}</Text>
            </Box>
            <Box width={14}>
                {isLoading ? (
                    <Text color="yellow">checking...</Text>
                ) : (
                    <StatusBadge status={status} />
                )}
            </Box>
        </Box>
    );
}

export function OverviewTab({
    refreshTrigger,
    serviceActionTrigger,
    onActionUpdate,
}: TabActionProps): React.ReactElement {
    const services = getServiceChecks();

    // Overview tab: action targets the first service (GitHub Sync Timer)
    const primaryService = services[0];
    const serviceAction = useServiceAction({
        unit: primaryService?.unit ?? "",
        userLevel: primaryService?.userLevel ?? true,
        launchctlLabel: primaryService?.launchctlLabel,
        onSuccess: () => {
            // No auto-refresh needed; the polling will pick it up
        },
    });

    // React to action trigger from keyboard
    const lastSeq = useRef(0);
    useEffect(() => {
        if (serviceActionTrigger.seq > lastSeq.current && primaryService) {
            lastSeq.current = serviceActionTrigger.seq;
            serviceAction.run(serviceActionTrigger.action);
        }
    }, [serviceActionTrigger.seq]);

    // Bubble action status up to App
    useEffect(() => {
        onActionUpdate(serviceAction.actionStatus, serviceAction.message);
    }, [serviceAction.actionStatus, serviceAction.message]);

    return (
        <Box flexDirection="column" gap={1}>
            <Box gap={1}>
                <Box width={24}>
                    <Text bold underline>
                        Service
                    </Text>
                </Box>
                <Box width={14}>
                    <Text bold underline>
                        Status
                    </Text>
                </Box>
            </Box>

            {services.map((svc) => (
                <ServiceRowComponent key={svc.name} {...svc} refreshTrigger={refreshTrigger} />
            ))}

            {services.length === 0 && (
                <Text color="yellow">
                    Unsupported platform. The dashboard supports Linux and macOS.
                </Text>
            )}

            {primaryService && (
                <Box marginTop={1}>
                    <Text dimColor>
                        s/x/R targets: {primaryService.name} ({primaryService.unit})
                    </Text>
                </Box>
            )}
        </Box>
    );
}
