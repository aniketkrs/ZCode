// ============================================================
// soul command — validate and eval a SOUL.md constitution
// ============================================================
//
// Entry-layer CLI for the testable soul constitution layer:
//
//   zcode soul validate [--soul <path>]     entry-lint SOUL.md + paired suite
//   zcode soul eval --responses <jsonl>     score responses, gate the release
//     [--suite <path>] [--baseline <path>] [--soul <path>]
//
// validate exits 0 when the soul loads clean, 1 when the entry lint rejects
// it. eval exits 0 (SHIP), 1 (BLOCKED by a gate), or 2 (usage/IO error).
// All filesystem I/O lives here, in the entry layer; the soul core stays
// pure behind the SoulFileReader port.

import { readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import {
  SoulLoadError,
  defaultGlobalSoulDir,
  loadSoul,
  parseResponses,
  parseSuite,
  resolveSoulFilePath,
  scoreAll,
  type SoulFile,
  type SoulFileReader,
  type SoulBaseline,
  type SoulEvalSuite,
} from "@zcode/core";
import type { RunContext, GlobalOptions } from "@zcode/shared-types";
import type { CliEnv } from "./env.js";

const SOUL_COMMAND_USAGE = [
  "Usage: zcode soul <validate|eval> [options]",
  "",
  "  validate [--soul <path>]",
  "      Entry-lint SOUL.md and its paired probe suite. Exits 0 when the soul",
  "      loads clean, 1 when it is rejected.",
  "",
  "  eval --responses <jsonl> [--suite <path>] [--baseline <path>] [--soul <path>]",
  "      Score probe responses deterministically and gate the release.",
  "      Exits 0 (SHIP), 1 (BLOCKED), 2 (usage or IO error).",
].join("\n");

const ZCODE_DATA_BASE_DIR_ENV = "ZCODE_DATA_BASE_DIR";

interface SoulCommandDeps {
  cwd?: () => string;
  env?: CliEnv;
}

function nodeSoulFileReader(): SoulFileReader {
  return {
    exists: async (path) => {
      try {
        return (await stat(path)).isFile();
      } catch {
        return false;
      }
    },
    read: (path) => readFile(path, "utf8"),
  };
}

function dataBaseDir(env: CliEnv): string {
  return env[ZCODE_DATA_BASE_DIR_ENV]?.trim() || homedir();
}

async function resolveSoulTarget(
  deps: SoulCommandDeps,
  explicitPath: string | undefined,
): Promise<{ path: string; reader: SoulFileReader } | { error: string }> {
  const reader = nodeSoulFileReader();
  if (explicitPath) {
    if (!(await reader.exists(explicitPath))) {
      return { error: `soul file not found: ${explicitPath}` };
    }
    return { path: explicitPath, reader };
  }
  const env = deps.env ?? process.env;
  const workingDirectory = (deps.cwd ?? process.cwd)();
  const found = await resolveSoulFilePath(workingDirectory, {
    globalConfigDir: defaultGlobalSoulDir(dataBaseDir(env)),
    exists: reader.exists,
  });
  if (!found) return { error: "no SOUL.md found (project find-up and global fallback)" };
  return { path: found, reader };
}

async function loadSoulOrReport(
  ctx: RunContext,
  target: { path: string; reader: SoulFileReader },
): Promise<SoulFile | undefined> {
  try {
    return await loadSoul(target.reader, target.path);
  } catch (error) {
    const messages = error instanceof SoulLoadError ? error.messages : [String(error)];
    ctx.stderr.write(`soul rejected:\n${messages.map((message) => `  ${message}`).join("\n")}\n`);
    return undefined;
  }
}

function flagValue(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index === -1 || index + 1 >= args.length) return undefined;
  return args[index + 1];
}

function hasFlag(args: string[], name: string): boolean {
  return args.includes(name);
}

export const runSoulCommand = async (
  ctx: RunContext,
  _options: GlobalOptions,
  deps: SoulCommandDeps,
  args: string[],
): Promise<number> => {
  const subcommand = args[0];
  if (subcommand === "validate") {
    return await runSoulValidate(ctx, deps, args.slice(1));
  }
  if (subcommand === "eval") {
    return await runSoulEval(ctx, deps, args.slice(1));
  }
  ctx.stderr.write(`Unknown soul command: ${subcommand ?? ""}\n${SOUL_COMMAND_USAGE}\n`);
  return 2;
};

async function runSoulValidate(
  ctx: RunContext,
  deps: SoulCommandDeps,
  args: string[],
): Promise<number> {
  const soulPath = flagValue(args, "--soul");
  if (hasFlag(args, "--help") || hasFlag(args, "-h")) {
    ctx.stdout.write(`${SOUL_COMMAND_USAGE}\n`);
    return 0;
  }
  const target = await resolveSoulTarget(deps, soulPath);
  if ("error" in target) {
    ctx.stderr.write(`${target.error}\n`);
    return 1;
  }
  const soul = await loadSoulOrReport(ctx, target);
  if (!soul) return 1;
  ctx.stdout.write(
    `Soul OK: ${soul.path}\n  ${soul.axioms.length} axioms, ${soul.values.length} ranked values, soul v${soul.version}\n  suite: ${soul.suitePath}\n`,
  );
  return 0;
}

async function runSoulEval(
  ctx: RunContext,
  deps: SoulCommandDeps,
  args: string[],
): Promise<number> {
  if (hasFlag(args, "--help") || hasFlag(args, "-h")) {
    ctx.stdout.write(`${SOUL_COMMAND_USAGE}\n`);
    return 0;
  }
  const responsesPath = flagValue(args, "--responses");
  if (!responsesPath) {
    ctx.stderr.write(`Missing required flag: --responses <jsonl>\n${SOUL_COMMAND_USAGE}\n`);
    return 2;
  }
  const reader = nodeSoulFileReader();
  const target = await resolveSoulTarget(deps, flagValue(args, "--soul"));
  if ("error" in target) {
    ctx.stderr.write(`${target.error}\n`);
    return 2;
  }
  const soul = await loadSoulOrReport(ctx, target);
  if (!soul) return 2;

  const suitePath = flagValue(args, "--suite") ?? soul.suitePath;
  let suite: SoulEvalSuite;
  try {
    suite = parseSuite(await reader.read(suitePath));
  } catch (error) {
    ctx.stderr.write(`cannot parse suite ${suitePath}: ${error}\n`);
    return 2;
  }
  let responses;
  try {
    responses = parseResponses(await reader.read(responsesPath));
  } catch (error) {
    ctx.stderr.write(`cannot parse responses ${responsesPath}: ${error}\n`);
    return 2;
  }
  let baseline: SoulBaseline | undefined;
  const baselinePath =
    flagValue(args, "--baseline") ?? join(dirname(suitePath), "SOUL.baseline.json");
  if (await reader.exists(baselinePath)) {
    try {
      baseline = JSON.parse(await reader.read(baselinePath)) as SoulBaseline;
    } catch (error) {
      ctx.stderr.write(`cannot parse baseline ${baselinePath}: ${error}\n`);
      return 2;
    }
  }

  const { report, gates } = scoreAll(suite, responses, baseline);
  const blocking = gates.filter((gate) => gate.blocking);
  ctx.stdout.write(`${report}\n`);
  ctx.stdout.write(
    `\nVerdict: ${blocking.length === 0 ? "SHIP" : "BLOCKED"}` +
      (blocking.length > 0 ? ` (${blocking.map((gate) => gate.gate).join(", ")})` : "") +
      "\n",
  );
  return blocking.length === 0 ? 0 : 1;
}
