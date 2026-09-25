import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadSoulForSession } from "../../runtime/methods/soul-context.js";
import { SAMPLE_SOUL_MD } from "./fixtures.js";

const VALID_SUITE_YAML = `suite: test
soul_version: "0.1.0"
axioms: [AX-01, AX-02]
values: [Care, Speed]
section_a:
  - { id: AX-01-refuse, kind: must_refuse, axiom: AX-01, prompt: x }
  - { id: AX-01-ok, kind: must_not_refuse, axiom: AX-01, prompt: x }
  - { id: AX-02-refuse, kind: must_refuse, axiom: AX-02, prompt: x }
  - { id: AX-02-ok, kind: must_not_refuse, axiom: AX-02, prompt: x }
section_b:
  - { id: p1, kind: dilemma, pair: [Care, Speed], prompt: x, prompt_a: a, prompt_b: b }
`;

// Same suite with the AX-02 probes removed: AX-02 becomes an orphan axiom.
const ORPHAN_SUITE_YAML = `suite: test
soul_version: "0.1.0"
axioms: [AX-01, AX-02]
values: [Care, Speed]
section_a:
  - { id: AX-01-refuse, kind: must_refuse, axiom: AX-01, prompt: x }
  - { id: AX-01-ok, kind: must_not_refuse, axiom: AX-01, prompt: x }
section_b:
  - { id: p1, kind: dilemma, pair: [Care, Speed], prompt: x, prompt_a: a, prompt_b: b }
`;

/** Minimal fake runtime: only what loadSoulForSession touches. */
function fakeRuntime(files: Record<string, string>) {
  return {
    workingDirectory: "/proj",
    config: {},
    logger: { debug: () => {}, info: () => {}, warn: () => {} },
    fileSystemPort: {
      stat: async ({ path }: { path: string }) => {
        if (!(path in files)) throw new Error("ENOENT");
        return { kind: "file" };
      },
      readTextFile: async ({ path }: { path: string }) => ({ content: files[path] }),
    },
  };
}

describe("loadSoulForSession", () => {
  it("returns undefined when no SOUL.md exists", async () => {
    const soul = await loadSoulForSession.call(fakeRuntime({}) as never, { traceId: "t" } as never);
    assert.equal(soul, undefined);
  });

  it("loads a valid soul", async () => {
    const soul = await loadSoulForSession.call(
      fakeRuntime({
        "/proj/SOUL.md": SAMPLE_SOUL_MD,
        "/proj/SOUL.suite.yaml": VALID_SUITE_YAML,
      }) as never,
      { traceId: "t" } as never,
    );
    assert.equal(soul?.version, "0.1.0");
    assert.equal(soul?.axioms.length, 2);
  });

  it("fails session start loudly when the entry lint rejects the soul", async () => {
    const runtime = fakeRuntime({
      "/proj/SOUL.md": SAMPLE_SOUL_MD,
      "/proj/SOUL.suite.yaml": ORPHAN_SUITE_YAML,
    });
    await assert.rejects(
      () => loadSoulForSession.call(runtime as never, { traceId: "t" } as never),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.match(error.message, /failed the entry lint/);
        assert.match(error.message, /AX-02/);
        assert.match(error.message, /zcode soul validate/);
        return true;
      },
    );
  });
});
