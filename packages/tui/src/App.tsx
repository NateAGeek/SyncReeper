import React, { useState, useCallback } from "react";
import { Box, Text, useApp } from "ink";
import { TabBar } from "./components/TabBar.js";
import { KeyHints } from "./components/KeyHints.js";
import { ActionBar } from "./components/ActionBar.js";
import { OverviewTab } from "./tabs/OverviewTab.js";
import { GithubSyncTab } from "./tabs/GithubSyncTab.js";
import { SyncthingTab } from "./tabs/SyncthingTab.js";
import { PassthroughTab } from "./tabs/PassthroughTab.js";
import { SecurityTab } from "./tabs/SecurityTab.js";
import { useKeyboard } from "./hooks/useKeyboard.js";
import type { ServiceAction } from "./hooks/useServiceAction.js";
import type { ActionStatus } from "./hooks/useServiceAction.js";

const TABS = [
    { label: "Overview", key: "overview" },
    { label: "GitHub Sync", key: "github-sync" },
    { label: "Syncthing", key: "syncthing" },
    { label: "Passthrough", key: "passthrough" },
    { label: "Security", key: "security" },
] as const;

export interface AppProps {
    version?: string;
}

export function App({ version = "1.0.0" }: AppProps): React.ReactElement {
    const { exit } = useApp();
    const [activeTab, setActiveTab] = useState(0);
    const [refreshTrigger, setRefreshTrigger] = useState(0);
    const [scrollOffset, setScrollOffset] = useState(0);

    // Service action state — bubbled up from tabs via onActionUpdate
    const [actionStatus, setActionStatus] = useState<ActionStatus>("idle");
    const [actionMessage, setActionMessage] = useState("");

    // Incremented when a service action key is pressed; tabs read this to trigger
    const [serviceActionTrigger, setServiceActionTrigger] = useState<{
        action: ServiceAction;
        seq: number;
    }>({ action: "restart", seq: 0 });

    const handleTabNext = useCallback(() => {
        setActiveTab((prev) => (prev + 1) % TABS.length);
        setScrollOffset(0);
    }, []);

    const handleTabPrev = useCallback(() => {
        setActiveTab((prev) => (prev - 1 + TABS.length) % TABS.length);
        setScrollOffset(0);
    }, []);

    const handleRefresh = useCallback(() => {
        setRefreshTrigger((prev) => prev + 1);
    }, []);

    const handleScrollDown = useCallback(() => {
        setScrollOffset((prev) => prev + 1);
    }, []);

    const handleScrollUp = useCallback(() => {
        setScrollOffset((prev) => Math.max(0, prev - 1));
    }, []);

    const handleScrollTop = useCallback(() => {
        setScrollOffset(0);
    }, []);

    const handleScrollBottom = useCallback(() => {
        setScrollOffset(Number.MAX_SAFE_INTEGER);
    }, []);

    const handleQuit = useCallback(() => {
        exit();
    }, [exit]);

    const handleServiceStart = useCallback(() => {
        setServiceActionTrigger((prev) => ({ action: "start", seq: prev.seq + 1 }));
    }, []);

    const handleServiceStop = useCallback(() => {
        setServiceActionTrigger((prev) => ({ action: "stop", seq: prev.seq + 1 }));
    }, []);

    const handleServiceRestart = useCallback(() => {
        setServiceActionTrigger((prev) => ({ action: "restart", seq: prev.seq + 1 }));
    }, []);

    const handleActionUpdate = useCallback((status: ActionStatus, message: string) => {
        setActionStatus(status);
        setActionMessage(message);
    }, []);

    useKeyboard({
        onTabNext: handleTabNext,
        onTabPrev: handleTabPrev,
        onScrollDown: handleScrollDown,
        onScrollUp: handleScrollUp,
        onScrollTop: handleScrollTop,
        onScrollBottom: handleScrollBottom,
        onRefresh: handleRefresh,
        onQuit: handleQuit,
        onServiceStart: handleServiceStart,
        onServiceStop: handleServiceStop,
        onServiceRestart: handleServiceRestart,
    });

    const renderActiveTab = (): React.ReactElement => {
        const tabKey = TABS[activeTab]!.key;
        const actionProps = {
            refreshTrigger,
            scrollOffset,
            serviceActionTrigger,
            onActionUpdate: handleActionUpdate,
        };

        switch (tabKey) {
            case "overview":
                return <OverviewTab {...actionProps} />;
            case "github-sync":
                return <GithubSyncTab {...actionProps} />;
            case "syncthing":
                return <SyncthingTab {...actionProps} />;
            case "passthrough":
                return <PassthroughTab {...actionProps} />;
            case "security":
                return <SecurityTab {...actionProps} />;
            default:
                return <Text>Unknown tab</Text>;
        }
    };

    return (
        <Box flexDirection="column" width="100%">
            <Box justifyContent="space-between" paddingX={1}>
                <Text bold color="cyan">
                    SyncReeper Dashboard
                </Text>
                <Text dimColor>v{version}</Text>
            </Box>

            <Box paddingX={1}>
                <Text dimColor>{"─".repeat(76)}</Text>
            </Box>

            <TabBar
                tabs={TABS.map((t) => ({ label: t.label, key: t.key }))}
                activeIndex={activeTab}
            />

            <Box paddingX={1}>
                <Text dimColor>{"─".repeat(76)}</Text>
            </Box>

            <Box flexDirection="column" paddingX={2} paddingY={1} minHeight={15}>
                {renderActiveTab()}
            </Box>

            <ActionBar actionStatus={actionStatus} message={actionMessage} />
            <KeyHints />
        </Box>
    );
}
