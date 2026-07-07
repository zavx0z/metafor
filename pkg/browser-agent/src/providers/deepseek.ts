export const DEFAULT_DEEPSEEK_URL_CONTAINS = "chat.deepseek.com"

export function deepseekSendExpression(message: string, newChat: boolean): string {
  return `(async function(){
    const message = ${JSON.stringify(message)};
    const newChat = ${JSON.stringify(newChat)};
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
    const disabled = (el) => !!el.disabled || el.getAttribute("aria-disabled") === "true" || el.getAttribute("disabled") !== null;
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
    const findSendButton = () => Array.from(document.querySelectorAll("button, [role=button]")).find((el) => {
      if (!visible(el) || disabled(el)) return false;
      const label = cleanInline([el.getAttribute("aria-label"), el.getAttribute("title"), el.getAttribute("data-testid"), el.className, el.innerText].join(" ")).toLowerCase();
      if (/stop|cancel|record|mic|voice/.test(label)) return false;
      return /send|submit|arrow|发送|送信/.test(label) || el.querySelector("svg") !== null && /send|arrow|paper/i.test(String(el.innerHTML || ""));
    });
    const generating = () => Array.from(document.querySelectorAll("button, [role=button], [class*=loading i], [class*=generating i], [class*=thinking i]")).some((el) => visible(el) && /stop|停止|cancel|generating|loading|thinking/i.test([el.getAttribute("aria-label"), el.getAttribute("title"), el.className, el.innerText].join(" ")));
    const transportState = () => {
      const input = findInput();
      const isGenerating = generating();
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
        "[class*=message i]",
        ".ds-markdown",
        ".markdown-body",
        ".markdown",
        "[class*=markdown i]"
      ].join(",");
      const seen = new Set();
      const messages = [];
      for (const el of Array.from(document.querySelectorAll(selectors))) {
        if (!visible(el) || el.closest("textarea, [contenteditable=true], nav, header, aside, form")) continue;
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
    if (accepted) return {ok:true, adapter:"deepseek", action:"click", previousAssistantText:before.assistantText, previousMessageCount:before.messageCount, ...statePayload(afterState)};
    return {ok:false, adapter:"deepseek", ...statePayload(afterState), busy:true, composerText:currentInput, error:"DeepSeek did not accept message yet"};
  })()`
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
    const disabled = (el) => !!el.disabled || el.getAttribute("aria-disabled") === "true" || el.getAttribute("disabled") !== null;
    const findInput = () => [document.querySelector("textarea"), document.querySelector("[contenteditable=true]"), document.querySelector("[role=textbox]")].filter(Boolean).find((el) => visible(el) && !disabled(el));
    const generating = Array.from(document.querySelectorAll("button, [role=button], [class*=loading i], [class*=generating i], [class*=thinking i]")).some((el) => visible(el) && /stop|停止|cancel|generating|loading|thinking/i.test([el.getAttribute("aria-label"), el.getAttribute("title"), el.className, el.innerText].join(" ")));
    const input = findInput();
    const canSend = !!input && !generating;
    const blockedReason = generating ? "DeepSeek is still generating" : !input ? "DeepSeek composer input not ready" : "";
    const roleFor = (el) => {
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
      "[class*=message i]",
      ".ds-markdown",
      ".markdown-body",
      ".markdown",
      "[class*=markdown i]"
    ].join(",");
    const seen = new Set();
    const messages = [];
    for (const el of Array.from(document.querySelectorAll(selectors))) {
      if (!visible(el) || el.closest("textarea, [contenteditable=true], nav, header, aside, form")) continue;
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
    return {ok:true, adapter:"deepseek", url:location.href, title:document.title, messages, messageCount:messages.length, lastAssistantText:lastAssistant ? lastAssistant.text : "", generating, preferenceActive:false, canSend, busy:!canSend, blockedReason};
  })()`
}
