/**
 * macOS auto-updates service
 *
 * On macOS, system updates are handled by macOS itself via System Preferences.
 * This is a no-op that logs a message about macOS update behavior.
 */

import type * as pulumi from "@pulumi/pulumi";
import { runCommand } from "../../lib/command";
import type { SetupAutoUpdatesOptions, SetupAutoUpdatesResult } from "./types";

/**
 * "Sets up" auto-updates on macOS
 *
 * This is effectively a no-op since macOS handles its own updates.
 * We just log a message to inform the user.
 */
export function setupAutoUpdatesDarwin(
    options: SetupAutoUpdatesOptions = {}
): SetupAutoUpdatesResult {
    const { dependsOn = [] } = options;
    const resources: pulumi.Resource[] = [];

    // Log message about macOS updates
    const logMessage = runCommand({
        name: "macos-auto-updates-info",
        create: `
            echo ""
            echo "============================================"
            echo "macOS Auto-Updates"
            echo "============================================"
            echo ""
            echo "macOS handles system updates automatically."
            echo "SyncReeper does not manage macOS system updates."
            echo ""
            echo "To configure auto-updates on macOS:"
            echo "  1. Open System Preferences > Software Update"
            echo "  2. Enable 'Automatically keep my Mac up to date'"
            echo ""
            echo "Homebrew packages can be updated with:"
            echo "  brew update && brew upgrade"
            echo ""
        `.trim(),
        dependsOn,
    });
    resources.push(logMessage);

    return { resources };
}
