import { describe, expect, it } from "vitest";
import { SessionSchema } from "./zod-schema.session.js";

describe("session.groupIsolation schema", () => {
  it("accepts session config without groupIsolation (backward compat)", () => {
    const result = SessionSchema.parse({
      scope: "per-sender",
    });
    expect(result).toBeDefined();
    expect(result?.groupIsolation).toBeUndefined();
  });

  it("accepts groupIsolation with mode: shared", () => {
    const result = SessionSchema.parse({
      groupIsolation: {
        mode: "shared",
      },
    });
    expect(result?.groupIsolation?.mode).toBe("shared");
  });

  it("accepts groupIsolation with mode: isolated", () => {
    const result = SessionSchema.parse({
      groupIsolation: {
        mode: "isolated",
      },
    });
    expect(result?.groupIsolation?.mode).toBe("isolated");
  });

  it("rejects invalid mode", () => {
    const result = SessionSchema.safeParse({
      groupIsolation: {
        mode: "banana",
      },
    });
    expect(result.success).toBe(false);
  });

  it("accepts full groupIsolation config", () => {
    const result = SessionSchema.parse({
      groupIsolation: {
        mode: "isolated",
        groups: {
          "120363404078961545@g.us": {
            label: "preseed-client",
            workspace: "~/custom/path",
          },
          "120363423561902447@g.us": {
            label: "thakkar-rasania-vault",
          },
        },
        sharedFiles: ["SOUL.md", "USER.md", "TOOLS.md"],
        memoryScope: "group-only",
      },
    });
    expect(result?.groupIsolation?.mode).toBe("isolated");
    expect(result?.groupIsolation?.groups?.["120363404078961545@g.us"]?.label).toBe(
      "preseed-client",
    );
    expect(result?.groupIsolation?.sharedFiles).toEqual(["SOUL.md", "USER.md", "TOOLS.md"]);
    expect(result?.groupIsolation?.memoryScope).toBe("group-only");
  });

  it("accepts group config with only label", () => {
    const result = SessionSchema.parse({
      groupIsolation: {
        mode: "isolated",
        groups: {
          "919820645414-1461388512@g.us": {
            label: "nyra-krishay",
          },
        },
      },
    });
    expect(result?.groupIsolation?.groups?.["919820645414-1461388512@g.us"]?.label).toBe(
      "nyra-krishay",
    );
  });

  it("accepts empty groups object", () => {
    const result = SessionSchema.parse({
      groupIsolation: {
        mode: "isolated",
        groups: {},
      },
    });
    expect(result?.groupIsolation?.groups).toEqual({});
  });

  it("rejects invalid memoryScope", () => {
    const result = SessionSchema.safeParse({
      groupIsolation: {
        mode: "isolated",
        memoryScope: "invalid-scope",
      },
    });
    expect(result.success).toBe(false);
  });

  it("accepts all valid memoryScope values", () => {
    for (const scope of ["group-only", "group+main", "all"]) {
      const result = SessionSchema.parse({
        groupIsolation: {
          mode: "isolated",
          memoryScope: scope,
        },
      });
      expect(result?.groupIsolation?.memoryScope).toBe(scope);
    }
  });

  it("accepts groupIsolation with only mode (minimal config)", () => {
    const result = SessionSchema.parse({
      groupIsolation: {
        mode: "isolated",
      },
    });
    expect(result?.groupIsolation?.groups).toBeUndefined();
    expect(result?.groupIsolation?.sharedFiles).toBeUndefined();
    expect(result?.groupIsolation?.memoryScope).toBeUndefined();
  });

  it("rejects unknown fields in groupIsolation (strict)", () => {
    const result = SessionSchema.safeParse({
      groupIsolation: {
        mode: "isolated",
        unknownField: true,
      },
    });
    expect(result.success).toBe(false);
  });

  it("rejects unknown fields in group entry (strict)", () => {
    const result = SessionSchema.safeParse({
      groupIsolation: {
        mode: "isolated",
        groups: {
          "some-group@g.us": {
            label: "test",
            unknownField: true,
          },
        },
      },
    });
    expect(result.success).toBe(false);
  });

  it("defaults mode when groupIsolation is omitted", () => {
    const result = SessionSchema.parse({});
    expect(result?.groupIsolation).toBeUndefined();
  });

  it("accepts sharedFiles as empty array", () => {
    const result = SessionSchema.parse({
      groupIsolation: {
        mode: "shared",
        sharedFiles: [],
      },
    });
    expect(result?.groupIsolation?.sharedFiles).toEqual([]);
  });
});
