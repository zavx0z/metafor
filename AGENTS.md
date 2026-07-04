# Правила Agent Для MetaFor Repo

Этот репозиторий часто разрабатывается прямо из live-интерпретатора MetaFor.
Интерпретатор сейчас является рабочей средой разработки MetaFor: в нем есть
server runtime/source debugging и уже подключенный WebApp-контур через
server Chrome remote desktop, WebRTC, DevTools, console и source maps.
`https://meta.proizvodstvo1.ru/` - текущая первая живая реализация MetaFor,
которую мы развиваем через эту среду.

Если задача касается interpreter, WebApp, server-dev браузера, remote desktop,
DevTools, HUD/TODO, breakpoints или текущего совместного runtime/source
контекста, сначала читай и выполняй:

```text
pkg/interpreter/AGENTS.md
```

Этот файл является кратким корневым указателем. Подробные operational rules
лежат рядом с кодом interpreter package, чтобы они не расходились с
реализацией. Не дублируй здесь interpreter workflow: при изменении поведения
обновляй `pkg/interpreter/AGENTS.md`, профильную документацию или TypeDoc.

## Текущий Server-Dev Контур

По умолчанию новый агент должен считать, что он находится в server-dev контуре:

- workspace: `/home/zavx0z/production/vendor/metafor`;
- branch: `main`;
- interpreter host: `http://10.66.0.10:6500`;
- app-web dev server: `http://10.66.0.10:3004`;
- matrix dev server: `http://10.66.0.10:3005`;
- energy dev server: `http://10.66.0.10:3006`;
- visible WebApp target: `https://meta.proizvodstvo1.ru/`;
- server Chrome remote desktop host: `http://127.0.0.1:32133`;
- server Chrome CDP: `http://127.0.0.1:9349/json/list`.

Текущий server-dev контур управляется через interpreter API. Для agent-facing
команд используй единый Codex-style endpoint `POST /tools`; process id и другие
параметры передаются внутри `tool_uses[].parameters`. Детали tools, Space,
remote desktop, DevTools, HUD и source editing описаны в
`pkg/interpreter/AGENTS.md`.

Локальный `127.0.0.1` workflow тоже поддерживается, но не путай его с текущим
server-dev контуром. LAN/TLS режим на `443` - отдельный локально-сетевой режим,
не диагностика текущего server-dev.

## Документационная Гигиена

Не оставляй устаревшие заметки, старые endpoint-ы, временные runbook-и и
архитектурные хвосты в scattered docs. Этот репозиторий развивается динамично:
документация должна описывать текущий рабочий контракт.

- актуальные правила агента держи в `AGENTS.md` или ближайшем package-level
  `AGENTS.md`;
- устойчивые contracts и workflow держи в профильной документации или TypeDoc;
- pending work держи в `TODO.md`;
- долгоживущие выводы для будущих агентов держи в `AGENT_MEMORY.md`;
- устаревшие инструкции удаляй сразу, а не складируй в документации.

## Документация

- Interpreter rules: `pkg/interpreter/AGENTS.md`
- Interpreter world model: `pkg/interpreter/docs/interpreter-world.md`
- Interpreter REST/API contracts: `pkg/interpreter/docs/api.md`
- Interpreter workflow: `pkg/interpreter/docs/workflow.md`
- Long-lived agent memory: `AGENT_MEMORY.md`
