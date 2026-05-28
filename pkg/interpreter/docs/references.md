# Источники

## Bun Protocol

Bun использует WebKit/JSC protocol, а не CDP.

Внутри интерпретатора wire-домены runtime остаются протокольными:

- `Runtime.*`
- `Debugger.*`

Их нельзя переименовать в запросах к Bun без разрыва совместимости. Пользовательские UI/логи/доки используют терминологию интерпретатора.

## Проверенные Практические Правила

- protocol initialization разблокирует `--inspect-wait`.
- Breakpoint-ы для TypeScript ставятся после `Debugger.scriptParsed`.
- Editor coordinates маппятся в generated coordinates перед `Debugger.setBreakpoint`.
- Snapshot обновляется на `Debugger.paused`.
