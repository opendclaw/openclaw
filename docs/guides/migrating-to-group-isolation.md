# Migration Guide: Enabling Group Session Isolation

This guide walks you through enabling Group Session Isolation for existing OpenClaw setups.

---

## Overview

**What changes:**
- Group sessions get dedicated workspace directories
- Memory searches become scoped per-group
- Each group can have custom `AGENTS.md` instructions

**What stays the same:**
- Session keys (already isolated per-group)
- Transcript files (already separate per-group)
- Core identity files (symlinked from main workspace)
- Main workspace behavior (for DMs and unenrolled groups)

**Risks:**
- **Low risk.** Default mode is `"shared"` — no changes unless you opt in
- Existing memories stay in main workspace (not automatically migrated)
- Group workspaces start empty (except symlinked files)

---

## Prerequisites

Before you begin:

1. **Backup your workspace:**
   ```bash
   cp -r ~/.openclaw/workspace ~/.openclaw/workspace-backup-$(date +%Y%m%d)
   ```

2. **Identify your group JIDs:**
   ```bash
   # Check sessions.json for group session keys
   cat ~/.openclaw/agents/$(whoami)/sessions/sessions.json | \
     jq '.sessions | keys | map(select(contains("@g.us")))'
   ```

   Output example:
   ```json
   [
     "agent:luffy:whatsapp:group:120363404078961545@g.us",
     "agent:luffy:whatsapp:group:120363423561902447@g.us"
   ]
   ```

   The group JID is the part after `:group:` (e.g., `120363404078961545@g.us`)

3. **Know your groups' purposes:**
   - Which groups handle sensitive client work?
   - Which groups are for family/personal use?
   - Which groups can share the main workspace?

---

## Step-by-Step Migration

### Step 1: Update Configuration

Edit `openclaw.json` in your project directory (`~/Developer/openclaw`):

```bash
cd ~/Developer/openclaw
nano openclaw.json  # or code openclaw.json
```

Add the `groupIsolation` section under `session`:

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
          "label": "family-vault"
        }
      },
      "sharedFiles": [
        "SOUL.md",
        "USER.md",
        "TOOLS.md",
        "IDENTITY.md"
      ]
    }
  }
}
```

**Tips:**
- Use descriptive `label` values (they become directory names)
- Only list groups you want isolated (unlisted groups use main workspace)
- Start with `"memoryScope": "group-only"` for maximum isolation

### Step 2: Validate Configuration

Before restarting, validate the JSON syntax:

```bash
cd ~/Developer/openclaw
node -e "JSON.parse(require('fs').readFileSync('openclaw.json', 'utf8')); console.log('✓ Valid JSON')"
```

If validation fails, fix syntax errors and try again.

### Step 3: Restart the Gateway

Apply the configuration:

```bash
openclaw gateway restart
```

Expected output:
```
Stopping gateway...
Starting gateway...
Gateway started (PID: 12345)
```

Check logs for errors:
```bash
tail -50 ~/.openclaw/logs/gateway.log
```

### Step 4: Trigger Workspace Creation

Send a test message to each enrolled group. This creates the isolated workspace:

**In WhatsApp:**
1. Open an enrolled group
2. Send: `@agent test isolation`
3. Agent should respond

**Behind the scenes:**
```bash
# Check that workspace was created
ls -la ~/.openclaw/workspace-groups/$(whoami)/
```

Expected output:
```
drwxr-xr-x  preseed-client/
drwxr-xr-x  family-vault/
```

### Step 5: Verify Symlinks

Check that shared files are symlinked correctly:

```bash
# Check preseed-client workspace
ls -la ~/.openclaw/workspace-groups/$(whoami)/preseed-client/

# Expected output:
# lrwxr-xr-x  SOUL.md -> ../../../workspace/SOUL.md
# lrwxr-xr-x  USER.md -> ../../../workspace/USER.md
# lrwxr-xr-x  TOOLS.md -> ../../../workspace/TOOLS.md
# drwxr-xr-x  memory/
```

Verify symlinks work:
```bash
cat ~/.openclaw/workspace-groups/$(whoami)/preseed-client/SOUL.md
# Should display content from main workspace/SOUL.md
```

### Step 6: Create Group-Specific Instructions

Each group workspace should have its own `AGENTS.md`:

**For client group:**
```bash
cat > ~/.openclaw/workspace-groups/$(whoami)/preseed-client/AGENTS.md << 'EOF'
# AGENTS.md

## Context
You are in the **Preseed X MethodLab** client group.

## Participants
- Chintan (client, technical founder)
- Luffy (you, technical lead)

## Focus
- Phase 2 security implementation
- Technical deliverables and architecture
- Professional communication

## Constraints
- NEVER discuss family matters
- NEVER mention personal finances
- Keep all discussions client-appropriate
- Maintain professional tone

## Memory
- All memories in this workspace are client work only
- No cross-contamination with other groups
EOF
```

**For family group:**
```bash
cat > ~/.openclaw/workspace-groups/$(whoami)/family-vault/AGENTS.md << 'EOF'
# AGENTS.md

## Context
You are in the **Thakkar-Rasania Vault** family group.

## Participants
- Family members only

## Focus
- Family documents (legal, financial)
- Property records
- Important family information

## Constraints
- NEVER discuss client work
- NEVER mention professional projects
- Keep all discussions family-appropriate
- Maintain confidentiality

## Memory
- All memories in this workspace are family-only
- No cross-contamination with work contexts
EOF
```

### Step 7: Test Memory Isolation

**Test 1: Create isolated memories**

In client group (via WhatsApp):
```
@agent Remember: Project Nightingale is our Q2 security initiative. Classified.
```

In family group:
```
@agent Remember: Property deed is in the blue folder, safe deposit box 42.
```

**Test 2: Verify isolation**

In client group:
```
@agent What do you know about property deeds?
```
Expected: *"I don't have any information about property deeds."*

In family group:
```
@agent What do you know about Project Nightingale?
```
Expected: *"I don't have any information about Project Nightingale."*

**Test 3: Verify workspace context**

In client group:
```
@agent What group are you in? What's your purpose here?
```
Expected: Agent should reference client group and Phase 2 work (from AGENTS.md)

### Step 8: Migrate Existing Memories (Optional)

If you have existing memories in the main workspace that belong to specific groups:

**Identify group-specific memories:**
```bash
ls ~/.openclaw/workspace/memory/
# Look for files like:
#   client-phase-2.md  → belongs to preseed-client
#   family-docs.md     → belongs to family-vault
```

**Move to group workspace:**
```bash
# For client memories
mv ~/.openclaw/workspace/memory/client-phase-2.md \
   ~/.openclaw/workspace-groups/$(whoami)/preseed-client/memory/

# For family memories
mv ~/.openclaw/workspace/memory/family-docs.md \
   ~/.openclaw/workspace-groups/$(whoami)/family-vault/memory/
```

**Or copy (safer):**
```bash
# Keep originals in main workspace as backup
cp ~/.openclaw/workspace/memory/client-phase-2.md \
   ~/.openclaw/workspace-groups/$(whoami)/preseed-client/memory/
```

**Restart to reindex:**
```bash
openclaw gateway restart
```

---

## Verification Checklist

After migration, verify:

- [ ] **Workspaces created**: `~/.openclaw/workspace-groups/{agentId}/` exists
- [ ] **Per-group directories**: One directory per enrolled group with correct labels
- [ ] **Symlinks work**: Shared files (SOUL.md, USER.md, etc.) are accessible
- [ ] **AGENTS.md present**: Each group workspace has custom `AGENTS.md`
- [ ] **Memory isolation**: Searches in Group A don't return Group B results
- [ ] **Agent responds**: Test messages in each group work correctly
- [ ] **Logs clean**: No errors in `~/.openclaw/logs/gateway.log`

**Quick verification script:**

```bash
#!/bin/bash
AGENT_ID=$(whoami)
WORKSPACE_DIR="$HOME/.openclaw/workspace-groups/$AGENT_ID"

echo "=== Group Workspace Verification ==="
echo

# Check workspace directory
if [ -d "$WORKSPACE_DIR" ]; then
  echo "✓ Workspace directory exists: $WORKSPACE_DIR"
else
  echo "✗ Workspace directory missing!"
  exit 1
fi

# Check each group
for group_dir in "$WORKSPACE_DIR"/*; do
  if [ -d "$group_dir" ]; then
    label=$(basename "$group_dir")
    echo
    echo "--- Group: $label ---"
    
    # Check AGENTS.md
    if [ -f "$group_dir/AGENTS.md" ]; then
      echo "  ✓ AGENTS.md exists"
    else
      echo "  ⚠ AGENTS.md missing (create one!)"
    fi
    
    # Check memory directory
    if [ -d "$group_dir/memory" ]; then
      echo "  ✓ memory/ directory exists"
    else
      echo "  ✗ memory/ directory missing!"
    fi
    
    # Check symlinks
    for file in SOUL.md USER.md TOOLS.md; do
      if [ -L "$group_dir/$file" ]; then
        if [ -e "$group_dir/$file" ]; then
          echo "  ✓ $file symlink OK"
        else
          echo "  ✗ $file symlink broken!"
        fi
      else
        echo "  ⚠ $file not symlinked"
      fi
    done
  fi
done

echo
echo "=== Verification Complete ==="
```

Save as `verify-isolation.sh`, run:
```bash
chmod +x verify-isolation.sh
./verify-isolation.sh
```

---

## Rollback Procedure

If you need to disable isolation and return to shared workspace:

### Option 1: Disable Isolation (Keep Workspaces)

```json
{
  "session": {
    "groupIsolation": {
      "mode": "shared"  // Change from "isolated" to "shared"
    }
  }
}
```

```bash
openclaw gateway restart
```

**Effect:**
- All groups use main workspace again
- Group workspaces remain on disk (not deleted)
- Can re-enable later without data loss

### Option 2: Full Removal

```json
{
  "session": {
    // Remove the entire groupIsolation section
  }
}
```

```bash
openclaw gateway restart
```

**Optional cleanup:**
```bash
# Backup group workspaces before deleting
tar -czf ~/group-workspaces-backup-$(date +%Y%m%d).tar.gz \
  ~/.openclaw/workspace-groups/

# Remove group workspaces
rm -rf ~/.openclaw/workspace-groups/
```

---

## Common Issues & Fixes

### Issue: Workspaces not created after restart

**Diagnosis:**
```bash
# Check config was loaded
grep -A 10 groupIsolation ~/Developer/openclaw/openclaw.json

# Check gateway logs
tail -100 ~/.openclaw/logs/gateway.log | grep -i isolation
```

**Fix:**
1. Verify group JIDs match exactly (including `@g.us`)
2. Ensure JSON syntax is valid
3. Restart gateway with logs visible:
   ```bash
   DEBUG=openclaw:* openclaw gateway restart
   ```

### Issue: Symlinks broken

**Diagnosis:**
```bash
ls -la ~/.openclaw/workspace-groups/$(whoami)/preseed-client/
# Look for red symlink names (broken)
```

**Fix:**
```bash
cd ~/.openclaw/workspace-groups/$(whoami)/preseed-client/
rm SOUL.md USER.md TOOLS.md  # Remove broken symlinks
ln -s ../../../workspace/SOUL.md SOUL.md
ln -s ../../../workspace/USER.md USER.md
ln -s ../../../workspace/TOOLS.md TOOLS.md
```

### Issue: Agent still sees memories from other groups

**Diagnosis:**
```bash
# Check memoryScope setting
grep memoryScope ~/Developer/openclaw/openclaw.json
```

**Fix:**
1. Ensure `"memoryScope": "group-only"` is set
2. Clear memory cache:
   ```bash
   rm -rf ~/.openclaw/cache/memory-index*
   ```
3. Restart gateway

### Issue: Wrong group workspace used

**Diagnosis:**
```bash
# Check which session keys exist
cat ~/.openclaw/agents/$(whoami)/sessions/sessions.json | \
  jq '.sessions | keys'

# Compare with config
grep -A 5 '"groups"' ~/Developer/openclaw/openclaw.json
```

**Fix:**
The group JID in config must EXACTLY match the session key. Double-check:
- Correct format: `120363404078961545@g.us` (not `120363404078961545`)
- No typos
- Correct agent ID in session key

---

## Performance Considerations

### Memory Index Size

Each group workspace maintains its own memory index:

```bash
# Check index sizes
du -sh ~/.openclaw/cache/memory-index*
```

**Impact:**
- Disk usage: ~1-10 MB per group (depends on memory file size)
- RAM usage: Minimal (indexes are loaded on demand)
- Search speed: Faster (smaller index per group)

### Transcript Storage

Transcript files were already isolated per-group, so no change.

### Symlink Performance

Symlinks have zero overhead (they're just filesystem pointers).

---

## Best Practices Post-Migration

### 1. Document each group workspace

Create a `README.md` in each group workspace:

```bash
cat > ~/.openclaw/workspace-groups/$(whoami)/preseed-client/README.md << 'EOF'
# Preseed Client Workspace

**Group:** Preseed X MethodLab X Thousand Sunny  
**Purpose:** Phase 2 security implementation  
**Participants:** Chintan, Luffy  

## Memory Structure
- `memory/phase-2-*.md` — Security deliverables
- `memory/meetings-*.md` — Client meeting notes
- `AGENTS.md` — Group-specific instructions

## Isolation
- memoryScope: group-only
- No access to family/personal contexts
EOF
```

### 2. Use version control per workspace

```bash
cd ~/.openclaw/workspace-groups/$(whoami)/preseed-client
git init
git add .
git commit -m "Initial client workspace setup"
```

### 3. Regular backups

```bash
# Add to crontab
0 2 * * * tar -czf ~/backups/workspaces-$(date +\%Y\%m\%d).tar.gz ~/.openclaw/workspace*
```

### 4. Monitor isolation effectiveness

Periodically test cross-group searches to ensure isolation holds:

```bash
# In Group A, search for a unique term from Group B
# Expected: No results

# If results leak, check:
# 1. memoryScope setting
# 2. Memory index cache (clear it)
# 3. Gateway logs for errors
```

---

## Next Steps

After successful migration:

1. **Customize `AGENTS.md`** for each group with specific instructions
2. **Organize memory files** within each group workspace
3. **Test edge cases** (subagent spawns, heartbeats, cron jobs)
4. **Monitor logs** for any unexpected behavior
5. **Document your setup** for other team members

---

## See Also

- [Group Session Isolation Guide](./group-session-isolation-guide.md) — Full feature documentation
- [Configuration Reference](../reference/config-session.md) — `session.groupIsolation` schema
- [Troubleshooting Guide](./group-session-isolation-guide.md#troubleshooting) — Common issues

---

**Last Updated:** 2026-02-15  
**Status:** Beta (feature/group-session-isolation branch)
