# Migration Guide: Adding Access Control to Existing Groups

This guide walks you through adding Access Control restrictions to groups that already have Session Isolation enabled.

---

## Overview

**What changes:**

- File system boundaries are enforced (read/write/edit restricted)
- Tool availability is restricted per-group
- Skill loading is filtered per-group
- Email routing can be configured per-group

**What stays the same:**

- Workspace isolation (already configured)
- Memory scope (already configured)
- Shared files (already symlinked)
- Session keys and transcripts

**Risks:**

- **Medium risk.** Access control can break existing workflows if too restrictive
- File operations that worked before may now be denied
- Tools that were available may become unavailable
- Subtle behavior changes require testing

---

## When to Add Access Control

### ✅ Add Access Control When:

1. **Compliance requires it** — Information barriers mandated for client work
2. **Security concerns exist** — Sensitive data must be protected from accidental exposure
3. **Multi-tenant scenarios** — Different groups need strictly isolated resources
4. **Accidental misuse prevention** — Prevent shell commands in family contexts

### ❌ Don't Add Access Control When:

- Groups are trusted and don't handle sensitive data
- You need maximum flexibility for the agent
- The overhead of testing restrictions isn't worth the security benefit
- You're actively debugging issues (wait until stable)

---

## Step-by-Step Migration

### Step 1: Audit Current Group Usage

Before adding restrictions, understand what each group currently does:

```bash
# Check recent transcripts for each group
ls -lt ~/.openclaw/agents/luffy/sessions/*.jsonl | head -20

# Look for tool usage patterns
grep -h "tool_calls" ~/.openclaw/agents/luffy/sessions/agent:luffy:whatsapp:group:120363*.jsonl | \
  jq -r '.[].name' | sort | uniq -c | sort -rn
```

**Document for each group:**

- Which files/directories are accessed?
- Which tools are used?
- Which skills are loaded?
- Any special requirements?

### Step 2: Determine Appropriate Boundaries

Different group types need different restriction levels:

#### High-Security Groups (Vault, Legal, Financial)

**Characteristics:**

- Contains sensitive documents
- Should never access external systems
- No shell commands
- Limited tool set

**Recommended restrictions:**

```json
{
  "accessControl": {
    "allowedPaths": ["~/path/to/sensitive/docs/**"],
    "allowedSkills": ["relevant-skill-only"],
    "allowedTools": ["read", "write", "edit", "message"],
    "deniedTools": ["exec", "process", "browser", "canvas", "nodes", "subagents"]
  }
}
```

#### Client Work Groups

**Characteristics:**

- Contains client deliverables
- May need web research
- May need shell commands for development
- Exclude personal/family paths

**Recommended restrictions:**

```json
{
  "accessControl": {
    "allowedPaths": ["~/Developer/client-name/**", "~/Documents/clients/client-name/**"],
    "deniedPaths": ["~/Developer/client-name/.env*", "~/Developer/client-name/secrets/**"],
    "allowedSkills": ["client-work", "project-management"],
    "allowedTools": ["read", "write", "edit", "exec", "process", "web_search", "web_fetch"]
  }
}
```

#### Family Fun Groups

**Characteristics:**

- Casual, non-sensitive
- May need entertainment features
- No access to work/client paths
- Light restrictions only

**Recommended restrictions:**

```json
{
  "accessControl": {
    "deniedPaths": ["~/Developer/**", "~/Documents/clients/**"],
    "allowedSkills": ["games", "entertainment"],
    "deniedTools": ["exec", "process"]
  }
}
```

#### Team Coordination Groups

**Characteristics:**

- Internal team use
- May need full access
- Minimal restrictions

**Recommended restrictions:**

```json
{
  "accessControl": {
    // Optional: minimal or no restrictions
    "deniedTools": [] // or omit entirely
  }
}
```

### Step 3: Create the Configuration

Edit `openclaw.json` and add `accessControl` to each group:

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
          "label": "thakkar-rasania-vault",
          "accessControl": {
            "allowedPaths": ["~/Library/Mobile Documents/com~apple~CloudDocs/FamilyDocs/**"],
            "allowedSkills": ["family-docs"],
            "allowedTools": ["read", "write", "edit", "message", "web_search"],
            "deniedTools": ["exec", "process", "browser", "canvas", "nodes", "subagents"]
          }
        }
      }
    }
  }
}
```

### Step 4: Validate Configuration

```bash
# Check JSON syntax
cd ~/Developer/openclaw
node -e "JSON.parse(require('fs').readFileSync('openclaw.json', 'utf8')); console.log('✓ Valid JSON')"

# Check access control schema (if validation script exists)
# node -e "require('./dist/config/validate-access-control.js')"
```

### Step 5: Test in Staging (Recommended)

Before applying to production:

1. **Create a test group** with access control
2. **Send test messages** that exercise each restriction
3. **Verify denied operations** return appropriate errors
4. **Verify allowed operations** work as expected

### Step 6: Apply Configuration

```bash
openclaw gateway restart
```

### Step 7: Verify Per-Group

For each group with access control:

```bash
# In the group, test:
"Read a file in the allowed directory"     # Should work
"Read a file outside allowed directory"    # Should be denied
"Run a shell command"                      # Depends on tool policy
"What tools do you have?"                  # Should list only allowed tools
"What skills do you have?"                 # Should list only allowed skills
```

---

## Common Patterns

### Pattern 1: Client Isolation

**Scenario:** Client work must be completely isolated from personal/family contexts.

```json
{
  "label": "acme-corp",
  "workspace": "~/Developer/acme",
  "accessControl": {
    "allowedPaths": ["~/Developer/acme/**", "~/Documents/clients/acme/**"],
    "deniedPaths": ["~/Developer/acme/.env", "~/Developer/acme/secrets/**"],
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
    ],
    "deniedTools": ["browser", "canvas", "nodes"]
  }
}
```

### Pattern 2: Family Vault

**Scenario:** Sensitive family documents with maximum security.

```json
{
  "label": "family-vault",
  "workspace": "~/Library/Mobile Documents/com~apple~CloudDocs/FamilyDocs",
  "accessControl": {
    "allowedPaths": ["~/Library/Mobile Documents/com~apple~CloudDocs/FamilyDocs/**"],
    "allowedSkills": ["family-docs"],
    "allowedTools": ["read", "write", "edit", "message"],
    "deniedTools": ["exec", "process", "browser", "canvas", "nodes", "subagents"]
  }
}
```

**Why this matters:**

- No `exec` → Cannot run shell commands (prevents accidental or malicious file access)
- Limited tools → Reduces attack surface
- Single skill → Agent focused on family documents

### Pattern 3: Crew Coordination

**Scenario:** Team coordination with full access.

```json
{
  "label": "thousand-sunny",
  "accessControl": {
    // Minimal restrictions for trusted team
    "deniedTools": [] // or omit accessControl entirely
  }
}
```

### Pattern 4: Child-Safe Environment

**Scenario:** Group with kids, need safe guardrails.

```json
{
  "label": "nyra-krishay",
  "accessControl": {
    "deniedPaths": ["~/Developer/**", "~/Documents/**", "~/.openclaw/**"],
    "allowedSkills": ["games", "stories", "fun-facts"],
    "allowedTools": ["read", "write", "message", "web_search", "web_fetch", "tts"],
    "deniedTools": ["exec", "process", "browser", "nodes", "subagents"]
  }
}
```

---

## Testing Checklist

Before considering the migration complete, verify each group:

### File Boundary Tests

- [ ] **Allowed path read:** Agent can read files in `allowedPaths`
- [ ] **Allowed path write:** Agent can write files in `allowedPaths`
- [ ] **Denied path read:** Agent is blocked from reading `deniedPaths`
- [ ] **Outside path read:** Agent is blocked from paths not in `allowedPaths`
- [ ] **Traversal attempt:** Agent is blocked from `../` escape attempts
- [ ] **Symlink escape:** Agent is blocked from symlink traversal

### Tool Restriction Tests

- [ ] **Allowed tool use:** Allowed tools work correctly
- [ ] **Denied tool use:** Denied tools return appropriate error
- [ ] **Tool not in list:** Tools not in `allowedTools` are unavailable
- [ ] **Exec blocked (if denied):** Shell commands are blocked
- [ ] **Subagent inheritance:** Spawned subagents inherit restrictions

### Skill Restriction Tests

- [ ] **Allowed skill loaded:** Allowed skills appear in agent context
- [ ] **Denied skill excluded:** Denied skills don't appear
- [ ] **Skill not in list:** Skills not in `allowedSkills` don't appear

### Integration Tests

- [ ] **Memory isolation still works:** Memory searches are scoped correctly
- [ ] **Workspace isolation still works:** Group uses correct workspace
- [ ] **Shared files accessible:** Symlinked files work
- [ ] **Transcripts unaffected:** Session tracking works
- [ ] **Non-group sessions OK:** DMs and unenrolled groups unaffected

---

## Rollback Procedure

If access control causes issues:

### Quick Rollback (Disable Access Control)

Remove the `accessControl` block from problematic groups:

```json
{
  "groups": {
    "120363423561902447@g.us": {
      "label": "thakkar-rasania-vault"
      // accessControl removed → all restrictions lifted
    }
  }
}
```

```bash
openclaw gateway restart
```

### Gradual Rollback (Relax Restrictions)

Keep some restrictions but relax problematic ones:

```json
{
  "accessControl": {
    // Keep path restrictions
    "allowedPaths": ["~/path/**"]
    // Remove tool restrictions temporarily
    // "allowedTools": [...]  // Commented out
  }
}
```

### Full Rollback (Disable Isolation)

If needed, disable group isolation entirely:

```json
{
  "session": {
    "groupIsolation": {
      "mode": "shared"
    }
  }
}
```

---

## Common Issues & Fixes

### Issue: Agent can't access files it used to access

**Symptom:** File operations that worked before now fail with "path not allowed" errors.

**Diagnosis:**

- Check if the path is in `allowedPaths`
- Check if the path matches a `deniedPaths` pattern
- Verify the path is correctly expanded (`~` → home directory)

**Fix:**

```json
{
  "accessControl": {
    "allowedPaths": [
      "~/path/to/workspace/**", // Add missing path
      "~/another/path/**" // Or expand allowed paths
    ]
  }
}
```

### Issue: Tool suddenly unavailable

**Symptom:** Agent says "Tool X is not available" when it was before.

**Diagnosis:**

- Check if tool is in `allowedTools`
- Check if tool is in `deniedTools`
- Verify tool name spelling (case-sensitive)

**Fix:**

```json
{
  "accessControl": {
    "allowedTools": ["read", "write", "edit", "exec", "missing-tool"]
  }
}
```

### Issue: Skill not loaded

**Symptom:** Agent doesn't have access to expected skills.

**Diagnosis:**

- Check if skill is in `allowedSkills`
- Check if skill is in `deniedSkills`
- Verify skill name matches skill directory name

**Fix:**

```json
{
  "accessControl": {
    "allowedSkills": ["existing-skill", "missing-skill"]
  }
}
```

### Issue: Subagent can't access files

**Symptom:** Subagent spawned from group session fails with access denied.

**Cause:** Subagents inherit group access control.

**Fix:** This is correct behavior. If subagent needs more access, spawn from a less restricted session.

### Issue: Path patterns not matching

**Symptom:** Paths that should match `allowedPaths` are denied.

**Common mistakes:**

- `~/path` instead of `~/path/**` (missing recursive wildcard)
- Relative paths instead of absolute
- Wrong home directory expansion

**Fix:**

```json
{
  "allowedPaths": [
    // ✅ Correct
    "~/Documents/family/**",
    "/Users/username/Documents/family/**"

    // ❌ Wrong
    // "~/Documents/family",      // Missing /**
    // "Documents/family/**",     // Relative path
    // "~username/Documents/**"   // Wrong ~ expansion
  ]
}
```

---

## Performance Impact

Access control adds minimal overhead:

| Operation                          | Overhead |
| ---------------------------------- | -------- |
| Path check (per file operation)    | ~1-5ms   |
| Tool filtering (at session start)  | ~1-10ms  |
| Skill filtering (at session start) | ~1-10ms  |
| Total latency per message          | <50ms    |

**Negligible impact** on typical usage.

---

## Security Checklist

After migration, verify security properties:

- [ ] **Path isolation:** Groups cannot access each other's files
- [ ] **Tool isolation:** Groups cannot use denied tools
- [ ] **Skill isolation:** Groups cannot use denied skills
- [ ] **No exec escape:** Shell commands cannot bypass path guards
- [ ] **Symlink safety:** Symlink traversal is blocked
- [ ] **Subagent inheritance:** Restrictions propagate to child agents
- [ ] **Non-group unaffected:** DMs and unenrolled groups work normally

---

## Next Steps

After successful migration:

1. **Document per-group access policies** in each workspace's `AGENTS.md`
2. **Create runbooks** for common operations within restrictions
3. **Monitor logs** for denied operations (may indicate config issues)
4. **Periodically review** restrictions as group purposes evolve

---

## See Also

- [Group Session Isolation Guide](./group-session-isolation-guide.md) — Full feature documentation
- [Configuration Reference](../reference/config-session-groupisolation.md) — Complete schema
- [Deployment Checklist](../deployment/group-access-control-deployment.md) — Production rollout guide

---

**Last Updated:** 2026-02-16  
**Status:** Beta (feature/group-session-isolation branch)
