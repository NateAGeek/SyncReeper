# Docker-Based Integration Testing for SyncReeper

## Research Report

**Date:** 2026-02-07
**Project:** SyncReeper — Pulumi IaC for provisioning Ubuntu Linux systems
**Status:** Research complete, no tests or Dockerfiles exist yet

---

## Table of Contents

1. [Architecture Summary](#1-architecture-summary)
2. [Pulumi Testing Frameworks](#2-pulumi-testing-frameworks)
3. [Docker-Based Integration Testing Approaches](#3-docker-based-integration-testing-approaches)
4. [What Can and Cannot Be Validated in Docker](#4-what-can-and-cannot-be-validated-in-docker)
5. [Practical Recommendations](#5-practical-recommendations)

---

## 1. Architecture Summary

SyncReeper uses `@pulumi/command`'s `local.Command` exclusively. Every operation — `apt-get install`, `ufw` rules, `sshd_config` writes, `systemctl` calls — runs directly on the machine where `pulumi up` is executed.

**Key files and what they do:**

| File                             | Purpose                                                                           |
| -------------------------------- | --------------------------------------------------------------------------------- |
| `lib/command.ts`                 | Core abstractions: `runCommand()`, `writeFile()`, `copyFile()`, `enableService()` |
| `lib/command.linux.ts`           | `enableServiceLinux()`, `enableUserServiceLinux()` — systemd management           |
| `index.ts`                       | Orchestrator: 4 phases (System Setup → Packages → Security → App Services)        |
| `services/packages/linux.ts`     | `apt-get install` for ufw, sshguard, syncthing, git, curl + NVM/Node.js           |
| `services/firewall/linux.ts`     | UFW reset, default policies, per-rule commands, enable                            |
| `services/ssh/index.ts`          | sshd_config.d drop-in, authorized_keys, `sshd -t`, restart sshd                   |
| `services/sshguard/linux.ts`     | SSHGuard with UFW backend                                                         |
| `services/auto-updates/linux.ts` | unattended-upgrades configuration                                                 |
| `resources/user.linux.ts`        | `useradd` for service user creation                                               |

**Critical implication for testing:** Because `local.Command` executes on localhost, you cannot simply point Pulumi at a Docker container and run `pulumi up` from outside. The commands would execute on the host, not inside the container.

---

## 2. Pulumi Testing Frameworks

Pulumi offers three tiers of testing. Each has different tradeoffs for SyncReeper.

### 2.1 Unit Tests with Mocks (`pulumi.runtime.setMocks()`)

**What it does:** Intercepts all Pulumi resource creation calls and returns mock values instead of actually creating resources. No real commands execute.

**What you can validate:**

- Correct resource names are generated
- Command strings contain expected content (e.g., `apt-get install -y ufw sshguard`)
- File contents written by `writeFile()` are correct (sshd_config, authorized_keys)
- Dependency chains between resources are correct
- Config validation logic (e.g., SSH requires at least one key)
- Platform branching logic (Linux vs macOS paths)

**What you cannot validate:**

- Whether the commands actually succeed on a real system
- Whether file permissions are applied correctly
- Whether services start and function

**Example pattern for SyncReeper:**

```typescript
import * as pulumi from "@pulumi/pulumi";
import { describe, it, expect, beforeAll } from "vitest";

// Must be called before importing any Pulumi code
pulumi.runtime.setMocks({
    newResource(args: pulumi.runtime.MockResourceArgs) {
        // Capture created resources for assertions
        return { id: `${args.name}-id`, state: args.inputs };
    },
    call(args: pulumi.runtime.MockCallArgs) {
        return args.inputs;
    },
});

describe("SSH hardening", () => {
    it("should generate correct sshd_config content", async () => {
        // Import AFTER setMocks
        const { setupSSH } = await import("../services/ssh/index");

        const result = setupSSH({
            authorizedKeys: ["ssh-ed25519 AAAA... user@host"],
        });

        // Assert on the command strings captured by the mock
        // Verify config file content includes expected directives
    });

    it("should reject empty authorized keys", () => {
        const { setupSSH } = await import("../services/ssh/index");
        expect(() => setupSSH({ authorizedKeys: [] })).toThrow("at least one authorized key");
    });
});
```

**Verdict:** High value, low effort. Best starting point. Can catch logic bugs, config typos, and regressions in command generation without any Docker infrastructure.

### 2.2 Integration Tests via Automation API

**What it does:** Uses `@pulumi/pulumi/automation` to programmatically run `pulumi up` and `pulumi destroy` from test code. Real resources are created.

**How it works with SyncReeper:** Since all commands are `local.Command`, running `pulumi up` via Automation API would execute every command on whatever machine runs the test. This is the mechanism you'd combine with Docker (see Section 3).

**Example pattern:**

```typescript
import { LocalWorkspace } from "@pulumi/pulumi/automation";

const stack = await LocalWorkspace.createOrSelectStack({
    stackName: "test",
    projectName: "syncreeper-test",
    program: async () => {
        // Your Pulumi program
    },
});

const upResult = await stack.up({ onOutput: console.log });
// Assert on outputs
expect(upResult.outputs.serviceUser.value).toBe("syncreeper");

// Cleanup
await stack.destroy({ onOutput: console.log });
```

**Verdict:** Only useful when combined with Docker (Pattern C in Section 3) or when running against a real test VPS. Too destructive to run on a developer's machine directly.

### 2.3 Policy Tests (CrossGuard)

**What it does:** `@pulumi/policy` lets you write rules that validate resource properties before deployment. Policies run during `pulumi preview` and can block non-compliant deployments.

**Example use cases for SyncReeper:**

- Ensure SSH config always disables password authentication
- Ensure UFW default policy is always "deny incoming"
- Ensure no `local.Command` writes files with mode `777`

**Verdict:** Useful for compliance guardrails, but not a substitute for functional testing. Lower priority than unit tests and integration tests.

---

## 3. Docker-Based Integration Testing Approaches

Three viable patterns exist, each with different tradeoffs.

### 3.1 Pattern A: Test Commands Directly (No Pulumi)

**Approach:** Skip Pulumi entirely. Use Testcontainers to spin up an Ubuntu container, then execute the same shell commands your Pulumi code generates — via `docker exec` or the Testcontainers API. Assert on results.

**How it works:**

1. Extract the shell commands from your service functions (or call helper functions that generate command strings)
2. Start an Ubuntu container with Testcontainers
3. Execute each command inside the container
4. Assert: files exist, packages installed, users created, configs correct

**Example:**

```typescript
import { GenericContainer, StartedTestContainer } from "testcontainers";
import { describe, it, expect, beforeAll, afterAll } from "vitest";

describe("Package installation", () => {
    let container: StartedTestContainer;

    beforeAll(async () => {
        container = await new GenericContainer("ubuntu:24.04")
            .withCommand(["sleep", "infinity"])
            .start();

        // Run the same commands our Pulumi code generates
        await container.exec([
            "bash",
            "-c",
            "export DEBIAN_FRONTEND=noninteractive && apt-get update && apt-get install -y ufw sshguard syncthing git curl ca-certificates",
        ]);
    }, 120_000);

    afterAll(async () => {
        await container.stop();
    });

    it("should install ufw", async () => {
        const result = await container.exec(["which", "ufw"]);
        expect(result.exitCode).toBe(0);
    });

    it("should install sshguard", async () => {
        const result = await container.exec(["which", "sshguard"]);
        expect(result.exitCode).toBe(0);
    });

    it("should install git", async () => {
        const result = await container.exec(["git", "--version"]);
        expect(result.exitCode).toBe(0);
    });
});
```

**Pros:**

- Simple to set up — no Pulumi runtime needed in tests
- Fast feedback loop
- Tests the actual shell commands that matter
- Easy to run in CI

**Cons:**

- Tests are decoupled from Pulumi resource definitions — if someone changes a command in Pulumi code but forgets to update the test, they drift
- Doesn't test Pulumi dependency ordering
- Requires manually extracting/duplicating command strings

**Mitigation for drift:** Refactor command strings into pure functions that return strings, then both Pulumi code and tests import the same function. For example:

```typescript
// lib/commands/packages.ts (pure function, no Pulumi imports)
export function getInstallPackagesCommand(): string {
    const packages = ["ufw", "sshguard", "syncthing", "git", "curl", "ca-certificates"];
    return `export DEBIAN_FRONTEND=noninteractive && apt-get update && apt-get install -y ${packages.join(" ")}`;
}

// services/packages/linux.ts (Pulumi code)
import { getInstallPackagesCommand } from "../../lib/commands/packages";
runCommand({ name: "install-apt-packages", create: getInstallPackagesCommand() });

// tests/packages.integration.test.ts
import { getInstallPackagesCommand } from "../lib/commands/packages";
await container.exec(["bash", "-c", getInstallPackagesCommand()]);
```

### 3.2 Pattern B: Refactor to `remote.Command` + Docker SSH

**Approach:** Change the codebase from `command.local.Command` to `command.remote.Command`. Then point the SSH connection at a Docker container running an SSH server. Run `pulumi up` normally.

**What changes in the code:**

```typescript
// Before (current)
import * as command from "@pulumi/command";
new command.local.Command("install-packages", {
    create: "apt-get install -y ufw",
});

// After (refactored)
import * as command from "@pulumi/command";
new command.remote.Command("install-packages", {
    create: "apt-get install -y ufw",
    connection: {
        host: "localhost",
        port: 2222,
        user: "root",
        privateKey: fs.readFileSync("test-key", "utf-8"),
    },
});
```

**Docker setup:**

```dockerfile
FROM ubuntu:24.04
RUN apt-get update && apt-get install -y openssh-server sudo
RUN mkdir /run/sshd
RUN echo 'root:test' | chpasswd
RUN sed -i 's/#PermitRootLogin.*/PermitRootLogin yes/' /etc/ssh/sshd_config
EXPOSE 22
CMD ["/usr/sbin/sshd", "-D"]
```

**Pros:**

- Tests the actual Pulumi program end-to-end, including dependency ordering
- Makes the architecture production-ready for remote VPS provisioning (SSH is how you'd deploy to a real VPS anyway)
- Clean separation: Pulumi runs on your machine, commands execute on the target

**Cons:**

- Significant refactor — every call to `runCommand()`, `writeFile()`, `copyFile()`, `enableService()` needs a `connection` parameter
- The `connection` object must be threaded through the entire codebase
- Slower tests (SSH overhead)
- More complex Docker setup (SSH server, key management)
- `writeFile()` uses heredoc syntax (`cat > path << 'EOF'`) which works over SSH but needs testing

**Verdict:** This is architecturally the best long-term solution if you plan to provision remote VPS machines. But it's a significant refactor and changes the project's fundamental execution model. Consider this as a future evolution, not a first step.

### 3.3 Pattern C: Run Pulumi Inside the Container

**Approach:** Mount the SyncReeper project into a Docker container, install Pulumi inside it, and run `pulumi up` from within the container. Since `local.Command` runs on localhost, and localhost is now the container, commands execute inside the container.

**Docker setup:**

```dockerfile
FROM jrei/systemd-ubuntu:24.04

# Install Pulumi prerequisites
RUN apt-get update && apt-get install -y curl ca-certificates git sudo

# Install Node.js
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y nodejs

# Install pnpm
RUN npm install -g pnpm

# Install Pulumi
RUN curl -fsSL https://get.pulumi.com | sh
ENV PATH="/root/.pulumi/bin:${PATH}"

WORKDIR /workspace
```

**Test execution:**

```bash
# Build and run with systemd support (required for systemctl commands)
docker build -t syncreeper-test .
docker run -d --privileged --name syncreeper-test \
  -v /sys/fs/cgroup:/sys/fs/cgroup:rw \
  -v $(pwd):/workspace \
  syncreeper-test

# Inside the container
docker exec syncreeper-test bash -c "
  cd /workspace &&
  pnpm install &&
  pnpm build &&
  pulumi login --local &&
  pulumi stack init test &&
  pulumi up --yes
"

# Assert on system state
docker exec syncreeper-test bash -c "which ufw && ufw status"
docker exec syncreeper-test bash -c "cat /etc/ssh/sshd_config.d/99-syncreeper-hardening.conf"
docker exec syncreeper-test bash -c "id syncreeper"
```

**Pros:**

- Tests the actual Pulumi program with zero code changes
- `local.Command` naturally runs inside the container
- Tests dependency ordering, resource creation, the whole stack

**Cons:**

- Requires `--privileged` flag for systemd (security concern in CI)
- The `jrei/systemd-ubuntu` image (or equivalent) is needed for systemctl to work
- Slow — full `pulumi up` with apt-get installs takes minutes
- Container state management is complex (need clean state for each test run)
- Pulumi state must be managed (local backend or mock)
- cgroup v2 compatibility issues on some CI runners

**Verdict:** Most realistic end-to-end test, but heaviest to set up and maintain. Best used as a periodic smoke test (nightly CI), not on every commit.

---

## 4. What Can and Cannot Be Validated in Docker

### Easy to Validate (standard container, no special flags)

| What                    | How to Verify                           | SyncReeper Files                                          |
| ----------------------- | --------------------------------------- | --------------------------------------------------------- |
| Package installation    | `which ufw`, `dpkg -l`, exit codes      | `services/packages/linux.ts`                              |
| File creation & content | `cat /path/to/file`, `diff`             | `lib/command.ts` (`writeFile`)                            |
| File permissions        | `stat -c '%a' /path`                    | `lib/command.ts` (`writeFile`, `copyFile`)                |
| File ownership          | `stat -c '%U:%G' /path`                 | `lib/command.ts` (`writeFile`)                            |
| User creation           | `id syncreeper`, `getent passwd`        | `resources/user.linux.ts`                                 |
| Directory creation      | `test -d /path`, `ls -la`               | `resources/directories.ts`                                |
| SSH config syntax       | `sshd -t` (if openssh-server installed) | `services/ssh/index.ts`                                   |
| NVM/Node.js install     | `node --version`, `npm --version`       | `services/packages/linux.ts`                              |
| Config file content     | `grep` for expected directives          | `services/ssh/index.ts`, `services/auto-updates/linux.ts` |
| authorized_keys content | `cat ~/.ssh/authorized_keys`            | `services/ssh/index.ts`                                   |

### Requires `--privileged` or Special Setup

| What               | Why                            | How to Verify                |
| ------------------ | ------------------------------ | ---------------------------- |
| UFW/iptables rules | Needs kernel netfilter access  | `ufw status`, `iptables -L`  |
| systemd services   | Needs systemd as PID 1         | `systemctl status <service>` |
| systemd timers     | Needs systemd                  | `systemctl list-timers`      |
| User-level systemd | Needs systemd + user lingering | `systemctl --user status`    |
| sshd restart       | Needs systemd or init          | `systemctl restart sshd`     |

**Note on `--privileged`:** This gives the container full host kernel access. It's necessary for iptables/UFW and systemd but poses security risks in shared CI environments. GitHub Actions self-hosted runners handle this fine; GitHub-hosted runners support it but with caveats.

### Difficult or Impossible in Docker

| What                                | Why                                                                                 |
| ----------------------------------- | ----------------------------------------------------------------------------------- |
| Real network firewall testing       | Container networking is virtual; UFW rules may not behave identically to bare metal |
| Actual SSH connections from outside | Possible but requires port mapping and key setup, adds significant complexity       |
| Kernel-level security features      | Containers share the host kernel                                                    |
| Full reboot testing                 | Containers don't reboot like real machines                                          |
| unattended-upgrades actual behavior | Requires real apt repos, timers, and reboot capability                              |

---

## 5. Practical Recommendations

### Recommended Tiered Approach

For a solo developer, implement testing in this order. Each tier builds on the previous one.

#### Tier 1: Unit Tests with Mocks (Do This First)

**Effort:** Low (1-2 days)
**Value:** High — catches logic bugs, config errors, regressions

**Setup:**

```bash
# Add vitest to the workspace
pnpm add -D vitest -w

# Add test script to packages/host/package.json
# "test": "vitest run"
# "test:watch": "vitest"
```

**What to test:**

1. `generateSSHDConfig()` output contains all expected directives
2. `generateAuthorizedKeys()` formats keys correctly
3. `generateFirewallCommands()` produces correct UFW commands in correct order
4. `generateRuleCommand()` handles all rule variations (limit, from, proto)
5. SSH setup throws when no keys provided
6. Platform branching (`isLinux()` / `isMacOS()`) in `writeFile()`, `enableService()`
7. Command strings in `setupPackagesLinux()` include all expected packages

**Refactoring suggestion:** Extract pure functions that generate command strings and config file contents. Currently, some of these (like `generateSSHDConfig`, `generateFirewallCommands`) are already pure functions — they just need to be exported for testing. Others (like the apt-get command in `setupPackagesLinux`) are inline strings that should be extracted.

#### Tier 2: Docker Command Tests (Pattern A)

**Effort:** Medium (2-3 days)
**Value:** High — proves commands actually work on Ubuntu

**Setup:**

```bash
pnpm add -D testcontainers -w
```

**Vitest config for integration tests:**

```typescript
// vitest.config.integration.ts
import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        include: ["**/*.integration.test.ts"],
        testTimeout: 180_000, // 3 minutes for container operations
        hookTimeout: 120_000,
    },
});
```

**What to test:**

1. Package installation: all APT_PACKAGES install successfully on ubuntu:24.04
2. NVM + Node.js installation: node and npm are available after install
3. User creation: `useradd` produces correct user with correct home dir
4. File writing: `writeFile`-style heredoc commands produce files with correct content, permissions, ownership
5. SSH config: `sshd -t` validates the generated config (install openssh-server first)
6. Directory creation with correct ownership

**Example test structure:**

```
packages/host/
├── src/
├── tests/
│   ├── unit/
│   │   ├── ssh-config.test.ts
│   │   ├── firewall-commands.test.ts
│   │   └── command-generation.test.ts
│   └── integration/
│       ├── packages.integration.test.ts
│       ├── ssh.integration.test.ts
│       ├── user.integration.test.ts
│       └── files.integration.test.ts
```

#### Tier 3: Full Stack Smoke Test (Pattern C)

**Effort:** High (3-5 days)
**Value:** Medium — proves the full Pulumi program works end-to-end

**When to add this:** After Tiers 1 and 2 are stable. Run nightly or on release branches, not on every commit.

**Setup:** Create a `Dockerfile.test` and a test script:

```dockerfile
# Dockerfile.test
FROM jrei/systemd-ubuntu:24.04

RUN apt-get update && apt-get install -y \
    curl ca-certificates git sudo openssh-server

# Install Node.js 22
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y nodejs

# Install pnpm and Pulumi
RUN npm install -g pnpm \
    && curl -fsSL https://get.pulumi.com | sh

ENV PATH="/root/.pulumi/bin:${PATH}"
WORKDIR /workspace
```

```bash
# scripts/smoke-test.sh
#!/bin/bash
set -e

docker build -f Dockerfile.test -t syncreeper-smoke .
docker run -d --privileged --name syncreeper-smoke \
  --cgroupns=host \
  -v /sys/fs/cgroup:/sys/fs/cgroup:rw \
  -v "$(pwd)":/workspace \
  syncreeper-smoke

cleanup() { docker rm -f syncreeper-smoke 2>/dev/null; }
trap cleanup EXIT

docker exec syncreeper-smoke bash -c "
  cd /workspace &&
  pnpm install &&
  pnpm build:host &&
  pulumi login --local &&
  cd packages/host &&
  pulumi stack init test &&
  pulumi config set syncreeper:ssh-authorized-keys '[\"ssh-ed25519 AAAA_TEST_KEY test@test\"]' &&
  pulumi up --yes --non-interactive
"

# Assertions
docker exec syncreeper-smoke id syncreeper
docker exec syncreeper-smoke test -f /etc/ssh/sshd_config.d/99-syncreeper-hardening.conf
docker exec syncreeper-smoke ufw status | grep -q "Status: active"
docker exec syncreeper-smoke systemctl is-active sshd

echo "Smoke test passed"
```

#### Tier 4 (Future): Refactor to `remote.Command`

**When:** If/when you want the same Pulumi code to provision remote VPS machines over SSH (not just the local machine). This changes the execution model and makes Pattern B testing natural.

### Tool Recommendations

| Tool               | Purpose                                                           | Package          |
| ------------------ | ----------------------------------------------------------------- | ---------------- |
| **Vitest**         | Test runner (fast, native ESM, works with pnpm)                   | `vitest`         |
| **Testcontainers** | Programmatic Docker container management from tests               | `testcontainers` |
| **Docker image**   | `ubuntu:24.04` for Tier 2, `jrei/systemd-ubuntu:24.04` for Tier 3 | —                |

### GitHub Actions CI Considerations

```yaml
# .github/workflows/test.yml
name: Test
on: [push, pull_request]

jobs:
    unit-tests:
        runs-on: ubuntu-latest
        steps:
            - uses: actions/checkout@v4
            - uses: pnpm/action-setup@v4
            - uses: actions/setup-node@v4
              with:
                  node-version: 22
                  cache: pnpm
            - run: pnpm install
            - run: pnpm build
            - run: pnpm test # Unit tests only, fast

    integration-tests:
        runs-on: ubuntu-latest
        steps:
            - uses: actions/checkout@v4
            - uses: pnpm/action-setup@v4
            - uses: actions/setup-node@v4
              with:
                  node-version: 22
                  cache: pnpm
            - run: pnpm install
            - run: pnpm build
            - run: pnpm test:integration # Testcontainers tests

    # Nightly only — too slow for every push
    smoke-test:
        runs-on: ubuntu-latest
        if: github.event_name == 'schedule'
        steps:
            - uses: actions/checkout@v4
            - run: bash scripts/smoke-test.sh
```

**Notes on GitHub Actions:**

- GitHub-hosted runners have Docker pre-installed
- `--privileged` works on GitHub-hosted runners
- Testcontainers works out of the box (uses the local Docker daemon)
- Cache the Docker images to speed up integration tests: use `docker pull` in a setup step or a container registry

### Summary Decision Matrix

| Approach                         | Effort    | Speed            | Coverage                      | Code Changes                      |
| -------------------------------- | --------- | ---------------- | ----------------------------- | --------------------------------- |
| Unit mocks (Tier 1)              | Low       | Fast (<5s)       | Logic, config generation      | Extract pure functions            |
| Docker commands (Tier 2)         | Medium    | Medium (1-3 min) | Commands work on real Ubuntu  | None (or extract command strings) |
| Full smoke test (Tier 3)         | High      | Slow (5-10 min)  | End-to-end Pulumi + system    | None                              |
| remote.Command refactor (Tier 4) | Very High | Medium           | End-to-end + production model | Major refactor                    |

**Start with Tier 1.** It gives the most value per hour invested and establishes the testing infrastructure. Add Tier 2 once you want confidence that your shell commands actually work on Ubuntu. Add Tier 3 when you want a full-stack safety net.
