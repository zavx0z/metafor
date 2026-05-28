export type RestartBreakpointSpec = {
  url?: string
  sourceUrl?: string
  urlRegex?: string
  line: number
  column?: number
  condition?: string
}

export type RestartRunPayload = {
  label: string
  command: string[]
  pauseOnStart: true
  breakpoints?: RestartBreakpointSpec[]
}

export function interactiveRestartPayload(input: {
  label: string
  command: readonly string[]
  breakpoints?: RestartBreakpointSpec[]
}): RestartRunPayload {
  const payload: RestartRunPayload = {
    label: input.label,
    command: stripInspectArgs(input.command),
    pauseOnStart: true,
  }
  if (input.breakpoints !== undefined && input.breakpoints.length > 0) {
    payload.breakpoints = input.breakpoints
  }
  return payload
}

function stripInspectArgs(command: readonly string[]): string[] {
  const next: string[] = []
  for (let i = 0; i < command.length; i++) {
    const part = command[i]!
    if (!part.startsWith("--inspect")) {
      next.push(part)
      continue
    }
    if (!part.includes("=") && isInspectEndpoint(command[i + 1])) i++
  }
  return next
}

function isInspectEndpoint(value: string | undefined): boolean {
  if (value === undefined || value.startsWith("--")) return false
  return value.startsWith("ws://") || value.startsWith("wss://") || value.includes(":")
}
