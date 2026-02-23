/**
 * dashboard command - Open the interactive TUI dashboard
 */

import React from "react";
import type { CommandModule } from "yargs";
import { render } from "ink";
import { App } from "@syncreeper/tui";

export const dashboardCommand: CommandModule = {
    command: "dashboard",
    describe: "Open the interactive TUI dashboard",
    builder: {},
    handler: async () => {
        // Clear entire screen and reset cursor to top-left
        process.stdout.write("\x1B[2J\x1B[H");

        const { waitUntilExit } = render(React.createElement(App, { version: "1.0.0" }));
        await waitUntilExit();
    },
};
