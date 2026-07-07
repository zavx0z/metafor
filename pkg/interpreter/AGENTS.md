# Правила Пакета Interpreter

Этот файл задает локальные правила разработки для `pkg/interpreter` и текущего
server-dev контура MetaFor. Следуй им при каждом изменении внутри interpreter
package, WebApp debugging workflow, remote desktop display, DevTools bridge,
HUD/Plan, breakpoints или совместного runtime/source контекста.

Документация и правила пакета пишутся на русском. Технические имена endpoint, типов, команд и protocol methods оставляются как literal identifiers.

Корневой `AGENTS.md` только указывает на этот файл и фиксирует краткую карту
репозитория. Этот файл является source of truth для interpreter/server-dev
workflow.

## Стиль Изменений

Не плодить лишний код. В interpreter/server-dev контуре особенно важно, чтобы
человек видел причинный путь прямо в открытом source.

- Одноразовую локальную логику оставляй рядом с местом использования: в handler,
  `switch case`, process action, route или runtime flow.
- Не выделяй helper-функции, wrapper API, constants, дополнительные типы,
  промежуточные флаги или отдельные модули только ради аккуратности или
  гипотетического будущего переиспользования.
- Вынос допустим, когда есть реальное повторное использование, явная граница
  ответственности или без выноса код становится объективно хуже читаемым.
- Для обработчиков сообщений и live-runtime glue предпочитай прямой скриптовый
  поток: получить вход -> `switch`/`if` -> выполнить действие в соответствующей
  ветке.
- Не расширяй `index.ts` / barrel files ради тестов. Если API нужен только
  spec-файлу, тест должен импортировать его относительным путём из конкретного
  модуля. Re-export оставляй только для реальной внешней поверхности пакета.

Цель - меньше скрытой архитектуры и больше кода, который можно понять глазами в
текущем дисплее.

## Совместные Правки

Владимир может параллельно править файлы в редакторе во время работы агента.
Любые изменения в worktree, source editor или runtime source, которые агент не
делал сам, считай правками Владимира. Их нельзя откатывать, перетирать,
нормализовать, форматировать, переносить или чинить без прямой просьбы. Если
такие изменения пересекаются с текущей задачей, работай вокруг них; если это
невозможно, сначала коротко покажи конфликт и дождись решения Владимира.

## Что Такое Интерпретатор

`@metafor/interpreter` - live-интерпретатор MetaFor. Это не wrapper вокруг WebStorm, Chrome DevTools или отдельного debugger UI.

Смысл продукта: человек и AI находятся в одной живой среде разработки MetaFor.
Сначала это был runtime/source-контекст серверного кода: execution point,
source, stack, scopes, terminal/output, события, breakpoints, step/evaluate и
изменение кода во время работы. Теперь WebApp тоже подключен в эту же среду:
server Chrome, remote desktop display, WebRTC, DevTools, console и source maps
являются частью interpreter workflow, а не внешним браузером рядом.

Через интерпретатор мы сейчас разрабатываем MetaFor. Видимый контур
`https://meta.proizvodstvo1.ru/` - первая живая реализация MetaFor, которую
нужно доводить через эту среду, а не как отдельный сайт вне interpreter.

Protocol names вроде `Debugger.paused`, `Debugger.scriptParsed`, `Runtime.getProperties` и Bun inspect flags - внутренние детали adapter-слоя. В adapter-коде, низкоуровневых tests и raw event streams их можно использовать. В пользовательских labels, docs, logs для людей и UI-controls используй язык интерпретатора: process, Space, display, module, expression, execution point, breakpoint.

Для агента интерпретатор - это главный рабочий API, а не страница, которую
нужно кликать вслепую:

- `host` - серверный процесс interpreter, который владеет REST/WS API;
- `UI client` - browser/XR/mobile host, который отображает state host-а;
- `Space` - общий WebGPU мир с независимыми display;
- `UIDisplay` - поверхность в Space;
- `Process` - основной адрес runtime/source действий;
- `Module` - source/code unit внутри process;
- `Remote desktop display` - отдельный display с серверным Chrome/WebApp,
  передаваемый через WebRTC;
- `WebApp target` - видимая вкладка `https://meta.proizvodstvo1.ru/`, где
  разрабатывается первая реализация MetaFor;
- `DevTools bridge` - agent API к Chrome DevTools Protocol для этой вкладки:
  console, source maps, breakpoints, reload и probe;
- `HUD` - host-level панели вроде Plan, SQLite и terminal.

Если нужно понять, что видит человек и где сейчас работать, сначала вызывай
`POST /tools` с `context.get` и `space.get`, затем process tools с нужным
`parameters.processId`.

## Текущий Server-Dev Контур

По умолчанию новый агент в этом репозитории должен считать, что он находится в
server-dev контуре:

- workspace: `/home/zavx0z/production/vendor/metafor`;
- branch: `main`;
- interpreter host: `http://10.66.0.10:6500`;
- default interpreter command: `bun run force:development`;
- Force server: `http://10.66.0.10:4000`;
- domain servers: boundary `4001`, dark `4002`, matrix `4003`, bulk `4004`,
  energy `4005`;
- boundary SQLite: `dark/tmp/boundary.sqlite`;
- Bun inspector children: `force/server.ts`, `boundary/server.ts`,
  `dark/server.ts`, `matrix/server.ts`, `bulk/server.ts`, `energy/server.ts`,
  with auto-allocated inspector sockets starting around `ws://127.0.0.1:6499/`;
- visible WebApp target в серверном Chrome:
  `https://meta.proizvodstvo1.ru/`;
- server Chrome remote desktop host: `http://127.0.0.1:32133`;
- server Chrome CDP: `http://127.0.0.1:9349/json/list`.

Локальный workflow через `127.0.0.1:6500` поддерживается для запуска на другой
машине, но в текущем server-dev контуре используй `10.66.0.10:6500` для host
API и `10.66.0.10:4000`-`4005` для domain dev health/API. LAN/TLS режим на `443` -
отдельный локально-сетевой режим, не диагностика этого контура.

Текущий Force development server-dev mode управляется через interpreter tools:

- `force/server.ts`: Force WebSocket registry на `4000`;
- `boundary/server.ts`, `dark/server.ts`, `matrix/server.ts`, `bulk/server.ts`,
  `energy/server.ts`: отдельные domain server targets на `4001`-`4005`, каждый
  регистрируется в Force через `ws://127.0.0.1:4000/ws`;
- `bulk/server.ts`: отдаёт WebApp HTML и минимальную engine static на `4004`;
- SQLite HUD открывает ту же базу `dark/tmp/boundary.sqlite` отдельным CLI
  аргументом interpreter;
- WebApp больше не является стартовым server-dev target.

Не возвращай WebApp/AppWeb как default target.

Удаленный браузер для визуальной WebApp-разработки должен открывать
`https://meta.proizvodstvo1.ru/`. Это не маркетинговая внешняя страница, а
текущий живой WebApp-контур первой MetaFor. Для shell/API/debug диагностики
используй server-dev адреса выше: внешний `meta` слой может вернуть SSO/redirect
вместо runtime state.

Базовая проверка текущего контура:

```sh
curl -sS http://10.66.0.10:6500/health
curl -sS -X POST http://10.66.0.10:6500/tools \
  -H 'content-type: application/json' \
  -d '{"tool_uses":[{"recipient_name":"context.get","parameters":{}},{"recipient_name":"space.get","parameters":{}}]}'
curl -sS http://10.66.0.10:4000/health
curl -sS http://10.66.0.10:4004/health
curl -sS http://10.66.0.10:6500/remote-desktop/lifecycle
```

## Interpreter / HUD / Space / Process

Интерпретатор один. Внутри него есть глобальный `HUD` и один WebGPU `Space`.

`Space` содержит независимые `UIDisplay`. Display - визуальная поверхность. Он не является единицей исполнения.

`Process` - основной адрес действий агента. Сейчас это live-запуск Bun process с `pid`, inspect target, source context, stack/scopes, terminal и breakpoints. Позже тот же термин покрывает actor/process MetaFor.

В Space нет привилегированных display:

- нет default display;
- нет primary/main display;
- нет default session;
- нет глобального selected module;
- нет глобального active interpreter, который меняет другой display;
- нет panel toggle, который открывает/закрывает одну панель сразу на нескольких displays;
- нет focus stealing между displays;
- нет логики, которая считает левый display особенным;
- нет общих terminal, events, breakpoints, source, frame, scope или toolbar state между displays.

Если запущены два модуля, это два независимых processes, отображенных на двух независимых surfaces в одном 3D `Space`. Browser layout - только текущий host. Будущие XR/mobile/desktop hosts должны уметь встроить те же surfaces как независимые поверхности.

Состояние, относящееся к одному display, должно быть keyed by `displayId`/`moduleId` или принадлежать `ModuleDisplayController`:

- toolbar state;
- source state;
- stack/frame state;
- scopes state;
- terminal buffer и terminal input state;
- events/verbose visibility и scroll state;
- breakpoint markers и pending breakpoint lines;
- active command state;
- focus/caret restoration.

Не добавляй package-level mutable UI state, если это не действительно глобальный host state. Locale глобален. WebSocket connection к interpreter host глобален. Module/display UI state не глобален.

## Привязка К Process

Все agent-facing runtime-действия идут через единый Codex-style endpoint
`POST /tools`. Process указывается в `parameters.processId` или через
`parameters.selector`; process id больше не кодируется в URL.

Source loading выполняется в контексте process. Breakpoints хранятся и
применяются для runtime конкретного process. Command replies обновляют только
process/display, в котором выполнялась команда. Protocol events с `moduleId`
уходят только в owning process/display.

## Правило Инструментов

Если человек и агент совместно работают над кодом, открытым или запущенным в интерпретаторе, этот код обновляется **только через API интерпретатора**. Это строгое правило, а не рекомендация.

Перед правкой кода:

1. Считай interpreter API рабочим по умолчанию. Не вызывай `GET /health` как обычный preflight; используй его только для диагностики после ошибки API, отсутствующего process, рестарта/закрытия или неизвестного контекста.
2. Вызови `POST /tools` с `context.get` и определи `processId`, `source.identity.sourceUrl` / `source.identity.scriptUrl`.
3. Если изменяемый файл относится к текущему process/display, открыт в source интерпретатора или работа явно идёт в текущей interpreter/debugger-сессии, не используй локальный `apply_patch`, `sed`, shell-write, редактор или форматтер для записи файла.
4. Применяй изменение только через API интерпретатора:
   - `POST /tools` с `tool_uses`; `processId` передаётся внутри `parameters`.
   - Для source используй `source.read`, `source.read_many`, `source.open`, `source.openSelection`, `source.write`, `source.apply_patch`.
5. После правки проверь, что интерпретатор получил изменение: `source-patched`, replay/restart при необходимости, новый `context.get` или `source.read` через `POST /tools`.
6. После правки агент сам доводит live-контур до примененного состояния: запускает нужные проверки, reload/restart/rebuild target-а и повторную диагностику. Не перекладывай на человека действия вроде "перезагрузи страницу", "пересобери bundle", "перезапусти process" или "проверь зависимости", если это можно сделать через interpreter API, DevTools/CDP, terminal или доступные host tools.
7. Не путай UI интерпретатора и WebApp target. Если изменен browser-side код самого interpreter/HUD/Plan/Space (`pkg/interpreter/web`, `ui/elements`, `ui/panes`, `ui/components` в текущем HUD-контуре), перезагружай UI интерпретатора через `host.reload` и проверяй `context.get`, `todo.panel`, screenshot или профильный interpreter API. Interpreter host должен отдавать `web/index.html` через Bun fullstack `development` mode; при `development:false` Bun держит bundled assets в памяти до restart-а, и `host.reload` не подхватывает свежий browser-side код.
8. Если изменен browser-side код WebApp target внутри server Chrome (`bulk/client.ts`, WebApp страницы, remote desktop target), перезагружай именно WebApp target через `devtools.reload` или Chrome CDP hard reload с cache bypass и проверяй `devtools.console`, screenshot или профильный WebApp API. Если изменен server/runtime код, сам перезапусти или replay соответствующий process и проверь health/output.

Причина: только interpreter source API сдвигает breakpoints, рассылает `source-patched`, обновляет source cache/display и сохраняет связь runtime/source context. Правка в обход API оставляет UI и текущий runtime на старом source snapshot.

### Workflow Для `apply_patch`

Для правок через `source.apply_patch` в `POST /tools` не читай большой файл
целиком как обязательный preflight. Используй уже видимый source-контекст,
точечные range-чтения или локальные read-only range-команды, чтобы собрать один
крупный patch по актуальным фрагментам, и применяй его через interpreter API.

Если `apply_patch` вернул `hunk does not match`, не дроби patch вслепую. Сначала
заново прочитай affected file/range через `source.read` / `source.read_many`,
обнови контекст и повтори одним согласованным patch-ом. Большой patch
предпочтительнее серии мелких, пока он построен из свежего контекста.

Документацию, правила, внешние meta-файлы и код, который не является текущим совместно отлаживаемым process, можно править обычными локальными инструментами только когда работа не идёт внутри активной interpreter/debugger-сессии. Если интерпретатор запущен и текущая работа идёт через него, сначала используй interpreter API; локальный fallback допустим только после явной проверки, что API не может адресовать файл, и после сообщения пользователю.

## REST API Интерпретатора

Base URL зависит от контура. В текущем server-dev используй:

```text
http://10.66.0.10:6500
```

В локальном запуске на той же машине используй:

```text
http://127.0.0.1:6500
```

Перед действием читай текущую ситуацию:

```sh
curl -sS -X POST http://10.66.0.10:6500/tools \
  -H 'content-type: application/json' \
  -d '{"tool_uses":[{"recipient_name":"context.get","parameters":{}},{"recipient_name":"space.get","parameters":{}}]}'
```

`context.get` - главный tool для запроса "что сейчас видно/выделено". Он возвращает один текущий active context, а не полный dump всех runtime.

`context.hud.todo` содержит текущее состояние Plan HUD: подсвеченные человеком пункты из `TODO.md`, чтобы агент понимал, о чем речь. Подсветка - состояние панели, не данные файла.

Host-level tools:

- `host.reload` в `POST /tools` рассылает подключенным UI-клиентам команду browser reload. Это не restart host process.
- `host.restart` в `POST /tools` перезапускает текущий interpreter host только когда host знает, как себя поднять снова: сейчас основной путь - tmux `respawn-pane` текущего `TMUX_PANE` или явно заданный `INTERPRETER_RESTART_COMMAND` / `INTERPRETER_RESTART_SCRIPT`. Клиенты получают delayed reload и должны дождаться `/health`, чтобы не показывать белый экран во время restart.
- `todo.reload` в `POST /tools` перечитывает корневой `TODO.md` и рассылает `hud-todo-changed` всем UI-клиентам. Не dispatch-ить это через случайный UI-host client: Plan HUD является общим состоянием host.

Если nginx показывает `502 Bad Gateway`, сначала проверяй upstream:
`curl http://10.66.0.10:6500/health`,
`curl http://10.66.0.10:4000/health`,
`curl http://10.66.0.10:4004/health` и `ss -ltnp`. Не доверяй только
`tmux ls`: session `metafor-interpreter-host` может существовать, но внутри
может быть shell/старый Codex. Подробный recovery описан в
`pkg/interpreter/docs/troubleshooting.md`.

Web DevTools tools для server Chrome/WebApp:

- `devtools.targets` читает Chrome CDP targets с default `127.0.0.1:9349`.
- `devtools.state` показывает agent CDP sessions, breakpoints и paused state.
- `devtools.console` включает capture и возвращает последние console/log/exception/network события; для ошибок передавай `level:"error", limit:50`.
- `devtools.console.clear` очищает agent buffer и Chrome console entries.
- `devtools.reload` делает `Page.reload` текущего WebApp target и по умолчанию синхронизирует DevTools Device Mode viewport/surface после reload.
- Managed DevTools CDP session также событийно повторяет viewport sync после `Page.frameNavigated` / `Page.loadEventFired`, чтобы ручной reload в DevTools не сбрасывал target page из portrait в landscape при неизменном toolbar.
- `devtools.viewport.sync` вручную синхронизирует DevTools Device Mode toolbar, WebApp target viewport и Chrome compositor surface, если после Rotate/reload видна серая область или target получил неправильный viewport.
- `devtools.breakpoint` ставит breakpoint по `source` + 1-based `line`; source maps мапятся на generated bundle автоматически.
- `devtools.probe` ставит breakpoint, дергает optional `trigger`, ждет `Debugger.paused`, затем по умолчанию делает resume и clear.
- `devtools.resume` продолжает paused target.
- `devtools.disable` снимает breakpoints, выключает Debugger и закрывает agent CDP session.

Plan tools (`todo.*` API, storage file `TODO.md`):

- `todo.get` читает корневой `TODO.md` и parsed items.
- `todo.replace` заменяет файл целиком.
- `todo.create` добавляет пункт.
- `todo.update` меняет текст пункта, markdown checkbox `checked` или marker `marker`.
- `todo.delete` удаляет пункт.
- `todo.highlight` подсвечивает пункт в HUD для `context.hud.todo.highlightedItems`.

Plan HUD поддерживает явный список markdown task markers: `[ ]`, `[x]`/`[X]`,
`[/]`, `[~]`, `[-]`, `[>]`, `[<]`, `[?]`, `[!]`, `[*]`, `[\"]`, `[l]`,
`[b]`, `[i]`, `[I]`, `[S]`, `[p]`, `[c]`, `[f]`, `[k]`, `[w]`, `[u]`,
`[d]`, а также progress marker `[0]`..`[100]`. Пауза progress-задачи
пишется точкой перед числом: `[.0]`..`[.100]`. В этом repo задача в работе
помечается `[0]`, пауза - `[.0]`, сделано - `[x]` или `[100]`. Не прячь
проценты прогресса в тексте пункта.

Plan - обязательный рабочий журнал текущей разработки. Перед продолжением
нетривиальной работы агент должен посмотреть Plan HUD/`todo.get`, понять
актуальную задачу и ее состояние. Когда задача берется в работу, ставится на
паузу, получает progress, завершается, добавляется или удаляется, это должно
сразу отражаться через `todo.*` tools. Progress отмечай процентом в marker:
`[1]`, `[25]`, `[99]`, `[100]`; для паузы ставь точку перед процентом:
`[.1]`, `[.25]`. Не описывай progress словами в тексте пункта и не держи
примерные проценты только в ответе агентом. Не веди параллельный список задач
в ответах, памяти, временных файлах или тексте комментариев вместо Plan. Если
работа меняет план или статус, сначала обнови Plan, затем продолжай код/анализ.
Без актуального Plan не начинай нетривиальную правку, перенос или проверку.
Для текущей совместной разработки Plan является источником правды по тому, что
мы делаем сейчас и что отложено.

Plan ведется по профильным секциям. Перед созданием нового пункта выбери
существующий раздел по домену работы или создай новый раздел через
`todo.create` с `section`; не складывай новые задачи в общий хвост файла только
потому, что это технически проще. Interpreter/HUD/Space/source-editor задачи
должны попадать в раздел interpreter workflow, а не в DSL/domain разделы.

Язык команд Plan:

- "добавь в план", "занеси в план", "поставь в план" означает создать или
  обновить пункт через `todo.create`/`todo.update`; будущая задача получает
  `[ ]`, задача сразу в работе - `[0]`, пауза - `[.N]`.
- "открой план", "покажи план", "что по плану", "где мы по плану" означает
  `todo.get`, при необходимости `todo.show`, затем подсветить релевантный пункт
  через `todo.highlight` и кратко назвать текущее состояние.
- "исполняй план", "выполняй план", "идем по плану", "делай по плану",
  "продолжай по плану" означает взять Plan как источник следующего действия:
  сначала текущий highlighted/progress пункт, затем первый незавершенный
  незапаузенный пункт по порядку файла. Перед работой отметь пункт `[0]` или
  актуальный процент, во время работы обновляй progress, после завершения
  ставь `[100]`/`[x]` или удаляй пункт, если он больше не связан с будущими
  задачами.
- "план выполнен", "закрой пункт", "убери из плана" означает обновить именно
  Plan через `todo.update`/`todo.delete`, а не только написать об этом в ответе.
- Если человек говорит "план" без уточнения "файл", это HUD Plan и `todo.*`.
  Source editor открывай только по явной просьбе открыть файл `TODO.md`.

Когда человек говорит "открой Plan/План/TODO/Туду", "покажи Plan/План/TODO/Туду" или разговор
идёт про планирование без явного уточнения "файл", агент должен работать с HUD
Plan: `todo.get`, `todo.show`, `todo.reload`, `todo.highlight` и mutating
`todo.*` tools. Не открывай `TODO.md` в source editor через `source.open`, пока
человек явно не попросит открыть именно файл `TODO.md` в редакторе/source.

Когда человек спрашивает "где задача", "где пункт", "что у нас в Plan/План/TODO",
"покажи задачу" или ссылается на раздел/пункт Plan, агент должен сделать
видимое действие в Plan HUD: вызвать `todo.get`, найти соответствующий пункт,
показать панель через `todo.show` при необходимости и подсветить конкретный item
через `todo.highlight`, чтобы человек видел, о чем идет разговор. Если пункт
отсутствует, агент должен предложить создать его или создать через `todo.create`,
когда формулировка задачи уже дана человеком. Текстовый ответ без подсветки
допустим только если HUD Plan API недоступен после явной попытки.

Когда пользователь должен сразу увидеть изменения в Plan HUD, меняй `TODO.md`
через `POST /tools`, а не прямым редактированием файла. Mutating `todo.*` tools
сами рассылают `hud-todo-changed` подключенным UI-клиентам. Если `TODO.md` все
же был изменен локально через git/apply_patch/merge, сразу вызови `todo.reload`
через `POST /tools` и только потом сообщай пользователю, что Plan обновлен.

Tools API:

- `POST /tools` - единственный agent-facing command endpoint.
- `GET /tools` возвращает typed registry tools из `pkg/interpreter/src/tools.ts`.
- `process.list` возвращает live processes.
- `process.start` запускает новый process.
- `process.resolve` находит process по selector и текущему Space.
- `process.focus` фокусирует surface process в Space.
- `process.get` возвращает рабочий payload process: content, runtime status, текущий UI context, tail терминала и capabilities.
- `process.context` возвращает текущий source/frame/scope/terminal context одного process.
- `process.modules` возвращает import graph каталога кода process от entrypoint и workspace package imports.
- `breakpoint.list`, `breakpoint.set`, `breakpoint.remove` управляют точками останова process.

API-редактирование source:

- `POST /tools` с `source.write` или `source.apply_patch` после успешной правки должен приводить UI к отредактированному файлу в process display из `parameters.processId`.
- На `source-patched` открывай первый измененный не-delete файл в source editor, раскрывай/выделяй его в file tree и ставь cursor на первую измененную строку (`lineChanges[0].newStart`, fallback строка 1).
- Не перетирай локальный dirty editor: если target source dirty или saving, авто-переход нужно пропустить.

Git-операции в live interpreter workspace:

- Для `git status`, `git commit` и `git push` используй `POST /tools` с
  `git.status`, `git.commit`, `git.push`, а не прямые shell-команды.
- `git.commit` должен получать явные `paths`, если человек не попросил
  коммитить всё. Это защищает параллельные правки Владимира от случайного
  попадания в коммит.
- Причина: `git.commit`/`git.push` через tools рассылают `workspace-changed`,
  после чего UI перечитывает `process.modules`, обновляет git-статистику в
  дереве файлов и пересчитывает gutter diff относительно нового `HEAD`.

Space tools:

- `space.get` возвращает `mode`, `activeDisplayId` и `displays[]`.
- `space.focus` фокусирует рабочую поверхность.
- `space.frame` возвращает обзор всех surfaces.

Поддерживаемые process actions:

- `pause`
- `resume`
- `step` с `params.kind`: `over`, `into`, `out`
- `evaluate` / `eval` с `params.expr` и опциональным `params.frame`
- `source.open` с `params.sourceUrl`, `params.path`, `params.modulePath` или `params.specifier`; опционально `params.line`/`params.column` или `params.selection:{start,end}` / `{anchor,focus}`
- `source.openSelection`
- `restart`
- `stop`
- `showExecutionPoint`

Agent-facing debugger actions (`pause`, `resume`, `step`, `evaluate`,
`breakpointsActive`/`setBreakpointsActive`, `muteBreakpoints`,
`unmuteBreakpoints`) должны отвечать только runtime outcome. В ответе этих
команд не должно быть editor cursor, selection, source-pane, workspace tree,
display geometry или других UI/display координат. Для `pause` и `step` ответ
возвращается после события `Debugger.paused`; для `resume` - после
`Debugger.resumed`. Агент делает вывод "вошли / не вошли / где остановились"
только по `state`, `currentFrame`, `frames[]` и `runtime` из ответа команды.
Поле `event` означает реально дождались соответствующего debugger-события. Если
process уже был в нужном состоянии, ответ использует `already:"paused"` или
`already:"running"`, а не фиктивный event.

`process.action` с `action:"restart"` должен сам возвращать итог restart-а,
достаточный для следующего решения агента. Он ждёт post-restart debugger-ready
состояние: inspector подключён, а target-level `pendingBreakpoints` потреблены
runtime-слоем. Если это не произошло до timeout, tool возвращает `ok:false`/504
с текущим `process` snapshot и `ready.state:"timeout"`, а не ложный success.
Не достраивай штатный restart цепочкой `process.action restart` -> `process.get`:
исправляй contract конкретного tool, чтобы tool возвращал ожидаемый результат.
Если у process есть breakpoints, обычный `process.action` с `action:"restart"`
по умолчанию работает как restart-and-stop-on-breakpoint: tool стартует через
`inspect-brk`, дождётся установки breakpoints, выполнит resume и вернёт ответ
только после следующего `Debugger.paused` или timeout. Явный
`params.runToBreakpoint:false` отключает этот режим.

`evaluate` возвращает результат вычисления в runtime-only ответе. Если нужно
отдельно показать вычисление человеку в UI/terminal, это должен быть явный
UI-visible workflow, а не часть debugger response.

`showExecutionPoint`, `source.open` и `source.openSelection` могут менять UI, но
debugger outcome нельзя смешивать с editor/source-pane состоянием.

Для совместной работы с конкретным process используй `context.get`, затем tools с `parameters.processId`:

```sh
curl -sS -X POST 'http://10.66.0.10:6500/tools' \
  -H 'content-type: application/json' \
  -d '{"tool_uses":[{"recipient_name":"context.get","parameters":{}}]}'

curl -sS -X POST 'http://10.66.0.10:6500/tools' \
  -H 'content-type: application/json' \
  -d '{"tool_uses":[{"recipient_name":"process.action","parameters":{"processId":"dark-server.spec.ts","action":"evaluate","params":{"expr":"globalThis.location","frame":0}}}]}'
```

SQLite HUD API:

- CLI args ending with `.sqlite` считаются входами SQLite HUD, а не runnable modules.
- HUD можно открыть до появления файла базы; UI ждет и повторяет чтение, пока runtime не создаст `.sqlite`.
- `GET /sqlite?path=<file.sqlite>&table=<name>` возвращает tables, schema и rows.
- `GET /sqlite/fingerprint?path=<file.sqlite>` возвращает дешевую версию database по stat основного файла и `-wal`; `-shm` есть в diagnostic `files`, но не участвует в `version`, потому что чтение SQLite само может менять shared-memory файл. UI использует `version` для авто-refresh без полного reread на каждом тике.
- `POST /sqlite/open` с `{"path":"dark/tmp/boundary.sqlite"}` открывает database в SQLite HUD.
- `GET /hud/sqlite` возвращает состояние SQLite HUD; `/hud/sqlite/dock|show|toggle` управляют сворачиванием.
- `POST /sqlite/cell` с `{"path","table","rowid","column","value"}` редактирует одну ячейку по SQLite `rowid`. Views read-only.
- UI-выделение в SQLite таблице построчное: один клик выбирает всю строку, `Shift` выбирает диапазон, `Cmd/Ctrl` добавляет или снимает отдельные строки, двойной клик по editable cell открывает редактор.
- `context.hud.sqlite` содержит активную базу, выбранную таблицу и компактный snapshot выбранных строк (`selectedRowIds`, `selectedRowCount`, `selectedRows`, `selectionTruncated`). Не клади в context весь SQLite payload или все rows таблицы.

Display selectors:

```json
{"selector":{"side":"left"}}
{"selector":{"side":"right"}}
{"selector":{"displayId":"module:dark-server.spec.ts"}}
{"selector":{"moduleId":"dark-server.spec.ts"}}
{"selector":{"label":"dark/server.spec.ts"}}
{"selector":{"order":0}}
```

Focus в Space не меняет host terminal HUD. Не dock/hide/show/toggle terminal при запросах вида "открой левый display". Панель терминала меняется только через явные `hud.terminal.*` tools, terminal transport routes или при явном `dockHostTerminal:true`.

Terminal HUD tools and transport:

- `hud.terminal.get` возвращает `docked`, `sessionId`, `status`, `statusLabel`, `rect` и `dockPlacement`.
- `hud.terminal.show` раскрывает host terminal HUD.
- `hud.terminal.dock` докает/прячет host terminal HUD.
- `hud.terminal.toggle` переключает состояние.
- `WS /hud/terminal/stream` - transport stream host PTY для browser host.
- `GET /hud/terminal/sessions` возвращает diagnostics host PTY sessions.

Прямые terminal routes не являются основным agent-facing API. Используй terminal
endpoints только для stream/diagnostics. Если пользователь просит визуальный
переход, вызывай `space.*` tools; если просит действие исполнения, вызывай
`process.*` tools через `POST /tools`.

Codex message и Browser Agent message используют один общий HUD composer `Message` с target-кнопками `Codex`/`Qwen`/`DeepSeek`, но остаются разными transport:

- Target `Codex` отправляет текст, голос и image attachment paths в host PTY/Codex CLI через terminal transport.
- Targets `Qwen`/`DeepSeek` отправляют текст, голос и images в уже открытый browser chat через Chrome DevTools DOM bridge. Для DeepSeek image attachments передаются как files через host `DOM.setFileInputFiles`; image-only отправка не добавляет caption и не отправляет filesystem paths текстом. Локальная `Agent` history показывает sent image previews.
- Browser Agent transport живет в workspace package `@metafor/browser-agent`; interpreter остается host/wiring слоем для `/tools`, Chrome DevTools callbacks и HUD/Space UI.
- Browser Agent Chat поддерживает provider `qwen` (`https://chat.qwen.ai/`) и `deepseek` (`https://chat.deepseek.com/`) через `browser_chat.*` tools в `POST /tools`. Provider можно выбрать параметром `provider?:"qwen"|"deepseek"`; без явного provider runtime выводит его из target hints и fallback-ится на Qwen.
- Browser Agent UI состоит из окна `Agent` и общего composer-окна `Message`. `Agent` показывает историю active provider-а, status/transport state и provider-specific controls: tools prompt/new chat, DeepSeek mode, deep thinking, pause/resume/stop. `Message` содержит единый ввод, слева только target switcher `Codex`/`Qwen`/`DeepSeek`, справа общие send/image/voice controls.
- Browser Agent Chat UI имеет provider sessions `Qwen` и `DeepSeek`. Каждая session держит отдельные history, draft, attachments, transport state и tool loop state. Общий composer/editor хранит отдельные drafts/attachments для `Codex`, `Qwen` и `DeepSeek` и отправляет сообщение в выбранный target. Session state хранится в browser `localStorage`, поэтому active session, active composer target, drafts, attachments, messages, DeepSeek mode/deep-thinking и tool loop controls переживают reload UI; live busy/canSend дополнительно гидратируется через `browser_chat.read`.
- `browser_chat.activate` переключает реальную Chrome-вкладку provider-а, а `browser_chat.configure` меняет provider-specific настройки без отправки сообщения. Сейчас `configure` поддерживает DeepSeek: `deepseekMode?: "fast"|"expert"|"vision"` и `deepThinking?: boolean`.
- Голосовые wake-команды `Завхоз`/`Запхоз`/`Метафор` возвращают текущий voice target в общий `Message` composer с target `Codex`. Wake-команды `Квин`/`Qwen` и `Дипсик`/`DeepSeek` открывают окно `Agent`, переключают active provider session и composer target, но не активируют Chrome-вкладку и не переводят Space на browser display; реальная browser tab переключается и `remote-desktop:server` display фокусируется только ручным кликом по target switcher в `Message`. Эти слова не должны попадать в draft как пользовательское сообщение.
- Browser Agent Chat использует текстовый tool protocol: active provider может вернуть `<tool_calls>{"tool_uses":[...]}</tool_calls>`, ограниченный loop выполнит эти calls через общий `POST /tools` и отправит provider-у `<tool_results>...` только после `generating:false`. Для прямого `browser_chat.send` работает server-side pump, Browser Agent UI передает `autoToolLoop:false` и использует свой streaming loop. `browser_chat.send/read` возвращают transport-state (`generating`, `canSend`, `busy`, `blockedReason`), а Browser Agent Chat показывает это отдельным toolbar-индикатором. Это не native function calling provider-а и не универсальный planner; `browser_chat.*` остаются внутренним transport и не вызываются browser LLM напрямую.

## UI Architecture

`web/main.ts` - browser host/controller layer. Он создает `UiRuntime`, maps processes/modules to `UIDisplay` и wires process-scoped snapshots to panes.

Pane classes under `web/*-pane.ts` должны оставаться reusable и display-local. Pane не должен читать или менять state другого module display.

Generic panes under `ui/panes` не должны знать interpreter-specific concepts. Например, `TerminalPane` может знать terminal buffers, ANSI, keyboard input, focus и caret behavior, но не должен знать module state, breakpoints, Bun, protocol commands или interpreter snapshots. Interpreter-specific terminal behavior живет в `pkg/interpreter/web/main.ts` или package-local helper.

Browser page - только host одного WebGPU canvas. Не добавляй hidden/default runtime surfaces для interpreter content. Interpreter panels должны быть attached к module `UIDisplay`.

Общий server desktop/browser для WebApp уже является рабочим first-class display
в `Space`, а не HUD. Через него человек и агент видят один и тот же WebApp,
управляют серверным Chrome и отлаживают `https://meta.proizvodstvo1.ru/` через
DevTools bridge. Realtime-канал - WebRTC video/audio stream из server Chrome
capture API на сервере; snapshot routes допустимы как fallback/diagnostics.
Visual source по умолчанию - весь server `screen`, не browser tab/window.
Если пользователь просит "сделай скриншот", "посмотри, что я вижу" или
аналогичную визуальную проверку текущего WebApp/DevTools, это означает запросить
удаленный screenshot из видимого server Chrome remote desktop/DevTools окна,
которое видит человек. Не подменяй такой запрос `GET /viewport/screenshot`
интерпретатора, WebApp target-only `Page.captureScreenshot` или локальным
снимком отдельного canvas: эти варианты допустимы только как diagnostics и
должны быть явно так названы. Если remote desktop snapshot endpoint недоступен,
используй ближайший эквивалент видимого браузера, например CDP screenshot
DevTools frontend target, сохраняй файл в `pkg/interpreter/tmp/codex-attachments`
и явно указывай метод capture.
Ввод в видимый WebApp/DevTools в server desktop должен проходить через рабочий
desktop input path: `remote_desktop.input` в `POST /tools` или прямой
`/remote-desktop/input` для низкоуровневой диагностики. Не имитируй клики через
DOM (`Runtime.evaluate`, `HTMLElement.click`, `canvas.dispatchEvent`) и не
выдавай такой обход за визуальную проверку: человек должен видеть движение той
же мыши на `remote-desktop:server`. CDP `Input.dispatchMouseEvent` относится к
page-target injection и может использоваться только как отдельная диагностика
Chrome protocol; если нужна работа с общим экраном, используй desktop input.
Interpreter воспроизводит audio через WebAudio spatial panner, привязанный к
позиции display в Space. Не делай Playwright permanent runtime dependency и не
завязывай архитектуру на macOS display пользователя. macOS/ai-macos и Linux
OS-level input/audio должны быть adapter-слоями поверх общего
signaling/input/media контракта.

Текущий server-dev контур без физического монитора использует один Wayland/Mutter
virtual monitor и Chrome sender `webrtc:chrome:monitor` на
`127.0.0.1:32133`. Ожидаемый быстрый media state - `transport:
"chrome-webrtc"`, `capture.frameSource:
"chrome-get-display-media:monitor"`, 1920x1080, target 60 fps,
`audio.transport: "pipewire-pcm-track-generator-stream"`, audio track в том же
PeerConnection, data channel open. Старый `32123` host не должен быть запущен
параллельно: он создает второй `MetaVendor` monitor и может дать черные кадры.
WebRTC sender не должен жить в видимой продуктовой странице
`https://meta.proizvodstvo1.ru/`. В текущем server-dev контуре sender target -
отдельная service page `http://127.0.0.1:32133/desktop/rtc/sender`, signaling -
`ws://10.66.0.10:6500/webrtc/signaling`, input/audio - локальные routes
`127.0.0.1:32133`. Не встраивай эти локальные URL в код видимой страницы
продукта: она не должна владеть remote desktop соединением.
`webrtc:chrome:browser`, Xwayland и PipeWire WebM/PCM/MJPEG считай
diagnostic-only paths и не возвращай их как основной realtime path.

Cold restart для нового агента: сначала используй единый lifecycle API
interpreter, а не ручную цепочку tmux/curl:

```sh
curl -sS http://10.66.0.10:6500/remote-desktop/lifecycle
curl -sS -X POST http://10.66.0.10:6500/remote-desktop/lifecycle \
  -H 'content-type: application/json' \
  -d '{"action":"recover","wait":true}'
curl -sS -X POST http://10.66.0.10:6500/remote-desktop/lifecycle \
  -H 'content-type: application/json' \
  -d '{"action":"restart","scope":"sender","wait":true}'
```

`GET /remote-desktop/lifecycle` возвращает schema/userStories и полный state.
`POST /remote-desktop/lifecycle` принимает `action`, `scope`, `wait`,
`timeoutMs`, `cleanProfile`, `stopXvfb`, `config`. Не гаси virtual display, если
нужно только перезапустить sender: default для `restart` - `scope:"sender"`.
На текущем server-dev `Meta-0` создается и удерживается headless GNOME RDP
trigger: Xvfb `:101` + `xfreerdp` к `127.0.0.1:3390`; sender - tmux
`metafor-chrome-wayland-monitor-main` с
`pkg/interpreter/remote-desktop/chrome-webrtc-monitor.sh`. Успешный health обязан
показать `stream.target.connector: "Meta-0"`, `capture.frameSource:
"chrome-get-display-media:monitor"`, audio `pipewire-pcm-track-generator-stream`
и RTC `control-open`.

Remote desktop host-код живет в `pkg/interpreter/remote-desktop`. В
interpreter-модуле должен оставаться только реально используемый server-dev
путь: Chrome WebRTC monitor sender, host API `/desktop/health|rtc|input|audio`
и dev-layout. Не переноси старые fallback-и и мертвый код: `32123`,
Xwayland/current-tab, MJPEG/snapshot как основной frame loop, Playwright-клиенты
и shell-specific UI поведение.

## Terminal Input

Module terminal является одновременно module output и expression input.

Expression input интерпретатора должен жить в terminal, а не в отдельной Eval panel. Пользовательский язык - "expression"; internal command names могут оставаться `eval`, когда это напрямую мапится на protocol behavior.

Terminal input доступен только owning module, когда module:

- connected;
- paused;
- has current dump/frame context;
- has not exited or failed;
- is not already running another command.

Terminal focus/caret behavior display-local. Click/focus одного module terminal не должен focus/enable input другого terminal. После reload восстанавливай focus только ранее focused module terminal, а не первый/левый display.

Focused input caret blinking разрешен. Не добавляй render loops или timer repaint work вне focused input caret behavior.

## Rendering Rules

MetaFor UI engine request-render based. Не добавляй continuous render loops, periodic repaint timers или repeated diagnostic repaints. Repaint только от state changes, input events, WebSocket/module events, resize/layout changes или focused input caret blink.

HUD/window layout в interpreter должен идти через общие UI primitives: `flexRow`/`flexColumn` и `ui/panes/pane-frame.ts` для pane chrome. Не добавляй локальную параллельную геометрию, ручные sibling-surface offsets или отдельные floating surfaces для content, который визуально находится внутри окна. Если legacy/low-level content уже живет sibling `UiSurface`, parent и sibling должны использовать один общий rect от `pane-frame`. Для стандартных HUD panes title/header веди через общий title bar path, чтобы minimize/actions/title/subtitle оставались одинаковыми.

После browser reload или hot reload серый canvas на моментальном screenshot может означать, что WebGPU еще не presented. Подожди перед выводом, что UI blank. Не добавляй permanent repaint logic ради раннего screenshot.

При screenshot tests жди стабилизации UI перед capture. Для Chrome automation используй local Chrome service и exact browser window/tab.

## CLI И Запуск

Root package script - supported entrypoint:

```sh
bun run interpreter
```

Запуск modules через interpreter поддерживает relative и absolute paths:

```sh
bun run interpreter ./module.ts
bun run interpreter ./module.spec.ts -timeout=2147483647
bun run interpreter dark/server.spec.ts -timeout=2147483647 pkg/interpreter/src/syntax.test.ts
```

CLI parsing rules:

- module paths передаются без `--module`;
- parameters начинаются с `-`;
- parameters между двумя module paths принадлежат предыдущему module;
- `-param=value` валиден;
- params перед первым module path невалидны;
- module id/label берется из launched module path, если явно не supplied через REST.

Default startup modules используют pause-on-start, чтобы пользователь успел поставить breakpoints до продолжения execution.

## Naming

В user-visible names используй interpreter terminology:

- interpreter;
- display;
- module;
- runtime;
- expression;
- execution point;
- breakpoint;
- event stream;
- terminal/output.

Избегай user-facing names:

- debugger;
- inspector;
- session default;
- default display;
- main display;
- attach to WebStorm.

Internal protocol references могут использовать точные protocol names, когда это необходимо.

## State And Persistence

Interpreter state пишется под `.metafor/interpreter/`. Per-display/module state должен жить под scoped ids/paths.

LocalStorage keys в UI должны быть scoped by module id/display id, если они влияют на один display. Shared LocalStorage keys допустимы только для truly global preferences вроде locale.

Никогда не используй `default` как module/session/display identifier.

## Breakpoints

Breakpoints process-scoped и должны matched against source identity owning process.

Agent-facing `breakpoint.set` не должен молча принимать неисполняемую строку:
для локальных TS/JS source-файлов он нормализует breakpoint на ближайшую
следующую runtime-исполняемую строку и возвращает `warning` +
`requestedBreakpoint`, либо `ok:false`, если рядом нет подходящей строки.
В `breakpoint.installed[]` должны быть видны `requestedLocation`,
`generatedLocation` и `actualLocation`, чтобы агент проверял фактическую
runtime-точку без чтения raw event log.

Для semantic/debug задач агент не должен вручную считать номера строк по
source-фрагменту или угадывать строку по открытому cursor/source-pane. Сначала
используй `source.locate` или сразу `breakpoint.set` с `text`/`query`/`regex`
locator. Если locator возвращает `ambiguous source locator`, уточни область
через `after`/`before`, `occurrence` или более точный текст; не выбирай первый
match молча. Line-only `breakpoint.set` допустим, когда line пришел из
`currentFrame`/`sourceMatch`/gutter click/явной команды пользователя, а не из
ручного подсчета агентом.

Editor gutter clicks в одном display могут set/remove breakpoints только для owning process. Badge counts и marker rendering должны использовать ту же process-scoped matching logic.

Используй logical source matching helpers из `web/breakpoint-matching.ts` и source map helpers из `src/source-map.ts`; не возвращай ad hoc global breakpoint matching.

Существующие breakpoints принадлежат пользователю. Перед переходом к requested location смотри текущие breakpoints display и планируй вокруг них. Если existing breakpoint остановит execution раньше requested location, пропусти его через resume/step flow или temporary agent-owned breakpoint. Не удаляй, не disable, не move и не overwrite existing breakpoints без явной просьбы. Только agent-created temporary breakpoints можно убрать после завершения перехода.

## Events

Verbose/event panels per display. Toggle events на одном display не должен show/hide cards на другом display.

Interpreter-level events без `moduleId` можно append ко всем displays только если они действительно host-level. Module protocol и target events должны route by `moduleId`.

Event copy/clear controls работают только в display, где пользователь нажал control.

## Tests And Verification

Запускай focused tests для touched files, затем package checks при изменении shared behavior:

```sh
bun run --filter @metafor/interpreter typecheck
bun run --filter @ui/panes typecheck
bun test pkg/interpreter/src/*.test.ts pkg/interpreter/web/*.test.ts ui/panes/**/*.test.ts
git diff --check
```

Для UI changes проверяй:

- один module display работает один;
- два module displays остаются независимыми;
- click controls на одном display не влияет на другой display;
- terminal focus/input/caret per display;
- breakpoints, поставленные в одном display, не появляются в другом display, если они не принадлежат source этого display;
- module completion disables только бессмысленные controls для этого module;
- reload/hot reload restores displays без default/hidden displays.

## Documentation

Держи эти файлы aligned при изменении behavior:

- `README.md` - primary usage;
- `docs/architecture.md` - структура и invariants;
- `docs/api.md` - REST/WS contracts;
- `docs/workflow.md` - launch и live workflow;
- `docs/troubleshooting.md` - known failure modes;
- `docs/acceptance.md` - manual acceptance flow.

Удаляй obsolete debugger/inspector/WebStorm wording, когда оно становится user-facing documentation. Internal protocol references могут оставаться, когда они точно описывают Bun protocol.
