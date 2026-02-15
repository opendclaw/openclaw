import path from "node:path";
import { describe, expect, it } from "vitest";
import type { SessionEntry } from "../config/sessions/types.js";
import { filterSessionFilesByScope, resolveEffectiveMemoryScope } from "./scoped-session-files.js";

// ---------------------------------------------------------------------------
// resolveEffectiveMemoryScope
// ---------------------------------------------------------------------------
describe("resolveEffectiveMemoryScope", () => {
  it('returns "all" when no sessionKey provided', () => {
    expect(resolveEffectiveMemoryScope({ memoryScope: "group-only" })).toBe("all");
  });

  it('returns "all" when no memoryScope configured', () => {
    expect(
      resolveEffectiveMemoryScope({
        sessionKey: "agent:luffy:whatsapp:group:123@g.us",
      }),
    ).toBe("all");
  });

  it('returns "all" for non-group session keys', () => {
    expect(
      resolveEffectiveMemoryScope({
        sessionKey: "agent:luffy:main",
        memoryScope: "group-only",
      }),
    ).toBe("all");
  });

  it('returns "all" for DM session keys', () => {
    expect(
      resolveEffectiveMemoryScope({
        sessionKey: "agent:luffy:whatsapp:direct:12345",
        memoryScope: "group-only",
      }),
    ).toBe("all");
  });

  it('returns "group-only" for group session with group-only scope', () => {
    expect(
      resolveEffectiveMemoryScope({
        sessionKey: "agent:luffy:whatsapp:group:123@g.us",
        memoryScope: "group-only",
      }),
    ).toBe("group-only");
  });

  it('returns "group+main" for group session with group+main scope', () => {
    expect(
      resolveEffectiveMemoryScope({
        sessionKey: "agent:luffy:whatsapp:group:123@g.us",
        memoryScope: "group+main",
      }),
    ).toBe("group+main");
  });

  it('returns "all" for group session with all scope', () => {
    expect(
      resolveEffectiveMemoryScope({
        sessionKey: "agent:luffy:whatsapp:group:123@g.us",
        memoryScope: "all",
      }),
    ).toBe("all");
  });
});

// ---------------------------------------------------------------------------
// filterSessionFilesByScope
// ---------------------------------------------------------------------------
describe("filterSessionFilesByScope", () => {
  // Mock session store with known entries
  const sessionsDir = "/home/user/.openclaw/agents/luffy/sessions";
  const mainFile = path.join(sessionsDir, "main-uuid.jsonl");
  const groupAFile = path.join(sessionsDir, "group-a-uuid.jsonl");
  const groupBFile = path.join(sessionsDir, "group-b-uuid.jsonl");
  const cronFile = path.join(sessionsDir, "cron-uuid.jsonl");

  const sessionStore: Record<string, SessionEntry> = {
    "agent:luffy:main": {
      sessionId: "main-uuid",
      sessionFile: "main-uuid.jsonl",
      updatedAt: Date.now(),
    },
    "agent:luffy:whatsapp:group:120363404078961545@g.us": {
      sessionId: "group-a-uuid",
      sessionFile: "group-a-uuid.jsonl",
      updatedAt: Date.now(),
    },
    "agent:luffy:whatsapp:group:919820645414-1461388512@g.us": {
      sessionId: "group-b-uuid",
      sessionFile: "group-b-uuid.jsonl",
      updatedAt: Date.now(),
    },
    "agent:luffy:cron:daily": {
      sessionId: "cron-uuid",
      sessionFile: "cron-uuid.jsonl",
      updatedAt: Date.now(),
    },
  };

  const allFiles = [mainFile, groupAFile, groupBFile, cronFile];

  it('"all" scope returns all files unchanged', () => {
    const result = filterSessionFilesByScope({
      allFiles,
      sessionKey: "agent:luffy:whatsapp:group:120363404078961545@g.us",
      agentId: "luffy",
      memoryScope: "all",
      sessionStore,
    });
    expect(result).toEqual(allFiles);
  });

  it('"group-only" scope returns only the current group transcript', () => {
    const result = filterSessionFilesByScope({
      allFiles,
      sessionKey: "agent:luffy:whatsapp:group:120363404078961545@g.us",
      agentId: "luffy",
      memoryScope: "group-only",
      sessionStore,
    });
    expect(result).toEqual([groupAFile]);
  });

  it('"group+main" scope returns current group + main DM transcript', () => {
    const result = filterSessionFilesByScope({
      allFiles,
      sessionKey: "agent:luffy:whatsapp:group:120363404078961545@g.us",
      agentId: "luffy",
      memoryScope: "group+main",
      sessionStore,
    });
    expect(result).toEqual([mainFile, groupAFile]);
  });

  it('"group-only" with different group returns that group only', () => {
    const result = filterSessionFilesByScope({
      allFiles,
      sessionKey: "agent:luffy:whatsapp:group:919820645414-1461388512@g.us",
      agentId: "luffy",
      memoryScope: "group-only",
      sessionStore,
    });
    expect(result).toEqual([groupBFile]);
  });

  it('"group+main" with different group returns that group + main', () => {
    const result = filterSessionFilesByScope({
      allFiles,
      sessionKey: "agent:luffy:whatsapp:group:919820645414-1461388512@g.us",
      agentId: "luffy",
      memoryScope: "group+main",
      sessionStore,
    });
    expect(result).toEqual([mainFile, groupBFile]);
  });

  it("returns all files when session store is empty (safety fallback)", () => {
    const result = filterSessionFilesByScope({
      allFiles,
      sessionKey: "agent:luffy:whatsapp:group:120363404078961545@g.us",
      agentId: "luffy",
      memoryScope: "group-only",
      sessionStore: {},
    });
    expect(result).toEqual(allFiles);
  });

  it("handles session key not present in store (no matching files)", () => {
    const result = filterSessionFilesByScope({
      allFiles,
      sessionKey: "agent:luffy:whatsapp:group:999999@g.us",
      agentId: "luffy",
      memoryScope: "group-only",
      sessionStore,
    });
    // The session key is in the allowed set, but no file maps to it
    // All other files map to different keys → filtered out
    expect(result).toEqual([]);
  });

  it("handles empty file list", () => {
    const result = filterSessionFilesByScope({
      allFiles: [],
      sessionKey: "agent:luffy:whatsapp:group:120363404078961545@g.us",
      agentId: "luffy",
      memoryScope: "group-only",
      sessionStore,
    });
    expect(result).toEqual([]);
  });
});
