/**
 * Utility to correctly run user-level and system-level commands from the dashboard.
 *
 * Handles three execution contexts:
 *
 * 1. **Running as root**: Wraps user-level commands with
 *    `sudo -u <user> env XDG_RUNTIME_DIR=... DBUS_SESSION_BUS_ADDRESS=... <command>`
 *
 * 2. **Running as the service user (syncreeper)**: Ensures `XDG_RUNTIME_DIR` and
 *    `DBUS_SESSION_BUS_ADDRESS` are set, since system users created with `useradd --system`
 *    may not get a full login session with these variables set via PAM.
 *
 * 3. **System-level commands (sshguard, ufw, etc.)**: Wraps with `sudo` when not root,
 *    allowing graceful fallback if the user lacks sudo access.
 *
 * Exception: `journalctl --user` does not work via sudo because the switched user
 * lacks read permissions on journal files. For logs, use `asJournalctl()` which queries
 * the system journal with `_SYSTEMD_USER_UNIT=<unit>` when root.
 */

import * as os from "node:os";
import { execaSync } from "execa";
import { isLinux } from "@syncreeper/shared";
import { DEFAULT_SERVICE_USER_LINUX } from "@syncreeper/shared";

export interface ResolvedCommand {
    command: string;
    args: string[];
}

/** Cached service user info so we only look it up once. */
let cachedServiceUser: { name: string; uid: string } | null = null;

/**
 * Reset the cached service user info. Exported for testing only.
 * @internal
 */
export function _resetServiceUserCache(): void {
    cachedServiceUser = null;
}

function resolveServiceUser(): { name: string; uid: string } | null {
    if (cachedServiceUser !== null) return cachedServiceUser;

    const name = DEFAULT_SERVICE_USER_LINUX;
    try {
        const result = execaSync("id", ["-u", name]);
        const uid = result.stdout.trim();
        if (uid) {
            cachedServiceUser = { name, uid };
            return cachedServiceUser;
        }
    } catch {
        // Service user doesn't exist
    }

    return null;
}

/**
 * Returns true if the current process is running as root on Linux.
 */
export function isRoot(): boolean {
    return isLinux() && os.userInfo().uid === 0;
}

/**
 * Returns true if the D-Bus session environment variables are missing.
 *
 * System users created with `useradd --system` often don't get a full login
 * session, so XDG_RUNTIME_DIR and DBUS_SESSION_BUS_ADDRESS may not be set
 * even when running directly as that user.
 */
function needsDbusEnv(): boolean {
    return !process.env.XDG_RUNTIME_DIR || !process.env.DBUS_SESSION_BUS_ADDRESS;
}

/**
 * Wraps a command that needs the service user's session (systemctl --user,
 * syncthing cli, etc.).
 *
 * Handles three cases:
 * - **Root**: wraps with `sudo -u <user> env XDG_RUNTIME_DIR=... DBUS_SESSION_BUS_ADDRESS=...`
 * - **Service user without D-Bus env**: prefixes with `env XDG_RUNTIME_DIR=... DBUS_SESSION_BUS_ADDRESS=...`
 * - **Service user with D-Bus env already set**: returns the command as-is
 *
 * NOTE: Do NOT use this for `journalctl --user` — use `asJournalctl()` instead.
 */
export function asServiceUser(command: string, args: string[]): ResolvedCommand {
    if (!isRoot()) {
        // Not root — running as the service user (or another non-root user).
        // System users may lack XDG_RUNTIME_DIR/DBUS_SESSION_BUS_ADDRESS,
        // so inject them if missing.
        if (isLinux() && needsDbusEnv()) {
            const uid = String(os.userInfo().uid);
            return {
                command: "env",
                args: [
                    `XDG_RUNTIME_DIR=/run/user/${uid}`,
                    `DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/${uid}/bus`,
                    command,
                    ...args,
                ],
            };
        }
        return { command, args };
    }

    const user = resolveServiceUser();
    if (!user) {
        // Service user not found; return as-is and let it fail gracefully
        return { command, args };
    }

    return {
        command: "sudo",
        args: [
            "-u",
            user.name,
            "env",
            `XDG_RUNTIME_DIR=/run/user/${user.uid}`,
            `DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/${user.uid}/bus`,
            command,
            ...args,
        ],
    };
}

/**
 * Build a journalctl command that works when running as root.
 *
 * `sudo -u <user> journalctl --user` fails because the switched user lacks
 * read permissions on the journal files.  When root, we query the system
 * journal directly using `_SYSTEMD_USER_UNIT=<unit>` which matches entries
 * written by the service user's systemd instance.
 *
 * When not root (i.e. running as the service user), the standard
 * `journalctl --user -u <unit>` works fine.
 */
export function asJournalctl(unit: string, extraArgs: string[] = []): ResolvedCommand {
    if (isRoot()) {
        return {
            command: "journalctl",
            args: [`_SYSTEMD_USER_UNIT=${unit}`, ...extraArgs],
        };
    }

    return {
        command: "journalctl",
        args: ["--user", "-u", unit, ...extraArgs],
    };
}

/**
 * Wraps a system-level command with `sudo` when running as a non-root user.
 *
 * Used for commands that require root privileges (e.g. `ufw status`,
 * `systemctl status sshguard`, `nft list table`). When already root,
 * runs the command directly.
 *
 * If sudo fails due to permission issues, the caller should detect the
 * error and show a "no permission" status rather than a hard error.
 */
export function asSystemService(command: string, args: string[]): ResolvedCommand {
    if (isRoot()) {
        return { command, args };
    }

    if (!isLinux()) {
        return { command, args };
    }

    // Non-root on Linux: wrap with sudo
    return {
        command: "sudo",
        args: ["-n", command, ...args],
    };
}
