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
- **Encrypted Secrets** - GitHub tokens and API keys stored encrypted in Pulumi config
- **Minimal Attack Surface** - Syncthing GUI only accessible via SSH tunnel

## Prerequisites

- **VPS** running Ubuntu 24.04 with root SSH access
- **Node.js** 18+ installed locally
- **Pulumi CLI** installed (`curl -fsSL https://get.pulumi.com | sh`)
- **GitHub Personal Access Token** with `repo` scope

## Quick Start

### 1. Clone and Install

```bash
git clone https://github.com/NateAGeek/SyncReeper.git
cd SyncReeper
npm install
cd sync && npm install && cd ..
```

### 2. Initialize Pulumi

```bash
# Use local backend (no Pulumi Cloud account needed)
pulumi login --local

# Run interactive setup
npm run setup
```

The setup wizard will prompt for:

- GitHub username and token
- Syncthing API key (auto-generated)
- Trusted Syncthing device IDs
- SSH public keys for VPS access

### 3. Deploy to VPS

SSH into your VPS and run:

```bash
pulumi up
```

### 4. Connect Your Devices

Get the VPS Syncthing device ID:

```bash
npm run get-device-id
```

Add this device ID to Syncthing on your other machines to start syncing.

## Usage

### Manual Sync

Trigger an immediate repository sync:

```bash
npm run sync-now
```

Or SSH to the VPS and run:

```bash
sync-repos
```

### View Sync Logs

```bash
ssh your-vps journalctl -u syncreeper-sync -f
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
ssh your-vps sudo ufw status

# Syncthing status
ssh your-vps systemctl status syncthing@syncreeper

# Sync timer status
ssh your-vps systemctl list-timers syncreeper-sync.timer
```

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
| `syncreeper:syncthing-api-key`         | Yes      | Syncthing REST API key (secret)              |
| `syncreeper:syncthing-trusted-devices` | Yes      | Array of trusted device IDs                  |
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
├── src/                      # Pulumi infrastructure code
│   ├── index.ts              # Main orchestrator
│   ├── config/               # Configuration types and loader
│   ├── lib/                  # Utility functions
│   ├── resources/            # Base resources (user, directories)
│   ├── services/             # Service modules
│   │   ├── firewall/         # UFW configuration
│   │   ├── sshguard/         # Brute-force protection
│   │   ├── auto-updates/     # Unattended upgrades
│   │   ├── github-sync/      # Sync service + timer
│   │   └── syncthing/        # Syncthing installation
│   └── scripts/              # Helper scripts
│
├── sync/                     # Standalone sync application
│   └── src/
│       ├── index.ts          # Entry point
│       ├── github.ts         # GitHub API client
│       ├── git.ts            # Git operations
│       └── lock.ts           # Lock file handling
│
├── package.json
├── tsconfig.json
├── eslint.config.js
└── Pulumi.yaml
```

## Scripts

| Script                  | Description                          |
| ----------------------- | ------------------------------------ |
| `npm run setup`         | Interactive configuration wizard     |
| `npm run get-device-id` | Get VPS Syncthing device ID          |
| `npm run sync-now`      | Trigger manual sync on VPS           |
| `npm run build`         | Build Pulumi infrastructure          |
| `npm run build:sync`    | Build sync application               |
| `npm run build:all`     | Build everything                     |
| `npm run lint`          | Run ESLint                           |
| `npm run lint:fix`      | Fix ESLint issues                    |
| `npm run format`        | Format with Prettier                 |
| `npm run check`         | Run all checks (lint, format, build) |

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

## Troubleshooting

### Sync not running

```bash
# Check timer status
systemctl list-timers syncreeper-sync.timer

# Check service logs
journalctl -u syncreeper-sync -n 100

# Run manually with verbose output
sudo -u syncreeper /usr/bin/node /opt/syncreeper/sync/dist/index.js
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

## Development

### Local Development

```bash
# Install dependencies
npm install
cd sync && npm install && cd ..

# Run checks
npm run check

# Build
npm run build:all
```

### Testing Changes

Use a separate Pulumi stack for testing:

```bash
pulumi stack init test
npm run setup
pulumi up
```

## License

MIT

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run `npm run check` to verify
5. Submit a pull request
