# Installation Guide

This guide covers installing SyncReeper on all supported platforms. SyncReeper can be deployed to a Linux VPS (Ubuntu 24.04), run locally on macOS, or configured from a Windows machine via WSL2.

## Table of Contents

- [Automated Installation](#automated-installation)
- [Prerequisites](#prerequisites)
- [Manual Installation](#manual-installation)
- [Configuration](#configuration)
- [Deployment](#deployment)
- [Post-Deployment Setup](#post-deployment-setup)
- [Passthrough Tunnel Setup (Optional)](#passthrough-tunnel-setup-optional)
- [Updating](#updating)
- [Uninstalling](#uninstalling)

---

## Automated Installation

The fastest way to get started. The installer handles all prerequisites, builds the project, links the CLI globally, and runs the interactive setup wizard.

### Linux / macOS

```bash
# One-line install (downloads and runs the install script)
curl -fsSL https://raw.githubusercontent.com/NateAGeek/SyncReeper/main/install.sh | bash
```

Or if you've already cloned the repository:

```bash
./install.sh
```

The script will:

1. Detect your OS (Debian/Fedora/Arch/macOS)
2. Install missing prerequisites (Git, NVM, Node.js 20, pnpm, Pulumi)
3. Install all workspace dependencies (`pnpm install`)
4. Build all packages (`pnpm run build`)
5. Link the `syncreeper` CLI globally
6. Set up Pulumi with a local backend
7. Run the interactive setup wizard (or preserve existing config)

### Windows

```powershell
# Run the PowerShell installer
.\install.ps1

# Or with execution policy bypass
powershell -ExecutionPolicy Bypass -File install.ps1
```

The Windows installer uses `winget` or Chocolatey to install prerequisites.

> **Note:** Windows is supported as a configuration/management platform only. The actual deployment target must be a Linux VPS or macOS machine. For local development on Windows, use WSL2.

---

## Prerequisites

If you prefer to install prerequisites manually, here is what SyncReeper requires:

### Required Tools

| Tool        | Version | Purpose                                 | Install                                   |
| ----------- | ------- | --------------------------------------- | ----------------------------------------- |
| **Git**     | Any     | Repository cloning                      | `apt install git` / `brew install git`    |
| **Node.js** | 20+     | Runtime (requires `--env-file` support) | Via [NVM](https://github.com/nvm-sh/nvm)  |
| **pnpm**    | 8+      | Workspace-aware package manager         | `npm install -g pnpm`                     |
| **Pulumi**  | 3+      | Infrastructure-as-Code engine           | `curl -fsSL https://get.pulumi.com \| sh` |

### Required Accounts / Credentials

| Credential                       | Where to Get It                                                                                     |
| -------------------------------- | --------------------------------------------------------------------------------------------------- |
| **GitHub Personal Access Token** | [GitHub Settings > Developer Settings > Personal Access Tokens](https://github.com/settings/tokens) |
| **VPS with SSH Access**          | Any provider (Hetzner, DigitalOcean, Linode, etc.) running Ubuntu 24.04                             |
| **SSH Key Pair**                 | `ssh-keygen -t ed25519` if you don't have one                                                       |

#### GitHub Token Scopes

Your PAT needs the following scope:

- **`repo`** -- Full control of private repositories (includes read access to public repos)

Both **classic** and **fine-grained** tokens are supported.

### Platform-Specific Notes

#### Linux (Deployment Target)

- Ubuntu 24.04 is the primary supported distribution
- Root SSH access is required for initial deployment
- `apt-get` must be available (Debian/Ubuntu)

#### macOS (Local Deployment)

- Homebrew is required (the installer will install it if missing)
- macOS deployment uses `launchd` instead of systemd
- The current user is used as the service user (no separate system user)

#### Windows (Configuration Only)

- Install prerequisites via `winget` or Chocolatey
- Deploy to a Linux VPS via SSH from Windows
- For local testing, use WSL2 with the Linux instructions

---

## Manual Installation

### 1. Install NVM and Node.js

```bash
# Install NVM
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash

# Reload shell
source ~/.bashrc   # or ~/.zshrc

# Install Node.js 20
nvm install 20
nvm alias default 20
```

### 2. Install pnpm

```bash
npm install -g pnpm
```

### 3. Install Pulumi

```bash
curl -fsSL https://get.pulumi.com | sh

# Add to PATH (if not already)
export PATH="$HOME/.pulumi/bin:$PATH"
```

### 4. Clone and Build

```bash
git clone https://github.com/NateAGeek/SyncReeper.git
cd SyncReeper

# Install all workspace dependencies
pnpm install

# Build all packages (shared -> tui -> cli -> host -> sync)
pnpm run build
```

### 5. Link the CLI Globally

```bash
cd packages/cli
pnpm link --global
cd ../..
```

You now have the `syncreeper` command available system-wide.

### 6. Verify Installation

```bash
# Check the CLI is available
syncreeper --help

# Verify the sync bundle was built
ls -lh packages/sync/dist/bundle.js

# Run lint and format checks
pnpm run check
```

---

## Configuration

### Initialize Pulumi

SyncReeper uses a local Pulumi backend by default -- no cloud account required.

```bash
# Use local state storage
pulumi login --local
```

### Run the Setup Wizard

The interactive setup wizard prompts for all required configuration:

```bash
pnpm run setup
# or
syncreeper setup
```

The wizard will ask for:

1. **Service username** -- The system user that runs SyncReeper services (default: `syncreeper` on Linux, current user on macOS)
2. **GitHub username** -- Your GitHub account name
3. **GitHub token** -- Your PAT with `repo` scope (stored encrypted)
4. **Syncthing trusted devices** -- Device IDs of machines to sync with
5. **SSH public keys** -- Keys authorized to access the server
6. **Optional settings** -- Repos path, sync schedule, Syncthing folder ID

### Manual Configuration

You can also set values directly:

```bash
# Required
pulumi config set syncreeper:github-username "your-username"
pulumi config set --secret syncreeper:github-token "ghp_your_token"
pulumi config set syncreeper:ssh-authorized-keys '["ssh-ed25519 AAAA... you@machine"]'
pulumi config set syncreeper:syncthing-trusted-devices '["DEVICE-ID-1"]'

# Optional
pulumi config set syncreeper:repos-path "/srv/repos"
pulumi config set syncreeper:sync-schedule "daily"
pulumi config set syncreeper:syncthing-folder-id "repos"
pulumi config set syncreeper:service-user "syncreeper"

# Passthrough (optional)
pulumi config set syncreeper:passthrough-enabled true
pulumi config set syncreeper:passthrough-port 2222
pulumi config set syncreeper:passthrough-authorized-keys '["ssh-ed25519 AAAA... tunnel@machine"]'
```

### View Configuration

```bash
pulumi config
```

---

## Deployment

### Deploy to VPS (Linux)

Ensure you can SSH into your VPS as root:

```bash
ssh root@your-vps-ip
```

Then deploy:

```bash
pulumi up
```

Pulumi will execute the 5-phase deployment pipeline:

| Phase | What Happens                                                               |
| ----- | -------------------------------------------------------------------------- |
| 1     | Creates the `syncreeper` service user and required directories             |
| 2     | Installs system packages (git, Syncthing, SSHGuard, NVM, Node.js 22)       |
| 3     | Configures firewall, SSH hardening, SSHGuard, auto-updates                 |
| 4     | Deploys the sync app bundle, sets up the daily timer, configures Syncthing |
| 5     | Sets up the passthrough tunnel (if enabled)                                |

Review the proposed changes and confirm with `yes`.

### Deploy Locally (macOS)

The same command works for local macOS deployment:

```bash
pulumi up
```

On macOS, SyncReeper uses `launchd` for scheduling, `brew` for package management, and `pf` for the firewall. The current user is the service user.

### Redeploy Sync Bundle Only

If you only need to update the sync application (not the full infrastructure):

```bash
syncreeper redeploy
```

---

## Post-Deployment Setup

### 1. Get the Syncthing Device ID

```bash
# From the deployed machine
syncreeper get-device-id

# Or remotely via SSH
syncreeper get-device-id --ssh your-vps-ip
```

### 2. Add Peer Devices

On each machine you want to sync with:

1. Install Syncthing ([syncthing.net](https://syncthing.net))
2. Get the device ID from the SyncReeper server (step above)
3. Add the server as a remote device in Syncthing
4. Add your other machines to the server:

```bash
syncreeper add-device
```

### 3. Access the Syncthing GUI

The Syncthing web interface is only accessible via SSH tunnel (for security):

```bash
ssh -L 8384:localhost:8384 your-vps-ip
# Then open http://localhost:8384 in your browser
```

On macOS local deployments, it is available directly at `http://localhost:8384`.

### 4. Verify the Sync Timer

```bash
# Linux
systemctl list-timers syncreeper-sync.timer

# macOS
launchctl list | grep syncreeper
```

### 5. Trigger a Manual Sync

```bash
syncreeper sync-now
syncreeper sync-now --follow   # Stream logs after triggering
```

### 6. Open the Dashboard

```bash
syncreeper
```

Use Tab/Shift-Tab to navigate between views, j/k to scroll logs, s/x/R for service actions, and q to quit.

---

## Passthrough Tunnel Setup (Optional)

The passthrough feature creates a reverse SSH tunnel from your home machine (behind NAT) to the VPS, allowing you to reach your home machine from anywhere.

### Enable on the Server

```bash
pulumi config set syncreeper:passthrough-enabled true
pulumi config set syncreeper:passthrough-port 2222
pulumi config set syncreeper:passthrough-authorized-keys '["ssh-ed25519 AAAA... tunnel@home"]'
pulumi up
```

### Configure the Client (Home Machine)

The `node-passthrough` package provides a client tool for macOS/Linux:

```bash
cd packages/node-passthrough

# Interactive setup (installs autossh, generates keys, configures tunnel)
pnpm run setup

# Start the tunnel
pnpm run start

# Check status
pnpm run status

# Stop the tunnel
pnpm run stop

# Remove everything
pnpm run uninstall
```

The client configuration is stored at `~/.config/syncreeper/passthrough.json`.

---

## Updating

### Update SyncReeper

```bash
cd SyncReeper
git pull
pnpm install
pnpm run build

# Re-link CLI if needed
cd packages/cli && pnpm link --global && cd ../..

# Redeploy
pulumi up
```

### Update Just the Sync App

```bash
pnpm run build:sync
syncreeper redeploy
```

---

## Uninstalling

### Remove Deployed Infrastructure

```bash
# Destroy all Pulumi-managed resources
pulumi destroy

# Remove the Pulumi stack
pulumi stack rm dev
```

### Remove Local Installation

```bash
# Unlink the CLI
cd packages/cli && pnpm unlink --global && cd ../..

# Remove the project
cd ..
rm -rf SyncReeper
```

### Remove the Passthrough Client

```bash
cd packages/node-passthrough
pnpm run uninstall
```

---

## Troubleshooting Installation

### `pnpm: command not found`

```bash
npm install -g pnpm
# If npm is also missing, reinstall Node.js via NVM
```

### `pulumi: command not found`

```bash
export PATH="$HOME/.pulumi/bin:$PATH"
# Add this to your ~/.bashrc or ~/.zshrc permanently
```

### Build fails with TypeScript errors

```bash
# Clean all build artifacts and rebuild
pnpm run clean
pnpm install
pnpm run build
```

### `syncreeper: command not found` after linking

```bash
# Re-link the CLI
cd packages/cli
pnpm link --global

# Verify pnpm global bin is in PATH
pnpm bin --global
# Add the output directory to your PATH if needed
```

### Pulumi stack already exists

```bash
# List existing stacks
pulumi stack ls

# Select an existing stack
pulumi stack select dev
```

### SSH connection refused during `pulumi up`

- Verify the VPS is running and accessible: `ssh root@your-vps-ip`
- Check that your SSH key is added to the agent: `ssh-add -l`
- Ensure port 22 is open on the VPS provider's firewall/security group
