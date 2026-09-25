import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PermissionService, type PermissionContext } from "../../permission/index.js";
import { SOUL_FORMATION_GUARD_RULE_ID } from "../guard.js";

function editContext(filePath: string): PermissionContext {
  return {
    toolName: "Edit",
    input: { filePath },
    riskLevel: "high",
    mode: "build",
  };
}

describe("PermissionService soul formation guard", () => {
  it("denies Edit on SOUL.md with the soul rule id", () => {
    const service = new PermissionService();
    const result = service.checkPermission(editContext("/proj/SOUL.md"));
    assert.equal(result.decision, "deny");
    assert.equal(result.ruleId, SOUL_FORMATION_GUARD_RULE_ID);
    assert.match(result.reason ?? "", /SOUL\.md/);
  });

  it("denies even when a session always-allow rule covers Edit", () => {
    const service = new PermissionService();
    service.grantSessionPermission([
      { type: "addRules", behavior: "allow", rules: [{ toolName: "Edit" }] },
    ]);
    const result = service.checkPermission(editContext("/proj/SOUL.md"));
    assert.equal(result.decision, "deny");
    assert.equal(result.ruleId, SOUL_FORMATION_GUARD_RULE_ID);
  });

  it("denies Write on the eval suite and baseline too", () => {
    const service = new PermissionService();
    for (const target of ["/proj/SOUL.suite.yaml", "/proj/SOUL.baseline.json"]) {
      const result = service.checkPermission({
        toolName: "Write",
        input: { file_path: target },
        riskLevel: "high",
        mode: "build",
      });
      assert.equal(result.decision, "deny");
      assert.equal(result.ruleId, SOUL_FORMATION_GUARD_RULE_ID);
    }
  });

  it("denies ApplyPatch whose patch_text names a soul artifact", () => {
    const service = new PermissionService();
    const result = service.checkPermission({
      toolName: "ApplyPatch",
      input: { patch_text: "*** Update File: /proj/SOUL.md\n@@" },
      riskLevel: "high",
      mode: "build",
    });
    assert.equal(result.decision, "deny");
    assert.equal(result.ruleId, SOUL_FORMATION_GUARD_RULE_ID);
  });

  it("does not deny Edit on ordinary files", () => {
    const service = new PermissionService();
    const result = service.checkPermission(editContext("/proj/src/index.ts"));
    assert.notEqual(result.ruleId, SOUL_FORMATION_GUARD_RULE_ID);
  });
});
