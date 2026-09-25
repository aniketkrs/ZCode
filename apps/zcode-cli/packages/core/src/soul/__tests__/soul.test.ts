import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { entryLint, loadSoul, parseSoul, resolveSoulFilePath, SoulLoadError } from "../soul.js";
import { memoryReader, SAMPLE_SOUL_MD, sampleSoul, sampleSuite } from "./fixtures.js";

describe("parseSoul", () => {
  it("parses axioms, ranked values, dispositions and front matter", () => {
    const soul = parseSoul(SAMPLE_SOUL_MD, "/proj/SOUL.md");
    assert.equal(soul.version, "0.1.0");
    assert.equal(soul.agent, "test-agent");
    assert.equal(soul.axioms.length, 2);
    assert.equal(soul.axioms[0]?.id, "AX-01");
    assert.equal(soul.axioms[0]?.statement, "Never fabricate file contents.");
    assert.deepEqual(soul.values, ["Care", "Speed"]);
    assert.match(soul.dispositions, /Be direct/);
    assert.equal(soul.suitePath, "/proj/SOUL.suite.yaml");
    assert.match(soul.purpose, /test constitution/);
  });

  it("honours a custom eval_suite front-matter path", () => {
    const soul = parseSoul(
      `---\neval_suite: "./probes.yaml"\n---\n${SAMPLE_SOUL_MD}`,
      "/proj/SOUL.md",
    );
    assert.equal(soul.suitePath, "/proj/probes.yaml");
  });

  it("degrades on malformed input instead of throwing", () => {
    const soul = parseSoul("no front matter, no sections", "/proj/SOUL.md");
    assert.deepEqual(soul.axioms, []);
    assert.deepEqual(soul.values, []);
  });
});

describe("resolveSoulFilePath", () => {
  it("finds SOUL.md walking up from the start dir", async () => {
    const found = await resolveSoulFilePath("/a/b/c", {
      exists: async (path) => path === "/a/SOUL.md",
    });
    assert.equal(found, "/a/SOUL.md");
  });

  it("falls back to the global dir when no project file exists", async () => {
    const found = await resolveSoulFilePath("/a/b", {
      globalConfigDir: "/home/user/.zcode/v2",
      exists: async (path) => path === "/home/user/.zcode/v2/SOUL.md",
    });
    assert.equal(found, "/home/user/.zcode/v2/SOUL.md");
  });

  it("returns undefined when nothing exists", async () => {
    const found = await resolveSoulFilePath("/a/b", { exists: async () => false });
    assert.equal(found, undefined);
  });
});

describe("entryLint", () => {
  it("passes a fully paired soul", () => {
    assert.deepEqual(entryLint(sampleSoul(), sampleSuite()), []);
  });

  it("rejects axioms without paired probes", () => {
    const errors = entryLint(sampleSoul(), sampleSuite({ section_a: [] }));
    assert.ok(errors.some((error) => error.includes("AX-01") && error.includes("must_refuse")));
    assert.ok(errors.some((error) => error.includes("AX-02") && error.includes("must_not_refuse")));
  });

  it("rejects a soul with no axioms", () => {
    const errors = entryLint(sampleSoul({ axioms: [] }), sampleSuite());
    assert.ok(errors.some((error) => error.includes("no axioms")));
  });

  it("rejects probes referencing unknown axioms", () => {
    const suite = sampleSuite();
    suite.section_a = [
      ...(suite.section_a ?? []),
      { id: "AX-99-refuse", kind: "must_refuse", axiom: "AX-99", prompt: "x" },
    ];
    const errors = entryLint(sampleSoul(), suite);
    assert.ok(errors.some((error) => error.includes("AX-99")));
  });
});

describe("loadSoul", () => {
  const suiteYaml = `suite: test
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

  it("loads a valid soul with its suite", async () => {
    const reader = memoryReader({
      "/proj/SOUL.md": SAMPLE_SOUL_MD,
      "/proj/SOUL.suite.yaml": suiteYaml,
    });
    const soul = await loadSoul(reader, "/proj/SOUL.md");
    assert.equal(soul.axioms.length, 2);
  });

  it("throws SoulLoadError when the suite is missing", async () => {
    const reader = memoryReader({ "/proj/SOUL.md": SAMPLE_SOUL_MD });
    await assert.rejects(() => loadSoul(reader, "/proj/SOUL.md"), SoulLoadError);
  });

  it("throws SoulLoadError when the entry lint fails", async () => {
    const reader = memoryReader({
      "/proj/SOUL.md": SAMPLE_SOUL_MD,
      "/proj/SOUL.suite.yaml": "suite: test\naxioms: [AX-01, AX-02]\n",
    });
    await assert.rejects(() => loadSoul(reader, "/proj/SOUL.md"), SoulLoadError);
  });
});
