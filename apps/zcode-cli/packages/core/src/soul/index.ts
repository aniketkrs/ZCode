// ============================================================
// Soul module — public surface
// ============================================================

export {
  SOUL_FILENAME,
  SOUL_SUITE_FILENAME,
  SOUL_BASELINE_FILENAME,
  SoulLoadError,
  compileSystemSection,
  defaultGlobalSoulDir,
  entryLint,
  loadSoul,
  parseSoul,
  resolveSoulFilePath,
} from "./soul.js";
export type { SoulAxiom, SoulFile, SoulFileReader, ResolveSoulFileOptions } from "./soul.js";

export {
  SOUL_FILENAMES,
  SOUL_FORMATION_GUARD_RULE_ID,
  denialMessage,
  extractWriteTargetPath,
  isProtectedEditTarget,
  isProtectedWriteTarget,
  isSoulFilename,
} from "./guard.js";

export {
  DEFAULT_GATES,
  DEFAULT_SCORING,
  SOUL_EVAL_SECTIONS,
  lintSuite,
  parseResponses,
  parseSuite,
  probesOf,
  resolveGates,
  resolveScoring,
} from "./eval.js";
export type {
  SoulEvalGates,
  SoulEvalScoring,
  SoulEvalSection,
  SoulEvalSuite,
  SoulProbe,
  SoulProbeExpect,
  SoulProbeResponse,
  SoulSectionD,
} from "./eval.js";

export { gradeProbe } from "./grade.js";
export type { SoulGradeResult, SoulGradeStatus } from "./grade.js";

export { computeMetrics, evaluateGates, renderReport, scoreAll } from "./metrics.js";
export type { SoulBaseline, SoulGateRow, SoulMetrics } from "./metrics.js";
