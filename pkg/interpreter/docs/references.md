# Источники

## Bun Inspector

Bun inspector использует WebKit Inspector Protocol/JSC, а не CDP.

Внутри интерпретатора эти имена остаются протокольными:

- `Inspector.*`
- `Runtime.*`
- `Debugger.*`

Их нельзя переименовать без разрыва совместимости с Bun inspector.

## Проверенные Практические Правила

- `Inspector.initialized` разблокирует `--inspect-wait`.
- Breakpoint-ы для TypeScript ставятся после `Debugger.scriptParsed`.
- Editor coordinates маппятся в generated coordinates перед `Debugger.setBreakpoint`.
- Snapshot обновляется на `Debugger.paused`.
