import React from "react";
import { Box, Text, useInput } from "ink";

export interface ConfigInputProps {
    label: string;
    value: string;
    masked?: boolean;
    isActive: boolean;
    onChange: (value: string) => void;
    onSubmit: () => void;
    onCancel: () => void;
}

export function ConfigInput({
    label,
    value,
    masked = false,
    isActive,
    onChange,
    onSubmit,
    onCancel,
}: ConfigInputProps): React.ReactElement {
    useInput(
        (input, key) => {
            if (key.return) {
                onSubmit();
                return;
            }
            if (key.escape) {
                onCancel();
                return;
            }
            if (key.backspace || key.delete) {
                onChange(value.slice(0, -1));
                return;
            }
            if (key.ctrl && input === "u") {
                onChange("");
                return;
            }
            if (!key.ctrl && !key.meta && input && !/[\r\n\0]/.test(input)) {
                onChange(value + input);
            }
        },
        { isActive }
    );

    return (
        <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1}>
            <Text bold>{label}</Text>
            <Text>{masked ? (value ? "[hidden]" : "") : value}</Text>
            <Text dimColor>Enter: continue | Esc: cancel | Ctrl-U: clear</Text>
        </Box>
    );
}
