import React from "react";
import { Box, Text } from "ink";

export interface TabBarProps {
    tabs: { label: string; key: string }[];
    activeIndex: number;
}

export function TabBar({ tabs, activeIndex }: TabBarProps): React.ReactElement {
    return (
        <Box paddingX={2} gap={1}>
            {tabs.map((tab, i) => (
                <Text
                    key={tab.key}
                    inverse={i === activeIndex}
                    bold={i === activeIndex}
                    color={i === activeIndex ? "cyan" : undefined}
                    dimColor={i !== activeIndex}
                >
                    {` ${tab.label} `}
                </Text>
            ))}
        </Box>
    );
}
