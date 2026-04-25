import { execSync } from "child_process"

/**
 * Проверка установлен ли git
 */
export function isGitInstalled(): boolean {
  try {
    execSync("git --version", { stdio: "ignore" })
    return true
  } catch {
    return false
  }
}

/**
 * Получить имя пользователя из git config
 */
export function getGitUserName(): string | null {
  try {
    const output = execSync("git config user.name", {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "ignore"]
    })
    return output.trim() || null
  } catch {
    return null
  }
}

/**
 * Получить email пользователя из git config
 */
export function getGitUserEmail(): string | null {
  try {
    const output = execSync("git config user.email", {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "ignore"]
    })
    return output.trim() || null
  } catch {
    return null
  }
}

/**
 * Инициализировать git репозиторий
 */
export function initGitRepo(cwd: string): boolean {
  try {
    execSync("git init", { cwd, stdio: "ignore" })
    return true
  } catch {
    return false
  }
}

/**
 * Добавить все файлы в git
 */
export function gitAddAll(cwd: string): boolean {
  try {
    execSync("git add .", { cwd, stdio: "ignore" })
    return true
  } catch {
    return false
  }
}

function hasGitConfig(cwd: string, key: string): boolean {
  try {
    const value = execSync(`git config --get ${key}`, {
      cwd,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "ignore"],
    })
    return value.trim().length > 0
  } catch {
    return false
  }
}

function ensureCommitIdentity(cwd: string): void {
  if (!hasGitConfig(cwd, "user.name")) {
    execSync(`git config user.name "MetaFor"`, { cwd, stdio: "ignore" })
  }
  if (!hasGitConfig(cwd, "user.email")) {
    execSync(`git config user.email "metafor@local"`, { cwd, stdio: "ignore" })
  }
}

/**
 * Сделать коммит. Если в окружении не задан identity (`user.name` / `user.email`) —
 * выставляет локальный fallback в репозитории, чтобы коммит проходил без зависимости от
 * глобального git-конфига.
 */
export function gitCommit(cwd: string, message: string): boolean {
  try {
    ensureCommitIdentity(cwd)
    execSync(`git commit -m "${message}"`, { cwd, stdio: "ignore" })
    return true
  } catch {
    return false
  }
}
