import React, { useMemo } from "react";
import { Box, Text } from "ink";

export interface LogViewerProps {
    lines: string[];
    maxVisible?: number;
    scrollOffset: number;
    title?: string;
    isLoading?: boolean;
}

export function LogViewer({
    lines,
    maxVisible = 20,
    scrollOffset,
    title = "Logs",
    isLoading = false,
}: LogViewerProps): React.ReactElement {
    const { visibleLines, effectiveOffset, totalLines } = useMemo(() => {
        const total = lines.length;
        // Clamp scroll offset
        const maxOffset = Math.max(0, total - maxVisible);
        const offset = Math.min(scrollOffset, maxOffset);
        const visible = lines.slice(offset, offset + maxVisible);
        return { visibleLines: visible, effectiveOffset: offset, totalLines: total };
    }, [lines, maxVisible, scrollOffset]);

    const hasAbove = effectiveOffset > 0;
    const hasBelow = effectiveOffset + maxVisible < totalLines;

    return (
        <Box flexDirection="column">
            <Text dimColor bold>
                {`── ${title} (${totalLines} lines) `}
                {"─".repeat(Math.max(0, 50 - title.length))}
            </Text>

            {isLoading && <Text color="yellow"> Loading...</Text>}

            {hasAbove && <Text dimColor> ... {effectiveOffset} lines above ...</Text>}

            {visibleLines.map((line, i) => (
                <Text key={effectiveOffset + i} wrap="truncate">
                    {line}
                </Text>
            ))}

            {hasBelow && (
                <Text dimColor>
                    {" "}
                    ... {totalLines - effectiveOffset - maxVisible} lines below ...
                </Text>
            )}

            {totalLines === 0 && !isLoading && <Text dimColor> No log entries found.</Text>}
        </Box>
    );
}
