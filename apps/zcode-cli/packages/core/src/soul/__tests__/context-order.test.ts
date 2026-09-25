import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createContextBuilder } from "../../context/builder.js";
import { buildSoulSection } from "../../context/sections/soul.js";
import type { ContextBuilderConfig } from "../../context/types.js";
import type { ResolvedUserInstructions } from "@zcode/contracts";
import { sampleSoul } from "./fixtures.js";

function userInstructions(): ResolvedUserInstructions {
  return {
    filePath: "/proj/AGENTS.md",
    fileName: "AGENTS.md",
    content: "# Project instructions\nAlways run the tests.",
    bytesRead: 42,
    sizeBytes: 42,
    truncated: false,
  };
}

function config(soul: ContextBuilderConfig["soul"]): ContextBuilderConfig {
  return {
    workingDirectory: "/proj",
    userInstructions: userInstructions(),
    soul,
    envInfo: {
      platform: "linux",
      shell: "bash",
      isGitRepository: false,
    } as ContextBuilderConfig["envInfo"],
  };
}

describe("soul context section", () => {
  it("builds a system-targeted section from a loaded soul", () => {
    const section = buildSoulSection(sampleSoul());
    assert.ok(section);
    assert.equal(section.source, "soul");
    assert.equal(section.injectionTarget, "system");
    assert.match(section.content, /<soul/);
    assert.match(section.content, /AX-01/);
  });

  it("returns null when no soul is loaded", () => {
    assert.equal(buildSoulSection(undefined), null);
  });

  it("injects the soul into system messages while project instructions stay meta_user", () => {
    const result = createContextBuilder(config(sampleSoul())).build();
    const soulSection = result.sections.find((section) => section.source === "soul");
    assert.ok(soulSection);
    assert.equal(soulSection.injectionTarget, "system");

    const systemText = result.systemMessages.map((message) => String(message.content)).join("\n");
    assert.match(systemText, /<soul/);
    assert.match(systemText, /Never fabricate file contents/);
    // Within the stable system body the soul follows the identity sections.
    assert.ok(
      systemText.indexOf("Agent Identity") < systemText.indexOf("<soul"),
      "soul compiles after identity in the system body",
    );

    // Project instructions stay in the meta-user body, not in system messages.
    // ZCode assembles system messages before the meta-user body, so the
    // constitution (system) outranks project instructions (meta_user).
    const metaText = result.metaUserAttachments.map((attachment) => attachment.content).join("\n");
    assert.match(metaText, /Always run the tests/);
    assert.doesNotMatch(systemText, /Always run the tests/);
  });

  it("omits the soul entirely when none is loaded", () => {
    const result = createContextBuilder(config(undefined)).build();
    assert.ok(!result.sections.some((section) => section.source === "soul"));
    const systemText = result.systemMessages.map((message) => String(message.content)).join("\n");
    assert.doesNotMatch(systemText, /<soul/);
  });
});
