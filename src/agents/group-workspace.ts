/**
 * Group workspace isolation — resolves per-group workspace directories
 * and initializes them with symlinks to shared files from the main workspace.
 *
 * When `session.groupIsolation.mode` is `"isolated"` and a group is enrolled,
 * messages from that group use an isolated workspace instead of the shared one.
 * This prevents cross-group context leakage (memory, notes, instructions).
 */

import fs from "node:fs/promises";
import path from "node:path";
import type { GroupIsolationConfig } from "../config/types.base.js";
import { normalizeAgentId } from "../routing/session-key.js";

// ── Constants ────────────────────────────────────────────────────────────────

/** Default files symlinked from the main workspace into group workspaces. */
export const DEFAULT_SHARED_FILES = ["SOUL.md", "USER.md", "TOOLS.md", "IDENTITY.md"] as const;

const LABEL_MAX_LENGTH = 64;
const INVALID_LABEL_CHARS_RE = /[^a-z0-9_-]+/g;
const LEADING_TRAILING_DASH_RE = /^-+|-+$/g;

// ── Session Key Parsing ──────────────────────────────────────────────────────

/**
 * Extract the group JID from an agent session key.
 *
 * Session key format: `agent:{agentId}:{channel}:{chatType}:{groupJid}`
 * Example: `agent:luffy:whatsapp:group:120363404078961545@g.us`
 *
 * Returns `null` for non-group session keys (DM, main, subagent, cron, etc.).
 */
export function extractGroupIdFromSessionKey(sessionKey: string | undefined | null): string | null {
  const raw = (sessionKey ?? "").trim();
  if (!raw) {
    return null;
  }

  // Split into parts: ["agent", agentId, channel, chatType, ...groupJidParts]
  const parts = raw.split(":");
  if (parts.length < 5) {
    return null;
  }
  if (parts[0] !== "agent") {
    return null;
  }

  const chatType = parts[3];
  if (chatType !== "group") {
    return null;
  }

  // Group JID is everything after the 4th colon (handles JIDs with colons, though unlikely)
  const groupId = parts.slice(4).join(":");
  return groupId || null;
}

// ── Label Sanitization ───────────────────────────────────────────────────────

/**
 * Sanitize a string into a safe directory name for use as a group workspace label.
 * - Lowercased
 * - Invalid characters replaced with hyphens
 * - Truncated to 64 characters
 */
export function sanitizeGroupLabel(input: string): string {
  let label = input.trim().toLowerCase();
  label = label.replace(INVALID_LABEL_CHARS_RE, "-");
  label = label.replace(LEADING_TRAILING_DASH_RE, "");
  label = label.slice(0, LABEL_MAX_LENGTH);
  // Ensure non-empty
  return label || "group";
}

// ── Workspace Resolution ─────────────────────────────────────────────────────

/**
 * Resolve the workspace directory for a given session.
 *
 * Returns the isolated group workspace path if:
 * 1. `isolation.mode` is `"isolated"`
 * 2. The session key identifies a group
 * 3. The group is enrolled in the `isolation.groups` map
 *
 * Otherwise returns `mainWorkspaceDir` (current shared behavior).
 */
export function resolveGroupWorkspaceDir(params: {
  isolation: GroupIsolationConfig | undefined;
  agentId: string;
  sessionKey: string;
  mainWorkspaceDir: string;
  stateDir: string;
}): string {
  const { isolation, sessionKey, mainWorkspaceDir, stateDir } = params;

  // No isolation config or shared mode → use main workspace
  if (!isolation || isolation.mode !== "isolated") {
    return mainWorkspaceDir;
  }

  // Extract group ID from session key
  const groupId = extractGroupIdFromSessionKey(sessionKey);
  if (!groupId) {
    return mainWorkspaceDir;
  }

  // Check if group is enrolled
  const groupConfig = isolation.groups?.[groupId];
  if (!groupConfig) {
    return mainWorkspaceDir;
  }

  // Explicit workspace path override
  if (groupConfig.workspace) {
    const trimmed = groupConfig.workspace.trim();
    if (trimmed) {
      // Resolve ~ and relative paths
      if (trimmed.startsWith("/")) {
        return trimmed;
      }
      // For tilde expansion we'd use resolveUserPath, but keep this pure
      // by delegating tilde resolution to the caller. In practice, the
      // Zod schema stores already-expanded paths or absolute paths.
      return trimmed;
    }
  }

  // Build isolated workspace path
  const label = groupConfig.label?.trim()
    ? sanitizeGroupLabel(groupConfig.label)
    : sanitizeGroupLabel(groupId);

  const agentId = normalizeAgentId(params.agentId);
  return path.join(stateDir, "workspace-groups", agentId, label);
}

// ── Workspace Initialization ─────────────────────────────────────────────────

/**
 * Ensure a group workspace directory exists with proper structure:
 * - Creates the directory tree (including `memory/` subdirectory)
 * - Symlinks shared files from the main workspace
 * - Idempotent: safe to call multiple times
 */
export async function ensureGroupWorkspace(params: {
  groupWorkspaceDir: string;
  mainWorkspaceDir: string;
  sharedFiles?: readonly string[];
}): Promise<void> {
  const { groupWorkspaceDir, mainWorkspaceDir } = params;
  const sharedFiles = params.sharedFiles ?? DEFAULT_SHARED_FILES;

  // Create workspace directory + memory subdirectory
  await fs.mkdir(path.join(groupWorkspaceDir, "memory"), { recursive: true });

  // Symlink shared files from main workspace
  for (const file of sharedFiles) {
    const sourcePath = path.join(mainWorkspaceDir, file);
    const linkPath = path.join(groupWorkspaceDir, file);

    // Check if source file exists in main workspace
    try {
      await fs.access(sourcePath);
    } catch {
      // Source doesn't exist — skip silently
      continue;
    }

    // Create or fix symlink
    await ensureSymlink(sourcePath, linkPath);
  }
}

/**
 * Create a symlink, replacing broken or stale ones.
 * Idempotent: if correct symlink already exists, this is a no-op.
 */
async function ensureSymlink(target: string, linkPath: string): Promise<void> {
  try {
    const existingTarget = await fs.readlink(linkPath);
    if (existingTarget === target) {
      return; // Correct symlink already exists
    }
    // Stale symlink — remove and re-create
    await fs.unlink(linkPath);
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === "ENOENT") {
      // Link doesn't exist — we'll create it below
    } else if (code === "EINVAL") {
      // Not a symlink (regular file) — leave it as is (user override)
      return;
    } else {
      throw err;
    }
  }

  await fs.symlink(target, linkPath);
}
