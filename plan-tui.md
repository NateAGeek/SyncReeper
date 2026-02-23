# SyncReeper CLI + TUI Implementation Plan

## Problem Statement

The current utility scripts in `@syncreeper/host-utils` are fragmented across 5 standalone
TypeScript files, each with duplicated boilerplate (getDefaultServiceUser, yargs setup, shebang
patterns). They can only be invoked via `pnpm run <script>` from inside the monorepo -- not as
a global system command. There is no centralized view of service health.

## Goal

1. **Unified CLI** (`syncreeper`) -- A single globally-installed command that consolidates all
   host-utils functionality under subcommands.
2. **TUI Dashboard** -- An Ink-based (React for terminal) interactive dashboard with tabbed views
   for service statuses and scrollable logs.
3. **Two new packages** -- `@syncreeper/cli` (entry point + commands) and `@syncreeper/tui`
   (Ink components, separate package as requested).

## What Changes

| Before                                    | After                                       |
| ----------------------------------------- | ------------------------------------------- |
| `pnpm run setup`                          | `syncreeper setup`                          |
| `pnpm run get-device-id -- --local`       | `syncreeper get-device-id --local`          |
| `pnpm run add-device -- --device-id ...`  | `syncreeper add-device --device-id ...`     |
| `pnpm run sync-now -- --local --follow`   | `syncreeper sync-now --local --follow`      |
| `pnpm run redeploy -- --local --no-build` | `syncreeper redeploy --local --no-build`    |
| _(no equivalent)_                         | `syncreeper dashboard` or bare `syncreeper` |

## What Stays the Same

- `@syncreeper/node-passthrough` remains separate (`syncreeper-passthrough` binary).
- `@syncreeper/shared`, `@syncreeper/host`, `@syncreeper/sync` are untouched.
- All Pulumi config interactions, SSH commands, systemctl/launchctl calls are identical.
- The `pnpm run` shortcuts in root `package.json` continue to work (re-pointed to cli).

---

## Architecture

```
packages/
├── cli/                          NEW: @syncreeper/cli
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── index.ts              Yargs entry point, registers all commands
│       ├── commands/
│       │   ├── setup.ts          Migrated from host-utils/src/setup.ts
│       │   ├── get-device-id.ts  Migrated from host-utils/src/get-device-id.ts
│       │   ├── add-device.ts     Migrated from host-utils/src/add-device.ts
│       │   ├── sync-now.ts       Migrated from host-utils/src/sync-now.ts
│       │   ├── redeploy.ts       Migrated from host-utils/src/redeploy.ts
│       │   └── dashboard.ts      Launches the TUI app
│       └── utils/
│           └── service-user.utils.ts   Shared getDefaultServiceUser() (extracted)
│
├── tui/                          NEW: @syncreeper/tui
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── index.tsx             Exports the main App for cli to render
│       ├── App.tsx               Root component: tab bar + active tab content
│       ├── hooks/
│       │   ├── useServiceStatus.tsx   Poll a service and return its state
│       │   ├── useServiceAction.tsx   Start/stop/restart service actions
│       │   ├── useLogs.tsx            Stream/tail logs from journalctl or files
│       │   └── useKeyboard.tsx        Keyboard navigation (tab switching, scroll)
│       ├── components/
│       │   ├── TabBar.tsx        Horizontal tab strip with highlight
│       │   ├── LogViewer.tsx     Scrollable log output with line buffer
│       │   ├── StatusBadge.tsx   [RUNNING] [STOPPED] [ERROR] [UNKNOWN] badges
│       │   ├── ActionBar.tsx     Service action feedback display
│       │   └── KeyHints.tsx      Bottom bar: keyboard shortcut hints
│       └── tabs/
│           ├── OverviewTab.tsx   All services at a glance
│           ├── GithubSyncTab.tsx GitHub sync timer status + log viewer
│           ├── SyncthingTab.tsx  Syncthing connections + folder status
│           ├── PassthroughTab.tsx Tunnel health + autossh logs
│           └── SecurityTab.tsx   SSHGuard, firewall, auto-updates
│
├── host-utils/                   DEPRECATED (kept for backward compat, scripts removed)
├── shared/                       Unchanged
├── host/                         Unchanged
├── sync/                         Unchanged
└── node-passthrough/             Unchanged
```

---

## Package Details

### `@syncreeper/cli` -- `packages/cli/package.json`

```json
{
    "name": "@syncreeper/cli",
    "version": "1.0.0",
    "description": "Unified CLI for managing SyncReeper deployments",
    "type": "module",
    "main": "dist/index.js",
    "types": "dist/index.d.ts",
    "bin": {
        "syncreeper": "dist/index.js"
    },
    "scripts": {
        "build": "tsc",
        "dev": "tsx src/index.ts",
        "clean": "rimraf dist"
    },
    "dependencies": {
        "@inquirer/prompts": "^7.0.0",
        "@syncreeper/shared": "workspace:*",
        "@syncreeper/tui": "workspace:*",
        "execa": "^9.0.0",
        "yargs": "^17.0.0"
    },
    "devDependencies": {
        "@types/node": "^20.0.0",
        "@types/yargs": "^17.0.0",
        "tsx": "^4.7.0",
        "typescript": "^5.0.0"
    }
}
```

### `@syncreeper/tui` -- `packages/tui/package.json`

```json
{
    "name": "@syncreeper/tui",
    "version": "1.0.0",
    "description": "Terminal UI dashboard for SyncReeper service monitoring",
    "type": "module",
    "main": "dist/index.js",
    "types": "dist/index.d.ts",
    "scripts": {
        "build": "tsc",
        "clean": "rimraf dist"
    },
    "dependencies": {
        "@syncreeper/shared": "workspace:*",
        "execa": "^9.0.0",
        "ink": "^5.1.0",
        "react": "^18.3.1"
    },
    "devDependencies": {
        "@types/node": "^20.0.0",
        "@types/react": "^18.3.0",
        "tsx": "^4.7.0",
        "typescript": "^5.0.0"
    }
}
```

### TypeScript Config -- `packages/cli/tsconfig.json`

```json
{
    "extends": "../../tsconfig.base.json",
    "compilerOptions": {
        "module": "NodeNext",
        "moduleResolution": "NodeNext",
        "outDir": "./dist",
        "rootDir": "./src"
    },
    "include": ["src/**/*"],
    "exclude": ["node_modules", "dist"]
}
```

### TypeScript Config -- `packages/tui/tsconfig.json`

```json
{
    "extends": "../../tsconfig.base.json",
    "compilerOptions": {
        "module": "NodeNext",
        "moduleResolution": "NodeNext",
        "jsx": "react-jsx",
        "outDir": "./dist",
        "rootDir": "./src"
    },
    "include": ["src/**/*"],
    "exclude": ["node_modules", "dist"]
}
```

---

## CLI Command Structure

```
syncreeper [command]

Commands:
  syncreeper dashboard       Open the interactive TUI dashboard [default]
  syncreeper setup           Interactive setup wizard (configure Pulumi)
  syncreeper get-device-id   Get the Syncthing device ID
  syncreeper add-device      Add a device to Syncthing
  syncreeper sync-now        Trigger a manual repository sync
  syncreeper redeploy        Redeploy the sync bundle without full pulumi up

Options:
  -h, --help     Show help
  -v, --version  Show version
```

Running `syncreeper` with no arguments opens the dashboard.

### Command Flags (unchanged from host-utils)

**get-device-id:**

```
--local   Run locally instead of via SSH            [boolean] [default: false]
--user    Service username override                  [string]
```

**add-device:**

```
--local       Run locally instead of via SSH        [boolean] [default: false]
--device-id   Syncthing device ID to add            [string]
--name        Friendly name for the device          [string]
--folder      Folder ID to share                    [string]
--user        Service username override             [string]
```

**sync-now:**

```
--local    Run locally instead of via SSH           [boolean] [default: false]
--follow   Follow sync logs after starting          [boolean]
--user     Service username override                [string]
```

**redeploy:**

```
--local     Run locally instead of via SSH          [boolean] [default: false]
--build     Build bundle before deploying           [boolean] [default: true]
--restart   Restart service after deploying         [boolean] [default: true]
--user      Service username override               [string]
```

---

## TUI Dashboard Mock

### Layout

```
┌──────────────────────────────────────────────────────────────────────────┐
│  SyncReeper Dashboard                                          v1.0.0  │
├──────────────────────────────────────────────────────────────────────────┤
│  [Overview]  GitHub Sync   Syncthing   Passthrough   Security          │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│   ┌─────────────────────────────────────────────────────────────────┐  │
│   │  Service             Status         Last Activity               │  │
│   │  ─────────────────   ────────────   ─────────────────────────── │  │
│   │  GitHub Sync         [RUNNING]      Last sync: 2h ago (daily)   │  │
│   │  Syncthing           [RUNNING]      3 devices connected         │  │
│   │  Passthrough Tunnel  [STOPPED]      Not configured              │  │
│   │  SSHGuard            [RUNNING]      2 IPs blocked               │  │
│   │  Firewall (UFW)      [ACTIVE]       4 rules loaded              │  │
│   │  Auto-Updates        [ENABLED]      Last check: 6h ago          │  │
│   └─────────────────────────────────────────────────────────────────┘  │
│                                                                        │
├──────────────────────────────────────────────────────────────────────────┤
│  Tab/Shift+Tab: switch tabs  q: quit  r: refresh                       │
└──────────────────────────────────────────────────────────────────────────┘
```

### GitHub Sync Tab

```
┌──────────────────────────────────────────────────────────────────────────┐
│  SyncReeper Dashboard                                          v1.0.0  │
├──────────────────────────────────────────────────────────────────────────┤
│   Overview  [GitHub Sync]  Syncthing   Passthrough   Security          │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│  Timer: syncreeper-sync.timer                                          │
│  Status: active (waiting)                                              │
│  Schedule: daily                                                       │
│  Next Run: 2026-02-24 03:00:00 UTC                                     │
│  Last Run: 2026-02-23 03:00:12 UTC (success)                          │
│                                                                        │
│  ── Recent Logs ──────────────────────────────────────────────────────  │
│  [2026-02-23 03:00:12] Starting GitHub repository sync...              │
│  [2026-02-23 03:00:13] Fetching repository list for NateAGeek...       │
│  [2026-02-23 03:00:14] Found 47 repositories (42 non-archived)         │
│  [2026-02-23 03:00:14] Syncing /srv/repos...                           │
│  [2026-02-23 03:00:15]   Updating NateAGeek/SyncReeper...              │
│  [2026-02-23 03:00:16]   Updating NateAGeek/dotfiles...                │
│  [2026-02-23 03:00:17]   ... (38 more)                                 │
│  [2026-02-23 03:01:42] Sync complete: 42 repos, 0 errors               │
│                                                                        │
├──────────────────────────────────────────────────────────────────────────┤
│  Tab/Shift+Tab: switch tabs  j/k: scroll logs  r: refresh  q: quit    │
└──────────────────────────────────────────────────────────────────────────┘
```

### Syncthing Tab

```
┌──────────────────────────────────────────────────────────────────────────┐
│  SyncReeper Dashboard                                          v1.0.0  │
├──────────────────────────────────────────────────────────────────────────┤
│   Overview   GitHub Sync  [Syncthing]  Passthrough   Security          │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│  This Device: ABCDEFG-ABCDEFG-ABCDEFG-ABCDEFG-ABCDEFG-...            │
│  Service: active (running)                                             │
│  Listen Address: 0.0.0.0:22000                                         │
│                                                                        │
│  ── Connected Devices ────────────────────────────────────────────────  │
│  Name              Device ID (short)     Status         Last Seen      │
│  ────────────────  ────────────────────  ─────────────  ────────────── │
│  mac-mini          XYZXYZX-...           Connected      Now            │
│  macbook-pro       QWERTYU-...           Connected      Now            │
│  backup-vps        ASDFGHJ-...           Disconnected   3d ago         │
│                                                                        │
│  ── Shared Folders ───────────────────────────────────────────────────  │
│  Folder    Path         Status     Completion                          │
│  ────────  ───────────  ─────────  ──────────                          │
│  repos     /srv/repos   Up to Date 100%                                │
│                                                                        │
├──────────────────────────────────────────────────────────────────────────┤
│  Tab/Shift+Tab: switch tabs  j/k: scroll  r: refresh  q: quit         │
└──────────────────────────────────────────────────────────────────────────┘
```

### Passthrough Tab

```
┌──────────────────────────────────────────────────────────────────────────┐
│  SyncReeper Dashboard                                          v1.0.0  │
├──────────────────────────────────────────────────────────────────────────┤
│   Overview   GitHub Sync   Syncthing  [Passthrough]  Security          │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│  Status: Passthrough user configured                                   │
│  Tunnel Port: 2222                                                     │
│  Active Connections: 1                                                 │
│                                                                        │
│  ── SSH Connections on Port 2222 ─────────────────────────────────────  │
│  PID     User            From              Connected Since             │
│  ──────  ──────────────  ────────────────  ──────────────────────────  │
│  48291   passthrough     192.168.1.50      2026-02-23 08:15:00        │
│                                                                        │
│  ── Recent Logs ──────────────────────────────────────────────────────  │
│  [2026-02-23 08:15:00] Connection from 192.168.1.50 accepted           │
│  [2026-02-23 08:15:00] Reverse tunnel established on port 2222         │
│                                                                        │
├──────────────────────────────────────────────────────────────────────────┤
│  Tab/Shift+Tab: switch tabs  j/k: scroll  r: refresh  q: quit         │
└──────────────────────────────────────────────────────────────────────────┘
```

### Security Tab

```
┌──────────────────────────────────────────────────────────────────────────┐
│  SyncReeper Dashboard                                          v1.0.0  │
├──────────────────────────────────────────────────────────────────────────┤
│   Overview   GitHub Sync   Syncthing   Passthrough  [Security]         │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│  ── SSHGuard ─────────────────────────────────────────────────────────  │
│  Status: active (running)                                              │
│  Blocked IPs: 2                                                        │
│    203.0.113.42   (blocked 4h ago, expires in 20h)                     │
│    198.51.100.7   (blocked 1d ago, expires in 2h)                      │
│                                                                        │
│  ── Firewall (UFW) ───────────────────────────────────────────────────  │
│  Status: active                                                        │
│  Default: deny (incoming), allow (outgoing)                            │
│  Rules:                                                                │
│    22/tcp    LIMIT    Anywhere                                         │
│    22000/tcp ALLOW    Anywhere                                         │
│    21027/udp ALLOW    Anywhere                                         │
│                                                                        │
│  ── Automatic Updates ────────────────────────────────────────────────  │
│  Status: enabled                                                       │
│  Auto-Reboot: 03:00 UTC                                                │
│  Last Run: 2026-02-23 06:00:00 UTC                                     │
│                                                                        │
├──────────────────────────────────────────────────────────────────────────┤
│  Tab/Shift+Tab: switch tabs  j/k: scroll  r: refresh  q: quit         │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## Data Sources for TUI

Each tab gathers its data by running local commands. The TUI only supports **local**
monitoring (run it on the machine you want to inspect).

### Overview Tab

Aggregates the status checks from all other tabs into a summary table.

### GitHub Sync Tab

| Data Point      | Linux Command                                             | macOS Command                                  |
| --------------- | --------------------------------------------------------- | ---------------------------------------------- |
| Timer status    | `systemctl --user status syncreeper-sync.timer`           | `launchctl list com.syncreeper.sync`           |
| Service status  | `systemctl --user status syncreeper-sync.service`         | same plist check                               |
| Next run time   | parsed from timer status output                           | parsed from plist config                       |
| Last run result | `systemctl --user show syncreeper-sync.service -p Result` | exit code from launchctl                       |
| Recent logs     | `journalctl --user -u syncreeper-sync -n 100 --no-pager`  | `tail -100 ~/Library/Logs/SyncReeper/sync.log` |

### Syncthing Tab

| Data Point        | Command (both platforms)                                                         |
| ----------------- | -------------------------------------------------------------------------------- |
| Device ID         | `syncthing cli show system` or `syncreeper-device-id`                            |
| Service status    | `systemctl --user status syncthing` (Linux) / `launchctl list syncthing` (macOS) |
| Connected devices | `syncthing cli show connections`                                                 |
| Folder status     | `syncthing cli show folders`                                                     |

Note: Some syncthing CLI commands may need `--config` flag when running as root on Linux.
Falls back to parsing the Syncthing REST API on `localhost:8384` if CLI is unavailable.

### Passthrough Tab

| Data Point     | Linux Command                                             | macOS Command                     |
| -------------- | --------------------------------------------------------- | --------------------------------- |
| User exists    | `id passthrough 2>/dev/null`                              | N/A (macOS uses node-passthrough) |
| Active tunnels | `ss -tnp \| grep :2222` or `who`                          | `lsof -i :2222`                   |
| Recent logs    | `journalctl -u sshd -n 50 --no-pager \| grep passthrough` | N/A                               |

### Security Tab

| Data Point        | Linux Command                                          | macOS Command                         |
| ----------------- | ------------------------------------------------------ | ------------------------------------- |
| SSHGuard status   | `systemctl status sshguard`                            | `brew services list \| grep sshguard` |
| Blocked IPs       | `nft list table sshguard` or `iptables -L sshguard -n` | `pfctl -t sshguard -T show`           |
| Firewall status   | `ufw status verbose`                                   | `pfctl -s rules`                      |
| Firewall rules    | parsed from ufw output                                 | parsed from pf output                 |
| Auto-updates      | `systemctl status unattended-upgrades`                 | N/A (not managed)                     |
| Last update check | `stat /var/lib/apt/periodic/update-stamp`              | N/A                                   |

---

## Shared Utility Extraction

The `getDefaultServiceUser()` function is duplicated across all 5 host-utils scripts.
It will be extracted into `packages/cli/src/utils/service-user.utils.ts`:

```typescript
/**
 * Resolve the service username.
 *
 * Priority:
 *   1. Explicit --user flag (passed as argument)
 *   2. Pulumi config: syncreeper:service-user
 *   3. Platform default: current user (macOS) or "syncreeper" (Linux)
 */
export async function resolveServiceUser(explicit?: string): Promise<string> {
    if (explicit) return explicit;

    try {
        const result = await execa("pulumi", ["config", "get", "syncreeper:service-user"], {
            reject: false,
        });
        if (result.exitCode === 0 && result.stdout.trim()) {
            return result.stdout.trim();
        }
    } catch {
        // Fall through to platform default
    }

    if (process.platform === "darwin") {
        return os.userInfo().username;
    }
    return DEFAULT_SERVICE_USER_LINUX;
}
```

---

## Entry Point Design

### `packages/cli/src/index.ts`

```typescript
#!/usr/bin/env node

import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { setupCommand } from "./commands/setup.js";
import { getDeviceIdCommand } from "./commands/get-device-id.js";
import { addDeviceCommand } from "./commands/add-device.js";
import { syncNowCommand } from "./commands/sync-now.js";
import { redeployCommand } from "./commands/redeploy.js";
import { dashboardCommand } from "./commands/dashboard.js";

yargs(hideBin(process.argv))
    .scriptName("syncreeper")
    .usage("$0 <command> [options]")
    .command(dashboardCommand)
    .command(setupCommand)
    .command(getDeviceIdCommand)
    .command(addDeviceCommand)
    .command(syncNowCommand)
    .command(redeployCommand)
    .demandCommand(0) // Allow running with no command (defaults to dashboard)
    .strict()
    .help()
    .alias("h", "help")
    .version()
    .alias("v", "version")
    .parse();
```

Each command module exports a yargs `CommandModule`:

```typescript
// Example: packages/cli/src/commands/sync-now.ts
import type { CommandModule } from "yargs";

export const syncNowCommand: CommandModule = {
    command: "sync-now",
    describe: "Trigger a manual repository sync",
    builder: (yargs) =>
        yargs
            .option("local", { type: "boolean", default: false, describe: "..." })
            .option("follow", { type: "boolean", describe: "..." })
            .option("user", { type: "string", describe: "..." }),
    handler: async (argv) => {
        // Migrated logic from host-utils/src/sync-now.ts
    },
};
```

### `packages/cli/src/commands/dashboard.ts`

```typescript
import type { CommandModule } from "yargs";
import { render } from "ink";
import React from "react";
import { App } from "@syncreeper/tui";

export const dashboardCommand: CommandModule = {
    command: "dashboard",
    describe: "Open the interactive TUI dashboard",
    builder: {},
    handler: async () => {
        const { waitUntilExit } = render(React.createElement(App));
        await waitUntilExit();
    },
};
```

---

## TUI Component Design

### App.tsx (Root)

```
State:
  - activeTab: number (0-4)
  - refreshTrigger: number (incremented on 'r' press)

Keyboard:
  - Tab / Right Arrow:       next tab
  - Shift+Tab / Left Arrow:  previous tab
  - q / Ctrl+C:              exit
  - r:                       refresh all data

Layout:
  <Box flexDirection="column" width="100%">
    <Header />
    <TabBar tabs={TABS} activeTab={activeTab} />
    <ActiveTabContent />
    <KeyHints />
  </Box>
```

### TabBar.tsx

Renders a horizontal list of tab names. The active tab is highlighted with inverse colors.
Uses Ink's `<Text>` with `bold` and `inverse` props.

```
Props:
  tabs: { label: string; key: string }[]
  activeIndex: number

Render:
  <Box>
    {tabs.map((tab, i) => (
      <Text key={tab.key} inverse={i === activeIndex} bold={i === activeIndex}>
        {` ${tab.label} `}
      </Text>
    ))}
  </Box>
```

### LogViewer.tsx

A scrollable log buffer. Maintains an internal array of log lines and a scroll offset.
Supports j/k and up/down arrow keys for scrolling when the parent tab is focused.

```
Props:
  lines: string[]
  maxVisible: number       (calculated from terminal height)
  isActive: boolean        (receives keyboard events only when active)

State:
  scrollOffset: number

Keyboard (when isActive):
  - j / Down:   scroll down 1 line
  - k / Up:     scroll up 1 line
  - G:          scroll to bottom
  - g:          scroll to top

Render:
  <Box flexDirection="column">
    <Text dimColor>── Logs ({lines.length} lines) ──</Text>
    {visibleLines.map((line, i) => (
      <Text key={i}>{line}</Text>
    ))}
    {hasMore && <Text dimColor>  ... ({remaining} more above/below)</Text>}
  </Box>
```

### StatusBadge.tsx

```
Props:
  status: "running" | "stopped" | "error" | "unknown" | "active" | "enabled" | "disabled"

Render:
  running/active  -> <Text color="green" bold>[RUNNING]</Text>
  stopped         -> <Text color="yellow">[STOPPED]</Text>
  error           -> <Text color="red" bold>[ERROR]</Text>
  enabled         -> <Text color="green">[ENABLED]</Text>
  disabled        -> <Text color="gray">[DISABLED]</Text>
  unknown         -> <Text color="gray">[UNKNOWN]</Text>
```

### KeyHints.tsx

```
Render:
  <Box borderStyle="single" borderTop borderBottom={false} borderLeft={false} borderRight={false}>
    <Text dimColor>
      Tab/Shift+Tab: switch tabs   j/k: scroll logs   r: refresh   q: quit
    </Text>
  </Box>
```

---

## Hooks

### `useServiceStatus(command, args, interval?)`

Runs a system command periodically and parses the output.

```typescript
function useServiceStatus(command: string, args: string[], interval = 10000) {
    const [status, setStatus] = useState<"running" | "stopped" | "error" | "unknown">("unknown");
    const [output, setOutput] = useState<string>("");
    const [lastChecked, setLastChecked] = useState<Date | null>(null);

    // Uses execa with reject:false, parses output/exitCode
    // Re-runs on interval and when refreshTrigger changes
    // Returns { status, output, lastChecked, refresh() }
}
```

### `useLogs(command, args, maxLines?)`

Fetches log output from journalctl or log files.

```typescript
function useLogs(command: string, args: string[], maxLines = 200) {
    const [lines, setLines] = useState<string[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    // Runs command, splits stdout into lines, stores in state
    // Returns { lines, isLoading, refresh() }
}
```

### `useKeyboard(handlers)`

Wraps Ink's `useInput` with our specific key bindings.

```typescript
function useKeyboard({
    onTabNext,
    onTabPrev,
    onScrollDown,
    onScrollUp,
    onScrollTop,
    onScrollBottom,
    onRefresh,
    onQuit,
}: KeyboardHandlers) {
    useInput((input, key) => {
        if (key.tab && !key.shift) onTabNext?.();
        if (key.tab && key.shift) onTabPrev?.();
        if (input === "j" || key.downArrow) onScrollDown?.();
        if (input === "k" || key.upArrow) onScrollUp?.();
        if (input === "G") onScrollBottom?.();
        if (input === "g") onScrollTop?.();
        if (input === "r") onRefresh?.();
        if (input === "q") onQuit?.();
    });
}
```

---

## Global Installation

### How It Works

The `bin` field in `@syncreeper/cli/package.json` points to `dist/index.js`.
The compiled output has a `#!/usr/bin/env node` shebang prepended.

During install, after `pnpm run build`:

```bash
pnpm --filter @syncreeper/cli link --global
```

This creates a symlink in the global pnpm bin directory (typically `~/.local/share/pnpm`
or `/usr/local/bin` depending on setup) so that `syncreeper` is available anywhere.

### Changes to `install.sh`

After line 317 (`success "Project built successfully"`), add:

```bash
# Link CLI globally
info "Installing syncreeper CLI globally..."
pnpm --filter @syncreeper/cli link --global
success "syncreeper CLI installed globally"
```

### Changes to `install.ps1`

After line 203 (`Write-Success "Project built successfully"`), add:

```powershell
Write-Info "Installing syncreeper CLI globally..."
pnpm --filter @syncreeper/cli link --global
Write-Success "syncreeper CLI installed globally"
```

### Changes to Root `package.json`

Update script targets from `@syncreeper/host-utils` to `@syncreeper/cli`:

```json
{
    "scripts": {
        "build": "pnpm -r build",
        "build:host": "pnpm --filter @syncreeper/shared build && pnpm --filter @syncreeper/host build",
        "build:sync": "pnpm --filter @syncreeper/sync build",
        "build:cli": "pnpm --filter @syncreeper/tui build && pnpm --filter @syncreeper/cli build",
        "setup": "pnpm --filter @syncreeper/cli run setup",
        "get-device-id": "pnpm --filter @syncreeper/cli run get-device-id",
        "add-device": "pnpm --filter @syncreeper/cli run add-device",
        "sync-now": "pnpm --filter @syncreeper/cli run sync-now",
        "redeploy": "pnpm --filter @syncreeper/cli run redeploy",
        "dashboard": "pnpm --filter @syncreeper/cli run dashboard",
        "lint": "eslint .",
        "lint:fix": "eslint . --fix",
        "format": "prettier --write .",
        "format:check": "prettier --check .",
        "check": "pnpm run lint && pnpm run format:check && pnpm run build",
        "clean": "pnpm -r clean"
    }
}
```

---

## Migration Strategy for host-utils

### What Moves

Each script in `packages/host-utils/src/` is migrated to `packages/cli/src/commands/`
with these changes:

1. **Remove shebang** (`#!/usr/bin/env npx tsx`) -- not needed, the entry point has the shebang.
2. **Remove standalone `main()` + `.catch()` pattern** -- logic is wrapped in a yargs handler.
3. **Replace duplicated `getDefaultServiceUser()`** -- import from `../utils/service-user.js`.
4. **Export a `CommandModule`** instead of self-executing.

The actual command logic (execa calls, inquirer prompts, platform detection) stays identical.

### What Happens to host-utils

Option: **Remove the package entirely.** The `pnpm run` shortcuts in root `package.json` are
re-pointed to `@syncreeper/cli`. Anyone who was running `pnpm run setup` etc. will
get the same behavior through the new package.

If backward compatibility is desired, the host-utils `package.json` scripts can be updated to
delegate to the cli package. But since this is a private project with a single author, clean
removal is recommended.

---

## Implementation Steps

### Phase 1: Create packages and scaffold

1. Create `packages/tui/` directory structure
2. Create `packages/cli/` directory structure
3. Write `package.json` and `tsconfig.json` for both
4. Run `pnpm install` to wire up workspaces

### Phase 2: Build the TUI package

1. Implement `StatusBadge.tsx`, `KeyHints.tsx` (simple leaf components)
2. Implement `TabBar.tsx`
3. Implement `LogViewer.tsx` with scroll support
4. Implement hooks: `useServiceStatus`, `useLogs`, `useKeyboard`
5. Implement tab content components:
    - `OverviewTab.tsx`
    - `GithubSyncTab.tsx`
    - `SyncthingTab.tsx`
    - `PassthroughTab.tsx`
    - `SecurityTab.tsx`
6. Implement `App.tsx` (orchestrates tabs + keyboard)
7. Implement `index.tsx` (exports App)

### Phase 3: Build the CLI package

1. Create `utils/service-user.ts` (extracted shared logic)
2. Migrate `setup.ts` -> `commands/setup.ts`
3. Migrate `get-device-id.ts` -> `commands/get-device-id.ts`
4. Migrate `add-device.ts` -> `commands/add-device.ts`
5. Migrate `sync-now.ts` -> `commands/sync-now.ts`
6. Migrate `redeploy.ts` -> `commands/redeploy.ts`
7. Create `commands/dashboard.ts` (renders TUI)
8. Create `index.ts` (yargs entry point with all commands)

### Phase 4: Integration

1. Update root `package.json` scripts
2. Update `install.sh` with `pnpm link --global` step
3. Update `install.ps1` with `pnpm link --global` step
4. Run `pnpm install && pnpm run build` to verify everything compiles
5. Test `syncreeper --help` and `syncreeper dashboard`
6. Remove or deprecate `@syncreeper/host-utils`

---

## Build Order

Packages must build in this order (respecting workspace dependencies):

```
1. @syncreeper/shared       (no deps)
2. @syncreeper/tui          (depends on shared)
3. @syncreeper/cli          (depends on shared, tui)
4. @syncreeper/host         (depends on shared)
5. @syncreeper/sync         (no workspace deps)
```

The existing `pnpm -r build` (recursive build) handles this automatically via
pnpm's topological sort based on workspace dependency graph.

---

## Implementation Status

> Last updated: 2026-02-23

### Completed

All four phases above are **done**. Both packages build clean, the `syncreeper` global
command works, and all host-utils scripts have been migrated with zero functional gaps.

#### File Naming Conventions (applied post-plan)

The following renames were applied to match project conventions:

| Original                            | Renamed To              | Convention     |
| ----------------------------------- | ----------------------- | -------------- |
| `cli/src/utils/service-user.ts`     | `service-user.utils.ts` | `*.utils.ts`   |
| `tui/src/utils/userCommand.ts`      | `userCommand.utils.ts`  | `*.utils.ts`   |
| `tui/src/hooks/useKeyboard.ts`      | `useKeyboard.tsx`       | hooks → `.tsx` |
| `tui/src/hooks/useLogs.ts`          | `useLogs.tsx`           | hooks → `.tsx` |
| `tui/src/hooks/useServiceAction.ts` | `useServiceAction.tsx`  | hooks → `.tsx` |
| `tui/src/hooks/useServiceStatus.ts` | `useServiceStatus.tsx`  | hooks → `.tsx` |

#### Additional Components (not in original plan)

- **`ActionBar.tsx`** — Service start/stop/restart action feedback display
- **`useServiceAction.tsx`** hook — Executes `systemctl` start/stop/restart commands
- **`types.ts`** — Shared `TabActionProps` interface for tab↔action communication
- **`userCommand.utils.ts`** — Root-user detection + service-user command wrapping (see below)

#### Root-User Fix

Running the dashboard as root caused `systemctl --user` and `journalctl --user` to query
root's (empty) user session. The `asServiceUser()` utility in
`tui/src/utils/userCommand.utils.ts` detects root via `os.userInfo().uid === 0 && isLinux()`
and wraps user-session commands with:

```
sudo -u syncreeper env XDG_RUNTIME_DIR=/run/user/<uid> DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/<uid>/bus <command>
```

The UID is resolved once via `execaSync("id", ["-u", "syncreeper"])` and cached. System-level
commands (e.g., `systemctl status sshguard`, `ufw status`) are **not** wrapped.

#### Global Link Fix

`pnpm --filter @syncreeper/cli link --global` does not work. The install scripts use
`cd packages/cli && pnpm link --global` instead.

### Testing

Tests use **vitest** with `ink-testing-library` for component rendering. Test files live in
`tests/unit/` within each package.

| Package   | Test File                    | Tests  | Status          |
| --------- | ---------------------------- | ------ | --------------- |
| CLI       | `service-user.utils.test.ts` | 9      | Passing         |
| TUI       | `components.test.tsx`        | 24     | Passing         |
| TUI       | `userCommand.utils.test.ts`  | 11     | Passing         |
| TUI       | `useServiceStatus.test.tsx`  | 9      | Passing         |
| TUI       | `useLogs.test.tsx`           | 5      | Passing         |
| **Total** |                              | **58** | **All passing** |

#### Testing Lessons Learned

- **ink-testing-library v4** only exports `render` and `cleanup` — no `act`. Async hook
  effects are tested with real `setTimeout`-based `waitForEffects()` helpers.
- **`vi.useFakeTimers()` breaks hook tests** because the `waitForEffects` approach relies on
  real `setTimeout`. All hook tests use real timers.
- **`vi.hoisted()` mock call counts accumulate** across tests. Use `vi.clearAllMocks()` in
  `beforeEach` to reset call counts.
- **Module-level caches** (like `cachedServiceUser`) persist between tests. The
  `_resetServiceUserCache()` export must be called in `beforeEach`.

### Potential Future Work

- Add `useServiceAction` hook tests
- Add integration/E2E tests for CLI commands
- Add tab-level component tests (e.g., `OverviewTab` rendering)
- macOS support testing (currently Linux-focused)
- Remove `@syncreeper/host-utils` entirely (currently just deprecated)
