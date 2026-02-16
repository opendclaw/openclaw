import { describe, expect, it } from "vitest";
import type { GroupAccessControl } from "../../config/types.base.js";
import type { SkillEntry } from "./types.js";
import { filterWorkspaceSkillEntries } from "./workspace.js";

function makeSkillEntry(name: string): SkillEntry {
  return {
    skill: {
      name,
      description: `${name} skill`,
      content: `Content of ${name}`,
      filePath: `/skills/${name}/skill.md`,
      baseDir: `/skills/${name}`,
    },
    frontmatter: {},
    metadata: {},
    invocation: { userInvocable: true, disableModelInvocation: false },
  };
}

describe("filterWorkspaceSkillEntries with groupAccessControl", () => {
  const entries = [
    makeSkillEntry("family-docs"),
    makeSkillEntry("coding"),
    makeSkillEntry("research"),
    makeSkillEntry("admin"),
  ];

  it("returns all entries when no groupAccessControl", () => {
    const result = filterWorkspaceSkillEntries(entries);
    expect(result.map((e) => e.skill.name)).toEqual(["family-docs", "coding", "research", "admin"]);
  });

  it("filters by allowedSkills", () => {
    const ac: GroupAccessControl = { allowedSkills: ["family-docs"] };
    const result = filterWorkspaceSkillEntries(entries, undefined, ac);
    expect(result.map((e) => e.skill.name)).toEqual(["family-docs"]);
  });

  it("filters by deniedSkills", () => {
    const ac: GroupAccessControl = { deniedSkills: ["admin", "coding"] };
    const result = filterWorkspaceSkillEntries(entries, undefined, ac);
    expect(result.map((e) => e.skill.name)).toEqual(["family-docs", "research"]);
  });

  it("applies both allowedSkills and deniedSkills", () => {
    const ac: GroupAccessControl = {
      allowedSkills: ["family-docs", "coding"],
      deniedSkills: ["coding"],
    };
    const result = filterWorkspaceSkillEntries(entries, undefined, ac);
    expect(result.map((e) => e.skill.name)).toEqual(["family-docs"]);
  });

  it("returns empty when allowedSkills is empty array", () => {
    const ac: GroupAccessControl = { allowedSkills: [] };
    const result = filterWorkspaceSkillEntries(entries, undefined, ac);
    expect(result).toEqual([]);
  });

  it("returns all when groupAccessControl has no skill restrictions", () => {
    const ac: GroupAccessControl = { allowedTools: ["read"] };
    const result = filterWorkspaceSkillEntries(entries, undefined, ac);
    expect(result.map((e) => e.skill.name)).toEqual(["family-docs", "coding", "research", "admin"]);
  });

  it("vault group scenario: only family-docs skill", () => {
    const vaultAc: GroupAccessControl = {
      allowedSkills: ["family-docs"],
      allowedTools: ["read", "write", "edit"],
      deniedTools: ["browser", "canvas", "nodes"],
    };
    const result = filterWorkspaceSkillEntries(entries, undefined, vaultAc);
    expect(result).toHaveLength(1);
    expect(result[0].skill.name).toBe("family-docs");
  });
});
