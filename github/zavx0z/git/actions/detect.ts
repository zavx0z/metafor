const patterns = {
  start: /^(clone|init)$/,
  work: /^(add|mv|restore|rm|clean|sparse-checkout)$/,
  examine: /^(show|status|diff|log|range-diff|shortlog|describe)$/,
  history: /^(switch|checkout|commit|reset|revert|bisect|repair)$/,
  collaborate: /^(fetch|pull|push|remote)$/,
  worktree: /^worktree$/,
  stash: /^stash$/,
  submodule: /^submodule$/,
  config: /^(config|help)$/,
} as Record<string, RegExp>

type Data<Fields> = {
  operation: Fields
  command: string
  args: string | null
}

export function detect<Fields>(cmd: string): Data<Fields> {
  const parts = cmd.split(" ")
  const command = parts[0]
  if (!command) {
    throw new Error("Не удалось извлечь команду")
  }
  const args = parts.length > 1 ? parts.slice(1).join(" ") : null
  let operation: Fields | null = null
  for (const [key, regex] of Object.entries(patterns)) {
    if ((regex as RegExp).test(command)) {
      operation = key as Fields
      break
    }
  }
  if (!operation) {
    throw new Error(`Неизвестная команда: ${command}`)
  }
  return { operation, command, args }
}
