import React, { useMemo, useEffect, useRef } from "react";
import { Box, Text } from "ink";
import { StatusBadge } from "../components/StatusBadge.js";
import { LogViewer } from "../components/LogViewer.js";
import { useServiceStatus } from "../hooks/useServiceStatus.js";
import { useServiceAction } from "../hooks/useServiceAction.js";
import { useLogs } from "../hooks/useLogs.js";
import { isLinux, isMacOS, getHomeDirectory } from "@syncreeper/shared";
import { asServiceUser, asJournalctl } from "../utils/userCommand.utils.js";
import type { TabActionProps } from "../types.js";

function getTimerStatusCommand(): { command: string; args: string[] } {
    if (isLinux()) {
        return asServiceUser("systemctl", ["--user", "status", "syncreeper-sync.timer"]);
    }
    if (isMacOS()) {
        return { command: "launchctl", args: ["list", "com.syncreeper.sync"] };
    }
    return { command: "echo", args: ["unsupported platform"] };
}

function getServiceStatusCommand(): { command: string; args: string[] } {
    if (isLinux()) {
        return asServiceUser("systemctl", ["--user", "status", "syncreeper-sync.service"]);
    }
    if (isMacOS()) {
        return { command: "launchctl", args: ["list", "com.syncreeper.sync"] };
    }
    return { command: "echo", args: ["unsupported platform"] };
}

function getLogCommand(): { command: string; args: string[] } {
    if (isLinux()) {
        return asJournalctl("syncreeper-sync.service", ["-n", "100", "--no-pager"]);
    }
    if (isMacOS()) {
        const logPath = `${getHomeDirectory()}/Library/Logs/SyncReeper/sync.log`;
        return { command: "tail", args: ["-100", logPath] };
    }
    return { command: "echo", args: ["No logs available on this platform"] };
}

function parseTimerInfo(output: string): { schedule: string; nextRun: string; lastRun: string } {
    const schedule =
        output.match(/Trigger:\s*(.+)/)?.[1]?.trim() ??
        output.match(/OnCalendar=(.+)/)?.[1]?.trim() ??
        "unknown";
    const nextRun =
        output.match(/next elapses? at\s*(.+)/i)?.[1]?.trim() ??
        output.match(/Trigger:\s*(.+)/)?.[1]?.trim() ??
        "unknown";
    const lastRun =
        output.match(/last triggered?\s*(.+)/i)?.[1]?.trim() ??
        output.match(/TriggeredBy:.*last ran (.+)/)?.[1]?.trim() ??
        "unknown";

    return { schedule, nextRun, lastRun };
}

function getTimerUnit(): { unit: string; userLevel: boolean; launchctlLabel?: string } {
    if (isLinux()) {
        return { unit: "syncreeper-sync.timer", userLevel: true };
    }
    if (isMacOS()) {
        return {
            unit: "com.syncreeper.sync",
            userLevel: true,
            launchctlLabel: "com.syncreeper.sync",
        };
    }
    return { unit: "syncreeper-sync.timer", userLevel: true };
}

function getServiceUnit(): { unit: string; userLevel: boolean } {
    return { unit: "syncreeper-sync.service", userLevel: true };
}

export function GithubSyncTab({
    refreshTrigger,
    scrollOffset,
    serviceActionTrigger,
    onActionUpdate,
}: TabActionProps): React.ReactElement {
    const timerCmd = getTimerStatusCommand();
    const serviceCmd = getServiceStatusCommand();
    const logCmd = getLogCommand();

    const timerStatus = useServiceStatus(timerCmd.command, timerCmd.args, refreshTrigger);
    const serviceStatus = useServiceStatus(serviceCmd.command, serviceCmd.args, refreshTrigger);
    const logs = useLogs(logCmd.command, logCmd.args, refreshTrigger);

    const timerInfo = useMemo(() => parseTimerInfo(timerStatus.output), [timerStatus.output]);

    // Two action targets:
    //   "start" -> starts the .service (triggers an immediate sync run)
    //   "stop"/"restart" -> targets the .timer (controls the schedule)
    const timerUnit = getTimerUnit();
    const serviceUnit = getServiceUnit();

    const timerAction = useServiceAction({
        ...timerUnit,
        onSuccess: timerStatus.refresh,
    });

    const serviceRunAction = useServiceAction({
        ...serviceUnit,
        onSuccess: () => {
            serviceStatus.refresh();
            timerStatus.refresh();
        },
    });

    const lastSeq = useRef(0);
    useEffect(() => {
        if (serviceActionTrigger.seq > lastSeq.current) {
            lastSeq.current = serviceActionTrigger.seq;
            if (serviceActionTrigger.action === "start") {
                // "start" triggers an immediate sync by starting the service unit
                serviceRunAction.run("start");
            } else {
                // "stop"/"restart" target the timer
                timerAction.run(serviceActionTrigger.action);
            }
        }
    }, [serviceActionTrigger.seq]);

    // Bubble whichever action is active
    const activeAction = serviceRunAction.actionStatus !== "idle" ? serviceRunAction : timerAction;
    useEffect(() => {
        onActionUpdate(activeAction.actionStatus, activeAction.message);
    }, [activeAction.actionStatus, activeAction.message]);

    return (
        <Box flexDirection="column" gap={1}>
            <Box flexDirection="column">
                <Box gap={1}>
                    <Text bold>Timer:</Text>
                    <Text>syncreeper-sync.timer</Text>
                    <StatusBadge status={timerStatus.status} />
                </Box>

                <Box gap={1}>
                    <Text bold>Service:</Text>
                    <Text>syncreeper-sync.service</Text>
                    <StatusBadge status={serviceStatus.status} />
                </Box>

                {timerInfo.nextRun !== "unknown" && (
                    <Box gap={1}>
                        <Text bold>Next Run:</Text>
                        <Text>{timerInfo.nextRun}</Text>
                    </Box>
                )}

                {timerInfo.lastRun !== "unknown" && (
                    <Box gap={1}>
                        <Text bold>Last Run:</Text>
                        <Text>{timerInfo.lastRun}</Text>
                    </Box>
                )}

                <Box marginTop={1}>
                    <Text dimColor>s: run sync now | x/R: stop/restart timer</Text>
                </Box>
            </Box>

            <LogViewer
                lines={logs.lines}
                scrollOffset={scrollOffset}
                title="Sync Logs"
                isLoading={logs.isLoading}
            />
        </Box>
    );
}
