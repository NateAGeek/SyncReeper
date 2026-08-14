import React from "react";
import { Box, Text } from "ink";

export interface KeyHintsProps {
    mode?: "dashboard" | "config" | "input";
}

export function KeyHints({ mode = "dashboard" }: KeyHintsProps): React.ReactElement {
    const hints =
        mode === "input"
            ? "Enter: continue  Esc: cancel  Ctrl-U: clear"
            : mode === "config"
              ? "Tab: switch tabs  j/k: select  e/Enter: edit  r: reload  q: quit"
              : "Tab/Shift+Tab: switch tabs j/k: scroll r: refresh s: start x: stop R: restart I: regen stignore q: quit";

    return (
        <Box
            paddingX={1}
            borderStyle="single"
            borderTop
            borderBottom={false}
            borderLeft={false}
            borderRight={false}
        >
            <Text dimColor>{hints}</Text>
        </Box>
    );
}
