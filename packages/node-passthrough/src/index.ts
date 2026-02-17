#!/usr/bin/env node

/**
 * @syncreeper/node-passthrough
 *
 * CLI tool for managing a persistent reverse SSH tunnel from your
 * home machine (e.g., Mac Mini) to a VPS. This allows SSH access
 * to the home machine from the VPS without exposing any ports on
 * the home network.
 *
 * Commands:
 *   setup     - Interactive setup: install autossh, generate keys, configure tunnel
 *   start     - Start the tunnel service
 *   stop      - Stop the tunnel service
 *   status    - Check tunnel status and connection info
 *   uninstall - Remove the tunnel service, keys, and config
 *
 * Usage:
 *   npx @syncreeper/node-passthrough setup
 *   npx @syncreeper/node-passthrough status
 */

import yargs from "yargs";
import { hideBin } from "yargs/helpers";

import { setup } from "./commands/setup.js";
import { start } from "./commands/start.js";
import { stop } from "./commands/stop.js";
import { status } from "./commands/status.js";
import { uninstall } from "./commands/uninstall.js";

yargs(hideBin(process.argv))
    .scriptName("syncreeper-passthrough")
    .usage("$0 <command>")
    .usage("")
    .usage("Manage a reverse SSH tunnel from your home machine to a VPS.")
    .command(
        "setup",
        "Interactive setup: install autossh, generate SSH keys, and configure the tunnel",
        () => {},
        async () => {
            await setup();
        }
    )
    .command(
        "start",
        "Start the reverse SSH tunnel service",
        () => {},
        async () => {
            await start();
        }
    )
    .command(
        "stop",
        "Stop the reverse SSH tunnel service",
        () => {},
        async () => {
            await stop();
        }
    )
    .command(
        "status",
        "Check the tunnel status and display connection info",
        () => {},
        async () => {
            await status();
        }
    )
    .command(
        "uninstall",
        "Remove the tunnel service, SSH keys, and configuration",
        () => {},
        async () => {
            await uninstall();
        }
    )
    .demandCommand(1, "Please specify a command. Run with --help to see available commands.")
    .strict()
    .help()
    .alias("h", "help")
    .version()
    .alias("v", "version")
    .parse();
