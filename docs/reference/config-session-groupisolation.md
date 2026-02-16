# Configuration Reference: `session.groupIsolation`

**Feature:** Group Session Isolation  
**Status:** Beta (feature/group-session-isolation branch)  
**Config Path:** `session.groupIsolation`

---

## Overview

The `session.groupIsolation` configuration controls workspace and memory isolation for group chat sessions. When enabled, specified groups operate in dedicated workspace directories with scoped memory search.

**Default behavior:** `mode: "shared"` — all groups share the main workspace (backward compatible)

---

## Schema

```typescript
type GroupIsolationConfig = {
  mode?: "shared" | "isolated";
  groups?: Record<string, GroupConfig>;
  sharedFiles?: string[];
  memoryScope?: "group-only" | "group+main" | "all";
};

type GroupConfig = {
  label?: string;
  workspace?: string;
};
```

### Full Configuration Example

```json
{
  "session": {
    "groupIsolation": {
      "mode": "isolated",
      "memoryScope": "group-only",
      "groups": {
        "120363404078961545@g.us": {
          "label": "preseed-client",
          "workspace": "~/custom/path/client"
        },
        "120363423561902447@g.us": {
          "label": "family-vault"
        },
        "919820645414-1461388512@g.us": {
          "label": "nyra-krishay"
        }
      },
      "sharedFiles": ["SOUL.md", "USER.md", "TOOLS.md", "IDENTITY.md"]
    }
  }
}
```

---

## Fields

### `mode`

**Type:** `"shared" | "isolated"`  
**Default:** `"shared"`  
**Required:** No

Controls whether group isolation is enabled.

| Value        | Behavior                                                         |
| ------------ | ---------------------------------------------------------------- |
| `"shared"`   | All groups use the main workspace (default, backward compatible) |
| `"isolated"` | Enrolled groups get dedicated workspaces                         |

**Examples:**

```json
// Disable isolation (default)
{ "mode": "shared" }

// Enable isolation for enrolled groups
{ "mode": "isolated" }
```

**Notes:**

- Changing from `"isolated"` to `"shared"` does NOT delete group workspaces
- Existing group workspace directories remain on disk
- Can safely toggle back to `"isolated"` later

---

### `groups`

**Type:** `Record<string, GroupConfig>`  
**Default:** `{}`  
**Required:** No (but isolation has no effect if empty)

Maps group JIDs to their isolation configuration.

**Key format:** WhatsApp group JID (e.g., `120363404078961545@g.us`)

**Value:** `GroupConfig` object with optional `label` and `workspace`

**Example:**

```json
{
  "groups": {
    "120363404078961545@g.us": {
      "label": "preseed-client"
    },
    "120363423561902447@g.us": {
      "label": "family-vault",
      "workspace": "~/Documents/family-workspace"
    }
  }
}
```

**How to find group JIDs:**

```bash
# Check sessions.json
cat ~/.openclaw/agents/{agentId}/sessions/sessions.json | \
  jq '.sessions | keys | map(select(contains("@g.us")))'

# Example output:
# [
#   "agent:luffy:whatsapp:group:120363404078961545@g.us"
# ]
```

The group JID is everything after `:group:` (e.g., `120363404078961545@g.us`)

**Notes:**

- Groups NOT listed in this object will use the main workspace
- Opt-in isolation: only configure groups that need isolation
- Group JIDs must exactly match the session key format

---

### `groups[groupJid].label`

**Type:** `string`  
**Default:** Sanitized version of group JID  
**Required:** No (but highly recommended)

Human-friendly label used as the directory name for the group workspace.

**Default behavior:** If omitted, the group JID is sanitized and used as the label:

- `120363404078961545@g.us` → `120363404078961545-g-us`

**Workspace path:**

- With label: `~/.openclaw/workspace-groups/{agentId}/{label}/`
- Without label: `~/.openclaw/workspace-groups/{agentId}/{sanitized-jid}/`

**Examples:**

```json
// ✅ Recommended: descriptive labels
{
  "120363404078961545@g.us": { "label": "preseed-client-phase2" },
  "120363423561902447@g.us": { "label": "thakkar-rasania-vault" }
}

// ⚠ Works but unclear
{
  "120363404078961545@g.us": { "label": "group1" },
  "120363423561902447@g.us": { "label": "group2" }
}

// ⚠ Omitted: uses sanitized JID
{
  "120363404078961545@g.us": {}
  // Becomes: ~/.openclaw/workspace-groups/luffy/120363404078961545-g-us/
}
```

**Label restrictions:**

- Must be filesystem-safe (no `/`, `\`, `..`, etc.)
- Lowercase recommended
- Use hyphens instead of spaces
- Keep under 64 characters

---

### `groups[groupJid].workspace`

**Type:** `string` (filesystem path)  
**Default:** `~/.openclaw/workspace-groups/{agentId}/{label}/`  
**Required:** No

Explicit workspace directory path for the group, overriding the default location.

**Use cases:**

- Custom directory structure
- Different storage volume
- Network-mounted workspace

**Examples:**

```json
{
  "120363404078961545@g.us": {
    "label": "preseed-client",
    "workspace": "~/Dropbox/openclaw-workspaces/client"
  },
  "120363423561902447@g.us": {
    "workspace": "/Volumes/SecureDrive/family-vault"
  }
}
```

**Path resolution:**

- `~` expands to user home directory
- Relative paths are resolved from `~/.openclaw/`
- Absolute paths are used as-is

**Notes:**

- Directory is auto-created if it doesn't exist
- Shared files are symlinked into this directory
- Ensure path is writable by the gateway process

---

### `groups[groupJid].accessControl`

**Type:** `GroupAccessControl` object  
**Default:** `undefined` (no restrictions)  
**Required:** No

Access control constraints for a specific group. When defined, restricts file system access, tool availability, skill loading, and email routing for the group.

#### GroupAccessControl Schema

```typescript
type GroupAccessControl = {
  /** Allowed file paths (glob patterns). If set, ONLY these are accessible. */
  allowedPaths?: string[];
  /** Denied file paths (glob patterns). Applied after allowedPaths. */
  deniedPaths?: string[];
  /** Allowed skill names. If set, ONLY these skills are loaded. */
  allowedSkills?: string[];
  /** Denied skill names. Applied after allowedSkills. */
  deniedSkills?: string[];
  /** Allowed tool names. If set, ONLY these tools are available. */
  allowedTools?: string[];
  /** Denied tool names. Applied after allowedTools. */
  deniedTools?: string[];
  /** Email account ID to use for this group. */
  emailAccount?: string;
};
```

#### Example Configuration

```json
{
  "120363423561902447@g.us": {
    "label": "family-vault",
    "workspace": "~/Library/Mobile Documents/com~apple~CloudDocs/FamilyDocs",
    "accessControl": {
      "allowedPaths": ["~/Library/Mobile Documents/com~apple~CloudDocs/FamilyDocs/**"],
      "allowedSkills": ["family-docs"],
      "allowedTools": ["read", "write", "edit", "message", "web_search"],
      "deniedTools": ["exec", "process", "browser", "canvas", "nodes", "subagents"]
    }
  }
}
```

---

#### `accessControl.allowedPaths`

**Type:** `string[]` (glob patterns)  
**Default:** No restrictions (all paths accessible)

Whitelist of file system paths the group can access via `read`, `write`, and `edit` tools. If set, ONLY these paths are accessible.

**Pattern syntax:**
| Pattern | Meaning |
|---|---|
| `~/Documents/**` | All files recursively under Documents |
| `~/Documents/*` | Files directly in Documents (one level) |
| `~/Documents/report.md` | Specific file only |

**Precedence:** `allowedPaths` is checked first. If the path doesn't match any pattern, access is denied.

**Example:**

```json
{
  "allowedPaths": [
    "~/Library/Mobile Documents/com~apple~CloudDocs/FamilyDocs/**",
    "/Volumes/SecureDrive/family/**"
  ]
}
```

**Behavior:**

- `~/Library/Mobile Documents/com~apple~CloudDocs/FamilyDocs/deed.pdf` → ✅ Allowed
- `~/Developer/openclaw` → 🚫 Denied (not in allowed paths)

**Notes:**

- Tilde (`~`) expands to user home directory
- Paths are normalized before matching
- Symlinks are resolved before checking
- Path traversal (`../`) is blocked

---

#### `accessControl.deniedPaths`

**Type:** `string[]` (glob patterns)  
**Default:** None

Blacklist of paths to deny, even if they match `allowedPaths`. Applied AFTER `allowedPaths`.

**Use case:** Allow a directory tree but exclude sensitive subdirectories.

**Example:**

```json
{
  "allowedPaths": ["~/Developer/client/**"],
  "deniedPaths": ["~/Developer/client/secrets/**", "~/Developer/client/.env*"]
}
```

**Behavior:**

- `~/Developer/client/project.md` → ✅ Allowed (matches allowed, not denied)
- `~/Developer/client/secrets/api-key.txt` → 🚫 Denied (matches denied)
- `~/Developer/client/.env` → 🚫 Denied (matches denied)

---

#### `accessControl.allowedSkills`

**Type:** `string[]` (skill names)  
**Default:** No restrictions (all skills loaded)

Whitelist of skills that will be loaded into the agent's prompt for this group. If set, ONLY these skills are available.

**Example:**

```json
{
  "allowedSkills": ["family-docs", "home-automation"]
}
```

**Behavior:**

- Agent prompt includes only `family-docs` and `home-automation` skills
- Other workspace skills are filtered out
- Bundled skills are also filtered (if allowedSkills is set)

**Notes:**

- Skill names must match skill directory names exactly (case-sensitive)
- Applied after global `skills.allow/deny` config
- Empty array means no skills loaded

---

#### `accessControl.deniedSkills`

**Type:** `string[]` (skill names)  
**Default:** None

Blacklist of skills to exclude from this group. Applied AFTER `allowedSkills`.

**Example:**

```json
{
  "deniedSkills": ["external-api", "social-media"]
}
```

---

#### `accessControl.allowedTools`

**Type:** `string[]` (tool names)  
**Default:** No restrictions (all tools available)

Whitelist of tools the agent can use in this group. If set, ONLY these tools are available.

**Common tool names:**
| Tool | Description |
|---|---|
| `read` | Read file contents |
| `write` | Create/overwrite files |
| `edit` | Make precise file edits |
| `exec` | Execute shell commands |
| `process` | Manage background processes |
| `browser` | Control web browser |
| `canvas` | Present canvas content |
| `nodes` | Control paired devices |
| `message` | Send messages |
| `subagents` | Spawn sub-agents |
| `web_search` | Search the web |
| `web_fetch` | Fetch web content |
| `tts` | Text-to-speech |
| `image` | Image analysis |

**Example:**

```json
{
  "allowedTools": ["read", "write", "edit", "message", "web_search"]
}
```

**Behavior:**

- Agent can read, write, edit files, send messages, and search the web
- Cannot use `exec` (shell commands), `browser`, `canvas`, etc.
- Tool calls to denied tools return an error message

**Notes:**

- Tool names are case-sensitive
- Applied after global tool policy and channel-level group policy
- Empty array means no tools available (rarely useful)

---

#### `accessControl.deniedTools`

**Type:** `string[]` (tool names)  
**Default:** None

Blacklist of tools to deny for this group. Applied AFTER `allowedTools`.

**Common denied tools for high-security groups:**
| Tool | Why deny? |
|---|---|
| `exec` / `process` | Shell commands can bypass file path guards |
| `browser` | External browser automation |
| `canvas` | Presentation features |
| `nodes` | Device control |
| `subagents` | Spawning child agents |

**Example:**

```json
{
  "deniedTools": ["exec", "process", "browser", "canvas", "nodes", "subagents"]
}
```

---

#### `accessControl.emailAccount`

**Type:** `string` (account ID)  
**Default:** Default email account

Email account to use for outbound messages from this group. Prepares for future email skill integration.

**Example:**

```json
{
  "emailAccount": "family-vault@icloud.com"
}
```

**Notes:**

- Currently a placeholder for future email skill implementation
- Will route outbound emails through the specified account
- Useful for separating work/personal email contexts

---

#### Precedence Rules

Access control follows this evaluation order:

**Path Access:**

1. If `allowedPaths` is non-empty → path MUST match at least one pattern
2. If `deniedPaths` is non-empty → path must NOT match any pattern
3. If neither is set → all paths allowed

**Skill Access:**

1. Skills filtered by global `skills.allow/deny` config first
2. If `allowedSkills` is non-empty → skill MUST be in the list
3. If `deniedSkills` is non-empty → skill must NOT be in the list

**Tool Access:**

1. Tools filtered by global `tools.allow/deny` config first
2. Tools filtered by channel-level group policy (if any)
3. If `allowedTools` is non-empty → tool MUST be in the list
4. If `deniedTools` is non-empty → tool must NOT be in the list
5. **Result:** Intersection of all allow lists, union of all deny lists

---

#### Security Considerations

**Exec Tool Escape Hatch:**
The `exec` tool can bypass file path guards via shell commands. For high-security groups, deny `exec` entirely:

```json
{
  "deniedTools": ["exec", "process"]
}
```

**Symlink Traversal:**
The path guard resolves symlinks before checking. A symlink inside an allowed directory pointing outside will be caught.

**Subagent Inheritance:**
Subagents spawned from a group session inherit the group's access control. The spawn tool propagates the session key context.

---

### `sharedFiles`

**Type:** `string[]` (array of filenames)  
**Default:** `["SOUL.md", "USER.md", "TOOLS.md"]`  
**Required:** No

Files from the main workspace to symlink into each group workspace.

**Purpose:** Maintain consistent identity/config across groups while isolating memories.

**Default shared files:**

| File       | Purpose                                 | Why shared?              |
| ---------- | --------------------------------------- | ------------------------ |
| `SOUL.md`  | Agent personality and core instructions | Identity is consistent   |
| `USER.md`  | User information and preferences        | User doesn't change      |
| `TOOLS.md` | Tool configuration and preferences      | Tool config is universal |

**Common additions:**

```json
{
  "sharedFiles": [
    "SOUL.md",
    "USER.md",
    "TOOLS.md",
    "IDENTITY.md", // Agent name/emoji
    "memory/core-facts.md" // Shared knowledge base
  ]
}
```

**Files NOT shared (per-group):**

| File           | Purpose                     | Why NOT shared?                    |
| -------------- | --------------------------- | ---------------------------------- |
| `AGENTS.md`    | Group-specific instructions | Each group has different behavior  |
| `memory/*.md`  | Memory files                | **This is the isolation boundary** |
| `HEARTBEAT.md` | Heartbeat behavior          | Group-specific timing/actions      |
| `BOOTSTRAP.md` | Onboarding messages         | Group-specific first messages      |

**Advanced: Maximum isolation**

```json
{
  "sharedFiles": ["SOUL.md"] // Only core identity shared
}
```

**Advanced: Shared knowledge base**

```json
{
  "sharedFiles": [
    "SOUL.md",
    "USER.md",
    "TOOLS.md",
    "memory/facts.md", // Shared facts
    "memory/company-info.md" // Shared company knowledge
  ]
}
```

**Symlink behavior:**

- Files are symlinked, not copied (no disk duplication)
- Changes to shared files propagate immediately
- Broken symlinks are logged as warnings
- Non-existent shared files are skipped (no error)

---

### `memoryScope`

**Type:** `"group-only" | "group+main" | "all"`  
**Default:** `"group-only"`  
**Required:** No

Controls which session transcripts and memory files are searchable when the agent is in a group session.

#### `"group-only"` (Strictest isolation)

**Searchable content:**

- Session transcript: Current group ONLY
- Memory files: Group workspace ONLY

**Not searchable:**

- Other group transcripts
- Main workspace memories
- DM session transcript

**Use when:**

- Maximum separation required (client work, sensitive docs)
- No cross-contamination allowed
- Compliance requires strict boundaries

**Example:**

```json
{
  "memoryScope": "group-only"
}
```

**Behavior:**

```
In preseed-client group:
  Search "Phase 2" → ✅ Results from preseed-client workspace
  Search "family"  → 🚫 No results (family-vault is isolated)

In family-vault group:
  Search "client" → 🚫 No results (preseed-client is isolated)
```

---

#### `"group+main"` (Moderate isolation)

**Searchable content:**

- Session transcript: Current group + main DM session
- Memory files: Group workspace + main workspace

**Not searchable:**

- Other group transcripts
- Other group workspaces

**Use when:**

- You want isolation between groups
- But still need personal context from DMs
- Main workspace has shared knowledge

**Example:**

```json
{
  "memoryScope": "group+main"
}
```

**Behavior:**

```
In preseed-client group:
  Search "Phase 2"    → ✅ Results from preseed-client + main
  Search "my birthday" → ✅ Results from main workspace (DM)
  Search "family docs" → 🚫 No results (family-vault isolated)

In DM session (main):
  Search → ✅ Main workspace only (as before)
```

---

#### `"all"` (No memory isolation)

**Searchable content:**

- Session transcript: All groups + all sessions
- Memory files: All workspaces

**Use when:**

- You want workspace separation (different `AGENTS.md` per group)
- But shared memory search across all contexts
- You trust the agent to not mix contexts inappropriately

**Example:**

```json
{
  "memoryScope": "all"
}
```

**Behavior:**

```
In any group:
  Search → ✅ All transcripts and all workspace memories
```

**Note:** This mode provides workspace-level organization but no search isolation.

---

## Complete Examples

### Example 1: Strict Client/Family Isolation with Access Control

**Scenario:** Client work and family docs must never mix. Family vault has maximum restrictions.

```json
{
  "session": {
    "groupIsolation": {
      "mode": "isolated",
      "memoryScope": "group-only",
      "groups": {
        "120363404078961545@g.us": {
          "label": "preseed-client",
          "accessControl": {
            "allowedPaths": ["~/Developer/preseed/**", "~/Documents/clients/preseed/**"],
            "deniedPaths": ["~/Developer/preseed/.env*"],
            "allowedSkills": ["client-work"],
            "allowedTools": [
              "read",
              "write",
              "edit",
              "exec",
              "process",
              "web_search",
              "web_fetch",
              "message"
            ]
          }
        },
        "120363423561902447@g.us": {
          "label": "family-vault",
          "workspace": "~/Library/Mobile Documents/com~apple~CloudDocs/FamilyDocs",
          "accessControl": {
            "allowedPaths": ["~/Library/Mobile Documents/com~apple~CloudDocs/FamilyDocs/**"],
            "allowedSkills": ["family-docs"],
            "allowedTools": ["read", "write", "edit", "message", "web_search"],
            "deniedTools": ["exec", "process", "browser", "canvas", "nodes", "subagents"]
          }
        }
      },
      "sharedFiles": ["SOUL.md", "USER.md", "TOOLS.md"]
    }
  }
}
```

**Result:**

- Client group: Can access client paths, use shell commands, web search
- Family vault: Only family documents, no shell commands, limited tools
- Complete separation of file system and tool access

---

### Example 2: Multi-Project with Access Control

**Scenario:** Multiple projects with per-project file boundaries and shared personal context.

```json
{
  "session": {
    "groupIsolation": {
      "mode": "isolated",
      "memoryScope": "group+main",
      "groups": {
        "project-a@g.us": {
          "label": "project-a",
          "accessControl": {
            "allowedPaths": ["~/Developer/project-a/**"],
            "allowedTools": ["read", "write", "edit", "exec", "process", "web_search"]
          }
        },
        "project-b@g.us": {
          "label": "project-b",
          "accessControl": {
            "allowedPaths": ["~/Developer/project-b/**"],
            "allowedTools": ["read", "write", "edit", "exec", "process", "web_search"]
          }
        },
        "project-c@g.us": {
          "label": "project-c",
          "accessControl": {
            "allowedPaths": ["~/Developer/project-c/**"],
            "allowedTools": ["read", "write", "edit", "web_search"]
          }
        }
      },
      "sharedFiles": ["SOUL.md", "USER.md", "TOOLS.md", "IDENTITY.md"]
    }
  }
}
```

**Result:**

- Each project: Isolated workspace + file boundary + access to main workspace
- Projects can't access each other's files
- Project C has no shell access (more restricted)

---

### Example 3: Custom Workspace Paths

**Scenario:** Different storage locations for different groups.

```json
{
  "session": {
    "groupIsolation": {
      "mode": "isolated",
      "memoryScope": "group-only",
      "groups": {
        "client-group@g.us": {
          "label": "sensitive-client",
          "workspace": "/Volumes/EncryptedDrive/client-workspace"
        },
        "team-group@g.us": {
          "label": "team-coordination",
          "workspace": "~/Dropbox/team-workspace"
        }
      }
    }
  }
}
```

**Result:**

- Client workspace on encrypted drive
- Team workspace in Dropbox (synced)

---

### Example 4: Minimal Shared Files (Maximum Isolation)

**Scenario:** Each group has completely independent identity.

```json
{
  "session": {
    "groupIsolation": {
      "mode": "isolated",
      "memoryScope": "group-only",
      "groups": {
        "personal-brand-a@g.us": { "label": "brand-a" },
        "personal-brand-b@g.us": { "label": "brand-b" }
      },
      "sharedFiles": [] // No shared files
    }
  }
}
```

**Result:**

- Each group has its own SOUL.md, USER.md, etc.
- Completely independent personalities/identities

---

### Example 5: High-Security Vault (Maximum Restrictions)

**Scenario:** Family legal/financial documents with strictest possible restrictions.

```json
{
  "session": {
    "groupIsolation": {
      "mode": "isolated",
      "memoryScope": "group-only",
      "groups": {
        "120363423561902447@g.us": {
          "label": "thakkar-rasania-vault",
          "workspace": "~/Library/Mobile Documents/com~apple~CloudDocs/FamilyDocs",
          "accessControl": {
            "allowedPaths": ["~/Library/Mobile Documents/com~apple~CloudDocs/FamilyDocs/**"],
            "allowedSkills": ["family-docs"],
            "allowedTools": ["read", "write", "edit", "message"],
            "deniedTools": ["exec", "process", "browser", "canvas", "nodes", "subagents"]
          }
        }
      },
      "sharedFiles": ["SOUL.md", "USER.md", "TOOLS.md"]
    }
  }
}
```

**Result:**

- Only family documents accessible (no other paths)
- Only family-docs skill loaded
- Only read/write/edit/message tools available
- No shell commands, no browser, no device control
- Maximum security for sensitive documents

---

### Example 6: Team Coordination with Light Restrictions

**Scenario:** Internal team coordination with minimal restrictions.

```json
{
  "session": {
    "groupIsolation": {
      "mode": "isolated",
      "memoryScope": "group+main",
      "groups": {
        "thousand-sunny@g.us": {
          "label": "thousand-sunny",
          "accessControl": {
            "deniedPaths": ["~/Library/Mobile Documents/com~apple~CloudDocs/FamilyDocs/**"],
            "deniedTools": []
          }
        }
      },
      "sharedFiles": ["SOUL.md", "USER.md", "TOOLS.md", "IDENTITY.md"]
    }
  }
}
```

**Result:**

- Team can access almost everything
- Only family documents excluded
- All tools available

---

## Validation Rules

The configuration is validated at gateway startup. Invalid config will prevent startup.

### Required Validations

| Rule                                                             | Error Message                                                       |
| ---------------------------------------------------------------- | ------------------------------------------------------------------- |
| `mode` must be `"shared"` or `"isolated"`                        | `Invalid mode: must be "shared" or "isolated"`                      |
| `memoryScope` must be `"group-only"`, `"group+main"`, or `"all"` | `Invalid memoryScope: must be "group-only", "group+main", or "all"` |
| `groups` keys must be valid group JIDs (contain `@`)             | `Invalid group JID: {key}`                                          |
| `label` must be filesystem-safe                                  | `Invalid label: {label} contains invalid characters`                |
| `workspace` path must be absolute or start with `~`              | `Invalid workspace path: {path}`                                    |
| `sharedFiles` must be array of strings                           | `sharedFiles must be an array of strings`                           |

### Example Validation Errors

```bash
# Invalid mode
Error: Invalid session.groupIsolation.mode: "partial" (must be "shared" or "isolated")

# Invalid group JID
Error: Invalid group JID in session.groupIsolation.groups: "my-group" (must contain @)

# Invalid label
Error: Invalid label in session.groupIsolation.groups["120@g.us"]: "../escape" (contains ..)
```

---

## Environment Variables

No environment variables directly affect `session.groupIsolation`. Standard OpenClaw environment variables apply:

| Variable                  | Effect on Group Isolation                      |
| ------------------------- | ---------------------------------------------- |
| `OPENCLAW_STATE_DIR`      | Changes base directory for `workspace-groups/` |
| `DEBUG=openclaw:agents:*` | Enables workspace resolution logging           |
| `DEBUG=openclaw:memory:*` | Enables memory scope filtering logs            |

**Debug logging:**

```bash
# See workspace resolution
DEBUG=openclaw:agents:workspace openclaw gateway restart

# See memory scope filtering
DEBUG=openclaw:memory:scope openclaw gateway restart
```

---

## Backward Compatibility

### Breaking Changes

**None.** The default `mode: "shared"` maintains existing behavior.

### Deprecation Warnings

**None.** This is a new feature with no deprecated fields.

### Migration Path

Existing setups require no changes. To opt in:

1. Add `session.groupIsolation` to `openclaw.json`
2. Set `mode: "isolated"`
3. Configure `groups` with JIDs and labels
4. Restart gateway

See [Migration Guide](../guides/migrating-to-group-isolation.md) for details.

---

## Related Configuration

### `session.keepRecent`

Controls transcript retention. Works independently of group isolation:

```json
{
  "session": {
    "keepRecent": 100, // Keep last 100 messages per session
    "groupIsolation": {
      /* ... */
    }
  }
}
```

**Interaction:** Each group session has its own `keepRecent` limit.

### `agents[].workspace`

Agent-level workspace override. Takes precedence over group isolation:

```json
{
  "agents": [
    {
      "id": "luffy",
      "workspace": "~/custom-workspace" // Overrides all group isolation
    }
  ],
  "session": {
    "groupIsolation": {
      /* ignored for luffy */
    }
  }
}
```

**Recommendation:** Use either agent-level workspace OR group isolation, not both.

---

## Performance Impact

### Disk Usage

- **Symlinked files:** Zero overhead (filesystem pointers)
- **Memory files:** ~1-10 MB per group (depends on usage)
- **Memory index:** ~1-5 MB per group workspace

**Estimate:** ~10-20 MB per isolated group workspace

### Memory (RAM)

- **Memory indexes:** Loaded on demand, not all at once
- **Additional overhead:** ~5-15 MB per active group session

### Search Performance

- **Faster:** Smaller indexes per group mean faster searches
- **No noticeable latency** for typical usage (<1000 memory files per group)

### Gateway Startup

- **Workspace creation:** ~10-50ms per group (one-time)
- **Symlink creation:** <1ms per file
- **Total startup overhead:** <100ms for typical setups

---

## Security Considerations

### Symlink Attacks

**Risk:** Malicious `workspace` path could symlink to sensitive locations.

**Mitigation:**

- Validate `workspace` paths (no `..` traversal)
- Restrict to user home directory or explicit whitelist
- Run gateway with least privilege

### Information Leakage

**Risk:** Incorrect `memoryScope` could leak context between groups.

**Mitigation:**

- Default to `"group-only"` (strictest)
- Validate at config load time
- Log all memory scope resolutions in debug mode

### Workspace Permissions

**Risk:** Group workspaces created with incorrect permissions.

**Mitigation:**

- Auto-create with `0700` permissions (user-only)
- Warn if workspace is world-readable
- Document recommended permissions

---

## See Also

- [Group Session Isolation Guide](../guides/group-session-isolation-guide.md) — Usage guide with access control section
- [Migration Guide: Enabling Isolation](../guides/migrating-to-group-isolation.md) — First-time setup
- [Migration Guide: Adding Access Control](../guides/migrating-to-group-access-control.md) — Adding restrictions to existing groups
- [Deployment Checklist](../deployment/group-access-control-deployment.md) — Production rollout
- [Session Management](./session-management-compaction.md) — Session lifecycle
- [Memory System](../../concepts/memory.md) — How memory indexing works

---

**Last Updated:** 2026-02-16  
**Status:** Beta (feature/group-session-isolation branch)
