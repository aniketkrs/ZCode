// ============================================================
// Soul constitution layer — SOUL.md loading and entry lint
// ============================================================
//
// SOUL.md is a testable values file: axioms with paired probes, ranked
// values, dispositions. It is loaded at session start and compiled into the
// system prompt AFTER project instructions. It is not identity prose: every
// axiom must survive the entry lint or the soul is rejected and never
// reaches the model.
//
// This module is pure: it takes content and file contents as input and never
// touches the filesystem or the network. Callers supply their own I/O.

import { basename, dirname, join, resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import { lintSuite, parseSuite, type SoulEvalSuite } from "./eval.js";

export const SOUL_FILENAME = "SOUL.md";
export const SOUL_SUITE_FILENAME = "SOUL.suite.yaml";
export const SOUL_BASELINE_FILENAME = "SOUL.baseline.json";

/** Axiom id shape, e.g. AX-01. */
const AXIOM_ID_PATTERN = /^[A-Z]+-\d+$/;

export interface SoulAxiom {
  id: string;
  statement: string;
  enforcedBy: string;
}

export interface SoulFile {
  path: string;
  version: string;
  agent: string;
  purpose: string;
  axioms: SoulAxiom[];
  values: string[];
  dispositions: string;
  suitePath: string;
}

export class SoulLoadError extends Error {
  readonly messages: string[];
  constructor(messages: string[]) {
    super(messages.join("\n"));
    this.name = "SoulLoadError";
    this.messages = messages;
  }
}

/** Minimal file access surface the loader needs. Async so both node fs and the FileSystemPort fit. */
export interface SoulFileReader {
  exists(path: string): Promise<boolean>;
  read(path: string): Promise<string>;
}

export interface ResolveSoulFileOptions {
  /** Global config dir, e.g. ~/.zcode/v2. Skipped when undefined. */
  globalConfigDir?: string;
  exists: (path: string) => Promise<boolean>;
}

/**
 * Find SOUL.md walking up from startDir, then the global fallback.
 * Returns undefined when no soul file exists.
 */
export async function resolveSoulFilePath(
  startDir: string,
  options: ResolveSoulFileOptions,
): Promise<string | undefined> {
  let dir = resolve(startDir);
  while (true) {
    const candidate = join(dir, SOUL_FILENAME);
    if (await options.exists(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  if (options.globalConfigDir) {
    const globalCandidate = join(options.globalConfigDir, SOUL_FILENAME);
    if (await options.exists(globalCandidate)) return globalCandidate;
  }
  return undefined;
}

interface FrontMatter {
  data: Record<string, unknown>;
  content: string;
}

function parseFrontMatter(content: string): FrontMatter {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) return { data: {}, content };
  let data: Record<string, unknown> = {};
  try {
    const parsed: unknown = parseYaml(match[1] ?? "");
    if (typeof parsed === "object" && parsed !== null) {
      data = parsed as Record<string, unknown>;
    }
  } catch {
    data = {};
  }
  return { data, content: content.slice(match[0].length) };
}

/** Section body between "## <n>." and the next "## " header. */
function section(content: string, n: number): string {
  const lines = content.split("\n");
  const header = new RegExp(`^##\\s+${n}\\.`);
  const start = lines.findIndex((line) => header.test(line.trim()));
  if (start === -1) return "";
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => line.trim().startsWith("## "));
  return (end === -1 ? rest : rest.slice(0, end)).join("\n");
}

function tableRows(sectionBody: string): string[][] {
  const rows = sectionBody
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("|") && !line.includes("---"))
    .map((line) =>
      line
        .split(/(?<!\\)\|/)
        .slice(1, -1)
        .map((cell) => cell.replace(/\\\|/g, "|").trim()),
    )
    .filter((cols) => cols.length > 0);
  // Markdown tables open with a header row; data starts after it.
  return rows.slice(1);
}

function stripBackticks(value: string): string {
  return value.replace(/^`|`$/g, "").trim();
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

/**
 * Parse SOUL.md content into a SoulFile. Never throws on malformed input:
 * missing pieces degrade to empty values, and entryLint() reports them.
 */
export function parseSoul(content: string, filepath: string): SoulFile {
  const { data, content: body } = parseFrontMatter(content);

  const axioms: SoulAxiom[] = [];
  for (const cols of tableRows(section(body, 1))) {
    const id = stripBackticks(cols[0] ?? "");
    if (!AXIOM_ID_PATTERN.test(id)) continue;
    axioms.push({
      id,
      statement: stripBackticks(cols[1] ?? ""),
      enforcedBy: stripBackticks(cols[2] ?? ""),
    });
  }

  const values: string[] = [];
  for (const cols of tableRows(section(body, 2))) {
    const value = stripBackticks(cols[1] ?? "");
    if (value && !/^<.*>$/.test(value)) values.push(value);
  }

  const dispositions = section(body, 3)
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      // Drop markdown separator rows like |---|---|
      return !(trimmed.startsWith("|") && trimmed.replace(/[\s:|-]/g, "") === "");
    })
    .join("\n")
    .trim();

  const purpose =
    section(body, 0)
      .split("\n")
      .map((line) => line.trim())
      .find((line) => line.length > 0) ?? "";

  const dir = dirname(filepath);
  const suiteRel = asString(data["eval_suite"]) ?? SOUL_SUITE_FILENAME;

  return {
    path: filepath,
    version: asString(data["soul_version"]) ?? "0.1.0",
    agent: asString(data["agent"]) ?? basename(dir),
    purpose,
    axioms,
    values,
    dispositions,
    suitePath: resolve(dir, suiteRel),
  };
}

// -----------------------------------------------
// Entry lint
// -----------------------------------------------

/**
 * Runtime entry lint: nothing enters the soul that cannot be tested. Every
 * axiom id in SOUL.md §1 must have at least one must_refuse and one
 * must_not_refuse probe in the co-located suite, or the soul is rejected.
 * Empty means clean.
 */
export function entryLint(soul: SoulFile, suite: SoulEvalSuite): string[] {
  const errors: string[] = [];
  if (soul.axioms.length === 0) {
    errors.push(`soul: ${soul.path} defines no axioms in §1`);
  }
  const linted = lintSuite({ ...suite, axioms: soul.axioms.map((axiom) => axiom.id) });
  for (const entry of linted) {
    if (entry.startsWith("ORPHAN")) {
      // "ORPHAN: axiom {id} has no {kind} probe"
      const [, , axiomId, , , kind] = entry.split(" ");
      errors.push(`soul: axiom ${axiomId} has no ${kind} probe in ${soul.suitePath}`);
    } else {
      errors.push(`soul: suite ${soul.suitePath}: ${entry}`);
    }
  }
  return errors;
}

// -----------------------------------------------
// System prompt compilation
// -----------------------------------------------

/** Global fallback dir for the soul file: ~/.zcode/v2 (existing CLI convention). */
export function defaultGlobalSoulDir(dataBaseDir: string): string {
  return join(dataBaseDir, ".zcode", "v2");
}

/**
 * Compile the loaded soul into a system-prompt section. Injected AFTER
 * project instructions (see ContextBuilder).
 */
export function compileSystemSection(soul: SoulFile): string {
  const lines = [
    `<soul version="${soul.version}">`,
    "The following constitution governs this session. Axioms are absolute and never traded off;",
    "values below are ranked in strict precedence order. A disposition may never soften an axiom.",
    ...(soul.purpose ? [`Purpose: ${soul.purpose}`] : []),
    "## Axioms",
    ...soul.axioms.map((axiom) => `- [${axiom.id}] ${axiom.statement}`),
    "## Values (ranked)",
    ...soul.values.map((value, index) => `${index + 1}. ${value}`),
  ];
  if (soul.dispositions) lines.push("## Dispositions", soul.dispositions);
  lines.push(
    "## Formation",
    `You may never edit ${SOUL_FILENAME}, ${SOUL_SUITE_FILENAME}, ${SOUL_BASELINE_FILENAME}. ` +
      "If the user asks you to change the soul, explain that axioms change only by human edit " +
      "plus a full eval re-run, and ask them to make the change in their own editor.",
    "</soul>",
  );
  return lines.join("\n");
}

// -----------------------------------------------
// Loading
// -----------------------------------------------

/**
 * Load a soul from disk: parse SOUL.md, require the paired suite, run the
 * entry lint. Throws SoulLoadError with named messages on any failure; a
 * caller that wants "degrade to no soul" catches it.
 */
export async function loadSoul(files: SoulFileReader, filepath: string): Promise<SoulFile> {
  let content: string;
  try {
    content = await files.read(filepath);
  } catch (cause) {
    throw new SoulLoadError([`soul: cannot read ${filepath}: ${cause}`]);
  }
  const soul = parseSoul(content, filepath);
  if (!(await files.exists(soul.suitePath))) {
    throw new SoulLoadError([
      `soul: eval suite not found at ${soul.suitePath}; every soul needs a paired probe suite`,
    ]);
  }
  let suiteText: string;
  try {
    suiteText = await files.read(soul.suitePath);
  } catch (cause) {
    throw new SoulLoadError([`soul: cannot read suite ${soul.suitePath}: ${cause}`]);
  }
  let suite: SoulEvalSuite;
  try {
    suite = parseSuite(suiteText);
  } catch (cause) {
    throw new SoulLoadError([`soul: cannot parse suite ${soul.suitePath}: ${cause}`]);
  }
  const errors = entryLint(soul, suite);
  if (errors.length > 0) throw new SoulLoadError(errors);
  return soul;
}
