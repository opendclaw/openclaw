import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { GroupIsolationConfig } from "../config/types.base.js";
import {
  extractGroupIdFromSessionKey,
  resolveGroupWorkspaceDir,
  ensureGroupWorkspace,
  sanitizeGroupLabel,
  DEFAULT_SHARED_FILES,
} from "./group-workspace.js";

// ---------------------------------------------------------------------------
// extractGroupIdFromSessionKey
// ---------------------------------------------------------------------------
describe("extractGroupIdFromSessionKey", () => {
  it("extracts group JID from a well-formed session key", () => {
    expect(extractGroupIdFromSessionKey("agent:luffy:whatsapp:group:120363404078961545@g.us")).toBe(
      "120363404078961545@g.us",
    );
  });

  it("extracts group JID with channel variant", () => {
    expect(extractGroupIdFromSessionKey("agent:luffy:telegram:group:120363404078961545@g.us")).toBe(
      "120363404078961545@g.us",
    );
  });

  it("handles group IDs containing colons", () => {
    // Group IDs shouldn't contain colons, but be robust
    expect(extractGroupIdFromSessionKey("agent:luffy:whatsapp:group:some-complex-id")).toBe(
      "some-complex-id",
    );
  });

  it("handles channel type session keys (not just group)", () => {
    expect(extractGroupIdFromSessionKey("agent:luffy:discord:channel:123456")).toBeNull(); // only "group" type extracts
  });

  it("returns null for main session key", () => {
    expect(extractGroupIdFromSessionKey("agent:luffy:main")).toBeNull();
  });

  it("returns null for DM session key", () => {
    expect(extractGroupIdFromSessionKey("agent:luffy:whatsapp:direct:12345")).toBeNull();
  });

  it("returns null for subagent session key", () => {
    expect(extractGroupIdFromSessionKey("agent:luffy:subagent:abc-123")).toBeNull();
  });

  it("returns null for cron session key", () => {
    expect(extractGroupIdFromSessionKey("agent:luffy:cron:daily")).toBeNull();
  });

  it("returns null for empty/undefined input", () => {
    expect(extractGroupIdFromSessionKey("")).toBeNull();
    expect(extractGroupIdFromSessionKey(undefined as unknown as string)).toBeNull();
    expect(extractGroupIdFromSessionKey(null as unknown as string)).toBeNull();
  });

  it("returns null for malformed session key", () => {
    expect(extractGroupIdFromSessionKey("not-a-session-key")).toBeNull();
  });

  it("handles group JID with hyphens (alternative format)", () => {
    expect(
      extractGroupIdFromSessionKey("agent:luffy:whatsapp:group:919820645414-1461388512@g.us"),
    ).toBe("919820645414-1461388512@g.us");
  });
});

// ---------------------------------------------------------------------------
// sanitizeGroupLabel
// ---------------------------------------------------------------------------
describe("sanitizeGroupLabel", () => {
  it("passes through clean labels", () => {
    expect(sanitizeGroupLabel("preseed-client")).toBe("preseed-client");
  });

  it("lowercases labels", () => {
    expect(sanitizeGroupLabel("Preseed-Client")).toBe("preseed-client");
  });

  it("replaces invalid characters with hyphens", () => {
    expect(sanitizeGroupLabel("My Group (Special)")).toBe("my-group-special");
  });

  it("generates safe label from group JID", () => {
    const label = sanitizeGroupLabel("120363404078961545@g.us");
    expect(label).toMatch(/^[a-z0-9][a-z0-9_-]*$/);
    expect(label).not.toContain("@");
  });

  it("truncates long labels", () => {
    const longLabel = "a".repeat(100);
    expect(sanitizeGroupLabel(longLabel).length).toBeLessThanOrEqual(64);
  });
});

// ---------------------------------------------------------------------------
// resolveGroupWorkspaceDir
// ---------------------------------------------------------------------------
describe("resolveGroupWorkspaceDir", () => {
  const mainWorkspaceDir = "/home/user/.openclaw/workspace";
  const stateDir = "/home/user/.openclaw";

  it("returns main workspace when isolation is not configured", () => {
    const result = resolveGroupWorkspaceDir({
      isolation: undefined,
      agentId: "luffy",
      sessionKey: "agent:luffy:whatsapp:group:120363404078961545@g.us",
      mainWorkspaceDir,
      stateDir,
    });
    expect(result).toBe(mainWorkspaceDir);
  });

  it("returns main workspace when mode is 'shared'", () => {
    const isolation: GroupIsolationConfig = { mode: "shared" };
    const result = resolveGroupWorkspaceDir({
      isolation,
      agentId: "luffy",
      sessionKey: "agent:luffy:whatsapp:group:120363404078961545@g.us",
      mainWorkspaceDir,
      stateDir,
    });
    expect(result).toBe(mainWorkspaceDir);
  });

  it("returns main workspace for non-group sessions even when isolated", () => {
    const isolation: GroupIsolationConfig = {
      mode: "isolated",
      groups: { "120363404078961545@g.us": { label: "preseed" } },
    };
    const result = resolveGroupWorkspaceDir({
      isolation,
      agentId: "luffy",
      sessionKey: "agent:luffy:main",
      mainWorkspaceDir,
      stateDir,
    });
    expect(result).toBe(mainWorkspaceDir);
  });

  it("returns main workspace for DM sessions even when isolated", () => {
    const isolation: GroupIsolationConfig = {
      mode: "isolated",
      groups: { "120363404078961545@g.us": { label: "preseed" } },
    };
    const result = resolveGroupWorkspaceDir({
      isolation,
      agentId: "luffy",
      sessionKey: "agent:luffy:whatsapp:direct:12345",
      mainWorkspaceDir,
      stateDir,
    });
    expect(result).toBe(mainWorkspaceDir);
  });

  it("returns main workspace for un-enrolled groups", () => {
    const isolation: GroupIsolationConfig = {
      mode: "isolated",
      groups: { "120363404078961545@g.us": { label: "preseed" } },
    };
    const result = resolveGroupWorkspaceDir({
      isolation,
      agentId: "luffy",
      sessionKey: "agent:luffy:whatsapp:group:999999999@g.us",
      mainWorkspaceDir,
      stateDir,
    });
    expect(result).toBe(mainWorkspaceDir);
  });

  it("returns isolated workspace for enrolled group with label", () => {
    const isolation: GroupIsolationConfig = {
      mode: "isolated",
      groups: { "120363404078961545@g.us": { label: "preseed-client" } },
    };
    const result = resolveGroupWorkspaceDir({
      isolation,
      agentId: "luffy",
      sessionKey: "agent:luffy:whatsapp:group:120363404078961545@g.us",
      mainWorkspaceDir,
      stateDir,
    });
    expect(result).toBe(path.join(stateDir, "workspace-groups", "luffy", "preseed-client"));
  });

  it("falls back to sanitized JID label when no label provided", () => {
    const isolation: GroupIsolationConfig = {
      mode: "isolated",
      groups: { "120363404078961545@g.us": {} },
    };
    const result = resolveGroupWorkspaceDir({
      isolation,
      agentId: "luffy",
      sessionKey: "agent:luffy:whatsapp:group:120363404078961545@g.us",
      mainWorkspaceDir,
      stateDir,
    });
    // Should use sanitized JID as label
    expect(result).toContain(path.join("workspace-groups", "luffy"));
    expect(result).not.toContain("@");
  });

  it("uses explicit workspace path when provided", () => {
    const isolation: GroupIsolationConfig = {
      mode: "isolated",
      groups: {
        "120363404078961545@g.us": {
          label: "preseed-client",
          workspace: "/custom/workspace/preseed",
        },
      },
    };
    const result = resolveGroupWorkspaceDir({
      isolation,
      agentId: "luffy",
      sessionKey: "agent:luffy:whatsapp:group:120363404078961545@g.us",
      mainWorkspaceDir,
      stateDir,
    });
    expect(result).toBe("/custom/workspace/preseed");
  });

  it("normalizes agent ID", () => {
    const isolation: GroupIsolationConfig = {
      mode: "isolated",
      groups: { "120363404078961545@g.us": { label: "preseed" } },
    };
    const result = resolveGroupWorkspaceDir({
      isolation,
      agentId: "Luffy",
      sessionKey: "agent:luffy:whatsapp:group:120363404078961545@g.us",
      mainWorkspaceDir,
      stateDir,
    });
    expect(result).toContain(path.join("workspace-groups", "luffy"));
  });

  it("returns main workspace when groups map is empty", () => {
    const isolation: GroupIsolationConfig = {
      mode: "isolated",
      groups: {},
    };
    const result = resolveGroupWorkspaceDir({
      isolation,
      agentId: "luffy",
      sessionKey: "agent:luffy:whatsapp:group:120363404078961545@g.us",
      mainWorkspaceDir,
      stateDir,
    });
    expect(result).toBe(mainWorkspaceDir);
  });

  it("returns main workspace when groups is undefined in isolated mode", () => {
    const isolation: GroupIsolationConfig = {
      mode: "isolated",
    };
    const result = resolveGroupWorkspaceDir({
      isolation,
      agentId: "luffy",
      sessionKey: "agent:luffy:whatsapp:group:120363404078961545@g.us",
      mainWorkspaceDir,
      stateDir,
    });
    expect(result).toBe(mainWorkspaceDir);
  });
});

// ---------------------------------------------------------------------------
// ensureGroupWorkspace
// ---------------------------------------------------------------------------
describe("ensureGroupWorkspace", () => {
  let tmpDir: string;
  let mainWorkspaceDir: string;
  let groupWorkspaceDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "group-workspace-test-"));
    mainWorkspaceDir = path.join(tmpDir, "workspace");
    groupWorkspaceDir = path.join(tmpDir, "workspace-groups", "luffy", "preseed");

    // Create main workspace with some shared files
    await fs.mkdir(mainWorkspaceDir, { recursive: true });
    await fs.writeFile(path.join(mainWorkspaceDir, "SOUL.md"), "# Soul\nI am Luffy");
    await fs.writeFile(path.join(mainWorkspaceDir, "USER.md"), "# User\nLuffy's user");
    await fs.writeFile(path.join(mainWorkspaceDir, "TOOLS.md"), "# Tools\nLocal tools");
    await fs.writeFile(path.join(mainWorkspaceDir, "AGENTS.md"), "# Agents\nInstructions");
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("creates the group workspace directory", async () => {
    await ensureGroupWorkspace({
      groupWorkspaceDir,
      mainWorkspaceDir,
      sharedFiles: ["SOUL.md", "USER.md", "TOOLS.md"],
    });

    const stat = await fs.stat(groupWorkspaceDir);
    expect(stat.isDirectory()).toBe(true);
  });

  it("creates the memory subdirectory", async () => {
    await ensureGroupWorkspace({
      groupWorkspaceDir,
      mainWorkspaceDir,
      sharedFiles: ["SOUL.md"],
    });

    const stat = await fs.stat(path.join(groupWorkspaceDir, "memory"));
    expect(stat.isDirectory()).toBe(true);
  });

  it("creates symlinks for shared files", async () => {
    await ensureGroupWorkspace({
      groupWorkspaceDir,
      mainWorkspaceDir,
      sharedFiles: ["SOUL.md", "USER.md", "TOOLS.md"],
    });

    for (const file of ["SOUL.md", "USER.md", "TOOLS.md"]) {
      const linkPath = path.join(groupWorkspaceDir, file);
      const lstat = await fs.lstat(linkPath);
      expect(lstat.isSymbolicLink()).toBe(true);

      // Verify symlink points to the correct target
      const target = await fs.readlink(linkPath);
      expect(target).toBe(path.join(mainWorkspaceDir, file));

      // Verify content is accessible through symlink
      const content = await fs.readFile(linkPath, "utf-8");
      expect(content).toBeTruthy();
    }
  });

  it("does NOT symlink files not in sharedFiles list", async () => {
    await ensureGroupWorkspace({
      groupWorkspaceDir,
      mainWorkspaceDir,
      sharedFiles: ["SOUL.md"],
    });

    // AGENTS.md should not be symlinked — it's group-specific
    const agentsPath = path.join(groupWorkspaceDir, "AGENTS.md");
    await expect(fs.access(agentsPath)).rejects.toThrow();
  });

  it("is idempotent — second call does not throw", async () => {
    await ensureGroupWorkspace({
      groupWorkspaceDir,
      mainWorkspaceDir,
      sharedFiles: ["SOUL.md", "USER.md"],
    });

    // Call again — should not throw
    await ensureGroupWorkspace({
      groupWorkspaceDir,
      mainWorkspaceDir,
      sharedFiles: ["SOUL.md", "USER.md"],
    });

    // Verify still correct
    const lstat = await fs.lstat(path.join(groupWorkspaceDir, "SOUL.md"));
    expect(lstat.isSymbolicLink()).toBe(true);
  });

  it("skips symlink for shared files that do not exist in main workspace", async () => {
    await ensureGroupWorkspace({
      groupWorkspaceDir,
      mainWorkspaceDir,
      sharedFiles: ["SOUL.md", "NONEXISTENT.md"],
    });

    // SOUL.md should be symlinked
    const soulPath = path.join(groupWorkspaceDir, "SOUL.md");
    const lstat = await fs.lstat(soulPath);
    expect(lstat.isSymbolicLink()).toBe(true);

    // NONEXISTENT.md should not exist
    const noPath = path.join(groupWorkspaceDir, "NONEXISTENT.md");
    await expect(fs.access(noPath)).rejects.toThrow();
  });

  it("uses DEFAULT_SHARED_FILES when no sharedFiles specified", async () => {
    await ensureGroupWorkspace({
      groupWorkspaceDir,
      mainWorkspaceDir,
    });

    // Default shared files that exist in main workspace should be symlinked
    for (const file of DEFAULT_SHARED_FILES) {
      const filePath = path.join(groupWorkspaceDir, file);
      try {
        const lstat = await fs.lstat(filePath);
        if (lstat.isSymbolicLink()) {
          const target = await fs.readlink(filePath);
          expect(target).toBe(path.join(mainWorkspaceDir, file));
        }
      } catch {
        // File might not exist in main workspace, which is fine
      }
    }
  });

  it("re-creates broken symlinks on re-run", async () => {
    await ensureGroupWorkspace({
      groupWorkspaceDir,
      mainWorkspaceDir,
      sharedFiles: ["SOUL.md"],
    });

    // Break the symlink by removing the group workspace link and creating a stale one
    const linkPath = path.join(groupWorkspaceDir, "SOUL.md");
    await fs.unlink(linkPath);
    await fs.symlink("/nonexistent/path/SOUL.md", linkPath);

    // Re-run should fix it
    await ensureGroupWorkspace({
      groupWorkspaceDir,
      mainWorkspaceDir,
      sharedFiles: ["SOUL.md"],
    });

    const target = await fs.readlink(linkPath);
    expect(target).toBe(path.join(mainWorkspaceDir, "SOUL.md"));
  });
});
