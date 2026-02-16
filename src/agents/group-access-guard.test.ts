import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  type GroupPathPolicy,
  expandAndResolve,
  guardPath,
  isPathAllowed,
  resolveRealPath,
} from "./group-access-guard.js";

// ── expandAndResolve ─────────────────────────────────────────────────────────

describe("expandAndResolve", () => {
  it("expands ~ to home directory", () => {
    const result = expandAndResolve("~/Documents/foo.txt");
    expect(result).toBe(path.join(os.homedir(), "Documents/foo.txt"));
  });

  it("resolves relative paths against cwd", () => {
    const result = expandAndResolve("foo/bar.txt", "/workspace");
    expect(result).toBe("/workspace/foo/bar.txt");
  });

  it("leaves absolute paths as-is", () => {
    const result = expandAndResolve("/absolute/path.txt");
    expect(result).toBe("/absolute/path.txt");
  });

  it("normalizes path traversal sequences", () => {
    const result = expandAndResolve("/workspace/../etc/passwd");
    expect(result).toBe("/etc/passwd");
  });

  it("handles bare ~", () => {
    const result = expandAndResolve("~");
    expect(result).toBe(os.homedir());
  });
});

// ── isPathAllowed ────────────────────────────────────────────────────────────

describe("isPathAllowed", () => {
  const home = os.homedir();

  it("allows everything when no restrictions", () => {
    const policy: GroupPathPolicy = { allowedPaths: [], deniedPaths: [] };
    expect(isPathAllowed("/any/path", policy).allowed).toBe(true);
  });

  it("allows path matching allowedPaths glob", () => {
    const policy: GroupPathPolicy = {
      allowedPaths: ["~/Documents/**"],
      deniedPaths: [],
    };
    expect(isPathAllowed(path.join(home, "Documents/file.txt"), policy).allowed).toBe(true);
    expect(isPathAllowed(path.join(home, "Documents/sub/file.txt"), policy).allowed).toBe(true);
  });

  it("denies path not in allowedPaths", () => {
    const policy: GroupPathPolicy = {
      allowedPaths: ["~/Documents/**"],
      deniedPaths: [],
    };
    const result = isPathAllowed(path.join(home, "Desktop/file.txt"), policy);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("not within the allowed paths");
  });

  it("denies path matching deniedPaths", () => {
    const policy: GroupPathPolicy = {
      allowedPaths: [],
      deniedPaths: ["~/secret/**"],
    };
    const result = isPathAllowed(path.join(home, "secret/keys.txt"), policy);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("explicitly denied");
  });

  it("deniedPaths takes precedence over allowedPaths", () => {
    const policy: GroupPathPolicy = {
      allowedPaths: ["~/Documents/**"],
      deniedPaths: ["~/Documents/private/**"],
    };
    expect(isPathAllowed(path.join(home, "Documents/public.txt"), policy).allowed).toBe(true);
    expect(isPathAllowed(path.join(home, "Documents/private/secret.txt"), policy).allowed).toBe(
      false,
    );
  });

  it("supports exact path matching", () => {
    const policy: GroupPathPolicy = {
      allowedPaths: [path.join(home, "Documents/specific.txt")],
      deniedPaths: [],
    };
    expect(isPathAllowed(path.join(home, "Documents/specific.txt"), policy).allowed).toBe(true);
    expect(isPathAllowed(path.join(home, "Documents/other.txt"), policy).allowed).toBe(false);
  });

  it("supports single-level wildcard", () => {
    const policy: GroupPathPolicy = {
      allowedPaths: ["~/Documents/*"],
      deniedPaths: [],
    };
    expect(isPathAllowed(path.join(home, "Documents/file.txt"), policy).allowed).toBe(true);
    // Subdirectory should NOT match single-level wildcard
    expect(isPathAllowed(path.join(home, "Documents/sub/file.txt"), policy).allowed).toBe(false);
  });

  it("** pattern matches the directory itself", () => {
    const policy: GroupPathPolicy = {
      allowedPaths: ["~/Documents/**"],
      deniedPaths: [],
    };
    expect(isPathAllowed(path.join(home, "Documents"), policy).allowed).toBe(true);
  });
});

// ── guardPath ────────────────────────────────────────────────────────────────

describe("guardPath", () => {
  const home = os.homedir();
  const workspaceDir = path.join(home, "workspace");

  it("allows when no restrictions", () => {
    const policy: GroupPathPolicy = { allowedPaths: [], deniedPaths: [] };
    expect(guardPath("/any/path", policy, workspaceDir).allowed).toBe(true);
  });

  it("rejects empty path", () => {
    const policy: GroupPathPolicy = { allowedPaths: ["~/Documents/**"], deniedPaths: [] };
    expect(guardPath("", policy, workspaceDir).allowed).toBe(false);
  });

  it("resolves relative paths against workspace", () => {
    const policy: GroupPathPolicy = {
      allowedPaths: [workspaceDir + "/**"],
      deniedPaths: [],
    };
    expect(guardPath("file.txt", policy, workspaceDir).allowed).toBe(true);
  });

  it("prevents path traversal via ../", () => {
    const policy: GroupPathPolicy = {
      allowedPaths: [workspaceDir + "/**"],
      deniedPaths: [],
    };
    // Attempting to traverse out of workspace
    const result = guardPath("../../etc/passwd", policy, workspaceDir);
    expect(result.allowed).toBe(false);
  });

  it("resolves ~ in file path", () => {
    const policy: GroupPathPolicy = {
      allowedPaths: ["~/Documents/**"],
      deniedPaths: [],
    };
    expect(guardPath("~/Documents/file.txt", policy, workspaceDir).allowed).toBe(true);
    expect(guardPath("~/Desktop/file.txt", policy, workspaceDir).allowed).toBe(false);
  });

  it("vault group scenario: only iCloud Family Documents", () => {
    const vaultPolicy: GroupPathPolicy = {
      allowedPaths: [
        "~/Library/Mobile Documents/com~apple~CloudDocs/Family Documents/**",
      ],
      deniedPaths: [],
    };
    const familyDocsDir = path.join(
      home,
      "Library/Mobile Documents/com~apple~CloudDocs/Family Documents",
    );

    // Allowed
    expect(guardPath(familyDocsDir + "/budget.xlsx", vaultPolicy, workspaceDir).allowed).toBe(true);
    expect(
      guardPath(familyDocsDir + "/sub/nested/file.pdf", vaultPolicy, workspaceDir).allowed,
    ).toBe(true);

    // Denied: outside family documents
    expect(guardPath("~/Documents/other.txt", vaultPolicy, workspaceDir).allowed).toBe(false);
    expect(guardPath("/etc/passwd", vaultPolicy, workspaceDir).allowed).toBe(false);
    expect(
      guardPath("~/Library/Mobile Documents/com~apple~CloudDocs/other.txt", vaultPolicy, workspaceDir).allowed,
    ).toBe(false);
  });
});

// ── resolveRealPath ──────────────────────────────────────────────────────────

describe("resolveRealPath", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "group-access-guard-test-")));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("resolves symlinks", () => {
    const realFile = path.join(tmpDir, "real.txt");
    const symlink = path.join(tmpDir, "link.txt");
    fs.writeFileSync(realFile, "hello");
    fs.symlinkSync(realFile, symlink);

    expect(resolveRealPath(symlink)).toBe(realFile);
  });

  it("returns normalized path for non-existent files", () => {
    const nonExistent = path.join(tmpDir, "does-not-exist.txt");
    expect(resolveRealPath(nonExistent)).toBe(nonExistent);
  });

  it("resolves symlink in parent directory", () => {
    const realDir = path.join(tmpDir, "realdir");
    const symlinkDir = path.join(tmpDir, "linkdir");
    fs.mkdirSync(realDir);
    fs.symlinkSync(realDir, symlinkDir);

    // File doesn't exist yet, but parent symlink should be resolved
    const result = resolveRealPath(path.join(symlinkDir, "newfile.txt"));
    expect(result).toBe(path.join(realDir, "newfile.txt"));
  });

  it("prevents symlink-based traversal", () => {
    // Create a symlink that points outside the allowed area
    const escapedTarget = path.join(fs.realpathSync(os.tmpdir()), "escaped-target.txt");
    fs.writeFileSync(escapedTarget, "secret");
    const symlink = path.join(tmpDir, "escape-link.txt");
    fs.symlinkSync(escapedTarget, symlink);

    // resolveRealPath follows the symlink to the real target
    const realPath = resolveRealPath(symlink);
    expect(realPath).toBe(escapedTarget);

    // So a policy check against the real path would catch the escape
    const policy: GroupPathPolicy = {
      allowedPaths: [tmpDir + "/**"],
      deniedPaths: [],
    };
    expect(isPathAllowed(realPath, policy).allowed).toBe(false);
  });
});
