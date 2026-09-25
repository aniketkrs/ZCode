import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  SOUL_FORMATION_GUARD_RULE_ID,
  denialMessage,
  extractWriteTargetPath,
  isProtectedEditTarget,
  isProtectedWriteTarget,
  isSoulFilename,
} from "../guard.js";

describe("isSoulFilename", () => {
  it("matches the three protected artifacts only", () => {
    assert.equal(isSoulFilename("SOUL.md"), true);
    assert.equal(isSoulFilename("SOUL.suite.yaml"), true);
    assert.equal(isSoulFilename("SOUL.baseline.json"), true);
    assert.equal(isSoulFilename("SOUL.md.bak"), false);
    assert.equal(isSoulFilename("soul.md"), false);
    assert.equal(isSoulFilename("AGENTS.md"), false);
  });
});

describe("isProtectedEditTarget", () => {
  it("matches soul files at any depth", () => {
    assert.equal(isProtectedEditTarget("SOUL.md"), true);
    assert.equal(isProtectedEditTarget("docs/SOUL.md"), true);
    assert.equal(isProtectedEditTarget("SOUL.suite.yaml"), true);
    assert.equal(isProtectedEditTarget("SOUL.baseline.json"), true);
  });

  it("prefers the absolute path when metadata provides one", () => {
    assert.equal(isProtectedEditTarget("notes.md", "/proj/SOUL.md"), true);
    assert.equal(isProtectedEditTarget("SOUL.md", "/proj/notes.md"), false);
  });

  it("matches soul globs but not bare wildcards", () => {
    assert.equal(isProtectedEditTarget("**/SOUL.md"), true);
    assert.equal(isProtectedEditTarget("*.md"), false);
    assert.equal(isProtectedEditTarget("**/*.md"), false);
  });

  it("does not match ordinary files", () => {
    assert.equal(isProtectedEditTarget("src/index.ts"), false);
    assert.equal(isProtectedEditTarget("SOUL.mdx"), false);
  });
});

describe("extractWriteTargetPath", () => {
  it("reads the canonical contract field names", () => {
    assert.equal(extractWriteTargetPath({ file_path: "a.ts" }), "a.ts");
    assert.equal(extractWriteTargetPath({ filePath: "b.ts" }), "b.ts");
    assert.equal(extractWriteTargetPath({ path: "c.ts" }), "c.ts");
    assert.equal(extractWriteTargetPath({}), undefined);
    assert.equal(extractWriteTargetPath(null), undefined);
    assert.equal(extractWriteTargetPath("SOUL.md"), undefined);
  });
});

describe("isProtectedWriteTarget", () => {
  it("fires for Edit/Write on soul artifacts", () => {
    assert.equal(isProtectedWriteTarget("Edit", { file_path: "SOUL.md" }), "SOUL.md");
    assert.equal(
      isProtectedWriteTarget("Write", { filePath: "docs/SOUL.suite.yaml" }),
      "docs/SOUL.suite.yaml",
    );
  });

  it("ignores reads and unrelated tools", () => {
    assert.equal(isProtectedWriteTarget("Read", { file_path: "SOUL.md" }), undefined);
    assert.equal(isProtectedWriteTarget("Bash", { file_path: "SOUL.md" }), undefined);
  });

  it("ignores writes to ordinary files", () => {
    assert.equal(isProtectedWriteTarget("Edit", { file_path: "src/app.ts" }), undefined);
  });

  it("ignores writes without a target path", () => {
    assert.equal(isProtectedWriteTarget("Edit", {}), undefined);
  });

  it("fires fail-closed for ApplyPatch naming a soul artifact in patch_text", () => {
    const hit = isProtectedWriteTarget("ApplyPatch", {
      patch_text: "*** Begin Patch ***\n*** Update File: SOUL.md\n@@\n+new axiom\n",
    });
    assert.match(hit ?? "", /SOUL\.md/);
    assert.equal(
      isProtectedWriteTarget("ApplyPatch", { patch_text: "update README.md only" }),
      undefined,
    );
    assert.equal(isProtectedWriteTarget("ApplyPatch", {}), undefined);
  });
});

describe("denialMessage", () => {
  it("names the target and the human-edit path", () => {
    const message = denialMessage("SOUL.md");
    assert.match(message, /SOUL\.md/);
    assert.match(message, /human edit/);
    assert.equal(SOUL_FORMATION_GUARD_RULE_ID, "rule.soul.formationGuard");
  });
});
