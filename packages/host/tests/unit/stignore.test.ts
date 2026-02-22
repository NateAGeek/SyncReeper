/**
 * Unit tests for Syncthing .stignore content generation
 *
 * Tests that generateStignoreContent() produces a comprehensive
 * .stignore file with patterns for all supported languages and platforms.
 *
 * All patterns should:
 * - Use the double-star prefix for explicit recursive matching
 * - Omit trailing slashes (so both directories and contents are matched)
 * - Use (?d) prefix on OS junk and log patterns for auto-deletion
 */

import { describe, it, expect } from "vitest";
import {
    generateStignoreContent,
    GITIGNORE_SECTION_START,
    GITIGNORE_SECTION_END,
} from "../../src/services/syncthing/stignore";

describe("Stignore Content Generation", () => {
    const content = generateStignoreContent();

    it("should produce non-empty content", () => {
        expect(content).toBeTruthy();
        expect(content.length).toBeGreaterThan(100);
    });

    it("should include a descriptive header comment", () => {
        expect(content).toContain("SyncReeper Syncthing Ignore Patterns");
    });

    it("should include Syncthing ignore syntax reference", () => {
        expect(content).toContain("https://docs.syncthing.net/users/ignoring.html");
    });

    it("should not contain trailing slashes on directory patterns", () => {
        // Directory patterns should NOT end with / to match both dir and contents
        const lines = content.split("\n").filter((l) => !l.startsWith("//") && l.trim() !== "");
        const trailingSlashPatterns = lines.filter((l) => l.endsWith("/"));
        expect(trailingSlashPatterns).toEqual([]);
    });

    // OS-specific file patterns
    describe("OS-Specific Files (with (?d) prefix)", () => {
        it("should ignore macOS files with (?d) prefix", () => {
            expect(content).toContain("(?d)**/.DS_Store");
            expect(content).toContain("(?d)**/.Spotlight-V100");
            expect(content).toContain("(?d)**/.Trashes");
        });

        it("should ignore Windows files with (?d) prefix", () => {
            expect(content).toContain("(?d)**/Thumbs.db");
            expect(content).toContain("(?d)**/desktop.ini");
            expect(content).toContain("(?d)**/$RECYCLE.BIN");
        });

        it("should ignore Linux temp files with (?d) prefix", () => {
            expect(content).toContain("(?d)**/*~");
        });
    });

    // Environment / secrets patterns
    it("should ignore environment and secret files with recursive prefix", () => {
        expect(content).toContain("**/.env");
        expect(content).toContain("**/.env.local");
        expect(content).toContain("**/*.pem");
        expect(content).toContain("**/*.key");
    });

    // Log patterns
    it("should ignore log files with (?d) prefix", () => {
        expect(content).toContain("(?d)**/*.log");
        expect(content).toContain("(?d)**/logs");
    });

    // Language-specific patterns
    describe("Language Patterns", () => {
        it("should ignore JavaScript/TypeScript artifacts", () => {
            expect(content).toContain("**/node_modules");
            expect(content).toContain("**/dist");
            expect(content).toContain("**/.next");
            expect(content).toContain("**/*.tsbuildinfo");
        });

        it("should ignore Python artifacts", () => {
            expect(content).toContain("**/__pycache__");
            expect(content).toContain("**/.venv");
            expect(content).toContain("**/*.py[cod]");
            expect(content).toContain("**/.pytest_cache");
        });

        it("should ignore Rust artifacts", () => {
            expect(content).toContain("**/target");
            expect(content).toContain("**/*.rs.bk");
        });

        it("should ignore Go artifacts", () => {
            expect(content).toContain("**/vendor");
        });

        it("should ignore Java/Gradle/Maven artifacts", () => {
            expect(content).toContain("**/*.class");
            expect(content).toContain("**/*.jar");
            expect(content).toContain("**/.gradle");
        });

        it("should ignore C/C++ artifacts", () => {
            expect(content).toContain("**/*.o");
            expect(content).toContain("**/*.obj");
            expect(content).toContain("**/*.dylib");
            expect(content).toContain("**/cmake-build-*");
        });

        it("should ignore Zig artifacts", () => {
            expect(content).toContain("**/zig-cache");
            expect(content).toContain("**/zig-out");
        });

        it("should ignore C#/.NET artifacts", () => {
            expect(content).toContain("**/[Bb]in");
            expect(content).toContain("**/[Oo]bj");
            expect(content).toContain("**/.vs");
        });

        it("should ignore Unity artifacts", () => {
            expect(content).toContain("**/[Ll]ibrary");
            expect(content).toContain("**/*.unitypackage");
        });

        it("should ignore Godot artifacts", () => {
            expect(content).toContain("**/.godot");
            expect(content).toContain("**/*.import");
        });
    });

    // Test/coverage patterns
    it("should ignore test and coverage output", () => {
        expect(content).toContain("**/coverage");
        expect(content).toContain("**/.nyc_output");
        expect(content).toContain("**/*.lcov");
    });

    // Build artifact patterns
    it("should ignore misc build artifacts", () => {
        expect(content).toContain("**/*.map");
        expect(content).toContain("**/*.min.js");
        expect(content).toContain("**/*.bundle.js");
    });

    // Auto-generated section markers
    describe("Auto-generated gitignore section", () => {
        it("should include start and end markers", () => {
            expect(content).toContain(GITIGNORE_SECTION_START);
            expect(content).toContain(GITIGNORE_SECTION_END);
        });

        it("should have start marker before end marker", () => {
            const startIdx = content.indexOf(GITIGNORE_SECTION_START);
            const endIdx = content.indexOf(GITIGNORE_SECTION_END);
            expect(startIdx).toBeLessThan(endIdx);
        });
    });
});
