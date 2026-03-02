/**
 * .stignore updater for per-repo .gitignore patterns
 *
 * Re-exports the stignore utilities from @syncreeper/shared.
 * The canonical implementations now live in the shared package so that
 * the CLI, TUI, and sync packages can all access them.
 *
 * This module preserves the original export surface so existing
 * call sites (sync/src/index.ts) continue to work without changes.
 */

export { updateStignoreIncludes, regenerateStignore } from "@syncreeper/shared";
