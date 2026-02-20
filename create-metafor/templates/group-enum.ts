// Группы Git команд и их операции
export const GIT_GROUP_ENUMS: Record<string, string[]> = {
  "git-start": ["clone", "init"],
  "git-work": ["add", "mv", "restore", "rm", "clean", "sparse-checkout"],
  "git-examine": ["show", "status", "diff", "log", "range-diff", "shortlog", "describe"],
  "git-history": ["switch", "checkout", "commit", "reset", "revert", "bisect", "repair"],
  "git-collaborate": ["fetch", "pull", "push", "remote"],
  "git-config": ["config", "help"],
}

/**
 * Получить enum значения для группы
 */
export function getGroupEnum(packageName: string): string[] {
  return GIT_GROUP_ENUMS[packageName] || []
}
