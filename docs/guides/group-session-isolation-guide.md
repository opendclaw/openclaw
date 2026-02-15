# Group Session Isolation Guide

## What is Group Session Isolation?

Group Session Isolation is a feature that allows OpenClaw agents to maintain **separate workspaces and memory contexts** for different WhatsApp groups (or other group chats). This prevents context leakage between groups with different purposes.

### The Problem

By default, OpenClaw agents share a single workspace directory across all conversations. This means:

- **Memory files** (`memory/*.md`) are shared across all groups
- **Context searches** return results from all conversations
- **System prompts** inject the same workspace files everywhere

This can lead to:
- Client deliverables being mentioned in family chats
- Family documents surfacing in work contexts  
- Cross-group context contamination

### The Solution

With Group Session Isolation enabled, each enrolled group gets its own isolated workspace:

```
~/.openclaw/
├── workspace/                    # Main workspace (DMs + unenrolled groups)
│   └── memory/2026-02-15.md     # Main session notes
│
└── workspace-groups/             # Isolated group workspaces
    └── luffy/
        ├── preseed-client/       # Client work group
        │   ├── AGENTS.md        # Group-specific instructions
        │   └── memory/          # Client-only memories
        ├── family-vault/         # Family documents
        │   └── memory/          # Family-only memories
        └── thousand-sunny/       # Team coordination
            └── memory/          # Team-only memories
```

Each group's agent operates in its own sandbox with:
- **Isolated memory**: Memory searches only see that group's context
- **Group-specific instructions**: Custom `AGENTS.md` per group
- **Shared identity**: Core identity files (SOUL.md, USER.md, TOOLS.md) are symlinked

---

## When to Use Group Session Isolation

### ✅ Use Group Isolation When:

1. **Handling sensitive client work** in one group while discussing personal matters in others
2. **Managing family documents** separate from work contexts
3. **Running multiple projects** where cross-context leakage would be confusing or inappropriate
4. **Compliance requirements** mandate strict information barriers between contexts

### Examples:

| Group | Purpose | Why Isolate? |
|---|---|---|
| `Preseed X MethodLab X Thousand Sunny` | Client deliverables | Don't mention client IP in family chat |
| `Thakkar-Rasania Vault` | Family legal/financial docs | Don't surface in client/work contexts |
| `Nyra👧🏻 Krishay👦🏻` | Family fun | Keep jokes/photos out of work chat |
| `Thousand Sunny` | Team coordination | No isolation needed (main workspace OK) |

### ❌ Don't Use Isolation When:

- You want the agent to remember context across all groups
- All groups serve the same purpose/project
- You're OK with cross-group memory search

---

## Configuration

### Basic Setup

Add to your `openclaw.json`:

```json
{
  "session": {
    "groupIsolation": {
      "mode": "isolated",
      "groups": {
        "120363404078961545@g.us": {
          "label": "preseed-client"
        },
        "120363423561902447@g.us": {
          "label": "family-vault"
        }
      }
    }
  }
}
```

### Configuration Fields

| Field | Type | Description | Default |
|---|---|---|---|
| `mode` | `"shared"` \| `"isolated"` | Enable/disable isolation | `"shared"` |
| `groups` | `Record<groupJid, GroupConfig>` | Which groups to isolate | `{}` |
| `sharedFiles` | `string[]` | Files to symlink from main workspace | `["SOUL.md", "USER.md", "TOOLS.md"]` |
| `memoryScope` | `"group-only"` \| `"group+main"` \| `"all"` | Memory search scope | `"group-only"` |

### Group Configuration

Each group in the `groups` object can have:

```json
{
  "120363404078961545@g.us": {
    "label": "preseed-client",           // Human-friendly directory name
    "workspace": "~/custom/path/client"  // (Optional) Custom workspace path
  }
}
```

- **`label`**: Used as the directory name under `workspace-groups/{agentId}/{label}/`
- **`workspace`**: Override the automatic path with a custom location

---

## Memory Scope Options

The `memoryScope` setting controls which transcripts and memory files the agent can search:

### `group-only` (Recommended)

**Strictest isolation.** Only the current group's content is searchable.

- ✅ Transcripts: Current group only
- ✅ Memory files: Group workspace only
- 🚫 No access to main workspace or other groups

**Use when:** You need maximum separation (client work, sensitive docs)

```json
{
  "session": {
    "groupIsolation": {
      "mode": "isolated",
      "memoryScope": "group-only"
    }
  }
}
```

### `group+main`

**Moderate isolation.** Current group + main session (DMs) are searchable.

- ✅ Transcripts: Current group + `agent:{id}:main`
- ✅ Memory files: Group workspace + main workspace
- 🚫 No access to other groups

**Use when:** You want isolation between groups but still need personal context from DMs

```json
{
  "session": {
    "groupIsolation": {
      "mode": "isolated",
      "memoryScope": "group+main"
    }
  }
}
```

### `all`

**No memory isolation.** Agent searches all transcripts and workspaces.

- ✅ Transcripts: All groups + all sessions
- ✅ Memory files: All workspaces

**Use when:** You want workspace separation (different `AGENTS.md` per group) but shared memory

```json
{
  "session": {
    "groupIsolation": {
      "mode": "isolated",
      "memoryScope": "all"
    }
  }
}
```

---

## Real-World Example

### Scenario: Luffy's Multi-Context Setup

Luffy (agent) participates in 4 WhatsApp groups:

1. **Thousand Sunny** (crew coordination) → Shared workspace (not enrolled)
2. **Preseed X MethodLab** (client work) → Isolated
3. **Thakkar-Rasania Vault** (family docs) → Isolated
4. **Nyra👧🏻 Krishay👦🏻** (family fun) → Isolated

#### Configuration

```json
{
  "session": {
    "groupIsolation": {
      "mode": "isolated",
      "memoryScope": "group-only",
      "groups": {
        "120363404078961545@g.us": {
          "label": "preseed-client"
        },
        "120363423561902447@g.us": {
          "label": "thakkar-rasania-vault"
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

#### Workspace Layout

```
~/.openclaw/
├── workspace/                       # Main workspace
│   ├── SOUL.md, USER.md, TOOLS.md  # Shared identity
│   └── memory/
│       └── 2026-02-15.md           # DM + Thousand Sunny notes
│
└── workspace-groups/luffy/
    ├── preseed-client/
    │   ├── AGENTS.md               # "You are assisting with Phase 2 security..."
    │   ├── SOUL.md → symlink       # Points to main workspace/SOUL.md
    │   ├── USER.md → symlink
    │   ├── TOOLS.md → symlink
    │   └── memory/
    │       ├── 2026-02-15.md       # Client work only
    │       └── phase-2-progress.md # Client deliverables
    │
    ├── thakkar-rasania-vault/
    │   ├── AGENTS.md               # "You manage family legal/financial docs..."
    │   └── memory/
    │       ├── 2026-02-15.md       # Family docs only
    │       └── property-deeds.md
    │
    └── nyra-krishay/
        ├── AGENTS.md               # "You're helping with family fun..."
        └── memory/
            └── 2026-02-15.md       # Family fun only
```

#### Behavior

| Action | Group | Context Available |
|---|---|---|
| Search "Phase 2" | Preseed client | ✅ Client memories only |
| Search "Phase 2" | Family vault | 🚫 No results (isolated) |
| Ask about family | Preseed client | 🚫 No family docs visible |
| Ask about client | Family vault | 🚫 No client docs visible |

---

## Shared Files Explained

The `sharedFiles` array specifies which files from the main workspace should be **symlinked** into each group workspace.

### Default Shared Files

```json
{
  "sharedFiles": ["SOUL.md", "USER.md", "TOOLS.md"]
}
```

These files define **consistent identity** across all groups:
- `SOUL.md`: Agent personality and core instructions
- `USER.md`: Information about the user
- `TOOLS.md`: Tool configuration and preferences

### Group-Specific Files

These files are **NOT** shared (each group gets its own):
- `AGENTS.md`: Group-specific behavior instructions
- `memory/*.md`: All memory files (this is the isolation boundary)
- `HEARTBEAT.md`: Group-specific heartbeat behavior
- `BOOTSTRAP.md`: Group-specific onboarding

### Customizing Shared Files

You can add more shared files:

```json
{
  "sharedFiles": ["SOUL.md", "USER.md", "TOOLS.md", "IDENTITY.md", "CUSTOM.md"]
}
```

Or minimize sharing (maximum isolation):

```json
{
  "sharedFiles": ["SOUL.md"]  // Only core identity is shared
}
```

---

## Troubleshooting

### Problem: Agent can't find memories from other groups

**Symptom:** You ask about something discussed in Group A while in Group B, and the agent says it doesn't remember.

**Cause:** `memoryScope: "group-only"` is active (working as designed).

**Solutions:**
1. **Accept the isolation** (this is the feature working correctly)
2. **Switch to `memoryScope: "group+main"`** if you need DM context everywhere
3. **Manually copy shared context** to a shared file in `sharedFiles`

### Problem: Group workspace not created

**Symptom:** Messages to the group don't create the isolated workspace directory.

**Diagnosis:**
```bash
# Check if group is enrolled
cd ~/Developer/openclaw
grep -A 5 'groupIsolation' openclaw.json

# Check session key
tail -20 ~/.openclaw/agents/{agentId}/sessions/sessions.json
```

**Fix:**
1. Verify the group JID in `openclaw.json` matches the session key
2. Restart the gateway: `openclaw gateway restart`
3. Send a test message to the group

### Problem: Memory search returns unexpected results

**Symptom:** Memories from other groups appear despite isolation.

**Diagnosis:**
```bash
# Check memory scope setting
cd ~/Developer/openclaw
grep memoryScope openclaw.json

# Check which workspace is active
openclaw status  # (if supported)
```

**Fix:**
1. Ensure `memoryScope: "group-only"` is set
2. Clear memory cache: `rm -rf ~/.openclaw/cache/memory-index*`
3. Restart gateway

### Problem: Shared files not appearing

**Symptom:** `SOUL.md` or other shared files are missing in group workspace.

**Diagnosis:**
```bash
# Check symlinks
ls -la ~/.openclaw/workspace-groups/{agentId}/{label}/
```

**Fix:**
1. Delete the group workspace directory
2. Restart gateway (it will recreate with symlinks)
3. Or manually create symlinks:
   ```bash
   cd ~/.openclaw/workspace-groups/{agentId}/{label}/
   ln -s ../../workspace/SOUL.md SOUL.md
   ```

### Problem: Wrong group JID in config

**Symptom:** Isolation not working for a specific group.

**How to find the correct group JID:**

```bash
# Method 1: Check sessions.json
cat ~/.openclaw/agents/{agentId}/sessions/sessions.json | jq '.sessions | keys'

# Method 2: Check recent transcripts
ls -lt ~/.openclaw/agents/{agentId}/sessions/*.jsonl | head -5
# Then open the file and look for "peer" fields

# Method 3: Enable debug logging
# Set env: DEBUG=openclaw:routing:*
# Send a message to the group and check logs
```

The group JID looks like: `120363404078961545@g.us`

---

## Best Practices

### 1. **Use descriptive labels**

```json
// ✅ Good
{ "label": "preseed-client-phase2" }

// ❌ Bad
{ "label": "group1" }
```

### 2. **Document group purposes in AGENTS.md**

Each group workspace should have a clear `AGENTS.md`:

```markdown
# AGENTS.md (preseed-client workspace)

## Context
You are in the **Preseed X MethodLab** client group.

## Constraints
- NEVER discuss family matters
- NEVER mention personal finances
- Focus on Phase 2 security deliverables

## Participants
- Chintan (client)
- Luffy (you, technical lead)
```

### 3. **Start with `group-only` scope**

Begin with strictest isolation and relax if needed:

```json
{ "memoryScope": "group-only" }  // Start here
```

### 4. **Test isolation before sensitive use**

```bash
# In Group A, create a memory
echo "# Client Secret\nProject Nightingale is classified." > \
  ~/.openclaw/workspace-groups/luffy/client/memory/secret.md

# In Group B, ask the agent
"What do you know about Project Nightingale?"

# Expected: "I don't have any information about that."
```

### 5. **Keep shared files minimal**

Only symlink truly universal files:

```json
{
  "sharedFiles": ["SOUL.md", "USER.md", "TOOLS.md"]  // Core identity only
}
```

### 6. **Use version control per group**

```bash
cd ~/.openclaw/workspace-groups/luffy/preseed-client
git init
git add .
git commit -m "Initial client workspace"
```

---

## Migration from Shared Workspace

See [Migration Guide](./migrating-to-group-isolation.md) for detailed steps.

**Quick start:**

1. **Backup current workspace**
   ```bash
   cp -r ~/.openclaw/workspace ~/.openclaw/workspace-backup-$(date +%Y%m%d)
   ```

2. **Enable isolation**
   ```json
   {
     "session": {
       "groupIsolation": {
         "mode": "isolated",
         "groups": { /* your groups */ }
       }
     }
   }
   ```

3. **Restart gateway**
   ```bash
   openclaw gateway restart
   ```

4. **Verify isolation**
   - Send test messages to each group
   - Check that separate workspaces are created
   - Test memory searches

---

## FAQ

### Can I mix isolated and shared groups?

**Yes.** Only groups listed in `groups` get isolated workspaces. Unlisted groups use the main workspace.

```json
{
  "groups": {
    "123@g.us": { "label": "isolated-group" }
    // 456@g.us not listed → uses main workspace
  }
}
```

### Does this affect session keys or transcripts?

**No.** Session keys and transcript files were already isolated per-group before this feature. This feature only isolates **workspaces** and **memory search scope**.

### Can I change `memoryScope` without restarting?

**No.** Configuration changes require a gateway restart:

```bash
openclaw gateway restart
```

### What happens to existing memories when I enable isolation?

**They stay in the main workspace.** New memories go to group workspaces. To migrate existing memories, see the [Migration Guide](./migrating-to-group-isolation.md).

### Can I share a single memory file across groups?

**Yes.** Add it to `sharedFiles`:

```json
{
  "sharedFiles": ["SOUL.md", "memory/shared-knowledge.md"]
}
```

The file will be symlinked from the main workspace.

### Does this work for Discord/Slack/Telegram?

**Currently WhatsApp only.** The underlying architecture supports multi-channel isolation, but implementation is pending for other platforms.

---

## See Also

- [Migration Guide](./migrating-to-group-isolation.md) — How to enable isolation for existing setups
- [Configuration Reference](../reference/config-session.md) — Full `session.groupIsolation` schema
- [Technical Spec](../../workspace/docs/specs/group-session-isolation-spec.md) — Implementation details

---

**Last Updated:** 2026-02-15  
**Status:** Beta (feature/group-session-isolation branch)
