import React from "react";
import { Text } from "ink";

export type ServiceStatus =
    | "running"
    | "active"
    | "stopped"
    | "error"
    | "enabled"
    | "disabled"
    | "unknown";

export interface StatusBadgeProps {
    status: ServiceStatus;
}

const STATUS_CONFIG: Record<ServiceStatus, { label: string; color: string; bold: boolean }> = {
    running: { label: "RUNNING", color: "green", bold: true },
    active: { label: "ACTIVE", color: "green", bold: true },
    stopped: { label: "STOPPED", color: "yellow", bold: false },
    error: { label: "ERROR", color: "red", bold: true },
    enabled: { label: "ENABLED", color: "green", bold: false },
    disabled: { label: "DISABLED", color: "gray", bold: false },
    unknown: { label: "UNKNOWN", color: "gray", bold: false },
};

export function StatusBadge({ status }: StatusBadgeProps): React.ReactElement {
    const config = STATUS_CONFIG[status];
    return (
        <Text color={config.color} bold={config.bold}>
            [{config.label}]
        </Text>
    );
}
