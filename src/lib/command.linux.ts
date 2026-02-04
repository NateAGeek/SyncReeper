/**
 * Linux-specific command utilities
 *
 * Provides systemd service management for Linux deployments.
 */

import * as command from "@pulumi/command";
import type * as pulumi from "@pulumi/pulumi";

export interface EnableServiceLinuxOptions {
    /** Unique resource name */
    name: string;
    /** Service name (without .service suffix) */
    service: string;
    /** Whether to start the service immediately */
    start?: boolean;
    /** Whether to enable on boot */
    enable?: boolean;
    /** Resources this depends on */
    dependsOn?: pulumi.Resource[];
}

/**
 * Enables and optionally starts a systemd service on Linux
 */
export function enableServiceLinux(options: EnableServiceLinuxOptions): command.local.Command {
    const { name, service, start = true, enable = true, dependsOn } = options;

    const commands: string[] = [];
    commands.push("systemctl daemon-reload");
    if (enable) {
        commands.push(`systemctl enable ${service}`);
    }
    if (start) {
        commands.push(`systemctl start ${service}`);
    }

    const createCmd = commands.join(" && ");
    const deleteCmd = `systemctl stop ${service} || true; systemctl disable ${service} || true`;

    return new command.local.Command(
        name,
        {
            create: createCmd,
            delete: deleteCmd,
        },
        { dependsOn }
    );
}

export interface EnableUserServiceLinuxOptions {
    /** Unique resource name */
    name: string;
    /** Service name (without .service suffix) */
    service: string;
    /** Username to run as */
    username: string;
    /** Whether to start the service immediately */
    start?: boolean;
    /** Whether to enable on boot */
    enable?: boolean;
    /** Resources this depends on */
    dependsOn?: pulumi.Resource[];
}

/**
 * Enables and optionally starts a user-level systemd service on Linux
 *
 * User-level services run without root privileges and are managed
 * via `systemctl --user`. Requires user lingering to be enabled.
 */
export function enableUserServiceLinux(
    options: EnableUserServiceLinuxOptions
): command.local.Command {
    const { name, service, username, start = true, enable = true, dependsOn } = options;

    // For user-level systemctl commands, we need to:
    // 1. Run as the target user (sudo -u)
    // 2. Set XDG_RUNTIME_DIR so systemctl can find the user's bus
    const uidCmd = `$(id -u ${username})`;
    const envPrefix = `sudo -u ${username} XDG_RUNTIME_DIR=/run/user/${uidCmd}`;

    const commands: string[] = [];
    commands.push(`${envPrefix} systemctl --user daemon-reload`);
    if (enable) {
        commands.push(`${envPrefix} systemctl --user enable ${service}`);
    }
    if (start) {
        commands.push(`${envPrefix} systemctl --user start ${service}`);
    }

    const createCmd = commands.join(" && ");
    const deleteCmd = `${envPrefix} systemctl --user stop ${service} || true; ${envPrefix} systemctl --user disable ${service} || true`;

    return new command.local.Command(
        name,
        {
            create: createCmd,
            delete: deleteCmd,
        },
        { dependsOn }
    );
}
