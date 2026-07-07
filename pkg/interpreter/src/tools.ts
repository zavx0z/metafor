import type {JsonObject} from "./types.ts"

export type InterpreterToolUse = {
  /**
   * Codex-style tool call id. Optional for handwritten curl calls.
   */
  toolUseId?: string
  /**
   * Semantic command name, e.g. `process.list`, `source.read`, `breakpoint.set`.
   * Addressing data such as processId stays in parameters, not in recipientName.
   */
  recipientName: string
  parameters: JsonObject
}

export type InterpreterToolDescription = {
  name: string
  description: string
  parameters: string
}

export const interpreterToolDescriptions = [
  {name: "health.get", description: "проверить, что interpreter HTTP host жив", parameters: "{}"},
  {name: "context.get", description: "прочитать текущий active context", parameters: "{}"},
  {name: "space.get", description: "прочитать Space/display state", parameters: "{}"},
  {name: "space.focus", description: "сфокусировать display", parameters: "{selector, dockHostTerminal?}"},
  {name: "space.frame", description: "показать все display в Space", parameters: "{}"},
  {name: "space.arrange", description: "расставить все display аккуратной сеткой и показать их в Space", parameters: "{columns?, gapMm?, centerZMm?, padding?, frame?}"},
  {name: "viewport.screenshot", description: "сделать screenshot interpreter viewport и сохранить attachment", parameters: "{format?, quality?}"},
  {name: "host.reload", description: "перезагрузить подключенные UI-клиенты interpreter host", parameters: "{}"},
  {name: "host.restart", description: "перезапустить interpreter host через поддерживаемый supervisor/tmux", parameters: "{}"},
  {name: "process.list", description: "список runtime processes", parameters: "{}"},
  {name: "process.start", description: "запустить runtime process", parameters: "{command, cwd?, env?, label?, processId?, pauseOnStart?, breakpoints?}"},
  {name: "process.get", description: "прочитать process payload", parameters: "{processId}"},
  {name: "process.focus", description: "сфокусировать process display", parameters: "{processId?|selector, dockHostTerminal?}"},
  {name: "process.resolve", description: "найти process по selector", parameters: "{selector}"},
  {name: "process.context", description: "прочитать context конкретного process", parameters: "{processId}"},
  {name: "process.modules", description: "прочитать каталог source files process", parameters: "{processId, q?, limit?}"},
  {name: "process.close", description: "закрыть process и убрать display", parameters: "{processId}"},
  {name: "process.action", description: "debug/action команда process", parameters: "{processId, action, params?}"},
  {name: "source.read", description: "прочитать source/runtime text", parameters: "{processId, sourceUrl?|scriptId?, ranges?, tokens?}"},
  {name: "source.read_many", description: "прочитать несколько source payloads", parameters: "{processId, sources:[sourceUrl|params]}"},
  {name: "source.locate", description: "найти уникальную source строку по exact text или line-local regex", parameters: "{processId, sourceUrl|path|modulePath|url, text|query|regex, occurrence?, after?, before?, contextLines?}"},
  {name: "source.open", description: "открыть source в UI process display", parameters: "{processId, sourceUrl|path|modulePath|specifier, line?, column?, selection?}"},
  {name: "source.openSelection", description: "открыть import/source из текущего выделения", parameters: "{processId}"},
  {name: "source.write", description: "сохранить source через server sync/replay path", parameters: "{processId, sourceUrl, text}"},
  {name: "source.apply_patch", description: "применить Codex apply_patch через interpreter sync/replay path", parameters: "{processId, patch}"},
  {name: "git.status", description: "прочитать git status текущего workspace", parameters: "{cwd?, processId?}"},
  {name: "git.commit", description: "создать git commit и обновить UI workspace", parameters: "{message, paths?|all?, cwd?, processId?}"},
  {name: "git.push", description: "выполнить git push и обновить UI workspace", parameters: "{remote?, branch?, cwd?, processId?}"},
  {name: "breakpoint.list", description: "прочитать breakpoints process", parameters: "{processId}"},
  {name: "breakpoint.set", description: "поставить breakpoint", parameters: "{processId, url|sourceUrl|path|urlRegex, line|text|query|regex|locator, column?, condition?}"},
  {name: "breakpoint.remove", description: "убрать breakpoint", parameters: "{processId, id|breakpointId}"},
  {name: "devtools.*", description: "Chrome DevTools target/console/breakpoint/probe/reload/evaluate commands", parameters: "см. docs/api.md"},
  {name: "browser_chat.*", description: "transport для browser-hosted LLM чата из @metafor/browser-agent: send/read/wait/exchange/configure/activate", parameters: "{provider?:qwen|deepseek, message?|text?, targetId?|targetUrl?|targetTitle?|urlContains?, autoToolLoop?, newChat?, waitUntilReady?, sendTimeoutMs?, previousAssistantText?, afterMessageCount?, intervalMs?, stableTicks?, timeoutMs?, deepseekMode?:fast|expert|vision, deepThinking?}"},
  {name: "browser.*", description: "browser-display JSON actions", parameters: "см. docs/api.md"},
  {name: "remote_desktop.*", description: "remote desktop lifecycle/input/RTC/browser JSON actions", parameters: "см. docs/api.md"},
  {name: "hud.*", description: "HUD panel state/actions", parameters: "см. docs/api.md"},
  {name: "todo.*", description: "Plan read/mutate/highlight actions backed by TODO.md", parameters: "см. docs/api.md"},
  {name: "sqlite.*", description: "SQLite inspect/open/cell actions", parameters: "см. docs/api.md"},
  {name: "android.*", description: "Android HUD/control proxy actions", parameters: "см. docs/api.md"},
  {name: "events.tail", description: "прочитать event log tail", parameters: "{since?, limit?}"},
  {name: "console.tail", description: "прочитать console log tail", parameters: "{since?, limit?}"},
] as const satisfies readonly InterpreterToolDescription[]

export function parseInterpreterToolRequest(body: JsonObject): {toolUses: InterpreterToolUse[]; error?: string} {
  const rawToolUses = body["tool_uses"] ?? body["toolUses"]
  if (Array.isArray(rawToolUses)) {
    if (rawToolUses.length === 0) return {toolUses: [], error: "tool_uses must not be empty"}
    const toolUses: InterpreterToolUse[] = []
    for (const [index, raw] of rawToolUses.entries()) {
      const parsed = parseSingleToolUse(raw)
      if (parsed.error !== undefined) return {toolUses: [], error: `tool_uses[${index}]: ${parsed.error}`}
      toolUses.push(parsed.toolUse)
    }
    return {toolUses}
  }

  const parsed = parseSingleToolUse(body)
  if (parsed.error !== undefined) return {toolUses: [], error: parsed.error}
  return {toolUses: [parsed.toolUse]}
}

function parseSingleToolUse(raw: unknown): {toolUse: InterpreterToolUse; error?: undefined} | {error: string; toolUse?: undefined} {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return {error: "tool use must be an object"}
  const obj = raw as Record<string, unknown>
  const recipientName = stringValue(obj["recipient_name"]) ?? stringValue(obj["recipientName"]) ?? stringValue(obj["name"]) ?? stringValue(obj["tool"])
  if (recipientName === undefined || recipientName.trim().length === 0) return {error: "recipient_name is required"}
  const rawParams = obj["parameters"] ?? obj["arguments"] ?? obj["params"] ?? {}
  const parameters = jsonObjectValue(rawParams)
  if (parameters === undefined) return {error: "parameters must be a JSON object"}
  const toolUseId = stringValue(obj["tool_use_id"]) ?? stringValue(obj["toolUseId"]) ?? stringValue(obj["id"])
  return {
    toolUse: {
      ...(toolUseId === undefined ? {} : {toolUseId}),
      recipientName: recipientName.trim(),
      parameters,
    },
  }
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined
}

function jsonObjectValue(value: unknown): JsonObject | undefined {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return undefined
  return value as JsonObject
}
