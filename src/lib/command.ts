/**
 * Command execution utilities for Pulumi
 * Wraps @pulumi/command for consistent usage across services
 */

import * as command from "@pulumi/command";
import * as pulumi from "@pulumi/pulumi";

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
 * Runs a local command on the VPS
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
    /** File owner (e.g., "root" or "syncreeper") */
    owner?: string;
    /** File group (e.g., "root" or "syncreeper") */
    group?: string;
    /** Resources this depends on */
    dependsOn?: pulumi.Resource[];
}

/**
 * Writes a file to the filesystem using a command
 * Handles content escaping and permissions
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

    // Use pulumi.interpolate to handle Output<string> content
    const createCmd = pulumi.interpolate`cat > ${path} << 'SYNCREEPER_EOF'
${content}
SYNCREEPER_EOF
chmod ${mode} ${path}
chown ${owner}:${group} ${path}`;

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

export interface InstallPackagesOptions {
    /** Unique resource name */
    name: string;
    /** List of packages to install */
    packages: string[];
    /** Resources this depends on */
    dependsOn?: pulumi.Resource[];
}

/**
 * APT lock timeout in seconds (5 minutes)
 * This allows apt to wait for other apt processes to finish
 */
const APT_LOCK_TIMEOUT = 300;

/**
 * Generates apt command with lock timeout
 * Uses DPkg::Lock::Timeout to wait for locks instead of failing immediately
 */
export function generateAptInstallCommand(packages: string[]): string {
    const packageList = packages.join(" ");
    return `apt-get -o DPkg::Lock::Timeout=${APT_LOCK_TIMEOUT} update && DEBIAN_FRONTEND=noninteractive apt-get -o DPkg::Lock::Timeout=${APT_LOCK_TIMEOUT} install -y ${packageList}`;
}

/**
 * Installs packages using apt-get
 * Includes lock timeout to handle concurrent apt operations
 */
export function installPackages(options: InstallPackagesOptions): command.local.Command {
    const { name, packages, dependsOn } = options;

    const createCmd = generateAptInstallCommand(packages);

    return new command.local.Command(
        name,
        {
            create: createCmd,
        },
        { dependsOn }
    );
}

export interface EnableServiceOptions {
    /** Unique resource name */
    name: string;
    /** Service name (without .service) */
    service: string;
    /** Whether to start the service immediately */
    start?: boolean;
    /** Whether to enable on boot */
    enable?: boolean;
    /** Resources this depends on */
    dependsOn?: pulumi.Resource[];
}

/**
 * Enables and optionally starts a systemd service
 */
export function enableService(options: EnableServiceOptions): command.local.Command {
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
