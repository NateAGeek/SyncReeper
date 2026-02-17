/**
 * Setup command for the passthrough tunnel client
 *
 * Interactive setup flow that:
 * 1. Checks/installs autossh via Homebrew
 * 2. Prompts for VPS connection details
 * 3. Generates an SSH keypair for the tunnel
 * 4. Generates and installs a launchd plist for autossh
 * 5. Prints next steps for VPS configuration
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
    getPlistPath,
    saveConfig,
    loadConfig,
    type PassthroughClientConfig,
} from "../config.js";

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
 * Finds the autossh binary path
 */
async function findAutosshPath(): Promise<string> {
    try {
        const { stdout } = await execa("which", ["autossh"]);
        return stdout.trim();
    } catch {
        // Default Homebrew paths
        const paths = ["/opt/homebrew/bin/autossh", "/usr/local/bin/autossh"];
        for (const p of paths) {
            if (existsSync(p)) return p;
        }
        return "/opt/homebrew/bin/autossh";
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

/**
 * Generates the launchd plist XML for autossh
 */
function generatePlist(config: PassthroughClientConfig, autosshPath: string): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>${DEFAULTS.plistLabel}</string>

    <key>ProgramArguments</key>
    <array>
        <string>${autosshPath}</string>
        <string>-M</string>
        <string>0</string>
        <string>-N</string>
        <string>-o</string>
        <string>ServerAliveInterval=30</string>
        <string>-o</string>
        <string>ServerAliveCountMax=3</string>
        <string>-o</string>
        <string>ExitOnForwardFailure=yes</string>
        <string>-o</string>
        <string>StrictHostKeyChecking=accept-new</string>
        <string>-i</string>
        <string>${config.keyPath}</string>
        <string>-R</string>
        <string>${config.tunnelPort}:localhost:22</string>
        <string>-p</string>
        <string>${config.vpsPort}</string>
        <string>${config.tunnelUser}@${config.vpsAddress}</string>
    </array>

    <key>RunAtLoad</key>
    <true/>

    <key>KeepAlive</key>
    <true/>

    <key>StandardOutPath</key>
    <string>/tmp/syncreeper-passthrough.out.log</string>

    <key>StandardErrorPath</key>
    <string>/tmp/syncreeper-passthrough.err.log</string>

    <key>EnvironmentVariables</key>
    <dict>
        <key>AUTOSSH_GATETIME</key>
        <string>0</string>
    </dict>
</dict>
</plist>
`;
}

/**
 * Installs the launchd plist
 */
async function installPlist(plistContent: string): Promise<void> {
    const plistPath = getPlistPath();

    console.log("\n--- Installing LaunchAgent ---\n");

    // Unload existing plist if present
    if (existsSync(plistPath)) {
        console.log("Unloading existing LaunchAgent...");
        try {
            await execa("launchctl", ["unload", plistPath]);
        } catch {
            // May not be loaded, that's fine
        }
    }

    // Write the plist file
    const { writeFile: fsWriteFile } = await import("node:fs/promises");
    await fsWriteFile(plistPath, plistContent, "utf-8");
    console.log(`Plist written to: ${plistPath}`);

    // Load the plist
    await execa("launchctl", ["load", plistPath]);
    console.log("LaunchAgent loaded successfully.");
}

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

    // Step 1: Check/install autossh
    const autosshPath = await ensureAutossh();

    // Step 2: Load existing config for defaults
    const existingConfig = await loadConfig();

    // Step 3: Prompt for VPS details
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

    // Step 4: Generate SSH key
    const keyPath = existingConfig?.keyPath ?? getDefaultKeyPath();
    const publicKey = await generateSSHKey(keyPath);

    // Step 5: Build config
    const config: PassthroughClientConfig = {
        vpsAddress,
        vpsPort,
        tunnelPort,
        keyPath,
        tunnelUser: DEFAULTS.tunnelUser,
    };

    // Step 6: Save config
    await saveConfig(config);
    console.log("\nConfiguration saved.");

    // Step 7: Generate and install plist
    const plistContent = generatePlist(config, autosshPath);

    const installNow = await confirm({
        message: "Install and start the LaunchAgent now?",
        default: true,
    });

    if (installNow) {
        await installPlist(plistContent);
    } else {
        console.log("\nYou can start the tunnel later with:");
        console.log("  npx @syncreeper/node-passthrough start");
    }

    // Step 8: Print next steps
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
    console.log("  stdout: /tmp/syncreeper-passthrough.out.log");
    console.log("  stderr: /tmp/syncreeper-passthrough.err.log");
    console.log("");
}
