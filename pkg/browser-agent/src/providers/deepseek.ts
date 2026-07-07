import type {BrowserAgentJsonObject} from "../types.ts"

export const DEFAULT_DEEPSEEK_URL_CONTAINS = "chat.deepseek.com"

export function deepseekSendExpression(message: string, newChat: boolean, params: BrowserAgentJsonObject = {}): string {
  const mode = deepseekModeFromParams(params)
  const deepThinking = deepseekDeepThinkingFromParams(params)
  return `(async function(){
    const message = ${JSON.stringify(message)};
    const newChat = ${JSON.stringify(newChat)};
    const mode = ${JSON.stringify(mode)};
    const deepThinking = ${JSON.stringify(deepThinking)};
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const clean = (text) => String(text || "").replace(/\\u200b/g, "").replace(/\\r\\n?/g, "\\n").split("\\n").map((line) => line.replace(/[ \\t]+/g, " ").trim()).join("\\n").replace(/\\n{3,}/g, "\\n\\n").trim();
    const cleanInline = (text) => String(text || "").replace(/\\u200b/g, "").replace(/[ \\t\\r\\n]+/g, " ").trim();
    const hasToolCalls = (text) => /<\\s*tool_calls\\s*>|\"tool_uses\"|\"recipient_name\"|\"recipientName\"/i.test(String(text || ""));
    const limitReasonFromText = (text) => {
      const flat = clean(text).split(String.fromCharCode(10)).join(" ");
      return /usage limit|daily limit|quota|rate limit|too many requests|лимит использования|дневн.*лимит/i.test(flat) ? "DeepSeek usage limit reached" : "";
    };
    const visible = (el) => {
      if (!el) return false;
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
    };
    const disabled = (el) => !!el.disabled || el.getAttribute("aria-disabled") === "true" || el.getAttribute("disabled") !== null || /(?:^|\\s|--)disabled(?:\\s|$)/i.test(String(el.className || ""));
    const stopButton = (el) => /M2 4\\.88|H11\\.12C12\\.3199|V11\\.12C14 12\\.3199/i.test(String(el.innerHTML || ""));
    const textOf = (el) => el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement ? el.value : (el.innerText || el.textContent || "");
    const comparable = (text) => clean(text).replace(/\\s+/g, " ").trim();
    const messageMatches = (expected, actual) => {
      const left = comparable(expected);
      const right = comparable(actual);
      if (!left || !right) return false;
      if (left === right) return true;
      if (left.length <= 240) return right.includes(left);
      return right.includes(left.slice(0, 180)) && right.includes(left.slice(-180));
    };
    const findInput = () => [
      document.querySelector("textarea"),
      document.querySelector("[contenteditable=true]"),
      document.querySelector("[role=textbox]"),
      document.querySelector("[data-testid*=chat-input i]"),
      document.querySelector("[class*=input i][contenteditable=true]")
    ].filter(Boolean).find((el) => visible(el) && !disabled(el));
    const findSendButton = () => {
      const input = findInput();
      const inputRect = input ? input.getBoundingClientRect() : null;
      const candidates = Array.from(document.querySelectorAll("button, [role=button]")).filter((el) => {
        if (!visible(el) || disabled(el)) return false;
        const label = cleanInline([el.getAttribute("aria-label"), el.getAttribute("title"), el.getAttribute("data-testid"), el.className, el.innerText].join(" ")).toLowerCase();
        if (/stop|cancel|record|mic|voice|attach|upload|file/.test(label)) return false;
        if (inputRect === null) return true;
        const rect = el.getBoundingClientRect();
        return rect.y >= inputRect.y - 80
          && rect.y <= inputRect.bottom + 120
          && rect.x >= inputRect.x + inputRect.width * 0.5;
      }).map((el) => {
        const rect = el.getBoundingClientRect();
        const label = cleanInline([el.getAttribute("aria-label"), el.getAttribute("title"), el.getAttribute("data-testid"), el.className, el.innerText].join(" ")).toLowerCase();
        let score = 0;
        if (/send|submit|arrow|发送|送信/.test(label)) score += 80;
        if (/primary|filled|circle/.test(label)) score += 30;
        if (el.querySelector("svg") !== null) score += 10;
        if (inputRect !== null) {
          score += rect.x;
          if (rect.x >= inputRect.right - 80) score += 120;
          score -= Math.abs((rect.y + rect.height / 2) - (inputRect.y + inputRect.height / 2)) / 10;
        }
        return {el, score};
      }).sort((left, right) => right.score - left.score);
      return candidates[0]?.el || null;
    };
    const generating = () => Array.from(document.querySelectorAll("button, [role=button], [class*=loading i], [class*=generating i], [class*=thinking i]")).some((el) => visible(el) && (/stop|停止|cancel|generating|loading|thinking/i.test([el.getAttribute("aria-label"), el.getAttribute("title"), el.className, el.innerText].join(" ")) || stopButton(el)));
    const selectMode = async () => {
      if (mode !== "expert" && mode !== "fast" && mode !== "vision") return "";
      const targetType = mode === "fast" ? "default" : mode;
      const radio = Array.from(document.querySelectorAll('[role=radio][data-model-type], [data-model-type]')).find((el) => visible(el) && el.getAttribute("data-model-type") === targetType);
      if (!radio) return "";
      const checked = radio.getAttribute("aria-checked") === "true" || /selected|active|checked/i.test(String(radio.className || ""));
      if (!checked) {
        radio.click();
        await wait(180);
      }
      return mode;
    };
    const selectDeepThinking = async () => {
      const toggle = Array.from(document.querySelectorAll(".ds-toggle-button, [role=button], button")).find((el) => visible(el) && /глубокое мышление|deep think|deepseek-r1|reason/i.test(cleanInline([el.innerText, el.textContent, el.getAttribute("aria-label"), el.getAttribute("title"), el.className].join(" "))));
      if (!toggle) return false;
      const selected = toggle.getAttribute("aria-pressed") === "true" || /selected/i.test(String(toggle.className || ""));
      if (deepThinking !== null && selected !== deepThinking) {
        toggle.click();
        await wait(180);
      }
      const nextSelected = toggle.getAttribute("aria-pressed") === "true" || /selected/i.test(String(toggle.className || ""));
      return nextSelected;
    };
    const lastAssistantControlsVisible = () => {
      const blocks = Array.from(document.querySelectorAll(".ds-markdown.ds-assistant-message-main-content, .markdown-body, .markdown")).filter((el) => visible(el) && !el.closest("textarea, [contenteditable=true], nav, header, aside, form"));
      const last = blocks[blocks.length - 1];
      if (!last) return false;
      const rect = last.getBoundingClientRect();
      return Array.from(document.querySelectorAll("button, [role=button]")).some((el) => {
        if (!visible(el) || disabled(el)) return false;
        const buttonRect = el.getBoundingClientRect();
        return buttonRect.y >= rect.bottom - 12 && buttonRect.y <= rect.bottom + 70 && buttonRect.x >= rect.x - 60 && buttonRect.x <= rect.x + 260;
      });
    };
    const transportState = () => {
      const input = findInput();
      const read = readMessages();
      const isGenerating = generating() || (read.assistantText.length > 0 && !lastAssistantControlsVisible());
      const inputReady = !!input && !disabled(input);
      const blockedReason = isGenerating ? "DeepSeek is still generating" : !inputReady ? "DeepSeek composer input not ready" : "";
      return {input, generating: isGenerating, preferenceActive: false, limitReached: false, canSend: inputReady && !isGenerating, blockedReason};
    };
    const statePayload = (state) => ({
      generating: state.generating,
      preferenceActive: false,
      limitReached: state.limitReached,
      canSend: state.canSend,
      busy: !state.canSend,
      blockedReason: state.blockedReason,
    });
    const roleFor = (el) => {
      if (el.matches(".ds-message")) return el.querySelector(".ds-assistant-message-main-content") ? "assistant" : "user";
      let node = el;
      for (let depth = 0; node && depth < 8; depth += 1, node = node.parentElement) {
        const label = String(node.className || "").toLowerCase() + " " + String(node.getAttribute("data-testid") || "").toLowerCase() + " " + String(node.getAttribute("data-role") || "").toLowerCase() + " " + String(node.getAttribute("role") || "").toLowerCase() + " " + String(node.getAttribute("aria-label") || "").toLowerCase();
        if (/user|human|question|query|request|mine|self/.test(label)) return "user";
        if (/assistant|answer|response|bot|ai|markdown|ds-markdown|message-content/.test(label)) return "assistant";
      }
      return null;
    };
    const readMessages = () => {
      const selectors = [
        "[data-testid*=message i]",
        "[data-message-id]",
        ".ds-message",
        "[class*=message i]",
        ".ds-markdown.ds-assistant-message-main-content",
        ".markdown-body",
        ".markdown"
      ].join(",");
      const seen = new Set();
      const messages = [];
      for (const el of Array.from(document.querySelectorAll(selectors))) {
        if (!visible(el) || el.closest("textarea, [contenteditable=true], nav, header, aside, form")) continue;
        if (el.closest(".ds-message") && !el.matches(".ds-message")) continue;
        const rawToolText = el.textContent || el.innerText;
        const rawText = el.innerText || el.textContent;
        const text = hasToolCalls(rawToolText) ? String(rawToolText || "").replace(/\\u200b/g, "").trim() : clean(rawText);
        if (text.length === 0 || text.length < 3) continue;
        const role = roleFor(el) || (hasToolCalls(text) ? "assistant" : null);
        if (role === null && text.length < 24) continue;
        const key = (role || "assistant") + ":" + text;
        if (seen.has(key)) continue;
        seen.add(key);
        messages.push({role: role || "assistant", text});
      }
      const latestAssistant = messages.slice().reverse().find((item) => item.role === "assistant");
      const latestUser = messages.slice().reverse().find((item) => item.role === "user");
      return {messages, messageCount: messages.length, assistantText: latestAssistant ? latestAssistant.text : "", userText: latestUser ? latestUser.text : ""};
    };
    if (newChat && location.hostname.includes("deepseek") && location.pathname !== "/") {
      location.assign("https://chat.deepseek.com/");
      await wait(150);
      return {ok:false, adapter:"deepseek", newChatNavigating:true, busy:true, canSend:false, generating:false, preferenceActive:false, blockedReason:"DeepSeek new chat navigation", error:"DeepSeek new chat navigation started"};
    }
    const selectedMode = await selectMode();
    const selectedDeepThinking = await selectDeepThinking();
    const before = readMessages();
    let state = transportState();
    if (!state.input) return {ok:false, adapter:"deepseek", ...statePayload(state), error:"DeepSeek composer input not found"};
    if (!state.canSend) return {ok:false, adapter:"deepseek", ...statePayload(state), error:state.blockedReason || "DeepSeek is not ready for input"};
    const input = state.input;
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
    await wait(180);
    state = transportState();
    if (!state.canSend) return {ok:false, adapter:"deepseek", ...statePayload(state), composerText:clean(textOf(input)), error:state.blockedReason || "DeepSeek became busy before send"};
    const send = findSendButton();
    if (!send) return {ok:false, adapter:"deepseek", ...statePayload(state), composerText:clean(textOf(input)), error:"DeepSeek send button not ready"};
    send.click();
    await wait(1200);
    const after = readMessages();
    const currentInput = clean(textOf(findInput() || input));
    const afterState = transportState();
    const limitReason = after.messageCount > before.messageCount ? limitReasonFromText(after.assistantText) : "";
    if (limitReason) return {ok:false, adapter:"deepseek", action:"click", previousAssistantText:before.assistantText, previousMessageCount:before.messageCount, ...statePayload(afterState), limitReached:true, canSend:false, busy:true, blockedReason:limitReason, error:limitReason};
    const accepted = currentInput.length === 0 || after.messageCount > before.messageCount || messageMatches(message, after.userText) || afterState.generating;
    if (accepted) return {ok:true, adapter:"deepseek", action:"click", mode:selectedMode, deepThinking:selectedDeepThinking, previousAssistantText:before.assistantText, previousMessageCount:before.messageCount, ...statePayload(afterState)};
    return {ok:false, adapter:"deepseek", ...statePayload(afterState), busy:true, composerText:currentInput, error:"DeepSeek did not accept message yet"};
  })()`
}

export function deepseekConfigureExpression(params: BrowserAgentJsonObject = {}): string {
  const mode = deepseekModeFromParams(params)
  const deepThinking = deepseekDeepThinkingFromParams(params)
  return `(async function(){
    const mode = ${JSON.stringify(mode)};
    const deepThinking = ${JSON.stringify(deepThinking)};
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const cleanInline = (text) => String(text || "").replace(/\\u200b/g, "").replace(/[ \\t\\r\\n]+/g, " ").trim();
    const visible = (el) => {
      if (!el) return false;
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
    };
    const selectedRadio = () => {
      const radio = Array.from(document.querySelectorAll('[role=radio][data-model-type], [data-model-type]')).find((el) => visible(el) && (el.getAttribute("aria-checked") === "true" || /selected|active|checked/i.test(String(el.className || ""))));
      const value = radio?.getAttribute("data-model-type") || "";
      return value === "default" ? "fast" : value;
    };
    const selectedDeepThinking = () => {
      const toggle = Array.from(document.querySelectorAll(".ds-toggle-button, [role=button], button")).find((el) => visible(el) && /глубокое мышление|deep think|deepseek-r1|reason/i.test(cleanInline([el.innerText, el.textContent, el.getAttribute("aria-label"), el.getAttribute("title"), el.className].join(" "))));
      if (!toggle) return null;
      return toggle.getAttribute("aria-pressed") === "true" || /selected/i.test(String(toggle.className || ""));
    };
    let changed = false;
    if (mode === "expert" || mode === "fast" || mode === "vision") {
      const targetType = mode === "fast" ? "default" : mode;
      const radio = Array.from(document.querySelectorAll('[role=radio][data-model-type], [data-model-type]')).find((el) => visible(el) && el.getAttribute("data-model-type") === targetType);
      if (!radio) return {ok:false, adapter:"deepseek", mode, deepThinking, error:"DeepSeek mode control not found"};
      const checked = radio.getAttribute("aria-checked") === "true" || /selected|active|checked/i.test(String(radio.className || ""));
      if (!checked) {
        radio.click();
        changed = true;
        await wait(180);
      }
    }
    if (deepThinking !== null) {
      const toggle = Array.from(document.querySelectorAll(".ds-toggle-button, [role=button], button")).find((el) => visible(el) && /глубокое мышление|deep think|deepseek-r1|reason/i.test(cleanInline([el.innerText, el.textContent, el.getAttribute("aria-label"), el.getAttribute("title"), el.className].join(" "))));
      if (!toggle) return {ok:false, adapter:"deepseek", mode, deepThinking, selectedMode:selectedRadio(), error:"DeepSeek thinking control not found"};
      const selected = toggle.getAttribute("aria-pressed") === "true" || /selected/i.test(String(toggle.className || ""));
      if (selected !== deepThinking) {
        toggle.click();
        changed = true;
        await wait(180);
      }
    }
    return {ok:true, adapter:"deepseek", mode, deepThinking, selectedMode:selectedRadio(), selectedDeepThinking:selectedDeepThinking(), changed};
  })()`
}

function deepseekModeFromParams(params: BrowserAgentJsonObject): "fast" | "expert" | "vision" | "" {
  const rawMode = typeof params["mode"] === "string" ? params["mode"]
    : typeof params["deepseekMode"] === "string" ? params["deepseekMode"]
      : typeof params["providerMode"] === "string" ? params["providerMode"]
        : ""
  return /vision|recognition|recognize|image|распозн/i.test(rawMode)
    ? "vision"
    : /expert|эксперт/i.test(rawMode)
      ? "expert"
      : /fast|quick|basic|быстр/i.test(rawMode) ? "fast" : ""
}

function deepseekDeepThinkingFromParams(params: BrowserAgentJsonObject): boolean | null {
  if (typeof params["deepThinking"] === "boolean") return params["deepThinking"]
  if (typeof params["thinking"] === "boolean") return params["thinking"]
  const rawMode = typeof params["mode"] === "string" ? params["mode"]
    : typeof params["deepseekMode"] === "string" ? params["deepseekMode"]
      : typeof params["providerMode"] === "string" ? params["providerMode"]
        : ""
  return /deep.?thinking|reason|глубокое мышление/i.test(rawMode) ? true : null
}

export function deepseekReadExpression(): string {
  return String.raw`(async function(){
    const clean = (text) => String(text || "").replace(/\u200b/g, "").replace(/\r\n?/g, "\n").split("\n").map((line) => line.replace(/[ \t]+/g, " ").trim()).join("\n").replace(/\n{3,}/g, "\n\n").trim();
    const cleanPreserved = (text) => String(text || "").replace(/\u200b/g, "").replace(/\u00a0/g, " ").replace(/\r\n?/g, "\n").trim();
    const hasToolCalls = (text) => /<\s*tool_calls\s*>|"tool_uses"|"recipient_name"|"recipientName"/i.test(String(text || ""));
    const visible = (el) => {
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
    };
    const disabled = (el) => !!el.disabled || el.getAttribute("aria-disabled") === "true" || el.getAttribute("disabled") !== null || /(?:^|\\s|--)disabled(?:\\s|$)/i.test(String(el.className || ""));
    const stopButton = (el) => /M2 4\\.88|H11\\.12C12\\.3199|V11\\.12C14 12\\.3199/i.test(String(el.innerHTML || ""));
    const findInput = () => [document.querySelector("textarea"), document.querySelector("[contenteditable=true]"), document.querySelector("[role=textbox]")].filter(Boolean).find((el) => visible(el) && !disabled(el));
    const buttonGenerating = Array.from(document.querySelectorAll("button, [role=button], [class*=loading i], [class*=generating i], [class*=thinking i]")).some((el) => visible(el) && (/stop|停止|cancel|generating|loading|thinking/i.test([el.getAttribute("aria-label"), el.getAttribute("title"), el.className, el.innerText].join(" ")) || stopButton(el)));
    const lastAssistantControlsVisible = () => {
      const blocks = Array.from(document.querySelectorAll(".ds-markdown.ds-assistant-message-main-content, .markdown-body, .markdown")).filter((el) => visible(el) && !el.closest("textarea, [contenteditable=true], nav, header, aside, form"));
      const last = blocks[blocks.length - 1];
      if (!last) return false;
      const rect = last.getBoundingClientRect();
      return Array.from(document.querySelectorAll("button, [role=button]")).some((el) => {
        if (!visible(el) || disabled(el)) return false;
        const buttonRect = el.getBoundingClientRect();
        return buttonRect.y >= rect.bottom - 12 && buttonRect.y <= rect.bottom + 70 && buttonRect.x >= rect.x - 60 && buttonRect.x <= rect.x + 260;
      });
    };
    const input = findInput();
    let generating = buttonGenerating;
    const roleFor = (el) => {
      if (el.matches(".ds-message")) return el.querySelector(".ds-assistant-message-main-content") ? "assistant" : "user";
      let node = el;
      for (let depth = 0; node && depth < 8; depth += 1, node = node.parentElement) {
        const label = String(node.className || "").toLowerCase() + " " + String(node.getAttribute("data-testid") || "").toLowerCase() + " " + String(node.getAttribute("data-role") || "").toLowerCase() + " " + String(node.getAttribute("role") || "").toLowerCase() + " " + String(node.getAttribute("aria-label") || "").toLowerCase();
        if (/user|human|question|query|request|mine|self/.test(label)) return "user";
        if (/assistant|answer|response|bot|ai|markdown|ds-markdown|message-content/.test(label)) return "assistant";
      }
      return null;
    };
    const selectors = [
      "[data-testid*=message i]",
      "[data-message-id]",
      ".ds-message",
      "[class*=message i]",
      ".ds-markdown.ds-assistant-message-main-content",
      ".markdown-body",
      ".markdown"
    ].join(",");
    const seen = new Set();
    const messages = [];
    for (const el of Array.from(document.querySelectorAll(selectors))) {
      if (!visible(el) || el.closest("textarea, [contenteditable=true], nav, header, aside, form")) continue;
      if (el.closest(".ds-message") && !el.matches(".ds-message")) continue;
      const rawToolText = el.textContent || el.innerText;
      const rawText = el.innerText || el.textContent;
      const text = hasToolCalls(rawToolText) ? cleanPreserved(rawToolText) : clean(rawText);
      if (text.length === 0 || text.length < 3) continue;
      const role = roleFor(el) || (hasToolCalls(text) ? "assistant" : null);
      if (role === null && text.length < 24) continue;
      const key = (role || "assistant") + ":" + text;
      if (seen.has(key)) continue;
      seen.add(key);
      messages.push({role: role || "assistant", text});
    }
    const lastAssistant = messages.slice().reverse().find((message) => message.role === "assistant");
    if (!generating && lastAssistant && !lastAssistantControlsVisible()) generating = true;
    const canSend = !!input && !generating;
    const blockedReason = generating ? "DeepSeek is still generating" : !input ? "DeepSeek composer input not ready" : "";
    return {ok:true, adapter:"deepseek", url:location.href, title:document.title, messages, messageCount:messages.length, lastAssistantText:lastAssistant ? lastAssistant.text : "", generating, preferenceActive:false, canSend, busy:!canSend, blockedReason};
  })()`
}
