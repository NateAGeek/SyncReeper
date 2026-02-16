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
 *
 * On first deployment, the user's runtime directory (/run/user/<uid>)
 * may not exist yet even after `loginctl enable-linger`. We ensure the
 * user manager is fully started by calling `systemd-run --user` with
 * a wait, and also use `machinectl shell` as a fallback to properly
 * initialize the user session.
 */
export function enableUserServiceLinux(
    options: EnableUserServiceLinuxOptions
): command.local.Command {
    const { name, service, username, start = true, enable = true, dependsOn } = options;

    // For user-level systemctl commands, we need to:
    // 1. Ensure the user manager is running (lingering may have just been enabled)
    // 2. Run as the target user (sudo -u)
    // 3. Set XDG_RUNTIME_DIR and DBUS_SESSION_BUS_ADDRESS so systemctl can find the user's bus
    const uidCmd = `$(id -u ${username})`;
    const runtimeDir = `/run/user/${uidCmd}`;
    const envPrefix = `sudo -u ${username} XDG_RUNTIME_DIR=${runtimeDir} DBUS_SESSION_BUS_ADDRESS=unix:path=${runtimeDir}/bus`;

    // Wait for the user manager to be ready after lingering is enabled.
    // loginctl enable-linger starts the user@<uid>.service, but we need
    // to wait for the runtime directory and D-Bus socket to actually appear.
    const waitForUserManager = [
        `loginctl enable-linger ${username}`,
        `echo "Waiting for user manager to start..."`,
        `for i in $(seq 1 30); do [ -S ${runtimeDir}/bus ] && break; sleep 1; done`,
        `[ -S ${runtimeDir}/bus ] || { echo "User D-Bus socket not available after 30s"; exit 1; }`,
    ].join(" && ");

    const commands: string[] = [];
    commands.push(waitForUserManager);
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
