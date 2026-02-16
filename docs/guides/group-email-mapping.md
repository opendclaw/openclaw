# Group Email Account Mapping

**Feature:** Per-Group Access Control for Email  
**Status:** Planned (documentation for future implementation)  
**Related:** [Group Session Isolation Guide](./group-session-isolation-guide.md)

---

## Overview

Group Email Account Mapping extends OpenClaw's Group Session Isolation feature to provide **per-group email account routing**. When a message arrives in a specific group, email operations (send, read, search) are automatically scoped to that group's designated email account.

This enables scenarios like:

- **Client group** uses `work@company.com` for all email operations
- **Family group** uses `family@icloud.com` for personal communications
- **Project group** uses a dedicated project email address
- **Personal group** uses your primary personal email

---

## How GOG CLI Uses Accounts

GOG CLI (`gog`) is the underlying tool that handles Gmail/IMAP operations. It supports multiple accounts through two mechanisms:

### 1. `--account` Flag (Recommended)

The `--account` flag specifies which configured email account to use for a command:

```bash
# Send email from specific account
gog gmail send \
  --account work@company.com \
  --to client@example.com \
  --subject "Project Update" \
  --body "Status report attached"

# Check inbox for specific account
gog gmail list \
  --account family@icloud.com \
  --label INBOX \
  --max 10

# Watch for new emails on specific account
gog gmail watch start \
  --account work@company.com \
  --label INBOX \
  --topic projects/my-project/topics/gog-gmail-watch
```

### 2. `GOG_ACCOUNT` Environment Variable

The `GOG_ACCOUNT` environment variable sets a default account for all GOG operations in that shell session:

```bash
# Set default account for session
export GOG_ACCOUNT=work@company.com

# All subsequent commands use this account
gog gmail list --label INBOX
gog gmail send --to someone@example.com --subject "Hello"
```

**Note:** The `--account` flag takes precedence over `GOG_ACCOUNT` if both are specified.

### Account Configuration

GOG CLI stores account credentials in the keyring (secure storage):

```bash
# List configured accounts
gog auth list

# Add new account (interactive OAuth flow)
gog auth login --account newemail@gmail.com

# Remove account
gog auth logout --account oldemail@gmail.com
```

---

## Configuration Schema

### Extended Group Config with `emailAccount`

The `session.groupIsolation.groups` configuration will be extended with an `accessControl` object containing `emailAccount`:

```typescript
type GroupConfig = {
  label?: string;
  workspace?: string;
  accessControl?: {
    emailAccount?: string; // Email address to use for GOG operations
  };
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
          "accessControl": {
            "emailAccount": "work@company.com"
          }
        },
        "120363423561902447@g.us": {
          "label": "thakkar-rasania-vault",
          "accessControl": {
            "emailAccount": "family@icloud.com"
          }
        },
        "919820645414-1461388512@g.us": {
          "label": "nyra-krishay",
          "accessControl": {
            "emailAccount": "family@icloud.com"
          }
        },
        "120363999999999999@g.us": {
          "label": "thousand-sunny",
          "accessControl": {
            "emailAccount": "crew@thousandsunny.io"
          }
        }
      },
      "sharedFiles": ["SOUL.md", "USER.md", "TOOLS.md"]
    }
  }
}
```

### Current Groups Reference

| Group Label           | Group JID                      | Email Account           | Purpose             |
| --------------------- | ------------------------------ | ----------------------- | ------------------- |
| Thousand Sunny        | `120363999999999999@g.us`      | `crew@thousandsunny.io` | Team coordination   |
| Preseed Client        | `120363404078961545@g.us`      | `work@company.com`      | Client deliverables |
| Thakkar-Rasania Vault | `120363423561902447@g.us`      | `family@icloud.com`     | Family documents    |
| Nyra Krishay          | `919820645414-1461388512@g.us` | `family@icloud.com`     | Family fun          |

---

## Email Routing Logic

### Resolution Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    Message arrives in group                      │
│                         (WhatsApp/etc.)                         │
└─────────────────────────┬───────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Resolve groupId                               │
│    Extract: 120363404078961545@g.us from session key             │
└─────────────────────────┬───────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│              Look up group in config                             │
│    config.session.groupIsolation.groups[groupId]                 │
└─────────────────────────┬───────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│          Check for accessControl.emailAccount                    │
│    groupConfig.accessControl?.emailAccount                       │
└─────────────────────────┬───────────────────────────────────────┘
                          │
              ┌───────────┴───────────┐
              │                       │
              ▼                       ▼
┌─────────────────────┐   ┌─────────────────────┐
│   Account found     │   │   No account set    │
│                     │   │                     │
│ Use specified       │   │ Use default account │
│ emailAccount        │   │ (GOG_ACCOUNT env    │
│                     │   │ or first configured)│
└──────────┬──────────┘   └──────────┬──────────┘
           │                         │
           └───────────┬─────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│            Pass to GOG CLI as account identifier                 │
│    gog gmail <command> --account <resolved-account>              │
└─────────────────────────┬───────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│           Email operations scoped to that account                │
│    - Send from that account's email address                      │
│    - Read from that account's inbox                              │
│    - Search within that account's mail                           │
└─────────────────────────────────────────────────────────────────┘
```

### Pseudocode Implementation

```typescript
async function resolveEmailAccount(
  config: OpenClawConfig,
  groupId: string,
): Promise<string | undefined> {
  // 1. Look up group configuration
  const groupConfig = config.session?.groupIsolation?.groups?.[groupId];

  if (!groupConfig) {
    // Group not in isolation config - use default
    return undefined;
  }

  // 2. Check for email account override
  const emailAccount = groupConfig.accessControl?.emailAccount;

  if (emailAccount) {
    // Validate account exists in GOG
    const accounts = await gogAuthList();
    if (!accounts.includes(emailAccount)) {
      throw new Error(
        `Email account "${emailAccount}" not configured in GOG CLI. ` +
          `Run: gog auth login --account ${emailAccount}`,
      );
    }
    return emailAccount;
  }

  // 3. No override - use default
  return undefined;
}

async function executeEmailCommand(
  config: OpenClawConfig,
  groupId: string,
  command: string,
  args: string[],
): Promise<CommandResult> {
  // Resolve account for this group
  const account = await resolveEmailAccount(config, groupId);

  // Build GOG command
  const gogArgs = ["gmail", command, ...args];

  if (account) {
    gogArgs.push("--account", account);
  }

  // Execute
  return execFile("gog", gogArgs);
}
```

---

## Setting Up Multiple GOG Accounts

### Step 1: Install GOG CLI

```bash
# macOS
brew install gogcli

# Or via install script
curl -fsSL https://gogcli.sh/install | bash
```

### Step 2: Authenticate Each Account

```bash
# Add work account
gog auth login --account work@company.com

# Add family iCloud account
gog auth login --account family@icloud.com

# Add project-specific account
gog auth login --account crew@thousandsunny.io
```

This opens a browser for OAuth authentication. Complete the flow for each account.

### Step 3: Verify Accounts

```bash
# List all configured accounts
gog auth list

# Expected output:
# work@company.com
# family@icloud.com
# crew@thousandsunny.io
```

### Step 4: Configure Group Mapping

Add the `emailAccount` to each group in `openclaw.json`:

```json
{
  "session": {
    "groupIsolation": {
      "mode": "isolated",
      "groups": {
        "120363404078961545@g.us": {
          "label": "preseed-client",
          "accessControl": {
            "emailAccount": "work@company.com"
          }
        },
        "120363423561902447@g.us": {
          "label": "thakkar-rasania-vault",
          "accessControl": {
            "emailAccount": "family@icloud.com"
          }
        }
      }
    }
  }
}
```

### Step 5: Restart Gateway

```bash
openclaw gateway restart
```

---

## Usage Examples

### Example 1: Sending Email from Client Group

**User in Preseed Client group:**

> "Send an email to the client about the Phase 2 completion"

**Agent resolves:**

1. Current group: `120363404078961545@g.us`
2. Config lookup: `accessControl.emailAccount` → `work@company.com`
3. Executes: `gog gmail send --account work@company.com --to client@example.com ...`

**Email is sent FROM `work@company.com`** (not personal email)

---

### Example 2: Checking Family Email

**User in Thakkar-Rasania Vault group:**

> "Any new emails about the property deed?"

**Agent resolves:**

1. Current group: `120363423561902447@g.us`
2. Config lookup: `accessControl.emailAccount` → `family@icloud.com`
3. Executes: `gog gmail list --account family@icloud.com --query "property deed"`

**Searches ONLY the family iCloud inbox** (not work email)

---

### Example 3: Shared Account Across Groups

**Configuration:**

```json
{
  "120363423561902447@g.us": {
    "label": "thakkar-rasania-vault",
    "accessControl": { "emailAccount": "family@icloud.com" }
  },
  "919820645414-1461388512@g.us": {
    "label": "nyra-krishay",
    "accessControl": { "emailAccount": "family@icloud.com" }
  }
}
```

Both groups use the same email account (`family@icloud.com`). This is useful when:

- Multiple groups serve the same "context" (family)
- You want shared email visibility across related groups

---

### Example 4: Group Without Email Account

**User in unconfigured group:**

> "Send an email to my friend"

**Agent resolves:**

1. Current group: `999999999999999999@g.us`
2. Config lookup: Not in `groups` object
3. Uses default: `GOG_ACCOUNT` env var or first configured account

**Behavior:** Falls back to default account behavior

---

## Future Implementation Notes

This section documents what code changes will be needed when implementing this feature.

### 1. Config Schema Extension

**File:** `src/config/schema.ts` (or equivalent)

```typescript
// Add to GroupConfig type
interface GroupConfig {
  label?: string;
  workspace?: string;
  accessControl?: {
    emailAccount?: string;
    // Future: other account types
    // calendarAccount?: string;
    // driveAccount?: string;
  };
}
```

### 2. Account Resolution Function

**File:** `src/agents/context.ts` (or equivalent)

```typescript
export function resolveGroupEmailAccount(
  config: OpenClawConfig,
  groupId: string,
): string | undefined {
  const groupConfig = config.session?.groupIsolation?.groups?.[groupId];
  return groupConfig?.accessControl?.emailAccount;
}
```

### 3. Message Tool Integration

**File:** `src/tools/message.ts` (or equivalent)

The `message` tool should accept an optional `accountId` parameter that gets resolved from group context:

```typescript
// When processing email-related actions
const groupId = extractGroupId(sessionKey);
const emailAccount = resolveGroupEmailAccount(config, groupId);

// Pass to GOG CLI
if (emailAccount) {
  gogArgs.push("--account", emailAccount);
}
```

### 4. GOG CLI Wrapper

**File:** `src/lib/gog.ts` (new file)

```typescript
export async function gogGmailSend(
  options: {
    account?: string;
    to: string;
    subject: string;
    body: string;
    // ... other options
  }
): Promise<SendResult> {
  const args = ['gmail', 'send', '--to', options.to, ...];

  if (options.account) {
    args.push('--account', options.account);
  }

  return execGog(args);
}
```

### 5. Validation at Startup

**File:** `src/config/validation.ts` (or equivalent)

```typescript
export async function validateGroupEmailAccounts(
  config: OpenClawConfig,
): Promise<ValidationResult[]> {
  const errors: ValidationResult[] = [];
  const configuredAccounts = await gogAuthList();

  for (const [groupId, groupConfig] of Object.entries(
    config.session?.groupIsolation?.groups ?? {},
  )) {
    const emailAccount = groupConfig.accessControl?.emailAccount;

    if (emailAccount && !configuredAccounts.includes(emailAccount)) {
      errors.push({
        level: "error",
        path: `session.groupIsolation.groups["${groupId}"].accessControl.emailAccount`,
        message: `Email account "${emailAccount}" not configured in GOG CLI`,
        hint: `Run: gog auth login --account ${emailAccount}`,
      });
    }
  }

  return errors;
}
```

### 6. Gmail Hook Integration

**File:** `src/hooks/gmail.ts` (or equivalent)

When Gmail webhooks deliver messages, they should be routed based on the email account:

```typescript
// In Gmail webhook handler
const emailAccount = payload.emailAccount; // From Pub/Sub metadata

// Find which group(s) use this account
const groups = findGroupsByEmailAccount(config, emailAccount);

// Route to appropriate group session(s)
for (const groupId of groups) {
  await deliverToGroup(groupId, payload);
}
```

---

## Security Considerations

### Account Isolation

- Each group only has access to its configured email account
- Cross-account access is prevented by design
- GOG CLI credentials are stored securely in the system keyring

### Credential Protection

```bash
# GOG uses the system keyring (platform-specific)
# macOS: Keychain
# Linux: gnome-keyring / kwallet
# Windows: Windows Credential Manager

# Keyring password (for Docker/CI)
export GOG_KEYRING_PASSWORD=your-secure-password
```

### Audit Logging

All email operations should log:

- Which group initiated the action
- Which email account was used
- What action was taken (send/read/search)
- Timestamp and result

---

## Troubleshooting

### "Account not configured" Error

**Symptom:** Agent reports email account is not available.

**Diagnosis:**

```bash
# Check if account exists in GOG
gog auth list

# Test the specific account
gog gmail list --account work@company.com --max 1
```

**Fix:**

```bash
# Add missing account
gog auth login --account work@company.com
```

---

### Wrong Email Account Used

**Symptom:** Email sent from wrong address.

**Diagnosis:**

```bash
# Check group configuration
cat ~/.openclaw/openclaw.json | jq '.session.groupIsolation.groups'

# Verify group JID
tail -20 ~/.openclaw/agents/{agentId}/sessions/sessions.json | jq '.sessions | keys'
```

**Fix:**

1. Ensure `accessControl.emailAccount` is set correctly
2. Verify the group JID matches exactly
3. Restart gateway: `openclaw gateway restart`

---

### Keyring Unlock Issues

**Symptom:** GOG commands fail with keyring errors.

**Fix:**

```bash
# For Docker/headless environments
export GOG_KEYRING_PASSWORD=$(openssl rand -hex 32)

# Store securely
echo "GOG_KEYRING_PASSWORD=$GOG_KEYRING_PASSWORD" >> ~/.openclaw/.env
```

---

## See Also

- [Group Session Isolation Guide](./group-session-isolation-guide.md) — Workspace isolation
- [Migration Guide](./migrating-to-group-isolation.md) — Enabling isolation
- [Configuration Reference](../reference/config-session-groupisolation.md) — Full schema
- [Gmail Pub/Sub](../automation/gmail-pubsub.md) — Gmail webhook setup
- [GOG CLI Documentation](https://gogcli.sh/) — GOG CLI reference

---

**Last Updated:** 2026-02-16  
**Status:** Documentation Ready (implementation pending)
