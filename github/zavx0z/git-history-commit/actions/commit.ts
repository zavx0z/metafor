type CommitMode = "commit" | "amend" | "dry-run"

export function parseCommitOptions(argsInput?: string): Record<string, any> {
  const args = argsInput || ""

  if (!args.trim()) {
    throw new Error("Команда не указана")
  }

  const result: Record<string, any> = {}

  if (args.includes("-a") || args.includes("--all")) result.all = true
  if (args.includes("--amend")) result.amend = true
  if (args.includes("-s") || args.includes("--signoff")) result.signoff = true
  if (args.includes("-n") || args.includes("--no-verify")) result.noVerify = true
  if (args.includes("--dry-run")) result.dryRun = true
  if (args.includes("-v") || args.includes("--verbose")) result.verbose = true
  if (args.includes("-e") || args.includes("--edit")) result.edit = true

  const msgMatch = args.match(/-m\s+"([^"]+)"/) || args.match(/-m\s+'([^']+)'/) || args.match(/-m\s+(\S+)/)
  if (msgMatch && msgMatch[1]) {
    result.message = msgMatch[1]
  }

  return result
}

export async function runCommitCommand(input: { command: string; mode: CommitMode }): Promise<string | undefined> {
  const result = await Bun.$`${input.command}`.quiet().text()

  if (input.mode === "dry-run") {
    return result
  }

  const successTokens = input.mode === "amend" ? ["amend", "mode"] : ["created", "mode"]
  if (!successTokens.some((token) => result.includes(token))) {
    throw new Error(result || (input.mode === "amend" ? "Не удалось заменить коммит" : "Не удалось создать коммит"))
  }

  return result
}
