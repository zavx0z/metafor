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

## Стиль Изменений

Не плодить лишний код. Это обязательное правило для всего репозитория.

- Если логика нужна только в одном месте, держи ее прямо в этом месте: в
  обработчике события, `switch case`, route handler или конкретном runtime flow.
- Не выноси одноразовую логику в функции, классы, wrapper API, constants,
  helper-модули или промежуточные переменные только ради аккуратности,
  симметрии или возможного будущего переиспользования.
- Новая функция, тип, модуль или слой допустимы, когда есть реальное повторное
  использование, явная доменная граница или код без выделения становится
  объективно труднее читать.
- Для glue-кода, `BroadcastChannel` handlers, bridge/pipeline сообщений и
  локальных runtime сценариев предпочитай прямой скриптовый поток: получить
  сообщение -> `switch`/`if` -> выполнить действие рядом с соответствующим case.
- Не добавляй bus/queue/router-style прослойки, самовызывающиеся async-обертки,
  наборы флагов и dispatch-функции, если тот же смысл можно увидеть напрямую в
  месте обработки.
- Не расширяй `index.ts` / barrel files ради тестов. Если функция, тип или
  runtime store нужны только spec-файлу, импортируй их в тесте относительным
  путём из конкретного модуля. Re-export означает реальную внешнюю поверхность
  пакета.

Меньше кода - меньше скрытого состояния, меньше поверхностей для ошибок и
меньше шансов случайно превратить локальный переход в новую архитектуру.

## Текущий Server-Dev Контур

По умолчанию новый агент должен считать, что он находится в server-dev контуре:

- workspace: `/home/zavx0z/production/vendor/metafor`;
- branch: `main`;
- interpreter host: `http://10.66.0.10:6500`;
- dark dev server: `http://10.66.0.10:3004`;
- Energy pipeline: `energy/energy.ts` loaded by `dark/index.ts`, no separate
  default dev server;
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
- долгоживущие выводы держи в `AGENT_MEMORY.md` только когда они меняют
  будущие инженерные решения или остаются незавершенной зависимостью;
- историю завершенных чисток, удаленные legacy-слои, старые endpoint-ы и
  временные runbook-и не записывай в memory; если прошлое нужно только как факт
  истории, достаточно git history;
- устаревшие инструкции удаляй сразу, а не складируй в документации.

## Документация

- Interpreter rules: `pkg/interpreter/AGENTS.md`
- Interpreter world model: `pkg/interpreter/docs/interpreter-world.md`
- Interpreter REST/API contracts: `pkg/interpreter/docs/api.md`
- Interpreter workflow: `pkg/interpreter/docs/workflow.md`
- Long-lived agent memory: `AGENT_MEMORY.md`
