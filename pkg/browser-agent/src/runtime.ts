import {asBoolean, asNumber, asObject, asString} from "./guards.ts"
import {DEFAULT_DEEPSEEK_URL_CONTAINS, deepseekConfigureExpression, deepseekReadExpression, deepseekSendExpression} from "./providers/deepseek.ts"
import {DEFAULT_QWEN_URL_CONTAINS, qwenReadExpression, qwenSendExpression} from "./providers/qwen.ts"
import type {BrowserAgentHost, BrowserAgentJsonObject, BrowserAgentProvider, BrowserAgentRuntime} from "./types.ts"

export {DEFAULT_DEEPSEEK_URL_CONTAINS, DEFAULT_QWEN_URL_CONTAINS}

const BROWSER_CHAT_READ_INTERVAL_MS = 650
const BROWSER_CHAT_STABLE_TICKS = 8
const BROWSER_CHAT_MIN_WAIT_MS = 6_000
const BROWSER_CHAT_WAIT_TIMEOUT_MS = 90_000
const BROWSER_CHAT_READ_RETRY_MS = 220
const BROWSER_CHAT_READ_RETRIES = 2
const BROWSER_CHAT_SEND_READY_INTERVAL_MS = 650
const BROWSER_CHAT_SEND_READY_TIMEOUT_MS = 90_000
const BROWSER_CHAT_CONFIGURE_READY_TIMEOUT_MS = 30_000

const QWEN_PROVIDER: BrowserAgentProvider = {
  id: "qwen",
  label: "Qwen",
  urlContains: DEFAULT_QWEN_URL_CONTAINS,
  sendExpression: qwenSendExpression,
  readExpression: qwenReadExpression,
}

const DEEPSEEK_PROVIDER: BrowserAgentProvider = {
  id: "deepseek",
  label: "DeepSeek",
  urlContains: DEFAULT_DEEPSEEK_URL_CONTAINS,
  sendExpression: deepseekSendExpression,
  readExpression: deepseekReadExpression,
  configureExpression: deepseekConfigureExpression,
}

const BROWSER_AGENT_PROVIDERS = [QWEN_PROVIDER, DEEPSEEK_PROVIDER] as const satisfies readonly BrowserAgentProvider[]

export function createBrowserAgentRuntime(host: BrowserAgentHost): BrowserAgentRuntime {
  return {
    runToolUse: async (name, params) => await runBrowserChatToolUse(host, name, params),
  }
}

async function runBrowserChatToolUse(host: BrowserAgentHost, name: string, params: BrowserAgentJsonObject): Promise<BrowserAgentJsonObject | null> {
  if (name === "browser_chat.send") return await browserChatSend(host, params)
  if (name === "browser_chat.read") return await browserChatRead(host, params)
  if (name === "browser_chat.wait") return await browserChatWait(host, params)
  if (name === "browser_chat.exchange") return await browserChatExchange(host, params)
  if (name === "browser_chat.configure") return await browserChatConfigure(host, params)
  if (name === "browser_chat.activate") return await browserChatActivate(host, params)
  return null
}

async function browserChatSend(host: BrowserAgentHost, params: BrowserAgentJsonObject): Promise<BrowserAgentJsonObject> {
  const message = asString(params["message"]) ?? asString(params["text"])
  if (message === undefined || message.trim().length === 0) return {ok: false, error: "message required"}
  const provider = browserAgentProviderForParams(params)
  const newChat = asBoolean(params["newChat"]) ?? asBoolean(params["newConversation"]) ?? false
  const waitUntilReady = asBoolean(params["waitUntilReady"]) ?? true
  const timeoutMs = boundedNumber(asNumber(params["sendTimeoutMs"]), BROWSER_CHAT_SEND_READY_TIMEOUT_MS, 1_000, 300_000)
  const startedAt = Date.now()
  const attachmentPaths = browserChatAttachmentPaths(params)
  let attachmentsUploaded = false

  while (true) {
    if (!attachmentsUploaded && attachmentPaths.length > 0) {
      if (newChat) return {ok: false, provider: provider.id, error: "attachment upload with newChat is not supported; open a new chat first"}
      const uploaded = await uploadBrowserChatAttachments(host, provider, params, attachmentPaths)
      if (uploaded["ok"] !== true) return {...uploaded, provider: provider.id, waitedMs: Date.now() - startedAt}
      attachmentsUploaded = true
    }
    const sent = await evaluateBrowserChatPayload(host, provider, params, provider.sendExpression(message, newChat, params))
    if (sent["ok"] === true) return {...sent, provider: provider.id, waitedMs: Date.now() - startedAt}
    if (sent["limitReached"] === true) return {...sent, provider: provider.id, waitedMs: Date.now() - startedAt}
    if (isTransientBrowserChatError(asString(sent["error"]))) {
      await delay(300)
      const read = await browserChatRead(host, params)
      const recovered = browserChatRecoveredSendPayload(message, sent, read)
      if (recovered !== null) return {...recovered, provider: provider.id, waitedMs: Date.now() - startedAt}
      if (waitUntilReady && Date.now() - startedAt < timeoutMs) continue
      return {...sent, provider: provider.id, waitedMs: Date.now() - startedAt}
    }
    if (!waitUntilReady || !isBrowserChatBusyPayload(sent) || Date.now() - startedAt >= timeoutMs) {
      return {...sent, provider: provider.id, waitedMs: Date.now() - startedAt}
    }
    await delay(BROWSER_CHAT_SEND_READY_INTERVAL_MS)
  }
}

async function uploadBrowserChatAttachments(host: BrowserAgentHost, provider: BrowserAgentProvider, params: BrowserAgentJsonObject, files: readonly string[]): Promise<BrowserAgentJsonObject> {
  if (provider.id !== "deepseek") return {ok: false, provider: provider.id, error: `${provider.label} attachment upload is not supported`}
  if (host.setFileInputFiles === undefined) return {ok: false, provider: provider.id, error: "setFileInputFiles host callback is not available"}
  try {
    const uploaded = await host.setFileInputFiles({
      ...browserChatTargetParams(params, provider),
      selector: asString(params["fileInputSelector"]) ?? "input[type=file]",
      files,
    })
    return {ok: true, provider: provider.id, target: uploaded.target, upload: uploaded.result, attachmentCount: files.length}
  } catch (error) {
    return {ok: false, provider: provider.id, error: host.serializeError?.(error) ?? (error instanceof Error ? error.message : String(error))}
  }
}

async function browserChatRead(host: BrowserAgentHost, params: BrowserAgentJsonObject): Promise<BrowserAgentJsonObject> {
  const provider = browserAgentProviderForParams(params)
  let last: BrowserAgentJsonObject = {ok: false, provider: provider.id, error: "browser_chat.read did not run"}
  for (let attempt = 0; attempt <= BROWSER_CHAT_READ_RETRIES; attempt += 1) {
    last = await evaluateBrowserChatPayload(host, provider, params, provider.readExpression())
    if (last["ok"] === true || !isTransientBrowserChatError(asString(last["error"]))) return {...last, provider: provider.id}
    if (attempt < BROWSER_CHAT_READ_RETRIES) await delay(BROWSER_CHAT_READ_RETRY_MS)
  }
  return {...last, provider: provider.id}
}

async function browserChatWait(host: BrowserAgentHost, params: BrowserAgentJsonObject): Promise<BrowserAgentJsonObject> {
  const intervalMs = boundedNumber(asNumber(params["intervalMs"]), BROWSER_CHAT_READ_INTERVAL_MS, 200, 2_500)
  const stableTicks = boundedNumber(asNumber(params["stableTicks"]), BROWSER_CHAT_STABLE_TICKS, 1, 12)
  const timeoutMs = boundedNumber(asNumber(params["timeoutMs"]), BROWSER_CHAT_WAIT_TIMEOUT_MS, 1_000, 300_000)
  const afterMessageCount = asNumber(params["afterMessageCount"])
  const previousAssistantText = asString(params["previousAssistantText"])
  const startedAt = Date.now()
  let lastKey = ""
  let stable = 0
  let lastRead: BrowserAgentJsonObject = {ok: false, error: "browser_chat.read did not run"}

  while (Date.now() - startedAt < timeoutMs) {
    lastRead = await browserChatRead(host, params)
    const text = asString(lastRead["lastAssistantText"]) ?? ""
    const messageCount = browserChatMessageCount(lastRead)
    const generating = lastRead["generating"] === true
    const canFinish = Date.now() - startedAt >= BROWSER_CHAT_MIN_WAIT_MS && !generating
    const afterBaseline = afterMessageCount === undefined
      || messageCount >= afterMessageCount + 2
      || (previousAssistantText !== undefined && text !== previousAssistantText)
    if (text.length > 0 && afterBaseline) {
      const key = `${messageCount}:${text}`
      if (key === lastKey) stable += 1
      else stable = 0
      lastKey = key
      if (canFinish && stable >= stableTicks) return {...lastRead, ok: true, stable: true, waitedMs: Date.now() - startedAt}
    } else {
      stable = 0
    }
    await delay(intervalMs)
  }

  return {...lastRead, ok: false, stable: false, waitedMs: Date.now() - startedAt, error: "browser_chat.wait timed out"}
}

async function browserChatExchange(host: BrowserAgentHost, params: BrowserAgentJsonObject): Promise<BrowserAgentJsonObject> {
  const send = await browserChatSend(host, params)
  if (send["ok"] !== true) return send
  const wait = await browserChatWait(host, {
    ...params,
    previousAssistantText: asString(send["previousAssistantText"]) ?? asString(params["previousAssistantText"]),
    afterMessageCount: asNumber(send["previousMessageCount"]) ?? asNumber(params["afterMessageCount"]),
  })
  return {...wait, send}
}

async function browserChatConfigure(host: BrowserAgentHost, params: BrowserAgentJsonObject): Promise<BrowserAgentJsonObject> {
  const provider = browserAgentProviderForParams(params)
  if (provider.configureExpression === undefined) return {ok: false, provider: provider.id, error: `${provider.label} configure is not supported`}
  const waitUntilReady = asBoolean(params["waitUntilReady"]) ?? true
  const timeoutMs = boundedNumber(asNumber(params["configureTimeoutMs"]), BROWSER_CHAT_CONFIGURE_READY_TIMEOUT_MS, 1_000, 120_000)
  const startedAt = Date.now()
  while (true) {
    const configured = await evaluateBrowserChatPayload(host, provider, params, provider.configureExpression(params))
    if (configured["ok"] === true) return {...configured, provider: provider.id, waitedMs: Date.now() - startedAt}
    if (!waitUntilReady || !isBrowserChatBusyPayload(configured) || Date.now() - startedAt >= timeoutMs) {
      return {...configured, provider: provider.id, waitedMs: Date.now() - startedAt}
    }
    await delay(BROWSER_CHAT_SEND_READY_INTERVAL_MS)
  }
}

async function browserChatActivate(host: BrowserAgentHost, params: BrowserAgentJsonObject): Promise<BrowserAgentJsonObject> {
  const provider = browserAgentProviderForParams(params)
  if (host.activateTarget === undefined) return {ok: false, provider: provider.id, error: "activateTarget host callback is not available"}
  try {
    const target = await host.activateTarget(browserChatTargetParams(params, provider))
    return {ok: true, provider: provider.id, target}
  } catch (error) {
    return {ok: false, provider: provider.id, error: host.serializeError?.(error) ?? (error instanceof Error ? error.message : String(error))}
  }
}

async function evaluateBrowserChatPayload(host: BrowserAgentHost, provider: BrowserAgentProvider, params: BrowserAgentJsonObject, expression: string): Promise<BrowserAgentJsonObject> {
  try {
    const targetParams = browserChatTargetParams(params, provider)
    const viewport = await ensureBrowserChatDesktopViewport(host, targetParams)
    const evaluated = await host.evaluateExpression({
      ...targetParams,
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: asBoolean(params["userGesture"]) ?? true,
    })
    const value = runtimeEvaluateValue(evaluated.result)
    const payload = asObject(value)
    if (payload === undefined) return {ok: false, provider: provider.id, target: evaluated.target, error: "browser chat script returned non-object payload"}
    return {...payload, provider: provider.id, target: evaluated.target, ...(viewport === null ? {} : {viewport})}
  } catch (error) {
    return {ok: false, provider: provider.id, error: host.serializeError?.(error) ?? (error instanceof Error ? error.message : String(error))}
  }
}

function browserChatTargetParams(params: BrowserAgentJsonObject, provider: BrowserAgentProvider): BrowserAgentJsonObject {
  const target: BrowserAgentJsonObject = {}
  for (const key of ["targetId", "targetUrl", "targetTitle", "urlContains"] as const) {
    const value = asString(params[key])
    if (value !== undefined && value.length > 0) target[key] = value
  }
  if (target["targetId"] === undefined && target["targetUrl"] === undefined && target["targetTitle"] === undefined && target["urlContains"] === undefined) {
    target["urlContains"] = provider.urlContains
  }
  return target
}

function browserAgentProviderForParams(params: BrowserAgentJsonObject): BrowserAgentProvider {
  const requested = asString(params["provider"]) ?? asString(params["adapter"])
  const explicit = requested === undefined ? undefined : BROWSER_AGENT_PROVIDERS.find((provider) => provider.id === requested || provider.label.toLowerCase() === requested.toLowerCase())
  if (explicit !== undefined) return explicit
  const urlHint = `${asString(params["urlContains"]) ?? ""} ${asString(params["targetUrl"]) ?? ""} ${asString(params["targetTitle"]) ?? ""}`.toLowerCase()
  if (urlHint.includes("deepseek")) return DEEPSEEK_PROVIDER
  return QWEN_PROVIDER
}

async function ensureBrowserChatDesktopViewport(host: BrowserAgentHost, targetParams: BrowserAgentJsonObject): Promise<BrowserAgentJsonObject | null> {
  try {
    const state = await host.evaluateExpression({
      ...targetParams,
      expression: "({innerWidth, innerHeight, outerWidth, outerHeight, devicePixelRatio})",
      awaitPromise: false,
      returnByValue: true,
      userGesture: false,
    })
    const viewport = asObject(runtimeEvaluateValue(state.result))
    const width = asNumber(viewport?.["innerWidth"])
    const height = asNumber(viewport?.["innerHeight"])
    if (width !== undefined && height !== undefined && width >= 900 && height >= 500) return null
    const repaired = host.setViewport === undefined ? null : await host.setViewport({
      ...targetParams,
      width: 1920,
      height: 963,
      visibleWidth: 1920,
      visibleHeight: 963,
      deviceScaleFactor: 1,
      mobile: false,
      scale: 1,
    })
    return asObject(repaired) ?? null
  } catch {
    return null
  }
}

function runtimeEvaluateValue(result: BrowserAgentJsonObject): unknown {
  const exception = asObject(result["exceptionDetails"])
  if (exception !== undefined) {
    const text = asString(exception["text"]) ?? "Runtime.evaluate exception"
    const remoteException = asObject(exception["exception"])
    const description = remoteException === undefined ? undefined : asString(remoteException["description"])
    throw new Error(description ?? text)
  }
  const remote = asObject(result["result"])
  if (remote === undefined) throw new Error("Runtime.evaluate result is missing")
  const value = remote["value"]
  if (typeof value !== "string") return value
  const text = value.trim()
  if (!text.startsWith("{") && !text.startsWith("[")) return value
  try {
    return JSON.parse(text) as unknown
  } catch {
    return value
  }
}

function browserChatMessageCount(payload: BrowserAgentJsonObject): number {
  const messages = payload["messages"]
  return Array.isArray(messages) ? messages.length : 0
}

function browserChatAttachmentPaths(params: BrowserAgentJsonObject): string[] {
  const raw = params["attachmentPaths"] ?? params["filePaths"] ?? params["files"]
  if (!Array.isArray(raw)) return []
  return raw.filter((item): item is string => typeof item === "string" && item.length > 0)
}

function browserChatRecoveredSendPayload(message: string, sent: BrowserAgentJsonObject, read: BrowserAgentJsonObject): BrowserAgentJsonObject | null {
  if (read["ok"] !== true || !Array.isArray(read["messages"])) return null
  let lastUserIndex = -1
  read["messages"].forEach((raw, index) => {
    const record = asObject(raw)
    if (record !== undefined && asString(record["role"]) === "user") lastUserIndex = index
  })
  if (lastUserIndex < 0) return null
  const lastUser = asObject(read["messages"][lastUserIndex])
  const lastUserText = asString(lastUser?.["text"])
  if (lastUserText === undefined || !browserChatUserMessageMatches(message, lastUserText)) return null
  let previousAssistantText = ""
  for (let index = lastUserIndex - 1; index >= 0; index -= 1) {
    const record = asObject(read["messages"][index])
    if (record !== undefined && asString(record["role"]) === "assistant") {
      previousAssistantText = asString(record["text"]) ?? ""
      break
    }
  }
  return {
    ...sent,
    ok: true,
    recovered: true,
    recovery: "last-user-message-present",
    previousAssistantText,
    previousMessageCount: lastUserIndex,
  }
}

function browserChatUserMessageMatches(expected: string, actual: string): boolean {
  const left = comparableBrowserChatText(expected)
  const right = comparableBrowserChatText(actual)
  if (left.length === 0 || right.length === 0) return false
  if (left === right) return true
  if (left.length <= 240) return right.includes(left)
  return right.includes(left.slice(0, 180)) && right.includes(left.slice(-180))
}

function comparableBrowserChatText(text: string): string {
  return text.replace(/\u200b/g, "").replace(/\s+/g, " ").trim()
}

function isTransientBrowserChatError(error: string | undefined): boolean {
  return error !== undefined && /Promise was collected|Execution context was destroyed|Cannot find context|Target closed|WebSocket/i.test(error)
}

function isBrowserChatBusyPayload(payload: BrowserAgentJsonObject): boolean {
  if (payload["limitReached"] === true) return false
  const error = asString(payload["error"]) ?? ""
  return payload["busy"] === true
    || payload["generating"] === true
    || payload["canSend"] === false
    || /busy|not ready|generating|preference|still thinking|composer/i.test(error)
}

function boundedNumber(value: number | undefined, fallback: number, min: number, max: number): number {
  if (value === undefined || !Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, Math.round(value)))
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
