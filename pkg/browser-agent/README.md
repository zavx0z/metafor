# @metafor/browser-agent

Browser-hosted LLM chat transport and tool-protocol runtime for MetaFor.

This package owns provider/runtime logic for browser-based agents such as Qwen. It must stay independent from `@metafor/interpreter`: the interpreter is only a host that supplies Chrome DevTools callbacks and `/tools` wiring.

## Boundary

`@metafor/browser-agent` owns:

- browser chat transport runtime (`browser_chat.send/read/wait/exchange`);
- provider DOM expressions, currently Qwen;
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

## Next providers

Add new browser LLMs as provider adapters rather than forking interpreter code. DeepSeek should be added as a provider beside Qwen, not as another interpreter transport implementation.
