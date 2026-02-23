import React from "react";
import { Box, Text } from "ink";

export function KeyHints(): React.ReactElement {
    return (
        <Box
            paddingX={1}
            borderStyle="single"
            borderTop
            borderBottom={false}
            borderLeft={false}
            borderRight={false}
        >
            <Text dimColor>
                Tab/Shift+Tab: switch tabs j/k: scroll r: refresh s: start x: stop R: restart q:
                quit
            </Text>
        </Box>
    );
}
