# SyncReeper Architecture

## Project Overview

SyncReeper is a Pulumi-based Infrastructure-as-Code (IaC) project written in TypeScript that automates:

1. **Repository Backup** — Clones all of a user's GitHub repositories to a secured VPS (or local Mac).
2. **Continuous Sync** — Keeps repositories updated on a daily schedule via systemd timers (Linux) or launchd (macOS).
3. **Cross-Device Sync** — Syncs repository mirrors across multiple devices using Syncthing.
4. **Server Hardening** — Configures firewall rules, SSH hardening, SSHGuard brute-force protection, and automatic security updates.

The project supports both **Linux (Ubuntu VPS)** and **macOS (local)** deployments.

---

## High-Level Architecture

SyncReeper is composed of two sub-projects:

| Sub-Project          | Location | Module System     | Purpose                                                                     |
| -------------------- | -------- | ----------------- | --------------------------------------------------------------------------- |
| **Infrastructure**   | `src/`   | CommonJS (Pulumi) | Provisions and configures the system using `@pulumi/command` local commands |
| **Sync Application** | `sync/`  | ESM (Node.js)     | Standalone app that fetches GitHub repos and clones/updates them locally    |

The infrastructure code deploys the sync application as a bundled `bundle.js` file to the target system and sets up a timer/scheduler to run it daily.

---

## Directory Structure

```
SyncReeper/
├── package.json                        # Root project config (Pulumi infra + scripts)
├── tsconfig.json                       # TypeScript config (CommonJS, ES2022, outDir: ./dist)
├── Pulumi.yaml                         # Pulumi project definition (nodejs/typescript runtime)
├── Pulumi.dev.yaml                     # Encrypted Pulumi stack config (dev stack)
├── eslint.config.js                    # ESLint flat config for both src/ and sync/src/
├── .editorconfig                       # Editor settings (4-space indent, LF line endings)
├── .prettierrc                         # Prettier config (4-space tabs, double quotes, 100 width)
├── .prettierignore                     # Prettier ignore list
├── .gitignore                          # Ignores dist/, node_modules/, .pulumi/, .env files
├── install.sh                          # Bash installer (Linux/macOS) — NVM, Node.js, Pulumi, deps
├── install.ps1                         # PowerShell installer (Windows) — winget/choco
├── README.md                           # User-facing documentation (setup, usage, troubleshooting)
│
├── src/                                # PULUMI INFRASTRUCTURE CODE
│   ├── index.ts                        # Main orchestrator — 4-phase deployment pipeline
│   │
│   ├── config/
│   │   ├── index.ts                    # Config loader — reads Pulumi config, sets service username
│   │   ├── types.ts                    # Config interfaces and platform-aware getters
│   │   ├── paths.linux.ts              # Linux filesystem paths
│   │   └── paths.darwin.ts             # macOS filesystem paths
│   │
│   ├── lib/
│   │   ├── index.ts                    # Re-exports command module
│   │   ├── platform.ts                 # Platform detection utilities
│   │   ├── command.ts                  # Core command abstraction over @pulumi/command
│   │   ├── command.linux.ts            # Linux service enablement (systemctl)
│   │   └── command.darwin.ts           # macOS service enablement (launchctl, brew services)
│   │
│   ├── resources/
│   │   ├── index.ts                    # Re-exports user + directories
│   │   ├── user.ts                     # Service user creation dispatcher
│   │   ├── user.linux.ts               # Creates dedicated system user via useradd
│   │   ├── user.darwin.ts              # Validates existing macOS user
│   │   └── directories.ts             # Creates repos dir, sync app dir, syncthing config dir
│   │
│   ├── services/
│   │   ├── packages/
│   │   │   ├── index.ts                # Platform dispatcher for package installation
│   │   │   ├── types.ts                # SetupPackagesOptions/Result interfaces
│   │   │   ├── linux.ts                # apt-get install + NVM/Node.js 22
│   │   │   └── darwin.ts               # brew install + NVM/Node.js 22
│   │   │
│   │   ├── firewall/
│   │   │   ├── index.ts                # Platform dispatcher
│   │   │   ├── types.ts                # FirewallRule interface, default rules (SSH rate limit)
│   │   │   ├── linux.ts                # UFW firewall configuration
│   │   │   └── darwin.ts               # pf (packet filter) configuration
│   │   │
│   │   ├── ssh/
│   │   │   └── index.ts                # Linux-only SSH hardening (sshd_config.d drop-in)
│   │   │
│   │   ├── sshguard/
│   │   │   ├── index.ts                # Platform dispatcher
│   │   │   ├── types.ts                # SSHGuard config constants (block time, thresholds)
│   │   │   ├── linux.ts                # Whitelist + systemd service
│   │   │   └── darwin.ts               # Whitelist + pf table + brew service
│   │   │
│   │   ├── auto-updates/
│   │   │   ├── index.ts                # Platform dispatcher
│   │   │   ├── types.ts                # Auto-update options (email, reboot settings)
│   │   │   ├── linux.ts                # unattended-upgrades configuration
│   │   │   └── darwin.ts               # No-op on macOS
│   │   │
│   │   ├── github-sync/
│   │   │   ├── index.ts                # Platform dispatcher
│   │   │   ├── types.ts                # SetupGitHubSyncOptions/Result interfaces
│   │   │   ├── linux.ts                # User-level systemd service + timer deployment
│   │   │   └── darwin.ts               # launchd plist deployment
│   │   │
│   │   └── syncthing/
│   │       ├── index.ts                # Platform dispatcher
│   │       ├── types.ts                # SetupSyncthingOptions/Result interfaces
│   │       ├── stignore.ts             # Generates .stignore for common build artifacts
│   │       ├── linux.ts                # Syncthing CLI configuration + systemd service
│   │       └── darwin.ts               # Syncthing CLI configuration + brew service
│   │
│   └── scripts/
│       ├── setup.ts                    # Interactive setup wizard (@inquirer/prompts)
│       ├── get-device-id.ts            # CLI to get Syncthing device ID
│       ├── add-device.ts               # CLI to add a Syncthing device
│       └── sync-now.ts                 # CLI to trigger manual sync
│
└── sync/                               # STANDALONE SYNC APPLICATION
    ├── package.json                    # ESM module with sync-specific dependencies
    ├── tsconfig.json                   # TypeScript config (NodeNext, ES2022)
    ├── rollup.config.js                # Bundles to single dist/bundle.js
    ├── eslint.config.js                # ESLint config
    ├── .prettierrc                     # Prettier config
    ├── .prettierignore                 # Prettier ignore
    ├── .env.local.example              # Example env vars (GITHUB_TOKEN, GITHUB_USERNAME, REPOS_PATH)
    └── src/
        ├── index.ts                    # Entry point: config → lock → fetch repos → sync → summary
        ├── github.ts                   # GitHub API client (Octokit, paginated repo fetching)
        ├── git.ts                      # Git operations (clone/update with authenticated URLs)
        └── lock.ts                     # Lock file handling (proper-lockfile, 10-min stale timeout)
```

---

## Infrastructure Code (`src/`)

### Main Orchestrator (`src/index.ts`)

The entry point for Pulumi. It runs a **4-phase deployment pipeline** with explicit `dependsOn` chains to ensure correct ordering:

| Phase                           | What It Does                                                                                                                                   |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| **Phase 1: User & Directories** | Creates a dedicated service user and required directories (`/srv/repos`, sync app dir, Syncthing config dir)                                   |
| **Phase 2: Packages**           | Installs system packages (git, Syncthing, SSHGuard, etc.) and sets up NVM with Node.js 22                                                      |
| **Phase 3: Security**           | Configures firewall (UFW/pf), SSH hardening, SSHGuard brute-force protection, and automatic security updates                                   |
| **Phase 4: App Services**       | Deploys the sync application bundle, sets up the GitHub sync timer/scheduler, and configures Syncthing with trusted devices and shared folders |

After deployment, it exports post-deployment instructions for the user.

### Config System (`src/config/`)

- **`types.ts`** — Defines interfaces for all configuration sections (`GitHubConfig`, `SyncthingConfig`, `SSHConfig`, etc.) and provides platform-aware getter functions: `getServiceUser()`, `getPaths()`, `getDefaultConfig()`. Uses a module-level `_configuredUsername` variable set during config loading for cross-module access.
- **`index.ts`** — Reads Pulumi config values and populates the configuration objects.
- **`paths.linux.ts` / `paths.darwin.ts`** — Platform-specific filesystem paths:
    - Linux: `/home/{user}`, `/srv/repos`, `/etc/syncreeper`, systemd directories
    - macOS: `~/Library/Application Support`, `~/Library/Logs`, `~/Library/LaunchAgents`

### Lib Layer (`src/lib/`)

- **`platform.ts`** — Platform detection utilities: `isLinux()`, `isMacOS()`, `isWindows()`, `assertSupportedPlatform()`.
- **`command.ts`** — Core abstraction over `@pulumi/command` `local.Command`. Provides:
    - `runCommand()` — Execute a shell command as a Pulumi resource
    - `writeFile()` — Write content to a file on the target system
    - `copyFile()` — Copy a file to the target
    - `enableService()` — Delegates to platform-specific service enablement
- **`command.linux.ts`** — `enableServiceLinux()` (systemctl) and `enableUserServiceLinux()` (systemctl --user)
- **`command.darwin.ts`** — `enableServiceDarwin()` (launchctl) and `enableBrewService()` (brew services)

### Resources (`src/resources/`)

- **`user.ts`** — Dispatches to `user.linux.ts` (creates a dedicated system user via `useradd`) or `user.darwin.ts` (validates an existing macOS user).
- **`directories.ts`** — Creates the repositories directory, sync application directory, and Syncthing configuration directory.

### Services (`src/services/`)

Each service follows a consistent **platform abstraction pattern**:

```
service/
├── index.ts        # Dispatcher — checks platform, delegates to linux.ts or darwin.ts
├── types.ts        # Shared interfaces and constants
├── linux.ts        # Linux implementation
└── darwin.ts       # macOS implementation
```

#### Packages (`services/packages/`)

Installs system dependencies. Linux uses `apt-get`, macOS uses `brew`. Both install NVM and Node.js 22 for the service user.

#### Firewall (`services/firewall/`)

- **Linux** — Configures UFW: reset rules, default deny inbound / allow outbound, add specific rules (SSH with rate limiting), enable.
- **macOS** — Configures pf (packet filter) with an anchor file at `/etc/pf.anchors/com.syncreeper` and SSHGuard table integration.

#### SSH (`services/ssh/`)

**Linux-only.** Writes an SSH hardening drop-in config to `/etc/ssh/sshd_config.d/`: disables password authentication, disables root login, restricts access to the service user, enforces key-only authentication. Also deploys authorized keys.

#### SSHGuard (`services/sshguard/`)

Configures SSHGuard brute-force protection: 2-hour block time, 1.5x multiplier, threshold of 30. Sets up whitelisting and integrates with the platform firewall backend.

#### Auto-Updates (`services/auto-updates/`)

- **Linux** — Configures `unattended-upgrades` for security updates with auto-reboot at 3 AM.
- **macOS** — No-op (logs an info message).

#### GitHub Sync (`services/github-sync/`)

The most complex service. Deploys the sync application:

- **Linux** — 15-step process: migrates from old system-level service (if present), enables user lingering (`loginctl enable-linger`), creates user-level systemd directory, writes environment file with secrets (GitHub token, username, repos path), deploys `bundle.js`, writes `.service` and `.timer` unit files, creates a convenience `sync-repos` script, enables the timer via `systemctl --user`.
- **macOS** — Similar flow using a launchd plist (`com.syncreeper.sync.plist`) with `StartCalendarInterval` for daily scheduling, plus a `sync-repos` convenience script.

#### Syncthing (`services/syncthing/`)

Configures Syncthing for peer-to-peer file synchronization:

- Stops the service, generates keys, writes a comprehensive `.stignore` file (excludes OS files, `node_modules`, Python venvs, Rust `target/`, Go vendor, Java build dirs, C/C++ objects, logs, `.env` files, test coverage, etc.), enables the service, waits for readiness, configures trusted devices and shared folders via the Syncthing CLI, and creates a `syncreeper-device-id` convenience script.

### Scripts (`src/scripts/`)

- **`setup.ts`** — Interactive setup wizard using `@inquirer/prompts`. Prompts for service username, GitHub credentials, Syncthing API key, trusted devices, SSH keys, and optional settings. Saves values to Pulumi config.
- **`get-device-id.ts`** — CLI tool (yargs) to retrieve the Syncthing device ID locally or via SSH.
- **`add-device.ts`** — CLI tool to add a Syncthing device. Validates device ID format and runs the Syncthing CLI locally or via SSH.
- **`sync-now.ts`** — CLI tool to trigger a manual sync. Uses `systemctl --user` on Linux, `sync-repos` script on macOS, or connects via SSH.

---

## Sync Application (`sync/`)

A standalone Node.js application (ESM) that performs the actual repository synchronization. It is bundled by Rollup into a single `dist/bundle.js` for deployment.

### Entry Point (`sync/src/index.ts`)

Orchestrates the sync process:

1. Load configuration from environment variables (`GITHUB_TOKEN`, `GITHUB_USERNAME`, `REPOS_PATH`)
2. Acquire a lock file (fail immediately if another sync is running)
3. Fetch all non-archived repositories from GitHub
4. Clone new repositories / update existing ones
5. Print a summary of results
6. Release the lock

### GitHub Client (`sync/src/github.ts`)

Uses `@octokit/rest` with pagination to fetch all repositories the user has access to (owned, collaborator, organization member). Filters out archived repositories.

### Git Operations (`sync/src/git.ts`)

Uses `simple-git` for:

- **Clone** — Shallow clone (`--depth 1`), single-branch, using an authenticated HTTPS URL
- **Update** — `git fetch` + `git reset --hard` to match remote state

Temporarily injects the authenticated URL during operations and restores the non-authenticated URL afterward for security.

### Lock File (`sync/src/lock.ts`)

Uses `proper-lockfile` to prevent concurrent sync runs. Lock has a 10-minute stale timeout and no retries (fails immediately if locked).

---

## Key Architecture Patterns

### Platform Abstraction

Every service follows the same pattern: an `index.ts` dispatcher checks `isLinux()` or `isMacOS()` and delegates to the corresponding platform-specific implementation. This keeps platform logic isolated and makes it straightforward to add new platform support.

### Pulumi Command Wrapping

All system configuration is performed via `@pulumi/command` `local.Command` resources. The `src/lib/command.ts` module provides higher-level abstractions (`runCommand`, `writeFile`, `copyFile`, `enableService`) that handle platform differences and Pulumi resource management.

### Phased Deployment

`src/index.ts` orchestrates deployment in 4 ordered phases with explicit Pulumi `dependsOn` chains. This ensures resources are created in the correct order (e.g., user exists before directories are created, packages are installed before services are configured).

### User-Level Systemd Services (Linux)

The GitHub sync service runs as a user-level systemd service (`systemctl --user`) with `loginctl enable-linger` enabled so the service persists without an active login session. Syncthing uses the system-level `syncthing@user` template unit.

### Two-Project Build

The root project uses CommonJS (required by Pulumi) while the sync application uses ESM. Rollup bundles the sync app into a single file, which the infrastructure code deploys to the target system.

---

## Technologies & Dependencies

| Dependency            | Purpose                                                    |
| --------------------- | ---------------------------------------------------------- |
| `@pulumi/pulumi`      | Infrastructure-as-Code framework                           |
| `@pulumi/command`     | Execute local shell commands as Pulumi resources           |
| `@octokit/rest`       | GitHub REST API client for fetching repositories           |
| `simple-git`          | Node.js Git client for clone and fetch operations          |
| `proper-lockfile`     | File-based locking to prevent concurrent sync runs         |
| `@inquirer/prompts`   | Interactive CLI prompts for the setup wizard               |
| `yargs`               | CLI argument parsing for helper scripts                    |
| `execa`               | Process execution for helper scripts                       |
| `rollup`              | Bundles the sync application into a single deployable file |
| `typescript`          | Type-safe development across both sub-projects             |
| `eslint` + `prettier` | Code quality and formatting                                |
