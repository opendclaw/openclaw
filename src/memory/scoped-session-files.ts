/**
 * Session file scope filtering for group isolation.
 *
 * When group isolation is active, this module restricts which session transcript
 * files are included in the memory index based on the configured `memoryScope`:
 *
 * - `group-only`: Only include the current group's transcript
 * - `group+main`: Include current group + main DM session transcript
 * - `all`: Include all transcripts (default/shared behavior)
 */

import path from "node:path";
import type { SessionEntry } from "../config/sessions/types.js";
import type { GroupMemoryScope } from "../config/types.base.js";
import { extractGroupIdFromSessionKey } from "../agents/group-workspace.js";
import { resolveDefaultSessionStorePath } from "../config/sessions/paths.js";
import { loadSessionStore } from "../config/sessions/store.js";

/**
 * Build a set of allowed session file paths based on the memory scope.
 *
 * Given the full list of session files for an agent and the current session key,
 * returns the subset of files that should be indexed for memory search.
 *
 * @returns The filtered list of absolute paths, or the original list if no filtering applies.
 */
export function filterSessionFilesByScope(params: {
  /** All session transcript file paths for the agent (absolute). */
  allFiles: string[];
  /** The current session key (e.g. "agent:luffy:whatsapp:group:120363404078961545@g.us"). */
  sessionKey: string;
  /** Agent ID. */
  agentId: string;
  /** Memory scope setting. */
  memoryScope: GroupMemoryScope;
  /** Pre-loaded session store (sessionKey → SessionEntry). When not provided, loaded from disk. */
  sessionStore?: Record<string, SessionEntry>;
}): string[] {
  const { allFiles, sessionKey, agentId, memoryScope } = params;

  // "all" means no filtering — return everything
  if (memoryScope === "all") {
    return allFiles;
  }

  // Build the set of allowed session keys based on scope
  const allowedKeys = new Set<string>();
  allowedKeys.add(sessionKey);

  if (memoryScope === "group+main") {
    // Also allow the main DM session
    allowedKeys.add(`agent:${agentId}:main`);
  }

  // Load session store to map files → session keys
  const store = params.sessionStore ?? loadSessionStoreForAgent(agentId);
  if (!store || Object.keys(store).length === 0) {
    // Can't filter without store — return all to avoid losing data
    return allFiles;
  }

  // Build reverse map: file basename → session key
  const basenameToKey = buildFileBasenameToKeyMap(store);

  // Filter files to only those whose session key is in the allowed set
  return allFiles.filter((absPath) => {
    const basename = path.basename(absPath);
    const key = basenameToKey.get(basename);
    if (!key) {
      // Unknown file — exclude in scoped modes (orphaned/rotated transcripts)
      return false;
    }
    return allowedKeys.has(key);
  });
}

/**
 * Determine the effective memory scope for a session.
 *
 * Returns "all" (no filtering) when:
 * - No session key provided
 * - Not a group session
 * - No memory scope configured
 */
export function resolveEffectiveMemoryScope(params: {
  sessionKey?: string;
  memoryScope?: GroupMemoryScope;
}): GroupMemoryScope {
  const { sessionKey, memoryScope } = params;

  // No session key or no scope configured → no filtering
  if (!sessionKey || !memoryScope) {
    return "all";
  }

  // Only apply scope filtering for group sessions
  const groupId = extractGroupIdFromSessionKey(sessionKey);
  if (!groupId) {
    return "all";
  }

  return memoryScope;
}

// ── Internal Helpers ─────────────────────────────────────────────────────────

function loadSessionStoreForAgent(agentId: string): Record<string, SessionEntry> {
  try {
    const storePath = resolveDefaultSessionStorePath(agentId);
    return loadSessionStore(storePath);
  } catch {
    return {};
  }
}

/**
 * Build a map from session file basename to session key.
 *
 * Session entries store either a `sessionFile` (filename or relative path)
 * or fall back to `{sessionId}.jsonl`. We match by basename since
 * `listSessionFilesForAgent` returns absolute paths and the session store
 * may use relative or bare filenames.
 */
function buildFileBasenameToKeyMap(store: Record<string, SessionEntry>): Map<string, string> {
  const map = new Map<string, string>();

  for (const [key, entry] of Object.entries(store)) {
    if (!entry?.sessionId) {
      continue;
    }

    // The session file is either explicitly stored or derived from sessionId
    const sessionFile = entry.sessionFile?.trim() || `${entry.sessionId}.jsonl`;
    const basename = path.basename(sessionFile);
    map.set(basename, key);
  }

  return map;
}
