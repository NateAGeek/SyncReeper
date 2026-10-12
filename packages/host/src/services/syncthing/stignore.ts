/**
 * Syncthing ignore patterns (.stignore) — re-exported from @syncreeper/shared
 *
 * The canonical implementation lives in the shared package so that the CLI,
 * TUI, and sync packages can also generate a fresh .stignore without pulling
 * in the host (Pulumi) package.
 */

export {
    generateStignoreContent,
    GITIGNORE_SECTION_START,
    GITIGNORE_SECTION_END,
} from "@syncreeper/shared";
