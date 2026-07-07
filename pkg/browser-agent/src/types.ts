export type BrowserAgentJsonObject = Record<string, unknown>

export type BrowserAgentProviderId = "qwen" | "deepseek"

export type BrowserAgentHost = {
  evaluateExpression(params: BrowserAgentJsonObject): Promise<{
    target?: unknown
    result: BrowserAgentJsonObject
  }>
  activateTarget?(params: BrowserAgentJsonObject): Promise<unknown>
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
  sendExpression(message: string, newChat: boolean, params?: BrowserAgentJsonObject): string
  readExpression(): string
  configureExpression?(params: BrowserAgentJsonObject): string
}
