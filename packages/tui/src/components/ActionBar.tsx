import React from "react";
import { Box, Text } from "ink";
import type { ActionStatus } from "../hooks/useServiceAction.js";

export interface ActionBarProps {
    actionStatus: ActionStatus;
    message: string;
}

const STATUS_COLOR: Record<ActionStatus, string> = {
    idle: "gray",
    running: "yellow",
    success: "green",
    error: "red",
};

export function ActionBar({ actionStatus, message }: ActionBarProps): React.ReactElement | null {
    if (actionStatus === "idle" || !message) {
        return null;
    }

    return (
        <Box paddingX={1} marginTop={1}>
            <Text color={STATUS_COLOR[actionStatus]}>
                {actionStatus === "running"
                    ? "[...] "
                    : actionStatus === "success"
                      ? "[OK]  "
                      : "[ERR] "}
                {message}
            </Text>
        </Box>
    );
}
