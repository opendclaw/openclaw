import type { AgentTool, AgentToolResult } from "@mariozechner/pi-agent-core";
import { Type } from "@sinclair/typebox";
import { describe, expect, it } from "vitest";
import type { OpenClawConfig } from "../config/config.js";
import {
  filterToolsByPolicy,
  isToolAllowedByPolicyName,
  resolveSubagentToolPolicy,
  resolveGroupAccessControl,
  resolveGroupToolPolicy,
} from "./pi-tools.policy.js";

function createStubTool(name: string): AgentTool {
  return {
    name,
    label: name,
    description: "",
    parameters: Type.Object({}),
    execute: async () => ({}) as AgentToolResult<unknown>,
  };
}

describe("pi-tools.policy", () => {
  it("treats * in allow as allow-all", () => {
    const tools = [createStubTool("read"), createStubTool("exec")];
    const filtered = filterToolsByPolicy(tools, { allow: ["*"] });
    expect(filtered.map((tool) => tool.name)).toEqual(["read", "exec"]);
  });

  it("treats * in deny as deny-all", () => {
    const tools = [createStubTool("read"), createStubTool("exec")];
    const filtered = filterToolsByPolicy(tools, { deny: ["*"] });
    expect(filtered).toEqual([]);
  });

  it("supports wildcard allow/deny patterns", () => {
    expect(isToolAllowedByPolicyName("web_fetch", { allow: ["web_*"] })).toBe(true);
    expect(isToolAllowedByPolicyName("web_search", { deny: ["web_*"] })).toBe(false);
  });

  it("keeps apply_patch when exec is allowlisted", () => {
    expect(isToolAllowedByPolicyName("apply_patch", { allow: ["exec"] })).toBe(true);
  });
});

describe("resolveSubagentToolPolicy depth awareness", () => {
  const baseCfg = {
    agents: { defaults: { subagents: { maxSpawnDepth: 2 } } },
  } as unknown as OpenClawConfig;

  const deepCfg = {
    agents: { defaults: { subagents: { maxSpawnDepth: 3 } } },
  } as unknown as OpenClawConfig;

  const leafCfg = {
    agents: { defaults: { subagents: { maxSpawnDepth: 1 } } },
  } as unknown as OpenClawConfig;

  it("applies subagent tools.alsoAllow to re-enable default-denied tools", () => {
    const cfg = {
      agents: { defaults: { subagents: { maxSpawnDepth: 2 } } },
      tools: { subagents: { tools: { alsoAllow: ["sessions_send"] } } },
    } as unknown as OpenClawConfig;
    const policy = resolveSubagentToolPolicy(cfg, 1);
    expect(isToolAllowedByPolicyName("sessions_send", policy)).toBe(true);
    expect(isToolAllowedByPolicyName("cron", policy)).toBe(false);
  });

  it("applies subagent tools.allow to re-enable default-denied tools", () => {
    const cfg = {
      agents: { defaults: { subagents: { maxSpawnDepth: 2 } } },
      tools: { subagents: { tools: { allow: ["sessions_send"] } } },
    } as unknown as OpenClawConfig;
    const policy = resolveSubagentToolPolicy(cfg, 1);
    expect(isToolAllowedByPolicyName("sessions_send", policy)).toBe(true);
  });

  it("merges subagent tools.alsoAllow into tools.allow when both are set", () => {
    const cfg = {
      agents: { defaults: { subagents: { maxSpawnDepth: 2 } } },
      tools: {
        subagents: { tools: { allow: ["sessions_spawn"], alsoAllow: ["sessions_send"] } },
      },
    } as unknown as OpenClawConfig;
    const policy = resolveSubagentToolPolicy(cfg, 1);
    expect(policy.allow).toEqual(["sessions_spawn", "sessions_send"]);
  });

  it("keeps configured deny precedence over allow and alsoAllow", () => {
    const cfg = {
      agents: { defaults: { subagents: { maxSpawnDepth: 2 } } },
      tools: {
        subagents: {
          tools: {
            allow: ["sessions_send"],
            alsoAllow: ["sessions_send"],
            deny: ["sessions_send"],
          },
        },
      },
    } as unknown as OpenClawConfig;
    const policy = resolveSubagentToolPolicy(cfg, 1);
    expect(isToolAllowedByPolicyName("sessions_send", policy)).toBe(false);
  });

  it("does not create a restrictive allowlist when only alsoAllow is configured", () => {
    const cfg = {
      agents: { defaults: { subagents: { maxSpawnDepth: 2 } } },
      tools: { subagents: { tools: { alsoAllow: ["sessions_send"] } } },
    } as unknown as OpenClawConfig;
    const policy = resolveSubagentToolPolicy(cfg, 1);
    expect(policy.allow).toBeUndefined();
    expect(isToolAllowedByPolicyName("subagents", policy)).toBe(true);
  });

  it("depth-1 orchestrator (maxSpawnDepth=2) allows sessions_spawn", () => {
    const policy = resolveSubagentToolPolicy(baseCfg, 1);
    expect(isToolAllowedByPolicyName("sessions_spawn", policy)).toBe(true);
  });

  it("depth-1 orchestrator (maxSpawnDepth=2) allows subagents", () => {
    const policy = resolveSubagentToolPolicy(baseCfg, 1);
    expect(isToolAllowedByPolicyName("subagents", policy)).toBe(true);
  });

  it("depth-1 orchestrator (maxSpawnDepth=2) allows sessions_list", () => {
    const policy = resolveSubagentToolPolicy(baseCfg, 1);
    expect(isToolAllowedByPolicyName("sessions_list", policy)).toBe(true);
  });

  it("depth-1 orchestrator (maxSpawnDepth=2) allows sessions_history", () => {
    const policy = resolveSubagentToolPolicy(baseCfg, 1);
    expect(isToolAllowedByPolicyName("sessions_history", policy)).toBe(true);
  });

  it("depth-1 orchestrator still denies gateway, cron, memory", () => {
    const policy = resolveSubagentToolPolicy(baseCfg, 1);
    expect(isToolAllowedByPolicyName("gateway", policy)).toBe(false);
    expect(isToolAllowedByPolicyName("cron", policy)).toBe(false);
    expect(isToolAllowedByPolicyName("memory_search", policy)).toBe(false);
    expect(isToolAllowedByPolicyName("memory_get", policy)).toBe(false);
  });

  it("depth-2 leaf denies sessions_spawn", () => {
    const policy = resolveSubagentToolPolicy(baseCfg, 2);
    expect(isToolAllowedByPolicyName("sessions_spawn", policy)).toBe(false);
  });

  it("depth-2 orchestrator (maxSpawnDepth=3) allows sessions_spawn", () => {
    const policy = resolveSubagentToolPolicy(deepCfg, 2);
    expect(isToolAllowedByPolicyName("sessions_spawn", policy)).toBe(true);
  });

  it("depth-3 leaf (maxSpawnDepth=3) denies sessions_spawn", () => {
    const policy = resolveSubagentToolPolicy(deepCfg, 3);
    expect(isToolAllowedByPolicyName("sessions_spawn", policy)).toBe(false);
  });

  it("depth-2 leaf allows subagents (for visibility)", () => {
    const policy = resolveSubagentToolPolicy(baseCfg, 2);
    expect(isToolAllowedByPolicyName("subagents", policy)).toBe(true);
  });

  it("depth-2 leaf denies sessions_list and sessions_history", () => {
    const policy = resolveSubagentToolPolicy(baseCfg, 2);
    expect(isToolAllowedByPolicyName("sessions_list", policy)).toBe(false);
    expect(isToolAllowedByPolicyName("sessions_history", policy)).toBe(false);
  });

  it("depth-1 leaf (maxSpawnDepth=1) denies sessions_spawn", () => {
    const policy = resolveSubagentToolPolicy(leafCfg, 1);
    expect(isToolAllowedByPolicyName("sessions_spawn", policy)).toBe(false);
  });

  it("depth-1 leaf (maxSpawnDepth=1) denies sessions_list", () => {
    const policy = resolveSubagentToolPolicy(leafCfg, 1);
    expect(isToolAllowedByPolicyName("sessions_list", policy)).toBe(false);
  });

  it("defaults to leaf behavior when no depth is provided", () => {
    const policy = resolveSubagentToolPolicy(baseCfg);
    // Default depth=1, maxSpawnDepth=2 → orchestrator
    expect(isToolAllowedByPolicyName("sessions_spawn", policy)).toBe(true);
  });

  it("defaults to leaf behavior when depth is undefined and maxSpawnDepth is 1", () => {
    const policy = resolveSubagentToolPolicy(leafCfg);
    // Default depth=1, maxSpawnDepth=1 → leaf
    expect(isToolAllowedByPolicyName("sessions_spawn", policy)).toBe(false);
  });
});

} from "./pi-tools.policy.js";

function makeConfig(overrides?: Partial<OpenClawConfig>): OpenClawConfig {
  return {
    session: {
      groupIsolation: {
        mode: "isolated",
        groups: {
          "120363404078961545@g.us": {
            label: "vault",
            workspace: "~/Family Documents",
            accessControl: {
              allowedTools: ["read", "write", "edit", "message"],
              deniedTools: ["browser", "canvas", "nodes"],
            },
          },
          "999@g.us": {
            label: "open-group",
          },
        },
      },
    },
    ...overrides,
  } as OpenClawConfig;
}

describe("resolveGroupAccessControl", () => {
  it("returns accessControl for enrolled group session", () => {
    const cfg = makeConfig();
    const ac = resolveGroupAccessControl(
      cfg,
      "agent:franky:whatsapp:group:120363404078961545@g.us",
    );
    expect(ac).toBeDefined();
    expect(ac?.allowedTools).toEqual(["read", "write", "edit", "message"]);
    expect(ac?.deniedTools).toEqual(["browser", "canvas", "nodes"]);
  });

  it("returns undefined for group without accessControl", () => {
    const cfg = makeConfig();
    const ac = resolveGroupAccessControl(cfg, "agent:franky:whatsapp:group:999@g.us");
    expect(ac).toBeUndefined();
  });

  it("returns undefined for DM sessions", () => {
    const cfg = makeConfig();
    const ac = resolveGroupAccessControl(cfg, "agent:franky:whatsapp:dm:someone");
    expect(ac).toBeUndefined();
  });

  it("returns undefined when isolation mode is shared", () => {
    const cfg = makeConfig({
      session: {
        groupIsolation: {
          mode: "shared",
          groups: {
            "120363404078961545@g.us": {
              label: "vault",
              accessControl: { allowedTools: ["read"] },
            },
          },
        },
      },
    } as Partial<OpenClawConfig>);
    const ac = resolveGroupAccessControl(
      cfg,
      "agent:franky:whatsapp:group:120363404078961545@g.us",
    );
    expect(ac).toBeUndefined();
  });

  it("returns undefined when no config", () => {
    expect(
      resolveGroupAccessControl(undefined, "agent:franky:whatsapp:group:123@g.us"),
    ).toBeUndefined();
  });

  it("resolves from spawnedBy when sessionKey has no group", () => {
    const cfg = makeConfig();
    const ac = resolveGroupAccessControl(
      cfg,
      "agent:franky:subagent:abc123",
      "agent:franky:whatsapp:group:120363404078961545@g.us",
    );
    expect(ac).toBeDefined();
    expect(ac?.allowedTools).toEqual(["read", "write", "edit", "message"]);
  });
});

describe("resolveGroupToolPolicy with accessControl", () => {
  it("returns tool policy from accessControl for vault group", () => {
    const cfg = makeConfig();
    const policy = resolveGroupToolPolicy({
      config: cfg,
      sessionKey: "agent:franky:whatsapp:group:120363404078961545@g.us",
      messageProvider: "whatsapp",
      groupId: "120363404078961545@g.us",
    });
    expect(policy).toBeDefined();
    // Should include the isolation accessControl restrictions
    expect(policy?.allow).toEqual(["read", "write", "edit", "message"]);
    expect(policy?.deny).toContain("browser");
    expect(policy?.deny).toContain("canvas");
    expect(policy?.deny).toContain("nodes");
  });

  it("returns undefined for non-group sessions", () => {
    const cfg = makeConfig();
    const policy = resolveGroupToolPolicy({
      config: cfg,
      sessionKey: "agent:franky:whatsapp:dm:someone",
    });
    expect(policy).toBeUndefined();
  });

  it("allowed tools filter correctly", () => {
    const cfg = makeConfig();
    const policy = resolveGroupToolPolicy({
      config: cfg,
      sessionKey: "agent:franky:whatsapp:group:120363404078961545@g.us",
      messageProvider: "whatsapp",
      groupId: "120363404078961545@g.us",
    });
    // read is allowed
    expect(isToolAllowedByPolicyName("read", policy)).toBe(true);
    // exec is NOT in allowedTools → should be denied
    expect(isToolAllowedByPolicyName("exec", policy)).toBe(false);
    // browser is explicitly denied
    expect(isToolAllowedByPolicyName("browser", policy)).toBe(false);
  });
});
