export type BrowserAgentJsonObject = Record<string, unknown>

export type BrowserAgentHost = {
  evaluateExpression(params: BrowserAgentJsonObject): Promise<{
    target?: unknown
    result: BrowserAgentJsonObject
  }>
  setViewport?(params: BrowserAgentJsonObject): Promise<unknown>
  serializeError?(error: unknown): string
}

export type BrowserAgentRuntime = {
  runToolUse(name: string, params: BrowserAgentJsonObject): Promise<BrowserAgentJsonObject | null>
}
