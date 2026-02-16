/**
 * File system boundary enforcement for group access control.
 *
 * When a group has `accessControl.allowedPaths` or `accessControl.deniedPaths`,
 * file operations are restricted accordingly. This prevents groups from accessing
 * files outside their designated boundaries.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// ── Types ────────────────────────────────────────────────────────────────────

export type GroupPathPolicy = {
  allowedPaths: string[];
  deniedPaths: string[];
};

export type PathCheckResult = {
  allowed: boolean;
  reason?: string;
};

// ── Path Matching ────────────────────────────────────────────────────────────

/**
 * Expand ~ to the user's home directory and resolve to absolute path.
 */
export function expandAndResolve(filePath: string, cwd?: string): string {
  let expanded = filePath;
  if (expanded.startsWith("~/") || expanded === "~") {
    expanded = path.join(os.homedir(), expanded.slice(1));
  }
  if (!path.isAbsolute(expanded)) {
    expanded = path.resolve(cwd ?? process.cwd(), expanded);
  }
  return path.normalize(expanded);
}

/**
 * Try to resolve symlinks. Falls back to the normalized path if the file doesn't exist yet.
 */
export function resolveRealPath(absolutePath: string): string {
  try {
    return fs.realpathSync(absolutePath);
  } catch {
    // File doesn't exist yet (e.g., write operation) — resolve parent directory
    const dir = path.dirname(absolutePath);
    try {
      const realDir = fs.realpathSync(dir);
      return path.join(realDir, path.basename(absolutePath));
    } catch {
      return absolutePath;
    }
  }
}

/**
 * Check if a path matches a glob pattern.
 * Supports:
 * - Exact prefix matching (paths ending with /)
 * - `**` wildcard for any subdirectory depth
 * - `*` wildcard for single path segment
 */
function pathMatchesPattern(absolutePath: string, pattern: string): boolean {
  // Expand ~ in pattern
  let expandedPattern = pattern;
  if (expandedPattern.startsWith("~/") || expandedPattern === "~") {
    expandedPattern = path.join(os.homedir(), expandedPattern.slice(1));
  }
  expandedPattern = path.normalize(expandedPattern);

  // Remove trailing /** for directory prefix matching
  if (expandedPattern.endsWith("/**")) {
    const prefix = expandedPattern.slice(0, -3);
    // Must be under the prefix directory (not the directory itself as a file)
    return absolutePath === prefix || absolutePath.startsWith(prefix + path.sep);
  }

  // Remove trailing /* for single-level matching
  if (expandedPattern.endsWith("/*")) {
    const prefix = expandedPattern.slice(0, -2);
    if (!absolutePath.startsWith(prefix + path.sep)) {
      return false;
    }
    const remainder = absolutePath.slice(prefix.length + 1);
    return !remainder.includes(path.sep);
  }

  // Exact match
  return absolutePath === expandedPattern;
}

// ── Core Guards ──────────────────────────────────────────────────────────────

/**
 * Check if an absolute path is allowed by the given policy.
 * The path must already be resolved to an absolute, real path.
 *
 * Logic:
 * 1. If allowedPaths is non-empty, path MUST match at least one → else denied
 * 2. If deniedPaths is non-empty, path must NOT match any → else denied
 * 3. If neither is set, allowed by default
 */
export function isPathAllowed(
  absolutePath: string,
  policy: GroupPathPolicy,
): PathCheckResult {
  const { allowedPaths, deniedPaths } = policy;

  // Check allowedPaths (whitelist mode)
  if (allowedPaths.length > 0) {
    const matched = allowedPaths.some((pattern) => pathMatchesPattern(absolutePath, pattern));
    if (!matched) {
      return {
        allowed: false,
        reason: `Path "${absolutePath}" is not within the allowed paths for this group.`,
      };
    }
  }

  // Check deniedPaths (blacklist mode)
  if (deniedPaths.length > 0) {
    const denied = deniedPaths.some((pattern) => pathMatchesPattern(absolutePath, pattern));
    if (denied) {
      return {
        allowed: false,
        reason: `Path "${absolutePath}" is explicitly denied for this group.`,
      };
    }
  }

  return { allowed: true };
}

/**
 * Full guard: resolve path, check for traversal, and enforce policy.
 *
 * @param filePath - Raw file path from tool input (may be relative, contain ~, etc.)
 * @param policy - The group's path policy
 * @param workspaceDir - The group's workspace directory (used as CWD for relative paths)
 */
export function guardPath(
  filePath: string,
  policy: GroupPathPolicy,
  workspaceDir: string,
): PathCheckResult {
  if (!filePath || !filePath.trim()) {
    return { allowed: false, reason: "Empty file path." };
  }

  // If no restrictions, allow everything
  if (policy.allowedPaths.length === 0 && policy.deniedPaths.length === 0) {
    return { allowed: true };
  }

  // Resolve to absolute path
  const absolute = expandAndResolve(filePath, workspaceDir);

  // Resolve symlinks to prevent traversal via symlink
  const realPath = resolveRealPath(absolute);

  return isPathAllowed(realPath, policy);
}
