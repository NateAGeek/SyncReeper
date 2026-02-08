/**
 * macOS-specific command utilities
 *
 * Provides launchd and Homebrew service management for macOS deployments.
 */

import * as command from "@pulumi/command";
import type * as pulumi from "@pulumi/pulumi";

export interface EnableServiceDarwinOptions {
    /** Unique resource name */
    name: string;
    /** Service name (for launchd plist or Homebrew service) */
    service: string;
    /** Whether to start the service immediately */
    start?: boolean;
    /** Whether to enable on boot/login */
    enable?: boolean;
    /** Resources this depends on */
    dependsOn?: pulumi.Resource[];
}

/**
 * Enables and optionally starts a launchd service on macOS
 *
 * This loads a LaunchAgent plist for the current user.
 * The plist file should already exist at ~/Library/LaunchAgents/{service}.plist
 */
export function enableServiceDarwin(options: EnableServiceDarwinOptions): command.local.Command {
    const { name, service, start = true, enable = true, dependsOn } = options;

    // launchctl uses 'gui/<uid>' domain for user agents
    // We use 'load -w' which both loads and enables the service
    const commands: string[] = [];

    // Unload first in case it's already loaded (to apply changes)
    commands.push(`launchctl unload ~/Library/LaunchAgents/${service}.plist 2>/dev/null || true`);

    if (enable || start) {
        // -w flag marks the job as not disabled
        commands.push(`launchctl load -w ~/Library/LaunchAgents/${service}.plist`);
    }

    const createCmd = commands.join(" && ");
    const deleteCmd = `launchctl unload ~/Library/LaunchAgents/${service}.plist 2>/dev/null || true`;

    return new command.local.Command(
        name,
        {
            create: createCmd,
            delete: deleteCmd,
        },
        { dependsOn }
    );
}

export interface EnableBrewServiceOptions {
    /** Unique resource name */
    name: string;
    /** Homebrew service/formula name (e.g., "syncthing", "sshguard") */
    service: string;
    /** Whether to start the service immediately */
    start?: boolean;
    /** Whether to restart if already running */
    restart?: boolean;
    /** Resources this depends on */
    dependsOn?: pulumi.Resource[];
}

/**
 * Enables and starts a Homebrew-managed service on macOS
 *
 * Uses `brew services` to manage services that were installed via Homebrew.
 * This is preferred for Homebrew-installed software like Syncthing, SSHGuard, etc.
 */
export function enableBrewService(options: EnableBrewServiceOptions): command.local.Command {
    const { name, service, start = true, restart = false, dependsOn } = options;

    let createCmd: string;
    if (restart) {
        createCmd = `brew services restart ${service}`;
    } else if (start) {
        createCmd = `brew services start ${service}`;
    } else {
        // Just ensure it's registered but not running
        createCmd = `echo "Service ${service} registered (not started)"`;
    }

    const deleteCmd = `brew services stop ${service} 2>/dev/null || true`;

    return new command.local.Command(
        name,
        {
            create: createCmd,
            delete: deleteCmd,
        },
        { dependsOn }
    );
}
