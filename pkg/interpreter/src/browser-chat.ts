import {serializeError} from "./errors.ts"
import {asBoolean, asNumber, asObject, asString} from "./guards.ts"
import type {JsonObject} from "./types.ts"
import {evaluateChromeDevtoolsExpression, setChromeDevtoolsDeviceMetrics} from "./chrome-devtools.ts"

const DEFAULT_QWEN_URL_CONTAINS = "chat.qwen.ai"
const BROWSER_CHAT_READ_INTERVAL_MS = 650
const BROWSER_CHAT_STABLE_TICKS = 8
const BROWSER_CHAT_MIN_WAIT_MS = 6_000
const BROWSER_CHAT_WAIT_TIMEOUT_MS = 90_000
const BROWSER_CHAT_READ_RETRY_MS = 220
const BROWSER_CHAT_READ_RETRIES = 2

export async function runBrowserChatToolUse(name: string, params: JsonObject): Promise<JsonObject | null> {
  if (name === "browser_chat.send") return await browserChatSend(params)
  if (name === "browser_chat.read") return await browserChatRead(params)
  if (name === "browser_chat.wait") return await browserChatWait(params)
  if (name === "browser_chat.exchange") return await browserChatExchange(params)
  return null
}

async function browserChatSend(params: JsonObject): Promise<JsonObject> {
  const message = asString(params["message"]) ?? asString(params["text"])
  if (message === undefined || message.trim().length === 0) return {ok: false, error: "message required"}
  return await evaluateBrowserChatPayload(params, qwenSendExpression(message))
}

async function browserChatRead(params: JsonObject): Promise<JsonObject> {
  let last: JsonObject = {ok: false, error: "browser_chat.read did not run"}
  for (let attempt = 0; attempt <= BROWSER_CHAT_READ_RETRIES; attempt += 1) {
    last = await evaluateBrowserChatPayload(params, qwenReadExpression())
    if (last["ok"] === true || !isTransientBrowserChatError(asString(last["error"]))) return last
    if (attempt < BROWSER_CHAT_READ_RETRIES) await delay(BROWSER_CHAT_READ_RETRY_MS)
  }
  return last
}

async function browserChatWait(params: JsonObject): Promise<JsonObject> {
  const intervalMs = boundedNumber(asNumber(params["intervalMs"]), BROWSER_CHAT_READ_INTERVAL_MS, 200, 2_500)
  const stableTicks = boundedNumber(asNumber(params["stableTicks"]), BROWSER_CHAT_STABLE_TICKS, 1, 12)
  const timeoutMs = boundedNumber(asNumber(params["timeoutMs"]), BROWSER_CHAT_WAIT_TIMEOUT_MS, 1_000, 300_000)
  const afterMessageCount = asNumber(params["afterMessageCount"])
  const previousAssistantText = asString(params["previousAssistantText"])
  const startedAt = Date.now()
  let lastKey = ""
  let stable = 0
  let lastRead: JsonObject = {ok: false, error: "browser_chat.read did not run"}

  while (Date.now() - startedAt < timeoutMs) {
    lastRead = await browserChatRead(params)
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

async function browserChatExchange(params: JsonObject): Promise<JsonObject> {
  const send = await browserChatSend(params)
  if (send["ok"] !== true) return send
  const wait = await browserChatWait({
    ...params,
    previousAssistantText: asString(send["previousAssistantText"]) ?? asString(params["previousAssistantText"]),
    afterMessageCount: asNumber(send["previousMessageCount"]) ?? asNumber(params["afterMessageCount"]),
  })
  return {...wait, send}
}

async function evaluateBrowserChatPayload(params: JsonObject, expression: string): Promise<JsonObject> {
  try {
    const targetParams = browserChatTargetParams(params)
    const viewport = await ensureBrowserChatDesktopViewport(targetParams)
    const evaluated = await evaluateChromeDevtoolsExpression({
      ...targetParams,
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: asBoolean(params["userGesture"]) ?? true,
    })
    const value = runtimeEvaluateValue(evaluated.result)
    const payload = asObject(value)
    if (payload === undefined) return {ok: false, target: evaluated.target, error: "browser chat script returned non-object payload"}
    return {...payload, target: evaluated.target, ...(viewport === null ? {} : {viewport})}
  } catch (error) {
    return {ok: false, error: serializeError(error)}
  }
}

function browserChatTargetParams(params: JsonObject): JsonObject {
  const target: JsonObject = {}
  for (const key of ["targetId", "targetUrl", "targetTitle", "urlContains"] as const) {
    const value = asString(params[key])
    if (value !== undefined && value.length > 0) target[key] = value
  }
  if (target["targetId"] === undefined && target["targetUrl"] === undefined && target["targetTitle"] === undefined && target["urlContains"] === undefined) {
    target["urlContains"] = DEFAULT_QWEN_URL_CONTAINS
  }
  return target
}

async function ensureBrowserChatDesktopViewport(targetParams: JsonObject): Promise<JsonObject | null> {
  try {
    const state = await evaluateChromeDevtoolsExpression({
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
    const repaired = await setChromeDevtoolsDeviceMetrics({
      ...targetParams,
      width: 1920,
      height: 963,
      visibleWidth: 1920,
      visibleHeight: 963,
      deviceScaleFactor: 1,
      mobile: false,
      scale: 1,
    })
    return repaired.viewport
  } catch {
    return null
  }
}

function runtimeEvaluateValue(result: JsonObject): unknown {
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

function browserChatMessageCount(payload: JsonObject): number {
  const messages = payload["messages"]
  return Array.isArray(messages) ? messages.length : 0
}

function isTransientBrowserChatError(error: string | undefined): boolean {
  return error !== undefined && /Promise was collected|Execution context was destroyed|Cannot find context|Target closed|WebSocket/i.test(error)
}

function qwenSendExpression(message: string): string {
  return `(async function(){
    const message = ${JSON.stringify(message)};
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const clean = (text) => String(text || "").replace(/\\u200b/g, "").replace(/\\s+\\n/g, "\\n").replace(/\\n\\s+/g, "\\n").replace(/[ \\t]+/g, " ").trim();
    const cleanAnswer = (text) => clean(text).split("\\n").map((line) => line.trim()).filter((line) => line && !/^(Finalize the response|Пропустить)$/i.test(line)).join("\\n").trim();
    const visible = (el) => {
      if (!el) return false;
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
    };
    const snapshot = () => {
      const messages = Array.from(document.querySelectorAll(".qwen-chat-message")).filter(visible).map((el) => {
        const className = String(el.className || "").toLowerCase();
        const role = className.includes("qwen-chat-message-user") ? "user" : "assistant";
        const content = role === "user"
          ? (el.querySelector(".user-message-content, .chat-user-message") || el)
          : (el.querySelector(".response-message-content .qwen-markdown, .custom-qwen-markdown, .qwen-markdown, .response-message-content") || el);
        const rawText = content.innerText || content.textContent;
        return {role, text: role === "assistant" ? cleanAnswer(rawText) : clean(rawText)};
      }).filter((message) => message.text.length > 0);
      const latestAssistant = messages.slice().reverse().find((message) => message.role === "assistant");
      return {messageCount: messages.length, assistantText: latestAssistant ? latestAssistant.text : ""};
    };
    const before = snapshot();
    const input = [
      document.querySelector("textarea.message-input-textarea"),
      ...document.querySelectorAll("textarea, [contenteditable=true], [role=textbox]")
    ].find(visible);
    if (!input) return {ok:false, adapter:"qwen", error:"Qwen composer input not found"};

    input.focus();
    if (input instanceof HTMLTextAreaElement || input instanceof HTMLInputElement) {
      const proto = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
      if (setter) setter.call(input, message);
      else input.value = message;
    } else {
      input.textContent = message;
    }
    input.dispatchEvent(new InputEvent("input", {bubbles:true, inputType:"insertText", data:message}));
    input.dispatchEvent(new Event("change", {bubbles:true}));
    await wait(90);

    const send = [
      document.querySelector(".message-input-right-button-send button.send-button"),
      document.querySelector(".chat-prompt-send-button button.send-button"),
      ...document.querySelectorAll("button.send-button, button[aria-label*=send i], [role=button][aria-label*=send i]")
    ].find((el) => visible(el) && !el.disabled && el.getAttribute("aria-disabled") !== "true" && !String(el.className || "").toLowerCase().includes("record"));
    if (send) {
      send.click();
      return {ok:true, adapter:"qwen", action:"click", inputSelector:"textarea.message-input-textarea", sendSelector:"button.send-button", previousAssistantText:before.assistantText, previousMessageCount:before.messageCount};
    }

    input.dispatchEvent(new KeyboardEvent("keydown", {key:"Enter", code:"Enter", bubbles:true, cancelable:true}));
    input.dispatchEvent(new KeyboardEvent("keyup", {key:"Enter", code:"Enter", bubbles:true, cancelable:true}));
    return {ok:true, adapter:"qwen", action:"enter", inputSelector:"textarea.message-input-textarea", previousAssistantText:before.assistantText, previousMessageCount:before.messageCount};
  })()`
}

function qwenReadExpression(): string {
  return String.raw`(function(){
    const clean = (text) => String(text || "").replace(/\u200b/g, "").replace(/\r\n?/g, "\n").split("\n").map((line) => line.replace(/[ \t]+/g, " ").trim()).join("\n").replace(/\n{3,}/g, "\n\n").trim();
    const cleanInline = (text) => String(text || "").replace(/\u200b/g, "").replace(/[ \t\r\n]+/g, " ").trim();
    const cleanAnswer = (text) => clean(text).split("\n").map((line) => line.trim()).filter((line) => line && !/^(Finalize the response|Пропустить|Завершено размышление)$/i.test(line)).join("\n").trim();
    const visible = (el) => {
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
    };
    const markdownText = (root) => {
      const selector = "h1,h2,h3,h4,h5,h6,p,li,pre,blockquote";
      const nodes = Array.from(root.querySelectorAll(selector)).filter((node) => {
        let parent = node.parentElement;
        while (parent && parent !== root) {
          if (parent.matches(selector)) return false;
          parent = parent.parentElement;
        }
        return visible(node);
      });
      if (nodes.length === 0) return cleanAnswer(root.innerText || root.textContent);
      const lines = [];
      for (const node of nodes) {
        const tag = node.tagName.toLowerCase();
        const text = tag === "pre" ? clean(node.innerText || node.textContent) : cleanInline(node.innerText || node.textContent);
        if (!text || /^(Finalize the response|Пропустить|Завершено размышление)$/i.test(text)) continue;
        if (tag === "li") lines.push("- " + text);
        else lines.push(text);
      }
      return cleanAnswer(lines.join("\n"));
    };
    const assistantTexts = (el) => {
      const parts = Array.from(el.querySelectorAll(".qwen-markdown")).filter(visible);
      const content = parts.length > 0 ? parts : [el.querySelector(".response-message-content, .custom-qwen-markdown") || el];
      const seen = new Set();
      const texts = [];
      for (const part of content) {
        const text = markdownText(part);
        if (text.length === 0 || seen.has(text)) continue;
        seen.add(text);
        texts.push(text);
      }
      if (texts.length > 0) return texts;
      const fallback = cleanAnswer(el.innerText || el.textContent);
      return fallback.length === 0 ? [] : [fallback];
    };
    const lastAssistantText = (messages) => {
      let last = messages.length - 1;
      while (last >= 0 && messages[last].role !== "assistant") last -= 1;
      if (last < 0) return "";
      let first = last;
      while (first > 0 && messages[first - 1].role === "assistant" && messages[first - 1].variantCount === messages[last].variantCount) first -= 1;
      return messages.slice(first, last + 1).filter((message) => message.role === "assistant").map((message) => {
        return message.variantCount > 1 ? "Вариант " + message.variantIndex + "/" + message.variantCount + ":\n" + message.text : message.text;
      }).join("\n\n").trim();
    };
    const qwenBlocks = Array.from(document.querySelectorAll(".qwen-chat-message")).filter(visible);
    if (qwenBlocks.length > 0) {
      const messages = [];
      for (const el of qwenBlocks) {
        const className = String(el.className || "").toLowerCase();
        const role = className.includes("qwen-chat-message-user") ? "user" : "assistant";
        if (role === "user") {
          const content = el.querySelector(".user-message-content, .chat-user-message") || el;
          const text = clean(content.innerText || content.textContent);
          if (text.length > 0) messages.push({role, text});
          continue;
        }
        const texts = assistantTexts(el);
        const variantCount = className.includes("dual-message") || texts.length > 1 ? texts.length : 0;
        texts.forEach((text, index) => {
          const message = {role, text};
          if (variantCount > 1) {
            message.variantIndex = index + 1;
            message.variantCount = variantCount;
          }
          messages.push(message);
        });
      }
      const generating = !!document.querySelector(".send-button.loading, .stop-button, [class*=stop-generating i], [class*=generating i]");
      return {ok:true, adapter:"qwen", url:location.href, title:document.title, messages, messageCount:messages.length, lastAssistantText:lastAssistantText(messages), generating};
    }
    const roleFor = (el) => {
      let node = el;
      for (let depth = 0; node && depth < 6; depth += 1, node = node.parentElement) {
        const label = String(node.className || "").toLowerCase() + " " + String(node.getAttribute("data-testid") || "").toLowerCase() + " " + String(node.getAttribute("data-role") || "").toLowerCase() + " " + String(node.getAttribute("aria-label") || "").toLowerCase();
        if (/user|human|question|query|request|mine|self/.test(label)) return "user";
        if (/assistant|answer|response|bot|ai|markdown|chat-message-content/.test(label)) return "assistant";
      }
      return null;
    };
    const skip = (el, text) => {
      if (!visible(el)) return true;
      if (el.closest(".message-input, .chat-search-input, .qwen-chat-layout-help, .slide-switch, .user-menu-btn, .ant-select, nav, header, aside")) return true;
      if (text.length === 0 || text === "?" || text === "Автоматический") return true;
      return false;
    };
    const selectors = [
      "[data-message-id]",
      "[data-testid*=message i]",
      ".chat-message",
      ".message",
      ".message-content",
      ".chat-message-content",
      ".qwen-chat-message",
      ".chat-response-message",
      ".user-message",
      ".chat-user-message",
      ".assistant-message",
      ".response-message",
      ".response-content",
      ".response-message-content",
      ".user-message-content",
      ".markdown-body",
      ".markdown"
    ].join(",");
    const seen = new Set();
    const messages = [];
    for (const el of Array.from(document.querySelectorAll(selectors))) {
      const text = clean(el.innerText || el.textContent);
      if (skip(el, text)) continue;
      const role = roleFor(el);
      if (role === null && text.length < 24) continue;
      const key = (role || "assistant") + ":" + text;
      if (seen.has(key)) continue;
      seen.add(key);
      messages.push({role: role || "assistant", text});
    }
    const generating = !!document.querySelector(".send-button.loading, .stop-button, [class*=stop-generating i], [class*=generating i]");
    return {ok:true, adapter:"qwen", url:location.href, title:document.title, messages, messageCount:messages.length, lastAssistantText:lastAssistantText(messages), generating};
  })()`
}

function boundedNumber(value: number | undefined, fallback: number, min: number, max: number): number {
  if (value === undefined || !Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, Math.round(value)))
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
