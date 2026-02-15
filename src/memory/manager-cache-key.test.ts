import { describe, expect, it } from "vitest";
import type { ResolvedMemorySearchConfig } from "../agents/memory-search.js";
import { computeMemoryManagerCacheKey } from "./manager-cache-key.js";

// Minimal settings stub for testing (only structure matters, not values)
function makeSettings(overrides?: Partial<ResolvedMemorySearchConfig>): ResolvedMemorySearchConfig {
  return {
    enabled: true,
    sources: ["memory"],
    extraPaths: [],
    provider: "local",
    model: "test-model",
    fallback: "none",
    local: {
      modelPath: undefined,
      modelCacheDir: undefined,
    },
    remote: undefined,
    experimental: {},
    store: {
      driver: "sqlite",
      path: "/tmp/test.sqlite",
      vector: {
        enabled: false,
        extensionPath: undefined,
      },
    },
    chunking: {
      tokens: 512,
      overlap: 64,
    },
    sync: {
      watch: false,
      watchDebounceMs: 1000,
      onSearch: false,
      onSessionStart: false,
      intervalMinutes: 0,
      sessions: undefined,
    },
    query: {
      maxResults: 5,
      minScore: 0.3,
      hybrid: {
        enabled: false,
        vectorWeight: 0.7,
        textWeight: 0.3,
        candidateMultiplier: 4,
      },
    },
    cache: {
      enabled: false,
      maxEntries: undefined,
    },
    ...overrides,
  } as ResolvedMemorySearchConfig;
}

describe("computeMemoryManagerCacheKey", () => {
  const settings = makeSettings();

  it("produces a deterministic key for the same inputs", () => {
    const key1 = computeMemoryManagerCacheKey({
      agentId: "luffy",
      workspaceDir: "/home/user/.openclaw/workspace",
      settings,
    });
    const key2 = computeMemoryManagerCacheKey({
      agentId: "luffy",
      workspaceDir: "/home/user/.openclaw/workspace",
      settings,
    });
    expect(key1).toBe(key2);
  });

  it("includes agentId in cache key", () => {
    const key1 = computeMemoryManagerCacheKey({
      agentId: "luffy",
      workspaceDir: "/tmp/workspace",
      settings,
    });
    const key2 = computeMemoryManagerCacheKey({
      agentId: "zoro",
      workspaceDir: "/tmp/workspace",
      settings,
    });
    expect(key1).not.toBe(key2);
    expect(key1).toContain("luffy");
    expect(key2).toContain("zoro");
  });

  it("includes workspaceDir in cache key", () => {
    const key1 = computeMemoryManagerCacheKey({
      agentId: "luffy",
      workspaceDir: "/home/user/.openclaw/workspace",
      settings,
    });
    const key2 = computeMemoryManagerCacheKey({
      agentId: "luffy",
      workspaceDir: "/home/user/.openclaw/workspace-groups/luffy/preseed",
      settings,
    });
    expect(key1).not.toBe(key2);
  });

  it("includes groupId when sessionKey is a group session", () => {
    const key1 = computeMemoryManagerCacheKey({
      agentId: "luffy",
      workspaceDir: "/tmp/workspace",
      settings,
      sessionKey: "agent:luffy:whatsapp:group:120363404078961545@g.us",
    });
    expect(key1).toContain("120363404078961545@g.us");
  });

  it("does not include groupId for non-group sessions", () => {
    const key1 = computeMemoryManagerCacheKey({
      agentId: "luffy",
      workspaceDir: "/tmp/workspace",
      settings,
      sessionKey: "agent:luffy:main",
    });
    // Should not contain any group ID
    expect(key1).not.toContain("@g.us");
  });

  it("produces different keys for different groups (same workspace)", () => {
    const key1 = computeMemoryManagerCacheKey({
      agentId: "luffy",
      workspaceDir: "/tmp/workspace",
      settings,
      sessionKey: "agent:luffy:whatsapp:group:120363404078961545@g.us",
    });
    const key2 = computeMemoryManagerCacheKey({
      agentId: "luffy",
      workspaceDir: "/tmp/workspace",
      settings,
      sessionKey: "agent:luffy:whatsapp:group:919820645414-1461388512@g.us",
    });
    expect(key1).not.toBe(key2);
  });

  it("produces same key when sessionKey is omitted vs undefined", () => {
    const key1 = computeMemoryManagerCacheKey({
      agentId: "luffy",
      workspaceDir: "/tmp/workspace",
      settings,
    });
    const key2 = computeMemoryManagerCacheKey({
      agentId: "luffy",
      workspaceDir: "/tmp/workspace",
      settings,
      sessionKey: undefined,
    });
    expect(key1).toBe(key2);
  });
});
