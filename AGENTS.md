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
реализацией.

## Текущий Server-Dev Контур

По умолчанию новый агент должен считать, что он находится в server-dev контуре:

- workspace: `/home/zavx0z/production/vendor/metafor`;
- branch: `energy`;
- interpreter host: `http://10.66.0.10:6500`;
- app-web dev server: `http://10.66.0.10:3004`;
- visible WebApp target: `https://meta.proizvodstvo1.ru/`;
- server Chrome remote desktop host: `http://127.0.0.1:32133`;
- server Chrome CDP: `http://127.0.0.1:9349/json/list`.

Локальный `127.0.0.1` workflow тоже поддерживается, но не путай его с текущим
server-dev контуром. LAN/TLS режим на `443` - отдельный локально-сетевой режим,
не диагностика текущего server-dev.

## Документация

- Interpreter rules: `pkg/interpreter/AGENTS.md`
- Interpreter world model: `pkg/interpreter/docs/interpreter-world.md`
- Interpreter REST/API contracts: `pkg/interpreter/docs/api.md`
- Interpreter workflow: `pkg/interpreter/docs/workflow.md`
- Remote desktop/WebApp runbook: `docs/web-ui-browser-display.md`
- Long-lived agent memory: `AGENT_MEMORY.md`
