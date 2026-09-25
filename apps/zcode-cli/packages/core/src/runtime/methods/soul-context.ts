// ============================================================
// Soul session loading — SOUL.md → testable constitution layer
// ============================================================
//
// Loads the project's SOUL.md (walking up from the workspace, with a global
// fallback) once during context initialization. The entry lint runs here: a
// soul whose axioms lack paired probes is rejected with a descriptive error
// that fails session start — a broken soul must never silently govern a
// session, and it must never reach the model unvalidated. Users repair it
// with `zcode soul validate`.

import type { AgentRuntimeInternal } from "../internal.js";
import type { TraceContext } from "../deps.js";
import {
  SoulLoadError,
  loadSoul,
  resolveSoulFilePath,
  type SoulFile,
  type SoulFileReader,
} from "../../soul/index.js";

export async function loadSoulForSession(
  this: AgentRuntimeInternal,
  traceContext: TraceContext,
): Promise<SoulFile | undefined> {
  const fileSystemPort = this.fileSystemPort;
  if (!fileSystemPort) {
    this.logger?.debug?.("soul skipped: missing file system port");
    return undefined;
  }
  const files: SoulFileReader = {
    exists: async (path) => {
      try {
        const stat = await fileSystemPort.stat(
          { path, trace: traceContext },
          { signal: undefined },
        );
        return stat.kind === "file";
      } catch {
        return false;
      }
    },
    read: async (path) => (await fileSystemPort.readTextFile({ path })).content,
  };
  const soulPath = await resolveSoulFilePath(this.workingDirectory, {
    globalConfigDir: this.config.soul?.globalSoulDir,
    exists: files.exists,
  });
  if (!soulPath) {
    this.logger?.debug?.("soul skipped: no SOUL.md found");
    return undefined;
  }
  try {
    const soul = await loadSoul(files, soulPath);
    this.logger?.info?.(
      `soul loaded from ${soulPath}: ${soul.axioms.length} axioms, soul v${soul.version}`,
    );
    return soul;
  } catch (cause) {
    // Entry-lint failures fail the session start loudly: silently running
    // without the user's constitution would be a worse failure mode.
    const messages = cause instanceof SoulLoadError ? cause.messages : [String(cause)];
    throw new Error(
      `SOUL.md at ${soulPath} failed the entry lint and was not loaded; ` +
        `fix it with \`zcode soul validate\`:\n${messages.join("\n")}`,
      { cause },
    );
  }
}
