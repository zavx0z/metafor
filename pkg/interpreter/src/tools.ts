import {asObject, asString} from "./guards.ts"
import type {JsonObject} from "./types.ts"

/**
 * Codex-style interpreter tool call. `recipient_name` is the semantic command,
 * while all addressing lives in `parameters` (`processId`, `selector`,
 * `targetUrl`, `path`, etc.).
 */
export type InterpreterToolUse = {
  toolUseId?: string
  recipientName: string
  parameters: JsonObject
}

/** Metadata published in docs and the route index for agent-facing tools. */
export type InterpreterToolDescription = {
  name: string
  description: string
  parameters: string
}

/** Read current interpreter/process/UI state. */
export type ContextGetTool = {
  recipient_name: "context.get"
  parameters?: Record<string, never>
}

/** Read, open, save, or patch source in a process. */
export type SourceTool = {
  recipient_name: "source.read" | "source.read_many" | "source.locate" | "source.open" | "source.openSelection" | "source.write" | "source.apply_patch"
  parameters: JsonObject & {processId?: string; sourceUrl?: string; path?: string; text?: string; patch?: string}
}

/** Start, focus, inspect, stop, restart, or debug a runtime process. */
export type ProcessTool = {
  recipient_name: "process.list" | "process.start" | "process.get" | "process.focus" | "process.resolve" | "process.context" | "process.modules" | "process.close" | "process.action"
  parameters?: JsonObject & {processId?: string; selector?: JsonObject; action?: string}
}

/** Manage process breakpoints through the same tool surface as source edits. */
export type BreakpointTool = {
  recipient_name: "breakpoint.list" | "breakpoint.set" | "breakpoint.remove"
  parameters: JsonObject & {processId?: string; line?: number; text?: string; query?: string; regex?: string; url?: string; sourceUrl?: string; id?: string; breakpointId?: string}
}

/** Inspect and control interpreter HUD, browser, DevTools, SQLite, Android, and remote desktop helpers. */
export type HostTool = {
  recipient_name: string
  parameters?: JsonObject
}

export const interpreterToolDescriptions = [
  {name: "health.get", description: "прочитать health payload host-а", parameters: "{}"},
  {name: "context.get", description: "прочитать текущий active context", parameters: "{}"},
  {name: "space.get", description: "прочитать Space/display state", parameters: "{}"},
  {name: "space.focus", description: "сфокусировать display", parameters: "{selector, dockHostTerminal?}"},
  {name: "space.frame", description: "показать все display в Space", parameters: "{}"},
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
  {name: "browser_chat.*", description: "MVP chat transport в уже открытый browser Qwen chat: send/read/wait/exchange", parameters: "{message?|text?, targetId?|targetUrl?|targetTitle?|urlContains?, previousAssistantText?, afterMessageCount?, intervalMs?, stableTicks?, timeoutMs?}"},
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
    for (const [index, value] of rawToolUses.entries()) {
      const parsed = parseInterpreterToolUse(value, index)
      if (parsed.error !== undefined) return {toolUses: [], error: parsed.error}
      toolUses.push(parsed.toolUse!)
    }
    return {toolUses}
  }

  if (body["recipient_name"] !== undefined || body["recipientName"] !== undefined || body["name"] !== undefined || body["tool"] !== undefined) {
    const parsed = parseInterpreterToolUse(body, 0)
    if (parsed.error !== undefined) return {toolUses: [], error: parsed.error}
    return {toolUses: [parsed.toolUse!]}
  }

  return {toolUses: [], error: "tool_uses must be a non-empty array"}
}

function parseInterpreterToolUse(value: unknown, index: number): {toolUse?: InterpreterToolUse; error?: string} {
  const object = asObject(value)
  if (object === undefined) return {error: `tool_uses[${index}] must be an object`}

  const recipientName = asString(object["recipient_name"])
    ?? asString(object["recipientName"])
    ?? asString(object["name"])
    ?? asString(object["tool"])
  if (recipientName === undefined || recipientName.trim().length === 0) {
    return {error: `tool_uses[${index}].recipient_name must be a string`}
  }

  const parameters = asObject(object["parameters"])
    ?? asObject(object["arguments"])
    ?? asObject(object["params"])
    ?? {}
  const toolUseId = asString(object["tool_use_id"]) ?? asString(object["toolUseId"]) ?? asString(object["id"])
  const toolUse: InterpreterToolUse = {
    recipientName,
    parameters,
  }
  if (toolUseId !== undefined) toolUse.toolUseId = toolUseId
  return {toolUse}
}
