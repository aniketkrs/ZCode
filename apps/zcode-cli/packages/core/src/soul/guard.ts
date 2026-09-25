// ============================================================
// Soul formation guard — the security boundary of the Soul layer
// ============================================================
//
// "An agent may not edit its own axioms" is enforced here, in code, by the
// permission layer. It is not a prompt instruction the model can talk itself
// out of. Every agent tool call flows through PermissionService.checkPermission;
// user edits made in their own editor never touch this path and are unaffected.
//
// The protected set is the soul file plus its co-located eval artifacts. The
// names are conventional and fixed so the guard stays a pure function with no
// config or I/O — there is nothing to misconfigure into an open gate.

import { SOUL_BASELINE_FILENAME, SOUL_FILENAME, SOUL_SUITE_FILENAME } from "./soul.js";

/** Soul artifacts an agent may never write through tools. */
export const SOUL_FILENAMES = [SOUL_FILENAME, SOUL_SUITE_FILENAME, SOUL_BASELINE_FILENAME] as const;

/**
 * Tool names that perform file writes. Mirrors the registered handler names
 * in @zcode/contracts (EditInput / WriteInput / ApplyPatchInput) and the
 * write-tool set in PermissionService.isWriteTool. ApplyPatch names its
 * targets inside patch_text, so it is scanned fail-closed (see below).
 */
const SOUL_WRITE_TOOL_NAMES: ReadonlySet<string> = new Set(["Edit", "Write", "ApplyPatch"]);

/** Rule id reported on permission decisions denied by this guard. */
export const SOUL_FORMATION_GUARD_RULE_ID = "rule.soul.formationGuard";

export function isSoulFilename(name: string): boolean {
  return (SOUL_FILENAMES as readonly string[]).includes(name);
}

function basenameOf(path: string): string {
  const parts = path.split(/[/\\]/);
  return parts[parts.length - 1] ?? path;
}

/**
 * True when an edit target names a soul artifact. `pattern` is the
 * worktree-relative path (or glob) from the permission request; `filepath` is
 * the absolute path from the tool metadata when present, which is
 * authoritative.
 */
export function isProtectedEditTarget(pattern: string, filepath?: unknown): boolean {
  // The absolute path from tool metadata is authoritative: it names the file
  // that will actually be written, so it overrides the request pattern.
  if (typeof filepath === "string") return isSoulFilename(basenameOf(filepath));
  if (pattern.includes("*")) {
    // Glob form, e.g. **/SOUL.md. A bare "*.md" must not match.
    const deglobbed = basenameOf(pattern.replace(/\*/g, ""));
    return deglobbed !== "" && isSoulFilename(deglobbed);
  }
  return isSoulFilename(basenameOf(pattern));
}

/** Extract the write target path from Edit/Write-style tool inputs. */
export function extractWriteTargetPath(input: unknown): string | undefined {
  if (typeof input !== "object" || input === null) return undefined;
  const record = input as Record<string, unknown>;
  const candidate = record["filePath"] ?? record["file_path"] ?? record["path"];
  return typeof candidate === "string" ? candidate : undefined;
}

/**
 * Formation-guard check for PermissionService.checkPermission. Returns the
 * matched target path when a file-write tool call targets a soul artifact,
 * otherwise undefined.
 *
 * ApplyPatch carries its targets inside patch_text with no single path field
 * (the repo's own permission code notes this), and no patch parser is
 * available at this layer. It is therefore scanned fail-closed: any mention
 * of a soul artifact name denies the call. A patch that merely documents
 * SOUL.md is collateral, accepted for a constitution guard.
 */
export function isProtectedWriteTarget(toolName: string, input: unknown): string | undefined {
  if (!SOUL_WRITE_TOOL_NAMES.has(toolName)) return undefined;
  if (toolName === "ApplyPatch") {
    const record = (input ?? {}) as Record<string, unknown>;
    const patchText = record["patch_text"];
    if (typeof patchText !== "string") return undefined;
    const hit = (SOUL_FILENAMES as readonly string[]).find((name) => patchText.includes(name));
    return hit === undefined ? undefined : `ApplyPatch patch targeting ${hit}`;
  }
  const target = extractWriteTargetPath(input);
  if (!target) return undefined;
  return isProtectedEditTarget(target) ? target : undefined;
}

/** Message shown to the agent when the guard fires. */
export function denialMessage(target: string): string {
  return (
    `Denied by the soul formation guard: agents may never edit ${target}. ` +
    "Axioms change only by human edit plus a full eval re-run. " +
    "Ask the user to make this change in their own editor."
  );
}
