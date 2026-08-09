/**
 * Setup command for the passthrough tunnel client
 *
 * Interactive setup flow that:
 * 1. Checks/installs autossh via Homebrew
 * 2. Prompts for VPS connection details
 * 3. Generates an SSH keypair for the tunnel
 * 4. Migrates from legacy LaunchAgent if present
 * 5. Generates and installs a LaunchDaemon plist for autossh
 * 6. Optionally configures power management for always-on operation
 * 7. Prints next steps for VPS configuration
 */

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { input, confirm } from "@inquirer/prompts";
import { execa } from "execa";

import {
    DEFAULTS,
    getDefaultKeyPath,
    getLegacyPlistPath,
    getLogOutPath,
    getLogErrPath,
    saveConfig,
    loadConfig,
    type PassthroughClientConfig,
} from "../config.js";

import { findAutosshPath, installAndLoadDaemon } from "./helpers.js";

// ──────────────────────────────────────────────
//  Dependency checks
// ──────────────────────────────────────────────

/**
 * Checks if a command exists on the system
 */
async function commandExists(cmd: string): Promise<boolean> {
    try {
        await execa("which", [cmd]);
        return true;
    } catch {
        return false;
    }
}

/**
 * Ensures autossh is installed via Homebrew
 */
async function ensureAutossh(): Promise<string> {
    console.log("\n--- Checking for autossh ---\n");

    if (await commandExists("autossh")) {
        const autosshPath = await findAutosshPath();
        console.log(`autossh found at: ${autosshPath}`);
        return autosshPath;
    }

    console.log("autossh is not installed. It is required to maintain the tunnel connection.");

    // Check if Homebrew is available
    if (!(await commandExists("brew"))) {
        console.error(
            "Error: Homebrew is not installed. Please install Homebrew first:\n" +
                "  https://brew.sh\n" +
                "\nThen run this setup again."
        );
        process.exit(1);
    }

    console.log("Installing autossh via Homebrew...\n");

    try {
        await execa("brew", ["install", "autossh"], { stdio: "inherit" });
        console.log("\nautossh installed successfully.");
        return await findAutosshPath();
    } catch (error) {
        console.error("Failed to install autossh:", error);
        process.exit(1);
    }
}

// ──────────────────────────────────────────────
//  SSH key generation
// ──────────────────────────────────────────────

/**
 * Generates an SSH keypair for the tunnel connection
 */
async function generateSSHKey(keyPath: string): Promise<string> {
    console.log("\n--- SSH Key Generation ---\n");

    const publicKeyPath = `${keyPath}.pub`;

    if (existsSync(keyPath)) {
        console.log(`SSH key already exists at: ${keyPath}`);

        const overwrite = await confirm({
            message: "Overwrite existing key?",
            default: false,
        });

        if (!overwrite) {
            const pubKey = await readFile(publicKeyPath, "utf-8");
            return pubKey.trim();
        }
    }

    console.log(`Generating Ed25519 SSH keypair at: ${keyPath}`);

    // Ensure .ssh directory exists
    const sshDir = join(homedir(), ".ssh");
    if (!existsSync(sshDir)) {
        await execa("mkdir", ["-p", sshDir]);
        await execa("chmod", ["700", sshDir]);
    }

    await execa("ssh-keygen", [
        "-t",
        "ed25519",
        "-f",
        keyPath,
        "-N",
        "",
        "-C",
        "syncreeper-passthrough",
    ]);

    console.log("SSH keypair generated successfully.");

    const pubKey = await readFile(publicKeyPath, "utf-8");
    return pubKey.trim();
}

// ──────────────────────────────────────────────
//  Legacy LaunchAgent migration
// ──────────────────────────────────────────────

/**
 * Detects and migrates from the legacy LaunchAgent to a LaunchDaemon.
 * If a LaunchAgent plist exists at ~/Library/LaunchAgents/, it is
 * unloaded and removed so the new LaunchDaemon can take over.
 */
async function migrateLegacyAgent(): Promise<void> {
    const legacyPath = getLegacyPlistPath();

    if (!existsSync(legacyPath)) {
        return;
    }

    console.log("\n--- Legacy LaunchAgent Detected ---\n");
    console.log(`Found existing LaunchAgent at: ${legacyPath}`);
    console.log("This will be replaced with a system-level LaunchDaemon that");
    console.log("runs at boot and persists across logout and lock screen.\n");

    const migrate = await confirm({
        message: "Remove the legacy LaunchAgent and migrate to a LaunchDaemon?",
        default: true,
    });

    if (!migrate) {
        console.log("\nWarning: Both the LaunchAgent and LaunchDaemon cannot run simultaneously.");
        console.log("The legacy LaunchAgent will be left in place but may conflict.\n");
        return;
    }

    // Unload the legacy agent
    try {
        await execa("launchctl", ["unload", legacyPath]);
        console.log("Legacy LaunchAgent unloaded.");
    } catch {
        // May not be loaded
    }

    // Remove the legacy plist file
    try {
        const { unlink } = await import("node:fs/promises");
        await unlink(legacyPath);
        console.log("Legacy LaunchAgent plist removed.");
    } catch {
        console.log(
            "Note: Could not remove legacy plist file. You may need to delete it manually:"
        );
        console.log(`  rm ${legacyPath}`);
    }
}

// ──────────────────────────────────────────────
//  Power management configuration
// ──────────────────────────────────────────────

/**
 * The pmset settings for always-on tunnel operation.
 * Each entry is [flag, value, description].
 */
const POWER_SETTINGS: Array<[string, string, string]> = [
    ["sleep", "0", "Prevent system sleep"],
    ["displaysleep", "30", "Display sleeps after 30 minutes"],
    ["disksleep", "0", "Prevent disk sleep"],
    ["tcpkeepalive", "1", "Keep TCP connections alive during display sleep"],
    ["powernap", "0", "Disable Power Nap"],
    ["womp", "1", "Enable Wake on LAN"],
];

/**
 * Configures macOS power management for always-on tunnel operation.
 * Prevents system sleep, keeps TCP alive, and enables Wake on LAN.
 * Requires sudo.
 */
async function configurePowerSettings(): Promise<void> {
    console.log("\n--- Power Management Configuration ---\n");
    console.log("For the tunnel to remain connected, the system should not sleep.");
    console.log("The following power settings are recommended:\n");

    for (const [flag, value, description] of POWER_SETTINGS) {
        console.log(`  pmset -a ${flag.padEnd(16)} ${value.padEnd(4)}  # ${description}`);
    }
    console.log("");

    const configure = await confirm({
        message: "Apply these power settings now? (requires sudo)",
        default: true,
    });

    if (!configure) {
        console.log("\nSkipped. You can apply these settings manually later with:");
        for (const [flag, value] of POWER_SETTINGS) {
            console.log(`  sudo pmset -a ${flag} ${value}`);
        }
        return;
    }

    console.log("\nApplying power settings...\n");

    for (const [flag, value, description] of POWER_SETTINGS) {
        try {
            await execa("sudo", ["pmset", "-a", flag, value], { stdio: "inherit" });
            console.log(`  ${description}: OK`);
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            console.error(`  ${description}: FAILED - ${msg}`);
        }
    }

    console.log("\nPower settings applied.");
}

// ──────────────────────────────────────────────
//  Main setup flow
// ──────────────────────────────────────────────

/**
 * Main setup flow
 */
export async function setup(): Promise<void> {
    console.log("=========================================");
    console.log("  SyncReeper Passthrough Tunnel Setup");
    console.log("=========================================");
    console.log("");
    console.log("This will configure a persistent reverse SSH tunnel");
    console.log("from this machine to your VPS, allowing you to SSH");
    console.log("into this machine from the VPS without exposing any");
    console.log("ports on your home network.");
    console.log("");
    console.log("The tunnel runs as a system-level LaunchDaemon so it");
    console.log("starts at boot and persists across logout and lock screen.");

    // Step 1: Check/install autossh
    await ensureAutossh();

    // Step 2: Load existing config for defaults
    const existingConfig = await loadConfig();

    // Step 3: Migrate legacy LaunchAgent if present
    await migrateLegacyAgent();

    // Step 4: Prompt for VPS details
    console.log("\n--- VPS Connection Details ---\n");

    const vpsAddress = await input({
        message: "VPS hostname or IP address:",
        default: existingConfig?.vpsAddress,
        validate: (value) => {
            if (!value.trim()) return "VPS address is required";
            return true;
        },
    });

    const vpsPortStr = await input({
        message: "VPS SSH port:",
        default: String(existingConfig?.vpsPort ?? DEFAULTS.vpsPort),
        validate: (value) => {
            const port = parseInt(value, 10);
            if (isNaN(port) || port < 1 || port > 65535) return "Must be a valid port (1-65535)";
            return true;
        },
    });
    const vpsPort = parseInt(vpsPortStr, 10);

    const tunnelPortStr = await input({
        message: "Reverse tunnel port on VPS (the port you'll use to SSH back):",
        default: String(existingConfig?.tunnelPort ?? DEFAULTS.tunnelPort),
        validate: (value) => {
            const port = parseInt(value, 10);
            if (isNaN(port) || port < 1 || port > 65535) return "Must be a valid port (1-65535)";
            return true;
        },
    });
    const tunnelPort = parseInt(tunnelPortStr, 10);

    // Step 5: Generate SSH key
    const keyPath = existingConfig?.keyPath ?? getDefaultKeyPath();
    const publicKey = await generateSSHKey(keyPath);

    // Step 6: Build config
    const config: PassthroughClientConfig = {
        vpsAddress,
        vpsPort,
        tunnelPort,
        keyPath,
        tunnelUser: DEFAULTS.tunnelUser,
    };

    // Step 7: Save config
    await saveConfig(config);
    console.log("\nConfiguration saved.");

    // Step 8: Install and load the LaunchDaemon
    console.log("\n--- Installing LaunchDaemon ---\n");
    console.log("The LaunchDaemon requires sudo to install and manage.");
    console.log("You may be prompted for your password.\n");

    const installNow = await confirm({
        message: "Install and start the LaunchDaemon now?",
        default: true,
    });

    if (installNow) {
        await installAndLoadDaemon(config);
    } else {
        console.log("\nYou can start the tunnel later with:");
        console.log("  npx @syncreeper/node-passthrough start");
    }

    // Step 9: Configure power management
    await configurePowerSettings();

    // Step 10: Print next steps
    console.log("\n=========================================");
    console.log("  Setup Complete - Next Steps");
    console.log("=========================================");
    console.log("");
    console.log("1. Add this public key to your VPS Pulumi config:");
    console.log("");
    console.log("   pulumi config set --path 'syncreeper:passthrough-authorized-keys[0]' \\");
    console.log(`     '${publicKey}'`);
    console.log("");
    console.log("2. Enable the passthrough service on your VPS:");
    console.log("");
    console.log("   pulumi config set syncreeper:passthrough-enabled true");
    console.log(`   pulumi config set syncreeper:passthrough-port ${tunnelPort}`);
    console.log("");
    console.log("3. Deploy the changes:");
    console.log("");
    console.log("   pulumi up");
    console.log("");
    console.log("4. Once deployed, from your VPS you can SSH into this machine:");
    console.log("");
    console.log(`   ssh <your-user>@localhost -p ${tunnelPort}`);
    console.log("");

    if (!installNow) {
        console.log("5. Start the tunnel when ready:");
        console.log("");
        console.log("   npx @syncreeper/node-passthrough start");
        console.log("");
    }

    console.log("Tunnel logs are written to:");
    console.log(`  stdout: ${getLogOutPath()}`);
    console.log(`  stderr: ${getLogErrPath()}`);
    console.log("");
    console.log("The tunnel runs as a system LaunchDaemon and will:");
    console.log("  - Start automatically at boot (no login required)");
    console.log("  - Persist across logout and lock screen");
    console.log("  - Auto-reconnect if the connection drops");
    console.log("");
}
