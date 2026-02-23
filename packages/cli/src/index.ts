#!/usr/bin/env node

/**
 * SyncReeper CLI
 *
 * Unified command-line interface for managing SyncReeper deployments.
 * Run `syncreeper --help` for usage information.
 */

import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { setupCommand } from "./commands/setup.js";
import { getDeviceIdCommand } from "./commands/get-device-id.js";
import { addDeviceCommand } from "./commands/add-device.js";
import { syncNowCommand } from "./commands/sync-now.js";
import { redeployCommand } from "./commands/redeploy.js";
import { dashboardCommand } from "./commands/dashboard.js";

const argv = process.argv.slice(2);

// If no command is given, default to dashboard
const hasCommand = argv.length > 0 && !argv[0]!.startsWith("-");

if (!hasCommand && argv.length === 0) {
    // No arguments at all -> launch dashboard
    argv.push("dashboard");
}

yargs(hasCommand ? hideBin(process.argv) : argv)
    .scriptName("syncreeper")
    .usage("$0 <command> [options]")
    .command(dashboardCommand)
    .command(setupCommand)
    .command(getDeviceIdCommand)
    .command(addDeviceCommand)
    .command(syncNowCommand)
    .command(redeployCommand)
    .demandCommand(1, "Please specify a command. Run syncreeper --help for available commands.")
    .strict()
    .help()
    .alias("h", "help")
    .version("1.0.0")
    .alias("v", "version")
    .parse();
