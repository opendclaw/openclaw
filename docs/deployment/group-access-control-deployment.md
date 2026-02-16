# Deployment Checklist: Group Access Control

**Feature:** Group Session Isolation with Access Control  
**Branch:** `feature/group-session-isolation`  
**Status:** Beta

---

## Overview

This checklist guides you through deploying Group Access Control to production. Access Control adds fine-grained restrictions on file system access, tool availability, and skill loading per group.

**Risk Level:** Medium  
**Rollback Time:** < 5 minutes  
**Testing Time:** 30-60 minutes

---

## Pre-Deployment Verification

### 1. Code Verification

- [ ] Branch is up to date with main

  ```bash
  cd ~/Developer/openclaw
  git fetch origin
  git log origin/main..feature/group-session-isolation --oneline
  ```

- [ ] All tests pass

  ```bash
  npm test
  npm run test:e2e  # If available
  ```

- [ ] TypeScript compiles without errors

  ```bash
  npm run build
  ```

- [ ] No linting errors
  ```bash
  npm run lint
  ```

### 2. Configuration Validation

- [ ] Identify all groups that need access control

  ```bash
  cat ~/.openclaw/agents/luffy/sessions/sessions.json | \
    jq '.sessions | keys | map(select(contains("@g.us")))'
  ```

- [ ] Document current group purposes and access patterns
  - Which files does each group access?
  - Which tools does each group use?
  - Which skills does each group need?

- [ ] Create `accessControl` configuration for each group
  - Start with permissive settings
  - Add restrictions incrementally

- [ ] Validate JSON syntax
  ```bash
  node -e "JSON.parse(require('fs').readFileSync('openclaw.json', 'utf8')); console.log('✓ Valid JSON')"
  ```

### 3. Staging Test (Recommended)

- [ ] Create test configuration in staging environment
- [ ] Send test messages exercising each restriction
- [ ] Verify allowed operations work
- [ ] Verify denied operations are blocked
- [ ] Check logs for unexpected errors

---

## Deployment Steps

### Step 1: Backup Current State

```bash
# Backup configuration
cp ~/Developer/openclaw/openclaw.json ~/Developer/openclaw/openclaw.json.backup-$(date +%Y%m%d-%H%M%S)

# Backup workspaces
tar -czf ~/backups/workspaces-pre-access-control-$(date +%Y%m%d).tar.gz \
  ~/.openclaw/workspace \
  ~/.openclaw/workspace-groups

# Export current sessions (optional)
cp ~/.openclaw/agents/luffy/sessions/sessions.json \
   ~/.openclaw/agents/luffy/sessions/sessions.json.backup-$(date +%Y%m%d)
```

### Step 2: Merge Branch (if not already merged)

```bash
cd ~/Developer/openclaw
git checkout main
git merge feature/group-session-isolation
```

### Step 3: Update Configuration

Edit `openclaw.json` to add `accessControl` to each group:

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
            "allowedPaths": ["~/Developer/preseed/**"],
            "allowedSkills": ["client-work"],
            "allowedTools": ["read", "write", "edit", "exec", "process", "web_search"]
          }
        },
        "120363423561902447@g.us": {
          "label": "thakkar-rasania-vault",
          "accessControl": {
            "allowedPaths": ["~/Library/Mobile Documents/com~apple~CloudDocs/FamilyDocs/**"],
            "allowedSkills": ["family-docs"],
            "allowedTools": ["read", "write", "edit", "message"],
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
node -e "JSON.parse(require('fs').readFileSync('openclaw.json', 'utf8')); console.log('✓ Valid JSON')"

# Check TypeScript compiles
npm run build
```

### Step 5: Restart Gateway

```bash
openclaw gateway restart
```

### Step 6: Verify Startup

```bash
# Check gateway is running
openclaw gateway status

# Check logs for errors
tail -50 ~/.openclaw/logs/gateway.log

# Look for access control initialization
grep -i "accessControl\|group.*policy" ~/.openclaw/logs/gateway.log
```

---

## Post-Deployment Testing

### Test Plan

For EACH group with access control, test:

#### File Boundary Tests

| Test                 | Command                                  | Expected Result  |
| -------------------- | ---------------------------------------- | ---------------- |
| Read allowed path    | "Read ~/allowed-path/file.md"            | ✅ Success       |
| Read denied path     | "Read ~/denied-path/file.md"             | 🚫 Access denied |
| Read outside allowed | "Read ~/other-path/file.md"              | 🚫 Access denied |
| Write allowed path   | "Write 'test' to ~/allowed-path/test.md" | ✅ Success       |
| Write denied path    | "Write 'test' to ~/denied-path/test.md"  | 🚫 Access denied |

#### Tool Restriction Tests

| Test                 | Command                                        | Expected Result           |
| -------------------- | ---------------------------------------------- | ------------------------- |
| Use allowed tool     | "Search the web for X" (if web_search allowed) | ✅ Success                |
| Use denied tool      | "Run command ls -la" (if exec denied)          | 🚫 Tool not available     |
| List available tools | "What tools do you have?"                      | Only allowed tools listed |

#### Skill Restriction Tests

| Test                  | Command                    | Expected Result     |
| --------------------- | -------------------------- | ------------------- |
| Allowed skill context | "What skills do you have?" | Only allowed skills |
| Skill functionality   | Use skill-specific feature | Works as expected   |

#### Integration Tests

| Test                    | Expected Result              |
| ----------------------- | ---------------------------- |
| Memory search scoped    | Only group memories returned |
| Workspace correct       | Files in correct directory   |
| Shared files accessible | SOUL.md, USER.md readable    |
| Non-group sessions OK   | DMs work normally            |

### Test Execution Script

```bash
#!/bin/bash
# save as test-access-control.sh

AGENT="luffy"
LOG_FILE="access-control-test-$(date +%Y%m%d-%H%M%S).log"

echo "=== Access Control Test Suite ===" | tee -a $LOG_FILE
echo "Time: $(date)" | tee -a $LOG_FILE
echo | tee -a $LOG_FILE

# Test 1: Check gateway status
echo "1. Gateway Status:" | tee -a $LOG_FILE
openclaw gateway status | tee -a $LOG_FILE
echo | tee -a $LOG_FILE

# Test 2: Check configuration loaded
echo "2. Configuration Check:" | tee -a $LOG_FILE
grep -A 5 "accessControl" ~/Developer/openclaw/openclaw.json | tee -a $LOG_FILE
echo | tee -a $LOG_FILE

# Test 3: Check workspace directories
echo "3. Workspace Directories:" | tee -a $LOG_FILE
ls -la ~/.openclaw/workspace-groups/$AGENT/ | tee -a $LOG_FILE
echo | tee -a $LOG_FILE

# Test 4: Check recent logs for errors
echo "4. Recent Errors:" | tee -a $LOG_FILE
grep -i "error\|denied" ~/.openclaw/logs/gateway.log | tail -20 | tee -a $LOG_FILE
echo | tee -a $LOG_FILE

echo "=== Test Complete ===" | tee -a $LOG_FILE
echo "Full log saved to: $LOG_FILE"
```

Run with:

```bash
chmod +x test-access-control.sh
./test-access-control.sh
```

---

## Rollback Procedure

### Quick Rollback (Remove Access Control)

If access control causes immediate issues:

1. **Remove accessControl blocks:**

   ```bash
   cd ~/Developer/openclaw
   # Edit openclaw.json to remove accessControl from all groups
   # Or restore from backup:
   cp openclaw.json.backup-TIMESTAMP openclaw.json
   ```

2. **Restart gateway:**

   ```bash
   openclaw gateway restart
   ```

3. **Verify rollback:**
   ```bash
   # Send test message to affected group
   # Should work without restrictions
   ```

**Rollback time:** < 2 minutes

### Full Rollback (Revert Branch)

If more serious issues:

1. **Revert to main branch:**

   ```bash
   cd ~/Developer/openclaw
   git checkout main
   npm run build
   ```

2. **Restore configuration:**

   ```bash
   cp openclaw.json.backup-TIMESTAMP openclaw.json
   ```

3. **Restart gateway:**
   ```bash
   openclaw gateway restart
   ```

**Rollback time:** < 5 minutes

---

## Post-Deployment Monitoring

### Immediate (First 24 Hours)

- [ ] **Monitor logs for access denials**

  ```bash
  tail -f ~/.openclaw/logs/gateway.log | grep -i "denied\|not allowed"
  ```

- [ ] **Check for unexpected errors**

  ```bash
  grep -i "error" ~/.openclaw/logs/gateway.log | tail -50
  ```

- [ ] **Verify group functionality**
  - Send test messages to each group
  - Verify responses are correct
  - Check that restrictions are applied

### Short-Term (First Week)

- [ ] **Track denied operations**
  - Are there patterns indicating config issues?
  - Are users reporting unexpected blocks?

- [ ] **Monitor performance**
  - Is there latency in path checks?
  - Are tool filtering calls slow?

- [ ] **Collect user feedback**
  - Are restrictions too tight?
  - Are restrictions too loose?

### Long-Term

- [ ] **Periodic access control audit**
  - Review allowed/denied lists quarterly
  - Update as group purposes evolve

- [ ] **Security review**
  - Verify no bypass mechanisms
  - Check subagent inheritance works

---

## Common Deployment Issues

### Issue: Gateway fails to start

**Symptom:** Gateway crashes or fails to start after config change.

**Diagnosis:**

```bash
# Check syntax
node -e "JSON.parse(require('fs').readFileSync('openclaw.json', 'utf8'))"

# Check logs
tail -100 ~/.openclaw/logs/gateway.log
```

**Fix:**

1. Restore backup configuration
2. Fix syntax errors
3. Restart gateway

### Issue: Access denied for legitimate operations

**Symptom:** Operations that should work are being denied.

**Diagnosis:**

```bash
# Check exact path being accessed
grep "denied" ~/.openclaw/logs/gateway.log

# Check if path matches allowedPaths pattern
# Test pattern matching manually
```

**Fix:**

1. Verify path pattern in `allowedPaths`
2. Add missing paths or use broader patterns
3. Restart gateway

### Issue: Tools unexpectedly unavailable

**Symptom:** Tools that should be available are missing.

**Diagnosis:**

- Check `allowedTools` list
- Check `deniedTools` list
- Check for typos in tool names

**Fix:**

1. Add missing tools to `allowedTools`
2. Remove from `deniedTools` if incorrectly listed
3. Restart gateway

### Issue: Memory search returns wrong results

**Symptom:** Memory searches cross group boundaries.

**Diagnosis:**

```bash
# Check memoryScope setting
grep memoryScope ~/Developer/openclaw/openclaw.json

# Clear memory cache
rm -rf ~/.openclaw/cache/memory-index*
```

**Fix:**

1. Ensure `memoryScope: "group-only"` is set
2. Clear memory cache
3. Restart gateway

---

## Configuration Best Practices

### Security

1. **Default to deny:** Use `allowedPaths`/`allowedTools` over `deniedPaths`/`deniedTools`
2. **Deny exec for high-security groups:** Shell commands can bypass file guards
3. **Principle of least privilege:** Grant only necessary access
4. **Regular audits:** Review access control configuration quarterly

### Maintainability

1. **Document per-group policies:** Add comments explaining each restriction
2. **Use descriptive labels:** `preseed-client-phase2` not `group1`
3. **Version control config:** Track changes to access control settings
4. **Test before production:** Always test in staging first

### Performance

1. **Minimize pattern count:** Use broader patterns when possible
2. **Avoid redundant checks:** Don't duplicate global policies
3. **Monitor latency:** Watch for slow path resolution

---

## Sign-Off

Before considering deployment complete:

- [ ] All tests pass
- [ ] Pre-deployment checklist complete
- [ ] Configuration validated
- [ ] Gateway restarted successfully
- [ ] Post-deployment tests pass for all groups
- [ ] Rollback procedure documented and tested
- [ ] Monitoring in place
- [ ] Team notified of changes

**Deployed By:** ******\_\_\_\_******  
**Date:** ******\_\_\_\_******  
**Configuration Version:** ******\_\_\_\_******

---

## See Also

- [Group Session Isolation Guide](../guides/group-session-isolation-guide.md) — Feature documentation
- [Configuration Reference](../reference/config-session-groupisolation.md) — Schema details
- [Migration Guide: Adding Access Control](../guides/migrating-to-group-access-control.md) — Step-by-step setup

---

**Last Updated:** 2026-02-16  
**Status:** Beta (feature/group-session-isolation branch)
