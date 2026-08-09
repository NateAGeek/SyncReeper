# SyncReeper

An Infrastructure-as-Code system that automatically backs up all your GitHub repositories to a hardened server and synchronizes them across your devices using Syncthing. Built with Pulumi, TypeScript, and a React-based terminal UI.

## Why SyncReeper?

Your GitHub repositories are your work, your side projects, your history. SyncReeper ensures you always have a complete, up-to-date mirror of every repository you own or contribute to -- cloned to a server you control, synchronized to every machine you use, and protected by a security-hardened environment. No manual intervention required.

## How It Works

```
GitHub ──(API)──> VPS / Mac ──(Syncthing)──> Laptop, Desktop, NAS, ...
                     |
              Daily scheduled sync
              Security hardened
              Terminal dashboard
```

1. **Fetches** all your non-archived GitHub repositories via the REST API
2. **Clones** new repos (shallow, single-branch) and **updates** existing ones (`fetch` + `reset`)
3. **Distributes** the repository mirror to your other devices via Syncthing peer-to-peer sync
4. **Secures** the server with firewall rules, SSH hardening, brute-force protection, and auto-updates
5. **Monitors** everything through an interactive terminal dashboard

## Features

### Repository Backup

- Fetches all non-archived repositories via GitHub REST API (owned, collaborator, org member)
- Paginated fetching for users with many repositories
- Shallow clone (`--depth 1`, `--single-branch`) for efficient initial setup
- Incremental updates via `git fetch` + `git reset --hard`
- Skips repositories with local modifications (dirty working tree, local commits ahead)
- Supports both classic and fine-grained personal access tokens
- Lock file prevents concurrent sync runs (10-minute stale timeout)
- Daily scheduled execution via systemd timer (Linux) or launchd (macOS)

### Cross-Device Synchronization

- Syncthing peer-to-peer file sync -- no cloud intermediary
- Trusted device management (add/remove devices via CLI)
- Shared folder configuration with automatic setup
- Comprehensive `.stignore` generation (OS files, `node_modules`, `.env`, build artifacts for Python, Rust, Go, Java, C/C++, and more)
- Auto-generated `.stignore` patterns from per-repo `.gitignore` files (scoped by path)
- Syncthing GUI accessible only via SSH tunnel for security
- Device ID retrieval command for easy setup

### Server Security

- **Firewall**: UFW (Linux) / pf (macOS) -- default deny inbound, allow outbound, SSH rate-limiting
- **SSH Hardening**: Key-only authentication, password auth disabled, root login disabled, restricted to service user
- **Brute-Force Protection**: SSHGuard with 2-hour block time, 1.5x multiplier, progressive bans
- **Auto-Updates**: Unattended security upgrades with auto-reboot at 3 AM (Linux)
- **Systemd Sandboxing**: `ProtectSystem=strict`, private `/tmp`, limited write paths

### Reverse SSH Tunnel (Passthrough)

- Reach a home machine behind NAT from the VPS
- Dedicated `passthrough` system user with no login shell
- SSHD Match block with forced command, restricted TCP forwarding
- No interactive terminal, no X11, no agent forwarding
- Client-side tool for macOS/Linux with autossh and launchd integration
- Commands: `setup`, `start`, `stop`, `status`, `uninstall`

### Terminal Dashboard (TUI)

- 5 tabbed views: Overview, GitHub Sync, Syncthing, Passthrough, Security
- Real-time service status polling (systemctl / launchctl)
- Log streaming from journalctl / log files
- Service actions: Start, Stop, Restart from within tabs
- Keyboard navigation: Tab/Shift-Tab, j/k scroll, G/g jump, q quit, r refresh
- Colored status badges: RUNNING, STOPPED, ERROR, ACTIVE, ENABLED, DISABLED
- Root-user detection with automatic `sudo -u` command wrapping

### Unified CLI

| Command                    | Description                                  |
| -------------------------- | -------------------------------------------- |
| `syncreeper`               | Launch the TUI dashboard (default)           |
| `syncreeper setup`         | Interactive setup wizard                     |
| `syncreeper sync-now`      | Trigger a manual repository sync             |
| `syncreeper get-device-id` | Retrieve Syncthing device ID (local or SSH)  |
| `syncreeper add-device`    | Add a Syncthing peer device                  |
| `syncreeper redeploy`      | Redeploy the sync bundle without `pulumi up` |

### Infrastructure as Code

- Entire system configuration managed with Pulumi (no manual server setup)
- 5-phase deployment pipeline with explicit dependency ordering
- Cross-platform: Linux (Ubuntu 24.04) and macOS
- Platform abstraction pattern for every service (Linux/macOS implementations)
- Local Pulumi backend -- no cloud account required
- Encrypted secrets storage for tokens and keys

## Quick Start

```bash
# One-line install (Linux / macOS)
curl -fsSL https://raw.githubusercontent.com/NateAGeek/SyncReeper/main/install.sh | bash

# Or manual setup
git clone https://github.com/NateAGeek/SyncReeper.git
cd SyncReeper
pnpm install && pnpm run build

# Configure
pulumi login --local
pnpm run setup

# Deploy
pulumi up
```

For detailed installation instructions, platform-specific steps, and prerequisites, see [INSTALLATION.md](./INSTALLATION.md).

## Configuration

All configuration is stored in Pulumi config. View current settings with `pulumi config`.

### Required Settings

| Key                                    | Description                           |
| -------------------------------------- | ------------------------------------- |
| `syncreeper:github-token`              | GitHub PAT with `repo` scope (secret) |
| `syncreeper:github-username`           | Your GitHub username                  |
| `syncreeper:syncthing-trusted-devices` | Array of trusted Syncthing device IDs |
| `syncreeper:ssh-authorized-keys`       | Array of SSH public keys for access   |

### Optional Settings

| Key                                      | Default      | Description                       |
| ---------------------------------------- | ------------ | --------------------------------- |
| `syncreeper:syncthing-folder-id`         | `repos`      | Syncthing shared folder ID        |
| `syncreeper:sync-schedule`               | `daily`      | Systemd timer schedule expression |
| `syncreeper:repos-path`                  | `/srv/repos` | Repository storage directory      |
| `syncreeper:service-user`                | `syncreeper` | Service user (Linux default)      |
| `syncreeper:passthrough-enabled`         | `false`      | Enable reverse SSH tunnel         |
| `syncreeper:passthrough-port`            | `2222`       | Tunnel port on VPS                |
| `syncreeper:passthrough-authorized-keys` | --           | SSH keys for tunnel user          |

### Modifying Configuration

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

## Usage

### TUI Dashboard

```bash
syncreeper
# or
syncreeper dashboard
```

### Manual Sync

```bash
# Via CLI
syncreeper sync-now
syncreeper sync-now --follow    # Stream logs after triggering

# Via systemd directly (Linux)
sudo systemctl start syncreeper-sync.service
```

### View Logs

```bash
# Via TUI dashboard (recommended)
syncreeper

# Via journalctl (Linux)
journalctl -u syncreeper-sync -f
```

### Syncthing Management

```bash
# Get device ID
syncreeper get-device-id

# Add a peer device
syncreeper add-device

# Access Syncthing GUI (SSH tunnel)
ssh -L 8384:localhost:8384 your-vps
# Then open http://localhost:8384
```

### Check Service Status

```bash
# Via TUI (recommended)
syncreeper

# Manual checks (Linux)
systemctl list-timers syncreeper-sync.timer
systemctl status syncthing@syncreeper
sudo ufw status
```

## Project Structure

```
SyncReeper/
├── packages/
│   ├── shared/                  # Platform detection and shared types
│   ├── host/                    # Pulumi infrastructure (5-phase deployment)
│   │   └── src/
│   │       ├── config/          # Platform-aware configuration
│   │       ├── lib/             # Pulumi command abstractions
│   │       ├── resources/       # User and directory provisioning
│   │       └── services/        # Service modules
│   │           ├── packages/    #   System package installation
│   │           ├── firewall/    #   UFW / pf configuration
│   │           ├── ssh/         #   SSH hardening
│   │           ├── sshguard/    #   Brute-force protection
│   │           ├── auto-updates/#   Unattended security upgrades
│   │           ├── github-sync/ #   Sync app + timer deployment
│   │           ├── syncthing/   #   Syncthing configuration
│   │           └── passthrough/ #   Reverse SSH tunnel
│   ├── sync/                    # Standalone sync app (Rollup-bundled)
│   ├── cli/                     # Unified CLI (yargs subcommands)
│   ├── tui/                     # Terminal dashboard (Ink/React)
│   └── node-passthrough/        # Reverse SSH tunnel client
├── install.sh                   # Linux/macOS installer
├── install.ps1                  # Windows installer
├── Pulumi.yaml                  # Pulumi project definition
└── architecture.md              # Detailed architecture docs
```

## Local Development

### Running the Sync App Locally

```bash
cd packages/sync
cp .env.local.example .env.local

# Edit .env.local with your values:
#   GITHUB_TOKEN=ghp_your_token
#   GITHUB_USERNAME=your_username
#   REPOS_PATH=./test-repos

# Development with hot reload
pnpm run dev:local

# Or production build
pnpm run build && pnpm run start:local
```

### Build Scripts

| Script                | Description                         |
| --------------------- | ----------------------------------- |
| `pnpm run build`      | Build all packages                  |
| `pnpm run build:host` | Build shared + host packages        |
| `pnpm run build:sync` | Build sync application bundle       |
| `pnpm run lint`       | Run ESLint                          |
| `pnpm run lint:fix`   | Auto-fix lint issues                |
| `pnpm run format`     | Format with Prettier                |
| `pnpm run check`      | Full CI check (lint, format, build) |
| `pnpm run clean`      | Remove all dist/ directories        |

### Running Tests

```bash
pnpm --filter @syncreeper/host test
pnpm --filter @syncreeper/tui test
pnpm --filter @syncreeper/cli test
pnpm --filter @syncreeper/shared test
```

## Tech Stack

| Technology  | Role                               |
| ----------- | ---------------------------------- |
| TypeScript  | Primary language (entire codebase) |
| Pulumi      | Infrastructure-as-Code engine      |
| React + Ink | Terminal UI dashboard              |
| Octokit     | GitHub REST API client             |
| simple-git  | Git clone/fetch operations         |
| Syncthing   | Peer-to-peer file synchronization  |
| Rollup      | Sync app bundling                  |
| Yargs       | CLI argument parsing               |
| Vitest      | Test runner                        |
| pnpm        | Workspace-aware package manager    |

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
syncreeper get-device-id
```

### Firewall blocking connections

```bash
# View current rules
sudo ufw status verbose

# Check SSHGuard blocks
sudo journalctl -u sshguard -n 50
```

### Permission errors (EROFS)

If the sync service fails with "read-only file system" errors, check the systemd sandboxing:

```bash
cat /etc/systemd/system/syncreeper-sync.service | grep ReadWritePaths
# Should show: ReadWritePaths=/srv/repos

# After fixing, reload and restart
sudo systemctl daemon-reload
sudo systemctl start syncreeper-sync.service
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run `pnpm run check` to verify lint, format, and build
5. Submit a pull request

## License

MIT
