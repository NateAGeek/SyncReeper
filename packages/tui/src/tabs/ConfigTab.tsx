import React, { useEffect, useState } from "react";
import { Box, Text, useInput } from "ink";
import { ConfigInput } from "../components/ConfigInput.js";
import type { ActionStatus } from "../hooks/useServiceAction.js";
import {
    parseConfigList,
    isPulumiPassphraseRequired,
    applySyncthingTrustedDevices,
    rotateGitHubToken,
    updatePulumiConfig,
    validateGitHubToken,
    type ConfigSnapshot,
} from "../utils/config.utils.js";

interface ConfigField {
    section: string;
    label: string;
    key: string;
    secret?: boolean;
    liveApply?: boolean;
    liveApplyKind?: "github-token" | "syncthing-devices";
    fromStorage?: (value: string | undefined) => string;
    toStorage?: (value: string) => string;
    validate: (value: string) => string | null;
}

const required = (value: string): string | null => (value.trim() ? null : "Value is required");

const FIELDS: ConfigField[] = [
    {
        section: "GitHub Sync",
        label: "GitHub username",
        key: "syncreeper:github-username",
        validate: required,
    },
    {
        section: "GitHub Sync",
        label: "GitHub auth token",
        key: "syncreeper:github-token",
        secret: true,
        liveApply: true,
        validate: validateGitHubToken,
    },
    {
        section: "GitHub Sync",
        label: "Sync schedule",
        key: "syncreeper:sync-schedule",
        validate: required,
    },
    {
        section: "GitHub Sync",
        label: "Repository path",
        key: "syncreeper:repos-path",
        validate: (value) => (value.startsWith("/") ? null : "Use an absolute path"),
    },
    {
        section: "Syncthing",
        label: "Folder ID",
        key: "syncreeper:syncthing-folder-id",
        validate: (value) =>
            /^[A-Za-z0-9_-]+$/.test(value) ? null : "Use letters, numbers, dash, or underscore",
    },
    {
        section: "Syncthing",
        label: "Trusted device IDs",
        key: "syncreeper:syncthing-trusted-devices",
        liveApply: true,
        liveApplyKind: "syncthing-devices",
        fromStorage: (value) => parseConfigList(value).join(", "),
        toStorage: (value) =>
            JSON.stringify(
                value
                    .split(",")
                    .map((item) => item.trim())
                    .filter(Boolean)
            ),
        validate: () => null,
    },
    {
        section: "Passthrough",
        label: "Enabled",
        key: "syncreeper:passthrough-enabled",
        validate: (value) => (value === "true" || value === "false" ? null : "Enter true or false"),
    },
    {
        section: "Passthrough",
        label: "Tunnel port",
        key: "syncreeper:passthrough-port",
        validate: (value) => {
            const port = Number(value);
            return Number.isInteger(port) && port > 0 && port <= 65535
                ? null
                : "Enter a port from 1 to 65535";
        },
    },
];

export interface ConfigTabProps {
    snapshot: ConfigSnapshot | null;
    error: string;
    isLoading: boolean;
    isActive: boolean;
    onRefresh: () => void;
    onEditingChange: (editing: boolean) => void;
    onActionUpdate: (status: ActionStatus, message: string) => void;
}

export function ConfigTab({
    snapshot,
    error,
    isLoading,
    isActive,
    onRefresh,
    onEditingChange,
    onActionUpdate,
}: ConfigTabProps): React.ReactElement {
    const [selected, setSelected] = useState(0);
    const [editing, setEditing] = useState(false);
    const [saving, setSaving] = useState(false);
    const [value, setValue] = useState("");
    const [tokenFirstValue, setTokenFirstValue] = useState("");
    const [confirmingToken, setConfirmingToken] = useState(false);
    const [validationError, setValidationError] = useState("");
    const [passphrasePrompt, setPassphrasePrompt] = useState(false);
    const [pendingValue, setPendingValue] = useState("");

    const field = FIELDS[selected]!;

    useEffect(() => {
        onEditingChange(editing || saving);
        return () => onEditingChange(false);
    }, [editing, saving, onEditingChange]);

    const beginEdit = (): void => {
        if (!snapshot || saving) return;
        const stored = snapshot.values[field.key];
        setValue(field.secret ? "" : (field.fromStorage?.(stored) ?? stored ?? ""));
        setTokenFirstValue("");
        setConfirmingToken(false);
        setValidationError("");
        setPassphrasePrompt(false);
        setPendingValue("");
        setEditing(true);
    };

    const cancelEdit = (): void => {
        setValue("");
        setTokenFirstValue("");
        setConfirmingToken(false);
        setValidationError("");
        setPassphrasePrompt(false);
        setPendingValue("");
        setEditing(false);
    };

    const save = async (submittedValue: string, passphrase?: string): Promise<void> => {
        if (!snapshot) return;
        let waitingForPassphrase = false;
        setSaving(true);
        setEditing(false);
        onActionUpdate("running", `Updating ${field.label}...`);

        try {
            const result = field.liveApply
                ? field.liveApplyKind === "syncthing-devices"
                    ? await applySyncthingTrustedDevices(
                          field.toStorage?.(submittedValue) ?? submittedValue,
                          snapshot,
                          passphrase
                      )
                    : await rotateGitHubToken(submittedValue, snapshot, passphrase)
                : await updatePulumiConfig(
                      field.key,
                      field.toStorage?.(submittedValue) ?? submittedValue,
                      field.secret,
                      passphrase
                  );
            onActionUpdate("success", result.message);
            onRefresh();
        } catch (reason) {
            if (isPulumiPassphraseRequired(reason) && !passphrase) {
                waitingForPassphrase = true;
                setPendingValue(submittedValue);
                setPassphrasePrompt(true);
                setValue("");
                setEditing(true);
                onActionUpdate("running", "Pulumi passphrase required");
                return;
            }
            onActionUpdate(
                "error",
                reason instanceof Error ? reason.message : `Unable to update ${field.label}`
            );
        } finally {
            setValue("");
            if (!waitingForPassphrase) {
                setTokenFirstValue("");
                setConfirmingToken(false);
                setPassphrasePrompt(false);
                setPendingValue("");
            }
            setSaving(false);
        }
    };

    const submit = (): void => {
        if (passphrasePrompt) {
            if (!value) {
                setValidationError("Passphrase is required");
                return;
            }
            void save(pendingValue, value);
            return;
        }

        const issue = field.validate(value);
        if (issue) {
            setValidationError(issue);
            return;
        }

        if (field.secret && !confirmingToken) {
            setTokenFirstValue(value);
            setValue("");
            setConfirmingToken(true);
            setValidationError("");
            return;
        }

        if (field.secret && value !== tokenFirstValue) {
            setValidationError("Values do not match");
            return;
        }

        void save(value);
    };

    useInput(
        (input, key) => {
            if (key.downArrow || input === "j") {
                setSelected((current) => (current + 1) % FIELDS.length);
            } else if (key.upArrow || input === "k") {
                setSelected((current) => (current - 1 + FIELDS.length) % FIELDS.length);
            } else if (key.return || input === "e") {
                beginEdit();
            }
        },
        { isActive: isActive && !editing && !saving }
    );

    if (isLoading && !snapshot) return <Text color="yellow">Loading configuration...</Text>;
    if (error && !snapshot) return <Text color="red">Configuration error: {error}</Text>;
    if (!snapshot) return <Text color="yellow">No Pulumi configuration available.</Text>;

    if (editing) {
        return (
            <Box flexDirection="column" gap={1}>
                <ConfigInput
                    label={
                        passphrasePrompt
                            ? "Pulumi secrets passphrase"
                            : confirmingToken
                              ? `Confirm ${field.label}`
                              : `New ${field.label}`
                    }
                    value={value}
                    masked
                    isActive
                    onChange={(next) => {
                        setValue(next);
                        setValidationError("");
                    }}
                    onSubmit={submit}
                    onCancel={cancelEdit}
                />
                {field.liveApply && !passphrasePrompt && (
                    <Text color="yellow">
                        {field.liveApplyKind === "syncthing-devices"
                            ? "Saving applies the device list and restarts Syncthing."
                            : "Saving applies the managed environment and starts an immediate sync."}
                    </Text>
                )}
                {passphrasePrompt && (
                    <Text color="yellow">
                        Passphrase is used only for this Pulumi operation and is never displayed or
                        saved.
                    </Text>
                )}
                {validationError && <Text color="red">{validationError}</Text>}
            </Box>
        );
    }

    let previousSection = "";
    return (
        <Box flexDirection="column">
            <Box gap={2} marginBottom={1}>
                <Text>
                    <Text bold>Stack:</Text> {snapshot.stack}
                </Text>
                <Text>
                    <Text bold>Service user:</Text> {snapshot.serviceUser}
                </Text>
            </Box>

            {FIELDS.map((item, index) => {
                const showSection = item.section !== previousSection;
                previousSection = item.section;
                const stored = snapshot.values[item.key];
                const displayValue = item.secret
                    ? snapshot.secrets.has(item.key)
                        ? "[secret configured]"
                        : "[missing]"
                    : (item.fromStorage?.(stored) ?? stored ?? "[not set]");

                return (
                    <React.Fragment key={item.key}>
                        {showSection && (
                            <Text bold color="cyan">
                                {item.section}
                            </Text>
                        )}
                        <Box>
                            <Box width={3}>
                                <Text color={index === selected ? "cyan" : undefined}>
                                    {index === selected ? ">" : " "}
                                </Text>
                            </Box>
                            <Box width={24}>
                                <Text bold={index === selected}>{item.label}</Text>
                            </Box>
                            <Text wrap="truncate">{displayValue}</Text>
                        </Box>
                    </React.Fragment>
                );
            })}

            <Box marginTop={1} flexDirection="column">
                <Text dimColor>j/k: select | e/Enter: edit | r: reload</Text>
                <Text dimColor>
                    Token rotation applies immediately. Other edits require pulumi up.
                </Text>
                {error && <Text color="yellow">Last refresh failed: {error}</Text>}
            </Box>
        </Box>
    );
}
