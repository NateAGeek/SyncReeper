# SyncReeper Architecture

## Project Overview

SyncReeper is a Pulumi-based Infrastructure-as-Code (IaC) project written in TypeScript that automates:

1. **Repository Backup** — Clones all of a user's GitHub repositories to a secured VPS (or local Mac).
2. **Continuous Sync** — Keeps repositories updated on a daily schedule via systemd timers (Linux) or launchd (macOS).
3. **Cross-Device Sync** — Syncs repository mirrors across multiple devices using Syncthing.
4. **Server Hardening** — Configures firewall rules, SSH hardening, SSHGuard brute-force protection, and automatic security updates.
5. **Traffic Passthrough** — (Planned) Node.js proxy on VPS that forwards traffic through a WireGuard tunnel to a host with a private IP.

The project supports both **Linux (Ubuntu VPS)** and **macOS (local)** deployments.

---

## High-Level Architecture

SyncReeper is organized as a **pnpm workspaces monorepo** with 5 packages:

| Package                          | Location                     | Module System     | Purpose                                                                  |
| -------------------------------- | ---------------------------- | ----------------- | ------------------------------------------------------------------------ |
| **@syncreeper/shared**           | `packages/shared/`           | CommonJS          | Platform detection utilities and shared type interfaces                  |
| **@syncreeper/host**             | `packages/host/`             | CommonJS (Pulumi) | Pulumi infrastructure code — provisions and configures the system        |
| **@syncreeper/sync**             | `packages/sync/`             | ESM (Node.js)     | Standalone app that fetches GitHub repos and clones/updates them locally |
| **@syncreeper/cli**              | `packages/cli/`              | ESM               | Unified CLI (`syncreeper` command) — setup, device mgmt, redeploy, TUI   |
| **@syncreeper/tui**              | `packages/tui/`              | ESM               | Ink/React terminal dashboard with tabbed views for monitoring            |
| **@syncreeper/node-passthrough** | `packages/node-passthrough/` | ESM               | (Scaffold) VPS traffic proxy via WireGuard tunnel to host                |
| ~~@syncreeper/host-utils~~       | `packages/host-utils/`       | _(deprecated)_    | Superseded by `@syncreeper/cli`                                          |

The infrastructure code deploys the sync application as a bundled `bundle.js` file to the target system and sets up a timer/scheduler to run it daily.

---

## Directory Structure

```
SyncReeper/
├── package.json                        # Root workspace config (private, pnpm scripts)
├── pnpm-workspace.yaml                 # pnpm workspace definition (packages/*)
├── tsconfig.base.json                  # Shared TypeScript base config (ES2022, strict)
├── Pulumi.yaml                         # Pulumi project definition (points to packages/host/dist)
├── Pulumi.dev.yaml                     # Encrypted Pulumi stack config (dev stack)
├── eslint.config.js                    # ESLint flat config for all packages
├── .editorconfig                       # Editor settings (4-space indent, 2-space for JSON/YAML, LF)
├── .prettierrc                         # Prettier config (4-space width, double quotes, 100 width)
├── .prettierignore                     # Prettier ignore list
├── .gitignore                          # Ignores dist/, node_modules/, .pulumi/, .env, test-repos/
├── install.sh                          # Bash installer (Linux/macOS) — pnpm, Node.js, Pulumi
├── install.ps1                         # PowerShell installer (Windows) — pnpm, winget/choco
├── README.md                           # User-facing documentation
├── architecture.md                     # This file
│
├── packages/
│   ├── shared/                         # @syncreeper/shared
│   │   ├── package.json                # CJS, no runtime deps
│   │   ├── tsconfig.json               # Extends base, CommonJS module
│   │   └── src/
│   │       ├── index.ts                # Barrel export
│   │       ├── platform.ts             # Platform detection (isLinux, isMacOS, isWindows, etc.)
│   │       └── types.ts                # Shared interfaces + DEFAULT_SERVICE_USER_LINUX constant
│   │
│   ├── host/                           # @syncreeper/host — PULUMI INFRASTRUCTURE
│   │   ├── package.json                # Deps: @pulumi/command, @pulumi/pulumi, @syncreeper/shared
│   │   ├── tsconfig.json               # Extends base, CommonJS module (Pulumi requirement)
│   │   └── src/
│   │       ├── index.ts                # Main orchestrator — 4-phase deployment pipeline
│   │       ├── config/
│   │       │   ├── index.ts            # Config loader — reads Pulumi config, sets service username
│   │       │   ├── types.ts            # Platform-aware getters, re-exports shared types
│   │       │   ├── paths.linux.ts      # Linux filesystem paths
│   │       │   └── paths.darwin.ts     # macOS filesystem paths
│   │       ├── lib/
│   │       │   ├── index.ts            # Re-exports command module
│   │       │   ├── command.ts          # Core command abstraction over @pulumi/command
│   │       │   ├── command.linux.ts    # Linux service enablement (systemctl)
│   │       │   └── command.darwin.ts   # macOS service enablement (launchctl, brew services)
│   │       ├── resources/
│   │       │   ├── index.ts            # Re-exports user + directories
│   │       │   ├── user.ts             # Service user creation dispatcher
│   │       │   ├── user.linux.ts       # Creates dedicated system user via useradd
│   │       │   ├── user.darwin.ts      # Validates existing macOS user
│   │       │   └── directories.ts      # Creates repos dir, sync app dir, syncthing config dir
│   │       └── services/               # Each service has: index.ts, types.ts, linux.ts, darwin.ts
│   │           ├── packages/           # Package installation (apt-get / brew + NVM/Node.js)
│   │           ├── firewall/           # Firewall config (UFW / pf)
│   │           ├── ssh/                # SSH hardening (index.ts only — Linux only)
│   │           ├── sshguard/           # Brute-force protection
│   │           ├── auto-updates/       # Automatic security updates
│   │           ├── github-sync/        # Sync app deployment + timer/scheduler
│   │           └── syncthing/          # Syncthing config + device management (+ stignore.ts)
│   │
│   ├── sync/                           # @syncreeper/sync — STANDALONE SYNC APPLICATION
│   │   ├── package.json                # ESM, deps: @octokit/rest, simple-git, proper-lockfile
│   │   ├── tsconfig.json               # Extends base, NodeNext module
│   │   ├── rollup.config.js            # Bundles to single dist/bundle.js
│   │   └── src/
│   │       ├── index.ts                # Entry point: config → lock → fetch repos → sync → summary
│   │       ├── github.ts               # GitHub API client (Octokit, paginated repo fetching)
│   │       ├── git.ts                  # Git operations (clone/update with authenticated URLs)
│   │       └── lock.ts                 # Lock file handling (proper-lockfile, 10-min stale timeout)
│   │
│   ├── host-utils/                     # @syncreeper/host-utils — DEPRECATED (use cli instead)
│   │   ├── package.json                # Deprecated — commands migrated to @syncreeper/cli
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── setup.ts                # (legacy) Interactive setup wizard
│   │       ├── get-device-id.ts        # (legacy) CLI to get Syncthing device ID
│   │       ├── add-device.ts           # (legacy) CLI to add a Syncthing device
│   │       └── sync-now.ts             # (legacy) CLI to trigger manual sync
│   │
│   ├── cli/                            # @syncreeper/cli — UNIFIED CLI
│   │   ├── package.json                # ESM, bin: "syncreeper", deps: yargs, ink, @syncreeper/tui
│   │   ├── tsconfig.json               # Extends base, NodeNext module, react-jsx
│   │   └── src/
│   │       ├── index.ts                # Entry point: yargs with subcommands, defaults to dashboard
│   │       ├── utils/
│   │       │   └── service-user.ts     # Shared getDefaultServiceUser() utility
│   │       └── commands/
│   │           ├── setup.ts            # Interactive setup wizard (@inquirer/prompts)
│   │           ├── get-device-id.ts    # Get Syncthing device ID
│   │           ├── add-device.ts       # Add a Syncthing device
│   │           ├── sync-now.ts         # Trigger manual sync
│   │           ├── redeploy.ts         # Redeploy sync bundle
│   │           └── dashboard.ts        # Launch TUI dashboard
│   │
│   ├── tui/                            # @syncreeper/tui — TERMINAL DASHBOARD
│   │   ├── package.json                # ESM, deps: ink, react
│   │   ├── tsconfig.json               # Extends base, NodeNext module, react-jsx
│   │   └── src/
│   │       ├── index.tsx               # Ink render entry point
│   │       ├── App.tsx                 # Root component with tab navigation
│   │       ├── components/
│   │       │   ├── TabBar.tsx          # Tab header with keyboard navigation
│   │       │   ├── LogViewer.tsx       # Scrollable log viewer with j/k keys
│   │       │   ├── StatusBadge.tsx     # Colored status indicators
│   │       │   └── KeyHints.tsx        # Keyboard shortcut hints bar
│   │       ├── hooks/
│   │       │   ├── useKeyboard.ts      # Global key handler (Tab/Shift-Tab/q/r)
│   │       │   ├── useServiceStatus.ts # Polls systemctl/launchctl status
│   │       │   └── useLogs.ts          # Streams journalctl/log output
│   │       └── tabs/
│   │           ├── OverviewTab.tsx      # Service status overview
│   │           ├── GithubSyncTab.tsx    # GitHub sync logs and status
│   │           ├── SyncthingTab.tsx     # Syncthing status and connections
│   │           ├── PassthroughTab.tsx   # Node passthrough status
│   │           └── SecurityTab.tsx      # UFW/firewall rules viewer
│   │
│   └── node-passthrough/               # @syncreeper/node-passthrough — TRAFFIC PROXY (scaffold)
│       ├── package.json                # ESM, private, v0.1.0, deps: @syncreeper/shared
│       ├── tsconfig.json               # Extends base, NodeNext module
│       └── src/
│           └── index.ts                # Placeholder — not yet implemented
```

---

## Package Dependency Graph

```
@syncreeper/shared          (no internal deps)
    ↑
    ├── @syncreeper/host          (+ @pulumi/pulumi, @pulumi/command)
    ├── @syncreeper/cli           (+ @inquirer/prompts, yargs, execa, @syncreeper/tui)
    └── @syncreeper/node-passthrough

@syncreeper/tui                  (+ ink, react — consumed by @syncreeper/cli)

@syncreeper/sync                 (independent — @octokit/rest, simple-git, proper-lockfile)
```

---

## Shared Library (`packages/shared/`)

Provides platform detection and shared types consumed by `host`, `cli`, and `node-passthrough`. Has no runtime dependencies.

### Platform Detection (`src/platform.ts`)

Exports the `Platform` type (`"linux" | "darwin" | "win32"`) and utility functions:

- `detectPlatform()` — Returns the current OS platform
- `isLinux()`, `isMacOS()`, `isWindows()` — Boolean platform checks
- `getPlatformDisplayName()` — Human-readable name (e.g., "Linux", "macOS")
- `getCurrentUsername()` — Returns `os.userInfo().username`
- `getHomeDirectory()` — Returns `os.homedir()`
- `isSupportedPlatform()` — Returns `true` for Linux and macOS
- `assertSupportedPlatform()` — Throws on unsupported platforms
- `logPlatformBanner()` — Logs platform info to console

### Shared Types (`src/types.ts`)

Exports interfaces: `GitHubConfig`, `SyncthingConfig`, `SSHConfig`, `SyncConfig`, `SyncReeperConfig`, `ServiceUserConfig`, `PathsConfig`, `DefaultConfig`.

Also exports the constant `DEFAULT_SERVICE_USER_LINUX = "syncreeper"`.

> **Note:** `DEFAULT_SERVICE_USER_LINUX` is also defined locally in `packages/host/src/config/paths.linux.ts` for use within the host package's config system. The host-utils scripts import it from `@syncreeper/shared`.

---

## Infrastructure Code (`packages/host/`)

### Main Orchestrator (`src/index.ts`)

The entry point for Pulumi. It runs a **4-phase deployment pipeline** with explicit `dependsOn` chains to ensure correct ordering:

| Phase                           | What It Does                                                                                                                                   |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| **Phase 1: User & Directories** | Creates a dedicated service user and required directories (`/srv/repos`, sync app dir, Syncthing config dir)                                   |
| **Phase 2: Packages**           | Installs system packages (git, Syncthing, SSHGuard, etc.) and sets up NVM with Node.js 22                                                      |
| **Phase 3: Security**           | Configures firewall (UFW/pf), SSH hardening, SSHGuard brute-force protection, and automatic security updates                                   |
| **Phase 4: App Services**       | Deploys the sync application bundle, sets up the GitHub sync timer/scheduler, and configures Syncthing with trusted devices and shared folders |

After deployment, it exports an `outputs` object containing `platform`, `serviceUser`, `reposPath`, `postDeploymentInstructions`, and `commands` for post-deployment reference.

### Config System (`src/config/`)

- **`types.ts`** — Re-exports shared type interfaces from `@syncreeper/shared` (`GitHubConfig`, `SyncthingConfig`, `SSHConfig`, `SyncConfig`, `SyncReeperConfig`, `ServiceUserConfig`, `PathsConfig`, `DefaultConfig`). Also re-exports `DEFAULT_SERVICE_USER_LINUX` from `./paths.linux`. Provides platform-aware getter functions: `getServiceUser()`, `getPaths()`, `getDefaultConfig()`. Uses a module-level `_configuredUsername` variable set via `setConfiguredUsername()` during config loading for cross-module access. Includes legacy deprecated exports (`DEFAULT_CONFIG`, `SERVICE_USER`, `PATHS`) for backward compatibility.
- **`index.ts`** — Reads Pulumi config values and populates the configuration objects.
- **`paths.linux.ts` / `paths.darwin.ts`** — Platform-specific filesystem paths:
    - Linux: `/home/{user}`, `/srv/repos`, `/etc/syncreeper`, systemd directories
    - macOS: `~/Library/Application Support`, `~/Library/Logs`, `~/Library/LaunchAgents`

### Lib Layer (`src/lib/`)

- **`command.ts`** — Core abstraction over `@pulumi/command` `local.Command`. Imports platform utilities from `@syncreeper/shared`. Provides:
    - `runCommand()` — Execute a shell command as a Pulumi resource
    - `writeFile()` — Write content to a file on the target system
    - `copyFile()` — Copy a file to the target
    - `enableService()` — Delegates to platform-specific service enablement
- **`command.linux.ts`** — `enableServiceLinux()` (systemctl) and `enableUserServiceLinux()` (systemctl --user)
- **`command.darwin.ts`** — `enableServiceDarwin()` (launchctl) and `enableBrewService()` (brew services)

### Resources (`src/resources/`)

- **`user.ts`** — Dispatches to `user.linux.ts` (creates a dedicated system user via `useradd`) or `user.darwin.ts` (validates an existing macOS user). Imports platform detection from `@syncreeper/shared`.
- **`directories.ts`** — Creates the repositories directory, sync application directory, and Syncthing configuration directory.

### Services (`src/services/`)

Each service follows a consistent **platform abstraction pattern**:

```
service/
├── index.ts        # Dispatcher — checks isLinux()/isMacOS() from @syncreeper/shared
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

**Linux-only.** Contains only `index.ts` (no platform split since macOS has no SSH hardening). Writes an SSH hardening drop-in config to `/etc/ssh/sshd_config.d/`: disables password authentication, disables root login, restricts access to the service user, enforces key-only authentication. Also deploys authorized keys.

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

---

## Sync Application (`packages/sync/`)

A standalone Node.js application (ESM) that performs the actual repository synchronization. It is bundled by Rollup into a single `dist/bundle.js` for deployment.

### Entry Point (`src/index.ts`)

Orchestrates the sync process:

1. Load configuration from environment variables (`GITHUB_TOKEN`, `GITHUB_USERNAME`, `REPOS_PATH`)
2. Acquire a lock file (fail immediately if another sync is running)
3. Fetch all non-archived repositories from GitHub
4. Clone new repositories / update existing ones
5. Print a summary of results
6. Release the lock

### GitHub Client (`src/github.ts`)

Uses `@octokit/rest` with pagination to fetch all repositories the user has access to (owned, collaborator, organization member). Filters out archived repositories.

### Git Operations (`src/git.ts`)

Uses `simple-git` for:

- **Clone** — Shallow clone (`--depth 1`), single-branch, using an authenticated HTTPS URL
- **Update** — `git fetch` + `git reset --hard` to match remote state

Temporarily injects the authenticated URL during operations and restores the non-authenticated URL afterward for security.

### Lock File (`src/lock.ts`)

Uses `proper-lockfile` to prevent concurrent sync runs. Lock has a 10-minute stale timeout and no retries (fails immediately if locked).

---

## CLI Scripts (`packages/host-utils/`)

- **`setup.ts`** — Interactive setup wizard using `@inquirer/prompts`. Prompts for service username, GitHub credentials, Syncthing API key, trusted devices, SSH keys, and optional settings. Saves values to Pulumi config.
- **`get-device-id.ts`** — CLI tool (yargs) to retrieve the Syncthing device ID locally or via SSH.
- **`add-device.ts`** — CLI tool to add a Syncthing device. Validates device ID format and runs the Syncthing CLI locally or via SSH.
- **`sync-now.ts`** — CLI tool to trigger a manual sync. Uses `systemctl --user` on Linux, `sync-repos` script on macOS, or connects via SSH.

All scripts import `DEFAULT_SERVICE_USER_LINUX` from `@syncreeper/shared`.

---

## Node Passthrough (`packages/node-passthrough/`) — Planned

A Node.js proxy that will run on the VPS and forward incoming traffic through a WireGuard tunnel to the host machine. The host has a private IP and the VPS has a public IP, so the VPS acts as a reverse proxy/traffic forwarder.

This package is currently a scaffold with a placeholder `src/index.ts`.

---

## Key Architecture Patterns

### Monorepo with pnpm Workspaces

The project uses pnpm workspaces (`pnpm-workspace.yaml`) to manage 5 packages. The workspace config also specifies `ignoredBuiltDependencies` for `@pulumi/command`, `esbuild`, and `protobufjs` to avoid build script prompts. A shared `tsconfig.base.json` at the root provides common TypeScript compiler options that each package extends. Dependencies between packages use `workspace:*` protocol.

### Platform Abstraction

Every service follows the same pattern: an `index.ts` dispatcher checks `isLinux()` or `isMacOS()` (imported from `@syncreeper/shared`) and delegates to the corresponding platform-specific implementation. This keeps platform logic isolated and makes it straightforward to add new platform support.

### Pulumi Command Wrapping

All system configuration is performed via `@pulumi/command` `local.Command` resources. The `packages/host/src/lib/command.ts` module provides higher-level abstractions (`runCommand`, `writeFile`, `copyFile`, `enableService`) that handle platform differences and Pulumi resource management.

### Phased Deployment

`packages/host/src/index.ts` orchestrates deployment in 4 ordered phases with explicit Pulumi `dependsOn` chains. This ensures resources are created in the correct order (e.g., user exists before directories are created, packages are installed before services are configured).

### User-Level Systemd Services (Linux)

The GitHub sync service runs as a user-level systemd service (`systemctl --user`) with `loginctl enable-linger` enabled so the service persists without an active login session. Syncthing uses the system-level `syncthing@user` template unit.

### Module System Strategy

- **@syncreeper/shared** and **@syncreeper/host** use CommonJS (Pulumi requires CJS)
- **@syncreeper/sync** uses ESM with Rollup bundling to a single `bundle.js`
- **@syncreeper/cli** uses ESM (NodeNext) — unified CLI with `syncreeper` global command
- **@syncreeper/tui** uses ESM (NodeNext) with React JSX — Ink terminal dashboard
- **@syncreeper/node-passthrough** uses ESM (NodeNext)
- ~~@syncreeper/host-utils~~ — deprecated, replaced by `@syncreeper/cli`

### Root Scripts

The root `package.json` provides workspace-level scripts:

| Script          | Command                                                  | Purpose                             |
| --------------- | -------------------------------------------------------- | ----------------------------------- |
| `build`         | `pnpm -r build`                                          | Build all packages                  |
| `build:host`    | `pnpm --filter shared build && pnpm --filter host build` | Build shared + host only            |
| `build:sync`    | `pnpm --filter @syncreeper/sync build`                   | Build sync package only             |
| `setup`         | `pnpm --filter @syncreeper/cli setup`                    | Run interactive setup wizard        |
| `get-device-id` | `pnpm --filter @syncreeper/cli get-device-id`            | Get Syncthing device ID             |
| `add-device`    | `pnpm --filter @syncreeper/cli add-device`               | Add a Syncthing device              |
| `sync-now`      | `pnpm --filter @syncreeper/cli sync-now`                 | Trigger manual sync                 |
| `redeploy`      | `pnpm --filter @syncreeper/cli redeploy`                 | Redeploy sync bundle                |
| `dashboard`     | `pnpm --filter @syncreeper/cli dashboard`                | Open TUI dashboard                  |
| `lint`          | `eslint .`                                               | Lint all packages                   |
| `format`        | `prettier --write .`                                     | Format all files                    |
| `check`         | `lint && format:check && build`                          | Full CI check (lint, format, build) |
| `clean`         | `pnpm -r clean`                                          | Remove all dist/ directories        |

---

## Technologies & Dependencies

| Dependency            | Package                          | Purpose                                                    |
| --------------------- | -------------------------------- | ---------------------------------------------------------- |
| `@pulumi/pulumi`      | host                             | Infrastructure-as-Code framework                           |
| `@pulumi/command`     | host                             | Execute local shell commands as Pulumi resources           |
| `@octokit/rest`       | sync                             | GitHub REST API client for fetching repositories           |
| `simple-git`          | sync                             | Node.js Git client for clone and fetch operations          |
| `proper-lockfile`     | sync                             | File-based locking to prevent concurrent sync runs         |
| `@inquirer/prompts`   | cli                              | Interactive CLI prompts for the setup wizard               |
| `yargs`               | cli                              | CLI argument parsing and subcommand routing                |
| `execa`               | cli                              | Process execution for helper scripts                       |
| `ink`                 | cli, tui                         | React-based terminal UI framework                          |
| `react`               | cli, tui                         | Component model for the TUI dashboard                      |
| `tsx`                 | cli, tui, sync, node-passthrough | TypeScript execution without compilation step              |
| `rollup`              | sync (devDep)                    | Bundles the sync application into a single deployable file |
| `typescript`          | all (devDep)                     | Type-safe development across all packages                  |
| `eslint` + `prettier` | root (devDep)                    | Code quality and formatting (flat config)                  |
| `pnpm`                | root                             | Workspace-aware package manager                            |
