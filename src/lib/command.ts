/**
 * Command execution utilities for Pulumi
 * Wraps @pulumi/command for consistent usage across services
 *
 * This module provides cross-platform abstractions for:
 * - Running arbitrary commands
 * - Writing files with proper permissions
 * - Enabling system services (systemd on Linux, launchd on macOS)
 */

import * as command from "@pulumi/command";
import * as pulumi from "@pulumi/pulumi";
import { isLinux, isMacOS } from "./platform";
import { enableServiceLinux } from "./command.linux";
import { enableServiceDarwin } from "./command.darwin";

export interface RunCommandOptions {
    /** Unique resource name */
    name: string;
    /** Command to execute on create */
    create: string | pulumi.Output<string>;
    /** Command to execute on delete (optional) */
    delete?: string;
    /** Command to execute on update (optional, defaults to create) */
    update?: string;
    /** Resources this command depends on */
    dependsOn?: pulumi.Resource[];
    /** Environment variables */
    environment?: Record<string, string | pulumi.Output<string>>;
    /** Working directory */
    dir?: string;
}

/**
 * Runs a local command
 * Uses @pulumi/command local.Command
 */
export function runCommand(options: RunCommandOptions): command.local.Command {
    const { name, create, delete: deleteCmd, update, dependsOn, environment, dir } = options;

    return new command.local.Command(
        name,
        {
            create,
            delete: deleteCmd,
            update: update ?? (typeof create === "string" ? create : undefined),
            environment: environment as Record<string, string> | undefined,
            dir,
        },
        { dependsOn }
    );
}

export interface WriteFileOptions {
    /** Unique resource name */
    name: string;
    /** Absolute path to the file */
    path: string;
    /** File content */
    content: string | pulumi.Output<string>;
    /** File permissions (octal, e.g., "644") */
    mode?: string;
    /** File owner (e.g., "root" or "syncreeper") - Linux only */
    owner?: string;
    /** File group (e.g., "root" or "syncreeper") - Linux only */
    group?: string;
    /** Resources this depends on */
    dependsOn?: pulumi.Resource[];
}

/**
 * Writes a file to the filesystem using a command
 * Handles content escaping and permissions
 *
 * On macOS, owner/group are ignored (uses current user).
 * On Linux, uses chown to set ownership.
 *
 * NOTE: For large files (>100KB), use copyFile instead to avoid
 * "argument list too long" errors.
 */
export function writeFile(options: WriteFileOptions): command.local.Command {
    const {
        name,
        path,
        content,
        mode = "644",
        owner = "root",
        group = "root",
        dependsOn,
    } = options;

    let createCmd: pulumi.Output<string>;

    if (isMacOS()) {
        // macOS: don't use chown (current user owns files)
        createCmd = pulumi.interpolate`cat > ${path} << 'SYNCREEPER_EOF'
${content}
SYNCREEPER_EOF
chmod ${mode} ${path}`;
    } else {
        // Linux: use chown for proper ownership
        createCmd = pulumi.interpolate`cat > ${path} << 'SYNCREEPER_EOF'
${content}
SYNCREEPER_EOF
chmod ${mode} ${path}
chown ${owner}:${group} ${path}`;
    }

    const deleteCmd = `rm -f ${path}`;

    return new command.local.Command(
        name,
        {
            create: createCmd,
            delete: deleteCmd,
            update: createCmd,
        },
        { dependsOn }
    );
}

export interface CopyFileOptions {
    /** Unique resource name */
    name: string;
    /** Absolute path to the source file (local) */
    src: string;
    /** Absolute path to the destination file */
    dest: string;
    /** File permissions (octal, e.g., "644") */
    mode?: string;
    /** File owner (e.g., "root" or "syncreeper") - Linux only */
    owner?: string;
    /** File group (e.g., "root" or "syncreeper") - Linux only */
    group?: string;
    /** Resources this depends on */
    dependsOn?: pulumi.Resource[];
}

/**
 * Copies a file from source to destination
 * Use this for large files to avoid "argument list too long" errors
 */
export function copyFile(options: CopyFileOptions): command.local.Command {
    const { name, src, dest, mode = "644", owner = "root", group = "root", dependsOn } = options;

    let createCmd: string;
    if (isMacOS()) {
        // macOS: don't use chown
        createCmd = `cp "${src}" "${dest}" && chmod ${mode} "${dest}"`;
    } else {
        // Linux: use chown for proper ownership
        createCmd = `cp "${src}" "${dest}" && chmod ${mode} "${dest}" && chown ${owner}:${group} "${dest}"`;
    }
    const deleteCmd = `rm -f "${dest}"`;

    return new command.local.Command(
        name,
        {
            create: createCmd,
            delete: deleteCmd,
            update: createCmd,
        },
        { dependsOn }
    );
}

export interface EnableServiceOptions {
    /** Unique resource name */
    name: string;
    /** Service name (without .service on Linux, plist name on macOS) */
    service: string;
    /** Whether to start the service immediately */
    start?: boolean;
    /** Whether to enable on boot */
    enable?: boolean;
    /** Resources this depends on */
    dependsOn?: pulumi.Resource[];
}

/**
 * Enables and optionally starts a system service
 *
 * Platform behavior:
 * - Linux: Uses systemctl to manage systemd services
 * - macOS: Uses launchctl to manage LaunchAgents
 *
 * Note: For Homebrew-installed services on macOS, use enableBrewService() instead.
 */
export function enableService(options: EnableServiceOptions): command.local.Command {
    if (isMacOS()) {
        return enableServiceDarwin(options);
    }
    if (isLinux()) {
        return enableServiceLinux(options);
    }
    throw new Error(`Unsupported platform: ${process.platform}`);
}

// Re-export platform-specific functions for direct use when needed
export { enableServiceLinux } from "./command.linux";
export { enableServiceDarwin, enableBrewService } from "./command.darwin";
export type { EnableServiceLinuxOptions } from "./command.linux";
export type { EnableServiceDarwinOptions, EnableBrewServiceOptions } from "./command.darwin";
