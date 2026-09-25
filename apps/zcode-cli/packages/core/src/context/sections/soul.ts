// ============================================================
// Soul Section Builder — testable constitution layer
// ============================================================
//
// Compiles the session's loaded SOUL.md into the system prompt AFTER project
// instructions. A soul that failed the entry lint is never passed here; see
// runtime/methods/soul-context.ts.

import { compileSystemSection, type SoulFile } from "../../soul/soul.js";
import type { ContextSection } from "../types.js";
import { estimateTokens } from "../utils.js";

export function buildSoulSection(soul: SoulFile | undefined): ContextSection | null {
  if (!soul) return null;
  const content = compileSystemSection(soul);
  return {
    name: "Soul",
    source: "soul",
    injectionTarget: "system",
    cacheHint: "stable",
    chars: content.length,
    tokens: estimateTokens(content),
    content,
    preview: content.slice(0, 100),
  };
}
