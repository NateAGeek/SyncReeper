/**
 * Utility to correctly run user-level commands when the dashboard is launched as root.
 *
 * Problem: `systemctl --user` and `journalctl --user` check the *current* user's
 * session. When root runs them, they see root's (empty) user services, not the
 * syncreeper service user's. Same for `syncthing cli`.
 *
 * Solution: Detect root, resolve the service user + UID, then prefix commands with
 *   sudo -u <user> env XDG_RUNTIME_DIR=/run/user/<uid> DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/<uid>/bus <command>
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
 * Wraps a command that needs the service user's session (systemctl --user,
 * syncthing cli, etc.).
 *
 * If not root, returns the command as-is.
 * If root, wraps it with `sudo -u <user> env XDG_RUNTIME_DIR=... DBUS_SESSION_BUS_ADDRESS=...`.
 *
 * NOTE: Do NOT use this for `journalctl --user` — use `asJournalctl()` instead.
 */
export function asServiceUser(command: string, args: string[]): ResolvedCommand {
    if (!isRoot()) {
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
