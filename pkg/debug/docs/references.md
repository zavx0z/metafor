# Источники

## Bun Web Debugger

https://bun.com/guides/runtime/web-debugger

Официальная документация по browser debugger frontend:

```text
https://debug.bun.sh
```

## Bun Debug Adapter

https://github.com/oven-sh/bun/blob/d484fd6e2e9737c90f7370456edd9c4e482fa794/packages/bun-debug-adapter-protocol/src/debugger/adapter.ts

Из этого source подтверждены:

- handshake
- `Debugger.setBreakpointsActive`
- `Debugger.setPauseOnDebuggerStatements`
- использование `Runtime.getDisplayableProperties` для variables/scopes
- mapping step commands

## Bun Inspector Connection Loop

https://github.com/oven-sh/bun/blob/9bf6ea3312e3716eb26ff4186a527a51d8fc4cac/src/bun.js/bindings/BunDebugger.cpp

Из этого source подтверждено ограничение attach-while-paused:

- Bun хранит несколько inspector connections
- во время `runWhilePaused` список connections берётся в локальный `Vector`
- новый connection, появившийся уже во время текущей pause, обслуживается после выхода из этой pause
- практический вывод: sidecar нужно запускать до breakpoint-а, который он должен увидеть live

## Bun Regression Test 21654

https://github.com/oven-sh/bun/blob/d484fd6e2e9737c90f7370456edd9c4e482fa794/test/regression/issue/21654/21654.test.ts

Из этого теста подтверждены:

- `--inspect-wait=ws://...`
- ожидание `Debugger.paused`
- `Inspector.initialized` как release command
- `Runtime.evaluate` во время paused state

## WebKit Inspector Protocol

Bun inspector основан на WebKit Inspector Protocol/JSC, а не CDP.
Практическое следствие: Chrome/Node debugger clients не являются drop-in replacement.
