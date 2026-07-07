# @metafor/browser-agent

Browser-hosted LLM chat transport and tool-protocol runtime for MetaFor.

This package owns provider/runtime logic for browser-based agents such as Qwen and DeepSeek. It must stay independent from `@metafor/interpreter`: the interpreter is only a host that supplies Chrome DevTools callbacks and `/tools` wiring.

## Boundary

`@metafor/browser-agent` owns:

- browser chat transport runtime (`browser_chat.send/read/wait/exchange`);
- provider DOM expressions for Qwen and DeepSeek;
- provider selection via `provider`, `adapter`, `urlContains`, `targetUrl`, or `targetTitle`;
- transport state fields such as `canSend`, `busy`, `generating`, `preferenceActive`, `blockedReason`, `limitReached`;
- response wait/stability logic;
- send recovery helpers.

`@metafor/interpreter` owns:

- HTTP `/tools` routing;
- Chrome DevTools session management;
- HUD/Space UI;
- process/source/debug/git tools;
- mapping browser-agent results back into interpreter tool responses.

## Host contract

The runtime is created by passing a host object:

```ts
createBrowserAgentRuntime({
  evaluateExpression,
  setViewport,
  serializeError,
})
```

The package must not import from `pkg/interpreter` or `@metafor/interpreter`; keep dependencies one-way: interpreter -> browser-agent.

## Providers

Current provider ids:

- `qwen` targets `chat.qwen.ai` and is the fallback provider.
- `deepseek` targets `chat.deepseek.com`.

Use `provider` when multiple browser LLM chats are open in the same Chrome instance:

```json
{"provider":"deepseek","message":"...","newChat":true}
```

If `provider` is not provided, the runtime infers it from `adapter`, `urlContains`, `targetUrl`, or `targetTitle`, then falls back to Qwen.

## Next providers

Add new browser LLMs as provider adapters rather than forking interpreter code.
