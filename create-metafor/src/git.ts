import {execFileSync} from "node:child_process"

export function isGitInstalled(): boolean {
  try {
    execFileSync("git", ["--version"], {stdio: "ignore"})
    return true
  } catch {
    return false
  }
}

export function getGitUserName(cwd?: string): string | null {
  try {
    const output = execFileSync("git", ["config", "user.name"], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    })
    return output.trim() || null
  } catch {
    return null
  }
}

export function getGitUserEmail(cwd?: string): string | null {
  try {
    const output = execFileSync("git", ["config", "user.email"], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    })
    return output.trim() || null
  } catch {
    return null
  }
}

export function initGitRepo(cwd: string): boolean {
  try {
    execFileSync("git", ["init"], {cwd, stdio: "ignore"})
    return true
  } catch {
    return false
  }
}

export function gitAddAll(cwd: string): boolean {
  try {
    execFileSync("git", ["add", "."], {cwd, stdio: "ignore"})
    return true
  } catch {
    return false
  }
}

function hasGitConfig(cwd: string, key: string): boolean {
  try {
    const value = execFileSync("git", ["config", "--get", key], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    })
    return value.trim().length > 0
  } catch {
    return false
  }
}

function ensureCommitIdentity(cwd: string): void {
  if (!hasGitConfig(cwd, "user.name")) {
    execFileSync("git", ["config", "user.name", "MetaFor"], {cwd, stdio: "ignore"})
  }
  if (!hasGitConfig(cwd, "user.email")) {
    execFileSync("git", ["config", "user.email", "metafor@local"], {cwd, stdio: "ignore"})
  }
}

export function gitCommit(cwd: string, message: string): boolean {
  try {
    ensureCommitIdentity(cwd)
    execFileSync("git", ["commit", "-m", message], {cwd, stdio: "ignore"})
    return true
  } catch {
    return false
  }
}
