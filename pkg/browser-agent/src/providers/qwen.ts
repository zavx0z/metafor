export const DEFAULT_QWEN_URL_CONTAINS = "chat.qwen.ai"

export function qwenSendExpression(message: string, newChat: boolean): string {
  return `(async function(){
    const message = ${JSON.stringify(message)};
    const newChat = ${JSON.stringify(newChat)};
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const clean = (text) => String(text || "").replace(/\\u200b/g, "").replace(/\\s+\\n/g, "\\n").replace(/\\n\\s+/g, "\\n").replace(/[ \\t]+/g, " ").trim();
    const cleanAnswer = (text) => clean(text).split("\\n").map((line) => line.trim()).filter((line) => line && !/^(Finalize the response|Пропустить)$/i.test(line)).join("\\n").trim();
    const hasToolCalls = (text) => /<tool_calls>|\"tool_uses\"|\"recipient_name\"|\"recipientName\"/i.test(String(text || ""));
    const limitReasonFromText = (text) => {
      const value = clean(text);
      if (!value) return "";
      const flat = value.split(String.fromCharCode(10)).join(" ");
      return /дневн.*лимит|лимит использования|достигли.*лимит|usage limit|daily limit|quota|rate limit|too many requests/i.test(flat) ? "Qwen usage limit reached" : "";
    };
    const isPreferenceButton = (el) => /^(Предпочитаю этот ответ|Prefer this response)$/i.test(clean(el.innerText || el.textContent));
    const comparable = (text) => clean(text).replace(/\\s+/g, " ").trim();
    const messageMatches = (expected, actual) => {
      const left = comparable(expected);
      const right = comparable(actual);
      if (!left || !right) return false;
      if (left === right) return true;
      if (left.length <= 240) return right.includes(left);
      return right.includes(left.slice(0, 180)) && right.includes(left.slice(-180));
    };
    const visible = (el) => {
      if (!el) return false;
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
    };
    const disabled = (el) => !!el.disabled || el.getAttribute("aria-disabled") === "true" || el.getAttribute("disabled") !== null;
    const textOf = (el) => el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement ? el.value : (el.innerText || el.textContent || "");
    const inputCandidates = () => [
      document.querySelector("textarea.message-input-textarea"),
      ...document.querySelectorAll("textarea, [contenteditable=true], [role=textbox]")
    ].filter(Boolean);
    const findInput = () => inputCandidates().find((el) => visible(el));
    const findSendButton = () => [
      document.querySelector(".message-input-right-button-send button.send-button"),
      document.querySelector(".chat-prompt-send-button button.send-button"),
      ...document.querySelectorAll("button.send-button, button[aria-label*=send i], [role=button][aria-label*=send i]")
    ].find((el) => visible(el) && !disabled(el) && !String(el.className || "").toLowerCase().includes("record"));
    const transportState = () => {
      const input = findInput();
      const generating = Array.from(document.querySelectorAll(".send-button.loading, .stop-button, [class*=stop-generating i], [class*=generating i]")).some((el) => visible(el));
      const preferenceActive = Array.from(document.querySelectorAll("button, [role=button]")).some((el) => visible(el) && isPreferenceButton(el));
      const inputReady = !!input && !disabled(input);
      const blockedReason = generating ? "Qwen is still generating"
        : preferenceActive ? "Qwen response choice is active"
          : !inputReady ? "Qwen composer input not ready"
            : "";
      return {input, generating, preferenceActive, limitReached: false, canSend: inputReady && !generating && !preferenceActive, blockedReason};
    };
    const selectResponsePreference = () => {
      const blocks = Array.from(document.querySelectorAll(".qwen-chat-message-dual-message, .dual-message, .qwen-chat-message")).filter(visible).reverse();
      let fallbackButton = null;
      for (const block of blocks) {
        const buttons = Array.from(block.querySelectorAll("button, [role=button]")).filter((el) => visible(el) && isPreferenceButton(el));
        if (buttons.length === 0) continue;
        if (!fallbackButton) fallbackButton = buttons[0];
        const nodes = Array.from(block.querySelectorAll(".response-message-content, .qwen-markdown, pre, code")).filter((el) => visible(el) && hasToolCalls(el.textContent || el.innerText));
        const toolNode = nodes[0];
        if (!toolNode) continue;
        const toolRect = toolNode.getBoundingClientRect();
        const toolCenterX = toolRect.x + toolRect.width / 2;
        let selected = buttons[0];
        let selectedScore = Infinity;
        for (const button of buttons) {
          const rect = button.getBoundingClientRect();
          const score = Math.abs((rect.x + rect.width / 2) - toolCenterX);
          if (score < selectedScore) {
            selected = button;
            selectedScore = score;
          }
        }
        selected.click();
        return "tool-call";
      }
      if (fallbackButton) {
        fallbackButton.click();
        return "first";
      }
      return "";
    };
    if (newChat && location.pathname.startsWith("/c/")) {
      location.assign("https://chat.qwen.ai/");
      await wait(150);
      return {ok:false, adapter:"qwen", newChatNavigating:true, busy:true, canSend:false, generating:false, preferenceActive:false, blockedReason:"Qwen new chat navigation", error:"Qwen new chat navigation started"};
    }
    const statePayload = (state) => ({
      generating: state.generating,
      preferenceActive: state.preferenceActive,
      limitReached: state.limitReached,
      canSend: state.canSend,
      busy: !state.canSend,
      blockedReason: state.blockedReason,
    });
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
      const latestUser = messages.slice().reverse().find((message) => message.role === "user");
      return {messages, messageCount: messages.length, assistantText: latestAssistant ? latestAssistant.text : "", userText: latestUser ? latestUser.text : ""};
    };
    let before = snapshot();
    let state = transportState();
    let preferenceAutoSelected = "";
    if (state.preferenceActive) {
      preferenceAutoSelected = selectResponsePreference();
      if (preferenceAutoSelected) {
        await wait(700);
        for (let attempt = 0; attempt < 12; attempt += 1) {
          state = transportState();
          if (!state.preferenceActive) break;
          await wait(250);
        }
        before = snapshot();
      }
    }
    if (!state.input) return {ok:false, adapter:"qwen", ...statePayload(state), error:"Qwen composer input not found"};
    if (!state.canSend) return {ok:false, adapter:"qwen", ...statePayload(state), error:state.blockedReason || "Qwen is not ready for input"};

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
    if (!state.canSend) return {ok:false, adapter:"qwen", ...statePayload(state), composerText:clean(textOf(input)), error:state.blockedReason || "Qwen became busy before send"};
    const send = findSendButton();
    if (send) {
      send.click();
      await wait(1200);
      const after = snapshot();
      const currentInput = clean(textOf(findInput() || input));
      const afterState = transportState();
      const limitReason = after.messageCount > before.messageCount ? limitReasonFromText(after.assistantText) : "";
      if (limitReason) return {ok:false, adapter:"qwen", action:"click", inputSelector:"textarea.message-input-textarea", sendSelector:"button.send-button", previousAssistantText:before.assistantText, previousMessageCount:before.messageCount, preferenceAutoSelected, ...statePayload(afterState), limitReached:true, canSend:false, busy:true, blockedReason:limitReason, error:limitReason};
      const accepted = currentInput.length === 0 || after.messageCount > before.messageCount || messageMatches(message, after.userText) || afterState.generating;
      if (accepted) return {ok:true, adapter:"qwen", action:"click", inputSelector:"textarea.message-input-textarea", sendSelector:"button.send-button", previousAssistantText:before.assistantText, previousMessageCount:before.messageCount, preferenceAutoSelected, ...statePayload(afterState)};
      return {ok:false, adapter:"qwen", ...statePayload(afterState), busy:true, composerText:currentInput, error:"Qwen did not accept message yet"};
    }

    return {ok:false, adapter:"qwen", ...statePayload(state), composerText:clean(textOf(input)), error:"Qwen send button not ready"};
  })()`
}

export function qwenReadExpression(): string {
  return String.raw`(async function(){
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const clean = (text) => String(text || "").replace(/\u200b/g, "").replace(/\r\n?/g, "\n").split("\n").map((line) => line.replace(/[ \t]+/g, " ").trim()).join("\n").replace(/\n{3,}/g, "\n\n").trim();
    const cleanInline = (text) => String(text || "").replace(/\u200b/g, "").replace(/[ \t\r\n]+/g, " ").trim();
    const cleanPreserved = (text) => String(text || "").replace(/\u200b/g, "").replace(/\u00a0/g, " ").replace(/\r\n?/g, "\n").trim();
    const cleanPreservedAnswer = (text) => cleanPreserved(text).split("\n").filter((line) => !/^(Finalize the response|Пропустить|Завершено размышление)$/i.test(line.trim())).join("\n").trim();
    const cleanAnswer = (text) => clean(text).split("\n").map((line) => line.trim()).filter((line) => line && !/^(Finalize the response|Пропустить|Завершено размышление)$/i.test(line)).join("\n").trim();
    const hasToolCalls = (text) => /<\s*tool_calls\s*>|"tool_uses"|"recipient_name"|"recipientName"/i.test(String(text || ""));
    const isPreferenceButton = (el) => /^(Предпочитаю этот ответ|Prefer this response)$/i.test(cleanInline(el.innerText || el.textContent));
    const visible = (el) => {
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
    };
    const disabled = (el) => !!el.disabled || el.getAttribute("aria-disabled") === "true" || el.getAttribute("disabled") !== null;
    const transportState = () => {
      const input = [
        document.querySelector("textarea.message-input-textarea"),
        ...document.querySelectorAll("textarea, [contenteditable=true], [role=textbox]")
      ].find((el) => el && visible(el));
      const generating = Array.from(document.querySelectorAll(".send-button.loading, .stop-button, [class*=stop-generating i], [class*=generating i]")).some((el) => visible(el));
      const preferenceActive = Array.from(document.querySelectorAll("button, [role=button]")).some((el) => visible(el) && isPreferenceButton(el));
      const inputReady = !!input && !disabled(input);
      const blockedReason = generating ? "Qwen is still generating"
        : preferenceActive ? "Qwen response choice is active"
          : !inputReady ? "Qwen composer input not ready"
            : "";
      return {generating, preferenceActive, canSend: inputReady && !generating && !preferenceActive, busy: !inputReady || generating || preferenceActive, blockedReason};
    };
    const selectResponsePreference = () => {
      const blocks = Array.from(document.querySelectorAll(".qwen-chat-message-dual-message, .dual-message, .qwen-chat-message")).filter(visible).reverse();
      let fallbackButton = null;
      for (const block of blocks) {
        const buttons = Array.from(block.querySelectorAll("button, [role=button]")).filter((el) => visible(el) && isPreferenceButton(el));
        if (buttons.length === 0) continue;
        if (!fallbackButton) fallbackButton = buttons[0];
        const nodes = Array.from(block.querySelectorAll(".response-message-content, .qwen-markdown, pre, code")).filter((el) => visible(el) && hasToolCalls(el.innerText || el.textContent));
        const toolNode = nodes[0];
        if (!toolNode) continue;
        const toolRect = toolNode.getBoundingClientRect();
        const toolCenterX = toolRect.x + toolRect.width / 2;
        let selected = buttons[0];
        let selectedScore = Infinity;
        for (const button of buttons) {
          const rect = button.getBoundingClientRect();
          const score = Math.abs((rect.x + rect.width / 2) - toolCenterX);
          if (score < selectedScore) {
            selected = button;
            selectedScore = score;
          }
        }
        selected.click();
        return "tool-call";
      }
      if (fallbackButton) {
        fallbackButton.click();
        return "first";
      }
      return "";
    };
    const markdownText = (root) => {
      const selector = "h1,h2,h3,h4,h5,h6,p,li,pre,blockquote,.qwen-markdown-paragraph";
      const rawText = root.innerText || root.textContent;
      const rawToolText = root.textContent || root.innerText;
      if (hasToolCalls(rawToolText)) {
        const toolNodes = Array.from(root.querySelectorAll("pre,code")).filter((node) => visible(node) && hasToolCalls(node.textContent || node.innerText));
        if (toolNodes.length > 0) {
          const text = toolNodes.map((node) => cleanPreservedAnswer(node.textContent || node.innerText)).filter((line) => line.length > 0).join("\n\n").trim();
          if (text.length > 0 && hasToolCalls(text)) return text;
        }
        const raw = cleanPreservedAnswer(rawToolText);
        if (raw.length > 0) return raw;
      }
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
        const text = tag === "pre" ? cleanPreservedAnswer(node.textContent || node.innerText) : cleanInline(node.innerText || node.textContent);
        if (!text || /^(Finalize the response|Пропустить|Завершено размышление)$/i.test(text)) continue;
        if (tag === "li") lines.push("- " + text);
        else lines.push(text);
      }
      const text = cleanAnswer(lines.join("\n"));
      const raw = cleanAnswer(rawText);
      return hasToolCalls(raw) && !hasToolCalls(text) ? raw : text;
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
      const rawText = el.innerText || el.textContent;
      const rawToolText = el.textContent || el.innerText;
      const fallback = hasToolCalls(rawToolText) ? cleanPreservedAnswer(rawToolText) : cleanAnswer(rawText);
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
    let state = transportState();
    let preferenceAutoSelected = "";
    if (state.preferenceActive) {
      preferenceAutoSelected = selectResponsePreference();
      if (preferenceAutoSelected) {
        await wait(700);
        state = transportState();
      }
    }
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
      return {ok:true, adapter:"qwen", url:location.href, title:document.title, messages, messageCount:messages.length, lastAssistantText:lastAssistantText(messages), preferenceAutoSelected, ...state};
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
      const rawText = el.innerText || el.textContent;
      const rawToolText = el.textContent || el.innerText;
      const text = hasToolCalls(rawToolText) ? cleanPreservedAnswer(rawToolText) : clean(rawText);
      if (skip(el, text)) continue;
      const role = roleFor(el);
      if (role === null && text.length < 24) continue;
      const key = (role || "assistant") + ":" + text;
      if (seen.has(key)) continue;
      seen.add(key);
      messages.push({role: role || "assistant", text});
    }
    return {ok:true, adapter:"qwen", url:location.href, title:document.title, messages, messageCount:messages.length, lastAssistantText:lastAssistantText(messages), preferenceAutoSelected, ...state};
  })()`
}

