# Spec: Soul constitution layer (`zcode soul`)

Status: proposed for `apps/zcode-cli` (core + cli packages).

## Product rule

A project's `SOUL.md` is a *testable* values file: axioms with paired probes,
ranked values, dispositions. It is loaded once at session start and compiled
into the system prompt as a system-role constitution (outranking user-role
project instructions; see State owner for the ordering note). It
is not identity prose and not plain memory:

- Every axiom in `SOUL.md` §1 must have at least one `must_refuse` and one
  `must_not_refuse` probe in the co-located eval suite, checked **at load**.
  A soul with an orphan axiom is rejected and never injected; the error names
  the axiom.
- An agent may **never** edit `SOUL.md`, `SOUL.suite.yaml`, or
  `SOUL.baseline.json`. This is enforced in code inside the permission gate,
  before any configurable permission rule runs, so no rule can override it.
  Human edits in their own editor never pass through this path and still work.
- Probes marked `human: true` are reported as `pending` and block the release
  gate; they are never auto-passed.
- Scoring is fully deterministic (marker/pattern matching, declared-winner
  matching). No model grading.

## State owner

- `AgentRuntimeInternal.soul?: LoadedSoul` — loaded once in
  `ensureContextInitialized`, passed into `ContextBuilderConfig.soul`.
- `ContextBuilder` owns prompt assembly: a `soul` section
  (`injectionTarget: "system"`, `cacheHint: "stable"`) is pushed right after
  the request-user-context section in build order. Ordering note: ZCode
  assembles `system` sections into system messages and `meta_user` sections
  (project instructions live there) into a separate meta-user body, with
  system messages preceding it. The source PR's "after project instructions"
  referred to OpenCode's flat system prompt; the faithful port here is that
  the constitution compiles into the system role — outranking user-role
  content — and sits after identity/cli-prefix inside the stable system body.
- `PermissionService.checkPermission` owns the formation guard: first check,
  before plan-mode transition and before project/user rules.

## Interfaces

- `packages/core/src/soul/soul.ts`
  - `SOUL_FILENAME = "SOUL.md"`, `SOUL_SUITE_FILENAME = "SOUL.suite.yaml"`,
    `SOUL_BASELINE_FILENAME = "SOUL.baseline.json"`
  - `parseSoul(content, filepath): SoulFile` — frontmatter + §§0..3
    (purpose / axioms table / values table / dispositions).
  - `resolveSoulFilePath(startDir, opts): string | undefined` — find-up from
    `startDir`, then global fallback
    `<ZCODE_DATA_BASE_DIR|~>/.zcode/v2/SOUL.md` (existing convention, existing
    env var; see `cli/src/provider-runtime-env.ts`).
  - `loadSoul(files, filepath): Promise<SoulFile>` — reads soul + suite,
    runs `entryLint`, throws `SoulLoadError` with named messages.
  - `entryLint(soul, suite): string[]` — orphan-axiom check + suite lint.
  - `compileSystemSection(soul): string` — `<soul>` system section text.
- `packages/core/src/soul/guard.ts`
  - `isProtectedWriteTarget(toolName, input): string | undefined` — true for
    `Edit`/`Write` tool calls whose `filePath`/`file_path` basename is a soul
    artifact (glob form `**/SOUL.md` matches; bare `*.md` does not), and for
    `ApplyPatch` calls whose `patch_text` mentions a soul artifact name
    (fail-closed: no patch parser exists at this layer, and the repo's own
    permission code notes ApplyPatch has no single path to judge).
  - `denialMessage(target): string`.
- `packages/core/src/soul/eval*.ts` — deterministic scorer:
  `parseSuite`, `parseResponses`, `probesOf`, `lintSuite`, `gradeProbe`,
  `computeMetrics`, `evaluateGates`, `renderReport`, `scoreAll`.
- `packages/cli/src/soul-command.ts` — `runSoulCommand(ctx, options, deps, args)`
  - `zcode soul validate` — lint the current project's soul. Exit 0 valid,
    1 lint failures, 2 missing/unparseable input.
  - `zcode soul eval --suite S --responses R [--baseline B] [--report out.md]` —
    deterministic scoring; exit 1 when blocked, 2 on bad input.
  - Entry-layer module: owns node fs access; core stays fs-free (ports only).

## Acceptance scenarios

1. Project with valid `SOUL.md` + suite: session system prompt contains the
   compiled `<soul>` section as a system message (see ordering note above).
2. Axiom without both probe kinds: session start fails with the axiom id in
   the error and a pointer to `zcode soul validate`; nothing soul-related
   reaches the model.
3. Agent calls `Edit` on `SOUL.md`: permission decision is `deny` with
   ruleId `rule.soul.formationGuard`, regardless of permission mode/rules.
4. `zcode soul validate` on the fixture: exit 0 and prints axiom count.
5. `zcode soul eval` on fixture suite + responses: markdown report, exit 0;
   a response violating an axiom flips a gate to FAIL and exits 1.
6. `zcode soul eval` with a `human: true` probe: reported `pending`, gate
   `human review pending` is PENDING and blocking, exit 1.

## Error behavior

- Soul load/reject errors surface as `SoulLoadError.messages` (string list).
  `loadSoulForSession` wraps them in a descriptive `Error` naming the path
  and pointing at `zcode soul validate`; session start fails loudly. A bad
  soul degrades to "no soul" only when no `SOUL.md` exists at all — never to
  an untested soul.
- CLI `validate`/`eval` map errors to exit codes per the CLI error rules
  (entry layer owns user-facing formatting and exit codes).

## Cross-platform

- All paths via `node:path`; no shell strings; recorder-free (no subprocess in
  the soul path). Suite parsing uses the existing `yaml` dependency.

## Test coverage

- `packages/core/test/soul/soul.test.ts` — parse, entry lint (orphan axiom
  named), system section compile, guard (protected/glob/bare-glob/tool input
  extraction), resolveSoulFilePath find-up + fallback.
- `packages/core/test/soul/eval.test.ts` — scorer parity: clean run SHIP,
  determinism, false refusal, trap miss, human probe pending+blocking,
  duplicate ids, violation flag.
- Failure paths: missing soul file, missing suite, unparseable suite,
  orphan axiom, empty axioms.
