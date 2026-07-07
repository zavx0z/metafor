export type BrowserAgentJsonObject = Record<string, unknown>

export type BrowserAgentProviderId = "qwen" | "deepseek"

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

export type BrowserAgentProvider = {
  id: BrowserAgentProviderId
  label: string
  urlContains: string
  sendExpression(message: string, newChat: boolean): string
  readExpression(): string
}
