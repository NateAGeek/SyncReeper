# SyncReeper

A Pulumi TypeScript project that automatically syncs all your GitHub repositories to a secured VPS and distributes them across devices using Syncthing.

## Overview

SyncReeper solves the problem of keeping a complete, up-to-date backup of all your GitHub repositories synchronized across multiple machines. It runs on a VPS (Ubuntu 24.04) and:

1. **Clones all your GitHub repositories** - Fetches every non-archived repo you have access to
2. **Keeps them updated** - Runs on a daily schedule via systemd timer
3. **Syncs across devices** - Uses Syncthing to distribute repos to your other machines
4. **Stays secure** - Hardens the VPS with firewall, brute-force protection, and auto-updates

## Features

- **Complete GitHub Backup** - Syncs all repositories you own or have access to (excludes archived repos)
- **Cross-Device Sync** - Syncthing distributes your repos to laptops, desktops, NAS, etc.
- **Security Hardened** - UFW firewall (SSH-only), SSHGuard brute-force protection, automatic security updates
- **Infrastructure as Code** - Entire VPS configuration managed with Pulumi
- **Encrypted Secrets** - GitHub tokens stored encrypted in Pulumi config
- **Minimal Attack Surface** - Syncthing GUI only accessible via SSH tunnel

## Prerequisites

- **VPS** running Ubuntu 24.04 with root SSH access
- **Node.js** 20.6+ installed locally (for `--env-file` support)
- **Pulumi CLI** installed (`curl -fsSL https://get.pulumi.com | sh`)
- **GitHub Personal Access Token** with `repo` scope

## Quick Start

### 1. Clone and Install

```bash
git clone https://github.com/NateAGeek/SyncReeper.git
cd SyncReeper
pnpm install
```

### 2. Initialize Pulumi

```bash
# Use local backend (no Pulumi Cloud account needed)
pulumi login --local

# Run interactive setup
pnpm run setup
```

The setup wizard will prompt for:

- GitHub username and token
- Trusted Syncthing device IDs
- SSH public keys for VPS access

### 3. Build and Deploy to VPS

```bash
# Build everything first
pnpm run build

# Deploy to VPS
pulumi up
```

### 4. Connect Your Devices

Get the VPS Syncthing device ID:

```bash
# SSH to VPS and run:
syncreeper-device-id
```

Add this device ID to Syncthing on your other machines to start syncing.

## Usage

### Manual Sync

Trigger an immediate repository sync on the VPS:

```bash
sudo systemctl start syncreeper-sync.service
```

### View Sync Logs

```bash
journalctl -u syncreeper-sync -f
```

### Access Syncthing GUI

The Syncthing web interface is only accessible via SSH tunnel:

```bash
ssh -L 8384:localhost:8384 your-vps
# Then open http://localhost:8384 in your browser
```

### Check Status

```bash
# Firewall status
sudo ufw status

# Syncthing status
systemctl status syncthing@syncreeper

# Sync timer status
systemctl list-timers syncreeper-sync.timer
```

## Local Development

### Running the Sync App Locally

You can test the sync application locally without deploying to a VPS:

```bash
cd packages/sync

# Copy the example env file
cp .env.local.example .env.local

# Edit with your values
# GITHUB_TOKEN=ghp_your_token_here
# GITHUB_USERNAME=your_username
# REPOS_PATH=./test-repos

# Build and run
pnpm run build
pnpm run start:local

# Or for development with hot reload
pnpm run dev:local
```

**Environment Variables:**

| Variable          | Required | Description                                      |
| ----------------- | -------- | ------------------------------------------------ |
| `GITHUB_TOKEN`    | Yes      | GitHub PAT with `repo` scope                     |
| `GITHUB_USERNAME` | Yes      | Your GitHub username                             |
| `REPOS_PATH`      | No       | Directory to store repos (default: `/srv/repos`) |

## Configuration

All configuration is stored in Pulumi config. View current settings:

```bash
pulumi config
```

### Configuration Options

| Key                                    | Required | Description                                  |
| -------------------------------------- | -------- | -------------------------------------------- |
| `syncreeper:github-token`              | Yes      | GitHub PAT with `repo` scope (secret)        |
| `syncreeper:github-username`           | Yes      | Your GitHub username                         |
| `syncreeper:syncthing-trusted-devices` | Yes      | Array of trusted device IDs                  |
| `syncreeper:syncthing-folder-id`       | No       | Folder ID for sync (default: `repos`)        |
| `syncreeper:ssh-authorized-keys`       | Yes      | Array of SSH public keys                     |
| `syncreeper:sync-schedule`             | No       | Systemd timer schedule (default: `daily`)    |
| `syncreeper:repos-path`                | No       | Where to store repos (default: `/srv/repos`) |

### Modify Configuration

```bash
# Update a value
pulumi config set syncreeper:sync-schedule "hourly"

# Update a secret
pulumi config set --secret syncreeper:github-token "ghp_newtoken"

# Update an array (JSON format)
pulumi config set syncreeper:syncthing-trusted-devices '["DEVICE-ID-1", "DEVICE-ID-2"]'

# Apply changes
pulumi up
```

## Project Structure

```
SyncReeper/
├── packages/
│   ├── host/                     # Pulumi infrastructure code
│   │   └── src/
│   │       ├── index.ts          # Main orchestrator
│   │       ├── config/           # Configuration types and loader
│   │       ├── lib/              # Utility functions
│   │       ├── resources/        # Base resources (user, directories)
│   │       └── services/         # Service modules
│   │           ├── firewall/     # UFW configuration
│   │           ├── sshguard/     # Brute-force protection
│   │           ├── auto-updates/ # Unattended upgrades
│   │           ├── github-sync/  # Sync service + timer
│   │           └── syncthing/    # Syncthing configuration
│   │
│   ├── sync/                     # Sync application (bundled for deployment)
│   │   └── src/
│   │       ├── index.ts          # Entry point
│   │       ├── github.ts         # GitHub API client
│   │       ├── git.ts            # Git operations
│   │       └── lock.ts           # Lock file handling
│   │
│   ├── shared/                   # Shared types and utilities
│   │   └── src/
│   │       ├── platform.ts       # Platform detection
│   │       └── config.ts         # Configuration types
│   │
│   ├── host-utils/               # CLI utilities (setup, sync-now, etc.)
│   │   └── src/
│   │       ├── setup.ts          # Interactive setup wizard
│   │       ├── sync-now.ts       # Manual sync trigger
│   │       ├── add-device.ts     # Add Syncthing device
│   │       └── get-device-id.ts  # Get Syncthing device ID
│   │
│   └── node-passthrough/         # Node passthrough service
│
├── package.json
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── eslint.config.js
└── Pulumi.yaml
```

## Scripts

| Script                   | Description                          |
| ------------------------ | ------------------------------------ |
| `pnpm run build`         | Build all packages                   |
| `pnpm run build:host`    | Build shared + host packages         |
| `pnpm run build:sync`    | Build sync application               |
| `pnpm run lint`          | Run ESLint                           |
| `pnpm run lint:fix`      | Fix ESLint issues                    |
| `pnpm run format`        | Format with Prettier                 |
| `pnpm run check`         | Run all checks (lint, format, build) |
| `pnpm run setup`         | Run interactive setup wizard         |
| `pnpm run sync-now`      | Trigger a manual sync                |
| `pnpm run get-device-id` | Get Syncthing device ID              |
| `pnpm run add-device`    | Add a Syncthing device               |

## Security Model

SyncReeper follows a defense-in-depth approach:

1. **Network Security**
    - UFW firewall allows only SSH (port 22)
    - SSH rate-limited to prevent brute-force
    - Syncthing uses relay servers (no exposed ports)

2. **Access Control**
    - Dedicated `syncreeper` service user
    - Syncthing GUI only on localhost
    - SSH key authentication recommended

3. **Brute-Force Protection**
    - SSHGuard monitors auth logs
    - Automatically blocks malicious IPs
    - Progressive ban duration for repeat offenders

4. **Automatic Updates**
    - Unattended security upgrades enabled
    - Automatic reboot at 3 AM if required

5. **Systemd Sandboxing**
    - Sync service runs with `ProtectSystem=strict`
    - Limited write access (only to repos directory)
    - Private `/tmp` directory

## Troubleshooting

### Sync not running

```bash
# Check timer status
systemctl list-timers syncreeper-sync.timer

# Check service logs
journalctl -u syncreeper-sync -n 100

# Run manually
sudo systemctl start syncreeper-sync.service
```

### Syncthing not connecting

```bash
# Check Syncthing status
systemctl status syncthing@syncreeper

# View Syncthing logs
journalctl -u syncthing@syncreeper -f

# Verify device ID
syncreeper-device-id
```

### Firewall blocking connections

```bash
# View current rules
sudo ufw status verbose

# Check SSHGuard blocks
sudo journalctl -u sshguard -n 50
```

### Permission errors (EROFS)

If the sync service fails with "read-only file system" errors:

```bash
# Check the systemd service file
cat /etc/systemd/system/syncreeper-sync.service | grep ReadWritePaths

# Should show:
# ReadWritePaths=/srv/repos

# After fixing, reload and restart
sudo systemctl daemon-reload
sudo systemctl start syncreeper-sync.service
```

## License

MIT

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run `pnpm run check` to verify
5. Submit a pull request
