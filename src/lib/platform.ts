/**
 * Platform Detection Utilities
 *
 * Provides platform detection and OS-specific utilities for cross-platform support.
 * SyncReeper supports Linux and macOS for local deployment.
 */

import * as os from "node:os";

/**
 * Supported platforms
 */
export type Platform = "linux" | "darwin" | "win32";

/**
 * Detects the current platform
 */
export function detectPlatform(): Platform {
    return process.platform as Platform;
}

/**
 * Returns true if running on Linux
 */
export function isLinux(): boolean {
    return process.platform === "linux";
}

/**
 * Returns true if running on macOS
 */
export function isMacOS(): boolean {
    return process.platform === "darwin";
}

/**
 * Returns true if running on Windows
 */
export function isWindows(): boolean {
    return process.platform === "win32";
}

/**
 * Returns a human-readable display name for the platform
 */
export function getPlatformDisplayName(platform?: Platform): string {
    const p = platform ?? detectPlatform();
    switch (p) {
        case "linux":
            return "Linux";
        case "darwin":
            return "macOS";
        case "win32":
            return "Windows";
        default:
            return `Unknown (${p})`;
    }
}

/**
 * Gets the current username
 */
export function getCurrentUsername(): string {
    return os.userInfo().username;
}

/**
 * Gets the current user's home directory
 */
export function getHomeDirectory(): string {
    return os.homedir();
}

/**
 * Checks if the current platform is supported for deployment
 */
export function isSupportedPlatform(): boolean {
    return isLinux() || isMacOS();
}

/**
 * Throws an error if the platform is not supported
 */
export function assertSupportedPlatform(): void {
    if (!isSupportedPlatform()) {
        const platform = detectPlatform();
        if (isWindows()) {
            throw new Error(
                "Windows is not supported for local SyncReeper deployment.\n" +
                    "Please use WSL2 (Windows Subsystem for Linux) or deploy to a Linux VPS."
            );
        }
        throw new Error(`Unsupported platform: ${platform}`);
    }
}

/**
 * Logs a banner indicating the current platform
 */
export function logPlatformBanner(): void {
    const platform = detectPlatform();
    const displayName = getPlatformDisplayName(platform);

    console.log("");
    console.log("================================================================================");
    console.log(`  SyncReeper - Running on ${displayName}`);
    console.log("================================================================================");
    console.log("");
}
