# LOAD-001 — Загружать браузерный функционал через минимальный Service Worker

## Коротко

Новый browser loader разделён на два последовательных уровня: неизменяемый
`startup` и обновляемый `import`. Минимальный startup получает управление и
запускает importers в Window и Service Worker. Importers формируют загружаемый
контур из двух разных пространств: `internal` содержит служебную логику самого
Hamiltonian для сетевого взаимодействия и обслуживания развёртывания, а
`metafor` содержит среду, ради загрузки которой создан Hamiltonian. Module не
закрепляется именем за Window или Service Worker и может быть размещён также в
Dedicated Worker.

Прежний Hamiltonian остаётся отдельно запускаемым прототипом. Новый loader
создаётся с нуля в чистых source-директориях и не получает перенесённый
prototype-код.

## Зачем

Первоначальный HTTPS server может быть временным, поэтому настоящий browser
functionality нельзя навсегда загружать напрямую с его static routes. В
браузере должна остаться минимальная неизменяемая оболочка, способная сохранить
и повторно запустить первоначально полученный functionality без исходного host.

Сначала нужен independently accepted loader с одним signaling peer. Только
после него `UPD-002` может определить полный многосоставный browser release и
его последующую атомарную смену.

## Связь с дорожной картой

Задача является первым срезом отдельной линии
[`Загрузка Hamiltonian`](../ROADMAP.md#загрузка-hamiltonian) и предшествует
[`UPD-002 — Обновлять всю клиентскую сборку через Service
Worker`](UPD-002.md).

Она развивает первый однодевайсный этап
[`MF-425 — Управлять одной Вселенной на одном устройстве`](MF-425.md), но не
берёт его общую visual/control приёмку и не переходит к нескольким устройствам
из `MF-426`.

## Связанные задачи и история

Evidence-backed gate выполнен в
[`HAM-004 — Собрать целостные требования к Hamiltonian`](HAM-004.md) и
зафиксирован коммитом `548a9ccc7`.

* Закрытая `MF-412` доказала один synthetic versioned module, SHA-256,
  Cache Storage и запуск одинаковых bytes в Window, Dedicated Worker и Bun
  process, но не production loader полного функционала.
* Закрытая `MF-428` доказала browser-managed замену executable Service Worker,
  profile ownership и recovery через Web Push, но не сменяемую исполняемую
  часть внутри неизменяемого Worker.
* Закрытая `UPD-001` только собрала прежний update-код под
  `hamiltonian/update/{shared,host,browser}` и сохранила прежнее behavior.
* `UPD-002` и её первый срез зарегистрированы project-коммитами `22a0be9c5` и
  `0d6d4de20`, но product result отсутствует. Прежняя `.1` начинала с полного
  artifact manifest и остановлена до implementation после owner-решения сначала
  доказать minimal loader.
* `HAM-003` владеет структурой source без изменения behavior, `MF-411` — общим
  законом Hamiltonian, а `MF-425` — средой однодевайсной приёмки; они не
  заменяют предметный loader contract.
* Решением владельца от 14 августа 2026 года весь существовавший Hamiltonian
  признан рабочим прототипом. Его прежняя декомпозиция остаётся evidence, но не
  является основанием для переноса исходников в новую реализацию.

## Подтверждённые факты

* Первый navigation request не может обслужить ещё не установленный Service
  Worker, поэтому HTTPS host обязан вернуть минимальный startup.
* Текущие page JavaScript, CSS, orchestration и Worker resources загружаются
  напрямую с host; release cache Service Worker обслуживает только
  `/versions/...` synthetic module.
* Service Worker уже открывает control WSS, сохраняет startup в Cache Storage
  и может быть разбужен Web Push без открытой Hamiltonian Page.
* Browser не позволяет динамически `import()` неизвестный module внутри
  Service Worker, но при разрешающей CSP Worker может выполнить уже проверенный
  source text через `Function()`/`eval()`.
* Уже установленный Service Worker и его storage остаются привязаны к исходному
  origin; новый WSS address является source/transport, а не новым PWA origin.
* В рабочем дереве уже начато отделение prototype entrypoint как
  `server_proto.ts` и созданы незакоммиченные заготовки новых директорий. Это
  параллельные изменения владельца; они не являются готовым результатом
  LOAD-среза до проверки exact source boundaries и поведения.
* Bun Fullstack Dev Server при импорте HTML в `Bun.serve({routes})`
  автоматически обрабатывает указанные в HTML scripts и styles, выполняет
  runtime bundling и публикует полученные assets. При `development: false`
  результат лениво создаётся по первому HTML request и кэшируется в памяти до
  перезапуска server.
* Официальная Fullstack-документация не определяет Service Worker registration,
  script URL и обязательные для него response headers. Применимость этого пути
  к `web/service` требует отдельного воспроизводимого proof.

## Решения владельца

* Направление называется `LOAD`, потому что владеет загрузкой, а не обновлением.
* Browser loader имеет неизменяемый `startup` и environment-specific
  обновляемый `import`. Startup содержит только минимально необходимый код
  доставки и запуска importer и не исполняет загружаемое поведение.
* `main` и `service` в именах `@import/main` и `@import/service` обозначают
  среду importer, а не вид загружаемого module. Importers загружают как
  `internal` modules Hamiltonian, так и modules среды `metafor`; их имена не
  зеркалят Window, Dedicated Worker или Service Worker, а placement одного
  module может между ними меняться. Фиксированные пакеты `@web/main` и
  `@web/service` не создаются.
* `internal` — не общее имя загружаемого поведения. Это только служебная логика
  Hamiltonian: сетевые взаимодействия и обслуживание развёртывания. Она живёт
  под `hamiltonian/internal`, адресуется под `/internal/…` и хранится в Cache
  Storage `internal`.
* `metafor` — отдельная будущая среда/пространство, ради которой создан
  Hamiltonian. Тот же importer и loader будут загружать её modules через
  `/metafor/*` в отдельный ленивый Cache Storage `metafor`.
* Минимальный package определяется до полного browser functional release.
* Package состоит из минимальных HTML, main-процесса и неизменяемой Service
  Worker оболочки.
* В первом контуре Service Worker знает один signaling Hamiltonian peer.
* Startup Service Worker не открывает WebSocket и не содержит RPC. WebSocket
  принадлежит загружаемому internal module `@internal/rpc`; peer может
  менять адрес source, но module bytes loader получает через `fetch`, проверяет
  и сохраняет до запуска.
* `web/startup/service` выполняет обычный browser `fetch` и содержит только
  используемые неизменяемые primitives `verify`, `cache`, `read`, `remove` и
  `run`. С их помощью startup загружает и запускает `@import/service`.
  Сам `@import/service` владеет логическими адресами modules, их placement и
  полной композицией этих primitives, но не дублирует их реализацию.
* Cache Storage разделён по владельцам: `startup` хранит минимальную оболочку и
  реально использованные ею resources, `import` — importer artifacts,
  `internal` — modules Hamiltonian, а будущий `metafor` — modules среды
  MetaFor. Каждый cache создаётся лениво только при первой записи своего
  artifact.
* Стабильный cache endpoint строится на исходном origin Service Worker и не
  меняется вместе с внешним адресом, откуда loader выполняет `fetch`.
* Minimal main регистрирует Service Worker, дожидается его управления страницей,
  отправляет `connect` и запускает `@import/main`, но не modules напрямую.
  Fetch handler возвращает importer response только после его сохранения в
  cache `import`; отдельный ready-message для этого не нужен.
* Сменяемый functionality состоит из нескольких частей, а не одного
  обязательного bundle.
* Каталог адресов нескольких signaling peers и peer-security обсуждаются и
  реализуются на следующем сетевом этапе.
* Весь ранее написанный Hamiltonian считается прототипом. Он запускается через
  `server_proto.ts`, остаётся рабочим наглядным образцом и не рефакторится;
  прежние `browser`, `core`, `public`, `update`, `visual` и остальные исходники
  также принадлежат прототипу.
* Новая реализация создаётся с нуля рядом в `web`, `server` и `interface`.
  Неизменяемые browser entrypoint находятся в `web/startup/main` и
  `web/startup/service`, а environment-specific importers — в
  `web/import/main` и `web/import/service`. Они оформляются workspace-пакетами
  `@startup/main`, `@startup/service`, `@import/main` и `@import/service`, потому
  что каждый требует строгой проверки в своей execution-среде. Служебные
  modules Hamiltonian размещаются в `hamiltonian/internal`; среда `metafor`
  остаётся отдельным загружаемым владельцем.
* Fullstack runtime bundling HTML/main отклонён из-за Bun HMR и неподходящего
  runtime URL importer. HTML остаётся статическим, оба browser entrypoint
  собираются заранее, а `server.ts` только выдаёт готовые bytes.
* `web/startup/main` владеет минимальным main-потоком: регистрирует Service
  Worker, дожидается controller и запускает `@import/main` через
  перехватываемый Worker endpoint `/import/main`.
* `web/import/main` владеет Window importer, а `web/import/service` — Service
  Worker importer. Прежние `web/main` и `@web/main` уже перенесены в
  `web/import/main` и `@import/main`. Service Worker importer загружает первый
  internal module; Window importer остаётся пустым оркестратором до выбора
  первого реального module. Имена importers определяют место их работы, но не
  навсегда закрепляют placement загруженного module.
* Стандартное пустое окружение визуализации Window вынесено в отдельную
  [`HAM-005`](HAM-005.md): `@import/main` создаёт общий `UiRuntime` с `Space` и
  `HUD`, а `hamiltonian/web/static` обслуживает его HTML, style и font
  resources. Это не первый `internal`/`metafor` module и не новый критерий
  minimal loader.
* Service Worker importer хранит выбранные логические адреса, cache и placement
  в собственном обновляемом слое. Первый адрес `/internal/rpc` уже материализован;
  получение новых source addresses через RPC остаётся отдельным следующим
  механизмом. Загрузку, проверку, cache и запуск самого importer выполняет
  loader в `web/startup/service`.
* `web/startup/service` владеет минимальной неизменяемой оболочкой Service
  Worker: перехватывает requests, готовит startup cache и загружает Service
  Worker importer. `connect` event остаётся активным до завершения этой работы.
  Вместе `web/startup/main` и `web/startup/service` образуют минимальный loader
  этой задачи.
* `server/import` и `server/service` позднее реализуют тот же принцип для Bun.
  Общий договор выделяется в `interface` только после появления обеих
  реализаций, а не проектируется заранее и не оформляется отдельным пакетом.
* `update` остаётся отдельным механизмом обновления уже загруженного
  функционала и не смешивается с первоначальным `import`.
* Каждый следующий срез берёт один механизм: наблюдает его поведение в
  прототипе, реализует заново в новом пакете, проверяет и только затем открывает
  следующий механизм.

## Целевой минимальный путь

1. HTTPS host возвращает минимальные HTML и startup entrypoints.
1. Minimal main регистрирует Worker, дожидается управления страницей, отправляет
   `connect` и запускает Window importer через `/code?module=@import/main`.
1. Startup loader получает Service Worker importer через
   `/code?module=@import/service`, проверяет response, сохраняет его в cache
   `import` и запускает с переданными primitives.
1. Service Worker importer выбирает `/code?module=@internal/rpc`, получает
   module через собственный общий loader, сохраняет в cache `internal` и
   запускает.
1. Загруженный internal RPC module открывает WebSocket `/sw` с единственным
   известным peer; прикладные сообщения принадлежат следующим механизмам.
1. Startup, importers и internal modules восстанавливаются из независимых
   caches; `metafor` создаётся лениво только первым module этой среды.
1. Первый реальный Window или Dedicated Worker module отдельно фиксирует ABI
   и placement, не расширяя неизменяемый startup заранее.

## Поведение процесса

Первый широкий package-срез остановлен до product implementation: общая
package architecture не создаётся. Диагностический Fullstack-срез также
остановлен после доказанного Bun HMR; приняты только необходимые browser
пакеты со статической сборкой.

Первая navigation доказала регистрацию, переход страницы под управление
Worker, постоянный offline startup и запуск обоих importers из cache `import`.
Service Worker importer уже загружает первый module `@internal/rpc` через
общий import-layer loader в cache `internal`; WebSocket находится внутри этого
module, а соединение подтверждено browser-сценарием. Диагностический
`ping`/`pong` удалён и не является loader contract. Startup не знает module
endpoints, storage policy или WebSocket.

Владелец подтвердил cold restoration internal module в живом browser.
Стандартное пустое visual-окружение Window и последующий запуск первого
реального module не расширяют minimal loader: окружение вынесено в `HAM-005`,
а выбор module остаётся отдельным будущим решением. Полный manifest с hashes,
preparing/ready/active release и атомарное переключение относятся к `UPD-002`.

Каждый новый механизм получает отдельную последовательную подзадачу и
checkpoint.

## Подзадачи

### LOAD-001.1 — Создать чистую пакетную структуру новой реализации

Статус и исполнитель: `STOPPED BEFORE IMPLEMENTATION`; product-исполнитель не
запускался, package manifests и workspace membership не создавались.

Классификация: один structural result в границах `LOAD-001`; новый Hamiltonian
получает физические package boundaries без runtime behavior.

Требование: прототип продолжает запускаться через `server_proto.ts`, а Git и Bun
workspace распознают самостоятельные пакеты `web`, `server`, `interface` и их
`import`, `service`, `update`. Новые пакеты не содержат перенесённого или нового
функционального кода.

Основание и связанная история: прежние `HAM-003`, `UPD-001`, `MF-412` и
`MF-428` описывают только устройство и доказательства прототипа. Решение
владельца требует clean-room реализации и откладывает общий `interface` contract
до появления Web- и Bun-реализаций.

Наблюдаемое расхождение: на проверенном `HEAD` `8b1f381526f7321f3b1009ba4c2feff50ca17d81`
новые packages не зарегистрированы в workspace и не имеют package manifests;
существующий `@metafor/hamiltonian` содержит весь прототип. В рабочем дереве есть
параллельные незавершённые заготовки владельца, которые нужно сохранить и
проверить, а не автоматически принять как результат.

Причина: чистая package architecture принята только текущим owner-решением и
ещё не материализована в каноническом Git-состоянии.

Разрешённое изменение одного механизма: отделить prototype entrypoint и создать
только package manifests, workspace membership и минимальную package-level
проверку новых границ. Не переносить source, не добавлять browser/server
behavior, общие public types или update protocol.

Regression или опровергающее доказательство: package-boundary проверка должна
падать при отсутствии любого заявленного package, при импорте prototype source
из нового дерева или при преждевременном общем implementation contract.

Среда и критерий приёмки: canonical checkout на текущей ветке; prototype tests
и его `server_proto.ts` entrypoint остаются рабочими, Bun workspace видит все
новые packages, а их source inventory пуст от функционального кода.

Фактические действия:

Результат и вывод: владелец отказался от package architecture до product patch.
`web`, `server`, `interface` и вложенные механизмы остаются обычными
source-директориями.

Подготовительный commit: `a90d9adfd`.

Result checkpoint:

### LOAD-001.2 — Проверить loader через Bun Fullstack без отдельной сборки

Статус и исполнитель: `STOPPED`; runtime `Bun.Transpiler` в `server.ts`
отклонён владельцем, а отдельный Service Worker build вынесен в `LOAD-001.4`.

Классификация: новый диагностический механизм после owner-отказа от packages;
срез принимает воспроизводимый ответ, может ли Bun Fullstack стать первым
server/browser loading path без отдельного build pipeline.

Требование: новый `server.ts` импортирует минимальный `web/index.html` как route
`Bun.serve()`. HTML указывает минимальный main из `web/import`, а Service Worker
script принадлежит `web/service`. Новые directory boundaries не имеют
`package.json`, не входят в workspaces и не импортируют prototype source.

Основание и связанная история: официальный Bun Fullstack contract подтверждает
автоматическую обработку HTML scripts/styles и runtime bundling. Он не описывает
Service Worker, поэтому точная выдача его script URL и headers остаётся
проверяемой гипотезой, а не принятым фактом.

Наблюдаемое расхождение: prototype использует ручной `Bun.build` Service Worker
bundle и множество static routes; новая реализация ещё не доказала ни одного
Fullstack HTML/main request и ни одной Service Worker registration без этого
механизма.

Причина: выбран новый Bun Fullstack loading mechanism, отсутствующий в
прототипе и не покрытый его проверками.

Разрешённое изменение одного механизма: создать минимальный воспроизводимый
Fullstack contour в новых `server.ts`, `web/index.html`, `web/import` и
`web/service`. Допускается только код, необходимый доказать HTML route, main
execution и Service Worker registration/response. Не добавлять WSS delivery,
cache protocol, functional module, `update`, общий `interface` или packages.

Regression или опровергающее доказательство: проверка должна устанавливать,
что HTML обслужен Fullstack route, main фактически выполнился, Service Worker
script получен с допустимым URL и headers и browser зарегистрировал его. Если
Fullstack route не может корректно выдать Worker, срез принимает точную границу
и останавливается; минимально необходимый явный server route сначала отдельно
предъявляется владельцу, а не добавляется автоматически.

Среда и критерий приёмки: canonical checkout и локальный secure browser contour;
prototype продолжает запускаться через `server_proto.ts`, новый contour не
использует prototype imports или отдельный `Bun.build`, а browser evidence
отличает загрузку HTML/main от фактической Service Worker registration.

Фактические действия:

Результат и вывод:

Подготовительный commit:

Result checkpoint:

### LOAD-001.3 — Подключить Service Worker к одному WebSocket

Статус и исполнитель: `REVIEW`; выполнял руководитель текущей задачи Codex
напрямую, без субагентов; live-сценарий проверил владелец.

Классификация: следующий минимальный runtime-механизм после регистрации Service
Worker; он доказывает только принадлежность WebSocket соединения Worker-контексту.

Требование: после успешной регистрации minimal main просит активный Service
Worker подключиться к тому же Bun server. Worker выбирает `ws:` для HTTP и
`wss:` для HTTPS, а server принимает upgrade на одном явном endpoint.

Наблюдаемое расхождение: импорт `web/service` из HTML запускает его в main-потоке,
а новый `server.ts` пока не выдаёт отдельный Service Worker script и не принимает
WebSocket upgrade.

Разрешённое изменение одного механизма: убрать прямой HTML import `web/service`,
зарегистрировать его отдельный script URL из `web/import`, добавить минимальный
message `connect` и принять WebSocket тем же `Bun.serve()`. Не добавлять payload
protocol, delivery частей, cache, retry/reconnect, identity, authentication,
update или imports из прототипа.

Среда и критерий приёмки: после запуска владельцем browser регистрирует Worker,
а Bun server наблюдает одно соединение от Service Worker. Консоль main-потока
не должна выполнять `web/service` как обычный HTML module.

Фактические действия: main регистрирует module Worker, ждёт `ready` и при первой
установке — `controllerchange`, после чего посылает единственный `connect`.
Worker открывает один socket к `/service`, выбирая `ws:` или `wss:` по origin;
тот же singleton `Bun.serve()` принимает upgrade и отмечает соединение как
принадлежащее `web/service`.

Результат и вывод: владелец подтвердил регистрацию Worker и WebSocket из его
контекста в локальном Hamiltonian contour. Повторный `connect` не создаёт второй
socket, пока первый находится в `CONNECTING` или `OPEN`; payload protocol,
reconnect и доставка functionality не добавлены.

Подготовительный commit: `e089719f9`.

Result checkpoint: `9fb1b30dd`, `07f0d0254`, `1e8699597`.

### LOAD-001.4 — Собирать Service Worker пакетом @web/service

Статус и исполнитель: `REVIEW`; выполнял руководитель текущей задачи Codex
напрямую, без субагентов.

Классификация: новый build-механизм после отклонения runtime-транспиляции в
Hamiltonian server.

Требование: `hamiltonian/web/service` является workspace-пакетом `@web/service`.
Пакет владеет Service Worker entrypoint, его строгими типами и командой `build`,
которая материализует готовый browser JavaScript. `server.ts` только читает и
выдаёт этот artifact.

Наблюдаемое расхождение: текущий `server.ts` читает TypeScript source и вызывает
`Bun.Transpiler` при запуске, смешивая HTTP server и Service Worker build.

Разрешённое изменение одного механизма: добавить package manifest и workspace
membership `@web/service`, перенести в него `@types/serviceworker`, добавить
одну build-команду и заменить runtime transpilation чтением результата build.
Не менять HTML/main registration, WebSocket protocol, cache, update или
прототипный Hamiltonian.

Среда и критерий приёмки: `bun run --filter @web/service build` успешно создаёт
игнорируемый Git build artifact, строгая проверка Worker source проходит, а
`server.ts` не содержит `Bun.Transpiler` или `Bun.build`.

Фактические действия: `hamiltonian/web/service` зарегистрирован в workspace как
`@web/service`; пакет получил отдельные strict `tsconfig`, `@types/serviceworker`
и `build`. Штатный Hamiltonian `start` сначала вызывает build пакета, затем
запускает server; server выдаёт прочитанные bytes `dist/index.js` и не содержит
runtime transpilation.

Результат и вывод: `bun run --filter @web/service build` завершён успешно,
создал игнорируемый `dist/index.js` размером 0.87 KB; отдельные typechecks
Worker и нового server/main contour проходят. Общий root typecheck после
успешной проверки `@web/service` останавливается только на прежних ошибках
прототипного `hamiltonian/update`.

Подготовительный commit: `14acb0071`.

Result checkpoint: `9fb1b30dd`.

### LOAD-001.5 — Собирать main-loader пакетом @web/import без HMR

Статус и исполнитель: `REVIEW`; выполнял руководитель текущей задачи Codex
напрямую, без субагентов; отсутствие HMR проверил владелец в browser contour.

Классификация: новый build-механизм после остановленного Fullstack-среза
`LOAD-001.2`.

Требование: минимальный main является workspace-пакетом `@web/import`, проходит
строгую проверку и заранее собирается в один `import.js`. Статический HTML
подключает этот artifact напрямую, а штатный запуск не создаёт Bun HMR runtime.

Основание и связанная история: `LOAD-001.2` доказал обработку HTML/main через
Bun Fullstack, но владелец отклонил HMR и runtime bundling для неизменяемого
loader. Отдельная сборка `@web/service` в `LOAD-001.4` дала применимый образец
границы browser entrypoint.

Наблюдаемое расхождение: Fullstack HTML route добавлял HMR socket и выдавал
importer через runtime URL вместо стабильного `/import.js`.

Причина: импорт HTML в Bun Fullstack передаёт main entrypoint runtime bundler,
который намеренно добавляет development runtime.

Разрешённое изменение одного механизма: оформить только `web/import` пакетом,
добавить static build и заменить Fullstack HTML route готовыми HTML/import
responses. Не добавлять payload delivery, update или prototype imports.

Regression или опровергающее доказательство: собранный `import.js` не содержит
Bun HMR runtime, HTML ссылается на стабильный `/import.js`, а `server.ts` не
импортирует HTML как Fullstack module.

Среда и критерий приёмки: strict typecheck и build обоих browser-пакетов
проходят; в локальном browser main регистрирует Worker без HMR socket.

Фактические действия: добавлены package manifest и strict `tsconfig` для
`@web/import`; штатный Hamiltonian `start` сначала собирает оба browser-пакета.
HTML перенесён в static source, а server буферизует его и оба готовых script при
запуске.

Результат и вывод: владелец подтвердил исчезновение Bun HMR; статический main
продолжил регистрацию и handoff Worker.

Подготовительный commit: отдельный project-коммит до прямой owner-итерации не
записывался.

Result checkpoint: `8bc7a3774`.

### LOAD-001.6 — Восстанавливать минимальный startup без сети

Статус и исполнитель: `REVIEW`; выполнял руководитель текущей задачи Codex
напрямую, без субагентов; offline-сценарий проверил владелец.

Классификация: новый cache-механизм после принятого статического startup.

Требование: после получения управления Worker один раз сохраняет HTML,
`import.js` и Web App Manifest в постоянный Cache Storage. Последующие GET этих
URL обслуживаются cache-first и не требуют доступного server; уже сохранённые
bytes не заменяются текущим host response.

Основание и связанная история: `LOAD-001.5` сделал startup стабильными
same-origin endpoints. Прототипный release cache не переносится, потому что он
владеет synthetic `/versions/...` module и update behavior.

Наблюдаемое расхождение: после первой регистрации navigation и main всё ещё
зависели от доступности host.

Причина: новый Worker не имел собственного startup inventory и fetch policy.

Разрешённое изменение одного механизма: добавить постоянный cache только для
HTML, importer и manifest; продлить `connect` message через `waitUntil`, пока
startup готовится. Не добавлять ready message, version switching, payload
cache или update.

Regression или опровергающее доказательство: startup inventory содержит
ровно `/`, `/import.js` и `/manifest.webmanifest`; отсутствующий endpoint не
становится cached после unsuccessful response.

Среда и критерий приёмки: после одного online запуска владелец включает offline
и повторно получает HTML/importer через активный Worker; WebSocket закономерно
остаётся сетевым и не входит в offline criterion.

Фактические действия: Worker получил cache-first fetch policy и идемпотентную
подготовку трёх startup endpoints в cache `metafor`. Main отправляет
`connect` только после появления controller, а Worker удерживает message event
до завершения подготовки cache.

Результат и вывод: owner-проверка подтвердила offline navigation и выполнение
`import.js`; отсутствие PWA images выявило отдельную политику assets и вынесено
в `LOAD-001.7`.

Подготовительный commit: отдельный project-коммит до прямой owner-итерации не
записывался.

Result checkpoint: `8bc7a3774`.

### LOAD-001.7 — Встраивать static assets и кэшировать только использованные

Статус и исполнитель: `REVIEW`; implementation checkpoint подготовил
руководитель текущей задачи Codex напрямую, без субагентов; повторную
offline/manifest проверку подтвердил владелец.

Классификация: отдельный static asset/cache mechanism после owner-наблюдения,
что precache всего Web App Manifest занимает `2.6 MB`, хотя один browser
запрашивает только часть ресурсов.

Требование: server не читает static assets на каждый request и не содержит
ручной перечень route каждого файла. Build-time Bun macro встраивает bytes и
MIME types, один `/assets/*` handler выдаёт подготовленный snapshot. Worker не
precache-ит весь manifest: успешный asset сохраняется только после фактического
browser request. Favicon и Apple touch icon принадлежат HTML, а Web App Manifest
содержит только PWA icons и install screenshots.

Основание и связанная история: `LOAD-001.6` сначала включил все manifest
resources в startup cache. Owner-проверка Cache Storage показала `2.6 MB`, а
после полного исключения assets offline manifest requests стали падать.

Наблюдаемое расхождение: полный precache хранит неиспользованные варианты icon
и screenshot; отсутствие любого asset cache ломает реально запрошенные PWA
resources offline. Manifest дополнительно объявлял multi-size ICO как PWA icon,
из-за чего Chromium сравнивал его как один кадр `256x256` и выдавал warnings.

Причина: manifest inventory ошибочно использовался как обязательный startup
inventory, а runtime static scan смешивал подготовку assets с запуском server.

Разрешённое изменение одного механизма: вынести filesystem scan в Bun macro,
оставить handler в `web/static`, исключить manifest resources из startup и
записывать `/assets/*` cache-on-first-request. Не оптимизировать изображения,
не добавлять release versions и не менять функциональный payload.

Regression или опровергающее доказательство: собранный Worker содержит только
три startup URL; static asset macro не остаётся runtime filesystem code;
manifest не содержит favicon/Apple touch entries; неизвестный asset получает
`404`.

Среда и критерий приёмки: strict host/Worker checks и обе browser builds
проходят. После очистки cache один online запуск сохраняет только реально
запрошенные browser assets, а повторный offline запуск использует их без
повторного network fetch и без manifest size warnings.

Фактические действия: manifest переведён в JSON source и по прежнему публичному
URL выдаётся как `application/manifest+json`. Bun macro сканирует
`hamiltonian/assets` при build и встраивает base64 bytes/MIME; `web/static`
однократно декодирует snapshot и владеет wildcard handler. Worker precache
оставляет только startup, а успешный network fallback `/assets/*` сохраняет
через clone. Favicon и Apple touch link остаются в HTML и удалены из manifest.

Результат и вывод: проверки build/typecheck подтверждают статический server
bundle и Worker inventory без полного asset precache. После очистки прежнего
Cache Storage владелец подтвердил online/offline загрузку и отсутствие прежних
manifest/cache ошибок.

Подготовительный commit: отдельный project-коммит до прямой owner-итерации не
записывался.

Result checkpoint: `395029974`.

### LOAD-001.8 — Импортировать управляющий main после захвата страницы

Статус и исполнитель: `REVIEW`; выполнял руководитель текущей задачи
Codex напрямую, без субагентов.

Классификация: следующий loading mechanism после подтверждённого offline
startup; владелец выбрал первоначальную HTTP-доставку вместо передачи кода по
WebSocket.

Требование: `web/main` является workspace-пакетом `@web/main` и собирает первый
управляющий Window-модуль в `/main.js`. `@web/import` начинает dynamic import
только после появления Service Worker controller. Первый `/main.js` request
перехватывается Worker: при cache miss response приходит с server, полностью
сохраняется в Cache Storage и лишь затем возвращается в `import()`. Повторный
offline import получает тот же response из cache.

Основание и связанная история: `LOAD-001.5` создал неизменяемый importer,
`LOAD-001.6` доказал контроль страницы и cache-first startup, а
`LOAD-001.7` — cache-on-first-request для browser assets. Передача Window-кода
по WSS не нужна: WebSocket остаётся сигналом будущего update.

Наблюдаемое расхождение: текущий importer после получения controller только
посылает `connect`; управляющий functionality не запрашивается и не запускается.

Причина: для первого Window entrypoint ещё нет отдельного build artifact,
server route и точной cache-on-first-import policy.

Разрешённое изменение одного механизма: добавить пакет `@web/main`, его build и
статический `/main.js` response; после `connect` импортировать URL из
`@web/import`; сохранять только exact `/main.js` network response до возврата.
Не добавлять Worker functionality, version switching, update payload или новый
message contract.

Regression или опровергающее доказательство: `@web/main` проходит strict build;
`@web/import` не импортирует модуль до controller; Worker bundle содержит exact
`/main.js` cache rule; server выдаёт только готовый JavaScript artifact.

Среда и критерий приёмки: после чистого online запуска console показывает
`main process`, Cache Storage содержит `/main.js`; после offline reload тот же
модуль выполняется без network error. Запуск и browser-проверку выполняет
владелец.

Фактические действия: `web/main` зарегистрирован workspace-пакетом `@web/main`
со strict typecheck и отдельным browser build в `dist/main.js`. Штатный start
собирает пакет до запуска server, который буферизует artifact на `/main.js`.
Importer после controller выполняет literal `import("/main.js")`; endpoint
объявлен внешним для Bun build и строго типизирован узкой ambient declaration,
поэтому main не встраивается в importer. Worker сохраняет successful exact
`/main.js` response до его возврата вызывающему import.

Результат и вывод: отдельные builds `@web/main`, `@web/import` и `@web/service`,
строгая host-проверка и server bundle проходят. Собранный importer сохраняет
runtime `import("/main.js")` и не содержит `main process`. При offline-проверке
владельца `/main.js` получен со статусом `200` через Service Worker; переход на
вложенный адрес выявил отдельный navigation-разрыв `LOAD-001.9`.

Подготовительный commit: `20b1e140e`.

Result checkpoint: `efebc35cc`.

### LOAD-001.9 — Открывать вложенные адреса через offline HTML

Статус и исполнитель: `REVIEW`; выполнял руководитель текущей задачи
Codex напрямую, без субагентов.

Классификация: новый пользовательский navigation-сценарий поверх
подтверждённого offline startup и управляющего main.

Требование: любой вложенный SPA-адрес внутри Service Worker scope, например
`/net` или `/net/peer`, получает тот же HTML startup, что `/`. При первом
online-входе до захвата страницы HTML возвращает server; после захвата и
offline — Service Worker из единственной cache-записи `/`. URL в браузере не
меняется. Script, asset и другие не-navigation requests не получают HTML
fallback.

Основание и связанная история: `LOAD-001.6` сохраняет HTML только под `/`, а
`LOAD-001.8` подтвердил offline-загрузку `/main.js`. Owner-проверка вложенного
`/net` показала активный Service Worker со scope `/`, но exact cache miss
завершился `Failed to fetch` при выключенной сети.

Наблюдаемое расхождение: Service Worker контролирует `/net`, однако
`cacheFirst` ищет cache entry по точному URL `/net`; в startup cache есть
только `/`, поэтому offline navigation обращается к недоступной сети.

Причина: scope определяет право перехватить запрос, но не сопоставляет разные
URL с одной SPA-оболочкой. Navigation fallback не объявлен ни в Worker, ни в
server routes.

Разрешённое изменение одного механизма: server возвращает статический HTML для
неизвестного navigation pathname, а Worker сопоставляет каждый GET navigation
request с cache entry `/`. Не создавать отдельные cache entries для вложенных
адресов, не перехватывать non-navigation как HTML и не менять main/WebSocket.

Regression или опровергающее доказательство: `/net` и `/net/peer` получают
HTML online и offline; Cache Storage не содержит их дубликатов; неизвестный
script или asset получает `404`, а не HTML.

Среда и критерий приёмки: browser после одного online startup открывает
вложенные адреса при включённом offline без `Failed to fetch`; прямой первый
online-вход на вложенный адрес также загружает startup. Runtime запускает и
проверяет владелец.

Фактические действия: HTML и manifest импортируются Bun как raw text и входят в
готовые `staticRoutes`; корневые URL их browser resources не зависят от
вложенного pathname. Unmatched GET с `Accept: text/html` получает clone
статического HTML response; остальные unmatched requests получают `404`.
Worker для `request.mode === "navigate"` ищет `/`, а non-navigation requests
сохраняют прежнее exact cache matching.

Результат и вывод: builds `@web/main`, `@web/import` и `@web/service`, строгая
host-проверка и server bundle проходят. Собранные artifacts содержат оба SPA
fallback, live online/offline проверка владельца остаётся открытой.

Подготовительный commit: `0341c6eeb`.

Result checkpoint: `303ab73b1`.

### LOAD-001.10 — Собирать startup внутри владельца routes

Статус и исполнитель: `REVIEW`; выполнял руководитель текущей задачи
Codex напрямую, без субагентов.

Классификация: уточнение build-владельца неизменяемого browser startup после
выделения общего `web/routes`.

Требование: macro рядом с startup routes строго проверяет и собирает пакеты
`@web/import` и `@web/service`, возвращает готовый JavaScript без промежуточного
чтения `dist`. Startup routes создают из результата статические responses для
`/import.js` и `/service.js`. Штатный `start` больше не запускает сборку этих
двух пакетов отдельно; сборка `@web/main` остаётся отдельной.

Основание и связанная история: `LOAD-001.4` и `LOAD-001.5` создали раздельные
строгие browser packages, а текущая декомпозиция server routes выделила группы
`static` и `startup`. Владелец перенёс ответственность за startup build в
его route-группу и подтвердил удаление прежних package build-команд из `start`.

Наблюдаемое расхождение: `routes.startup` пока читает заранее записанные
`web/import/dist/index.js` и `web/service/dist/index.js`, а `start` обязан
сначала отдельно построить оба artifacts.

Причина: сборка и выдача одного startup разделены между package script,
filesystem artifact и route owner.

Разрешённое изменение одного механизма: создать рядом `startup/macro.ts` и
`startup/routes.ts`, собрать оба entrypoint через Bun и вернуть их code
routes; убрать только две соответствующие build-команды из `start`. Не менять
исходники packages, `/main.js`, cache policy и WebSocket.

Regression или опровергающее доказательство: macro выполняет strict typecheck,
сборка importer сохраняет внешний `import("/main.js")`, Service Worker code не
попадает в importer, server bundle содержит оба готовых startup artifacts и
не читает их `dist`.

Среда и критерий приёмки: strict host и package checks, macro/server builds и
`git diff --check` проходят; штатный запуск выполняет владелец.

Фактические действия: `web/startup/macro.ts` запускает package-owned
typechecks и отдельные Bun CLI browser builds через `Bun.spawnSync`, потому что
вложенный `Bun.build` внутри macro запрещён самим bundler как deadlock. Macro
возвращает JavaScript в `web/startup/routes.ts`; `web/routes.ts` только
собирает группы `static` и `startup`. Из `start` удалены отдельные builds
`@web/import` и `@web/service`, а build `@web/main` сохранён.

Результат и вывод: strict host/macro checks и server build проходят. Server
bundle содержит оба startup artifacts и внешний `import("/main.js")`, не
содержит чтения `web/import/dist` или `web/service/dist`. Штатный runtime
владелец ещё не запускал.

Подготовительный commit: `ad60dee6a`.

Result checkpoint: `303ab73b1`.

### LOAD-001.11 — Принять startup как термин начальной загрузки

Статус и исполнитель: `REVIEW`; выполнял руководитель текущей задачи
Codex напрямую, без субагентов.

Классификация: принятое владельцем терминологическое изменение нового loader и
действующего архитектурного описания начальной загрузки.

Требование: `startup` является единственным термином для начальной неизменяемой
загрузки Hamiltonian. Новый loader использует directory `web/startup`,
identifiers `startup` и `Startup`, сообщения ошибок и TypeDoc с этим термином.
Действующая документация использует `startup` в том же смысле.

Основание и связанная история: `LOAD-001.10` выделил отдельную route-группу с
macro, importer и Service Worker code. Владелец выбрал `startup`, потому что это
канонический смысл начального запуска и имя получает отдельную Init icon в Atom
Material Icons.

Наблюдаемое расхождение: новый directory, code identifiers и документация пока
используют прежнее имя, хотя владельцем уже принят термин `startup`.

Разрешённое изменение одного механизма: переименовать новый LOAD-001 directory,
API, TSDoc и релевантную архитектурную прозу в `startup`. Не менять поведение,
URL endpoints и cache contents. Не рефакторить executable identifiers старого
прототипа и независимые одноимённые механизмы других доменов.

Regression или опровергающее доказательство: в новом `hamiltonian/web`, его
server bindings и LOAD-001 документации не остаётся прежних identifiers; build
output и HTTP endpoints совпадают с предыдущим срезом; старый prototype diff
отсутствует.

Среда и критерий приёмки: strict host/Worker checks, startup macro/server build
и `git diff --check` проходят; `rg` подтверждает терминологическую границу.

Фактические действия: route-группа и её macro находятся в `web/startup`;
server, importer и Service Worker используют только identifiers `startup` и
`Startup`. Термин принят в действующей архитектурной и проектной документации.
Исполняемый старый прототип и независимые механизмы Bulk/Matrix не менялись.

Результат и вывод: strict host/package checks, server build, boundary spec и
`git diff --check` проходят. В новом loader, его server bundle и действующей
документации прежнего термина нет; HTTP endpoints и cache policy не изменены.

Подготовительный commit: `42df060e9`.

Result checkpoint: `303ab73b1`.

### LOAD-001.12 — Поместить минимальные загрузчики внутрь startup

Статус и исполнитель: `REVIEW`; выполнял руководитель текущей задачи
Codex напрямую, без субагентов.

Классификация: уточнение физического и package-владельца двух неизменяемых
browser startup entrypoint после принятия общего термина `startup`.

Требование: минимальный main-thread loader находится в `web/startup/main` и
является workspace-пакетом `@startup/main`. Неизменяемая Service Worker
оболочка находится в `web/startup/service` и является workspace-пакетом
`@startup/service`. Управляющий Window-модуль `web/main` остаётся отдельным
пакетом `@web/main` и не входит в startup.

Основание и связанная история: `LOAD-001.4` и `LOAD-001.5` выделили прежние
пакеты по среде `web`, `LOAD-001.10` передал их сборку владельцу
`web/startup`, а `LOAD-001.11` принял `startup` как имя механизма. Владелец
уточнил, что package scope и физическое расположение должны выражать того же
владельца.

Наблюдаемое расхождение: startup macro владеет сборкой, но исходники и package
names всё ещё находятся в соседних `web/import`, `web/service`, `@web/import`
и `@web/service`.

Причина: package boundary была создана до появления единого владельца
`web/startup` и сохранила прежнюю группировку по browser-среде.

Разрешённое изменение одного механизма: перенести два существующих пакета под
`web/startup`, переименовать package names и связанные workspace/typecheck/build
ссылки, направить startup macro на новые entrypoints и обновить диагностическое
имя Service Worker. Не менять `/import.js`, `/service.js`, `/main.js`, cache
policy, WebSocket protocol и поведение модулей.

Regression или опровергающее доказательство: workspace видит
`@startup/main` и `@startup/service`; оба strict typecheck проходят; startup
macro и server bundle собираются без прежних source paths и package names;
importer сохраняет внешний `import("/main.js")`, а Service Worker сохраняет
свою fetch/cache/socket реализацию.

Среда и критерий приёмки: package checks, focused host check, startup
macro/server build и `git diff --check` проходят. Общий typecheck сначала
подтверждает оба startup package, затем сохраняет прежние ошибки неизменённого
прототипного `hamiltonian/update`; они не исправляются этим срезом. Runtime
запускает и проверяет владелец.

Фактические действия: прежние package directories перенесены в
`web/startup/main` и `web/startup/service`; package names, workspace membership,
lockfile, root typecheck filters и диагностическое имя Service Worker обновлены.
Startup macro собирает вложенные entrypoints и возвращает `main`/`service`
routes, а `/import.js` продолжает выдавать startup main.

Результат и вывод: Bun workspace видит `@startup/main`, `@startup/service` и
отдельный `@web/main`. Оба startup package проходят strict typecheck/build;
focused host check и server bundle проходят. Собранный main сохраняет внешний
`import("/main.js")`, а Worker — fetch/cache/socket. Общий typecheck после трёх
успешных package checks сообщает только прежние семь ошибок неизменённого
`hamiltonian/update`. Runtime-проверка владельца остаётся открытой.

Подготовительный commit: `1373c6059`.

Result checkpoint: `9dd5030b4`.

### LOAD-001.13 — Не отклонять запрос отсутствующего asset без сети

Статус и исполнитель: `REVIEW`; выполнял руководитель текущей задачи
Codex напрямую, без субагентов.

Классификация: отдельная error-handling граница lazy asset cache после
подтверждённой offline-загрузки startup.

Требование: если `/assets/*` отсутствует в Cache Storage, а network request
отклонён, Service Worker завершает `FetchEvent` контролируемым `503 Response`.
Неуспешный response не сохраняется. Cache hit и успешная первоначальная загрузка
asset сохраняют прежнее поведение; ошибки startup, navigation и `/main.js` этим
срезом не скрываются.

Основание и связанная история: `LOAD-001.7` оставил assets в политике
cache-on-first-request, чтобы не сохранять весь тяжёлый manifest inventory.
Owner-проверка offline показала rejected `FetchEvent` для отсутствующих icon
assets; после изменения browser cache state ошибка исчезла, но исполняемая
ветвь `fetch()` без обработки осталась.

Наблюдаемое расхождение: при одновременном cache miss и недоступной сети
`cacheFirst()` отклоняет promise, поэтому DevTools показывает `Uncaught (in
promise)` для Service Worker event вместо контролируемого HTTP response.

Причина: network fallback вызывается без обработки rejected `fetch()`.

Разрешённое изменение одного механизма: обработать только network exception
для pathname `/assets/*` и вернуть пустой `503 Response`. Не добавлять asset
precache, placeholder, retry, logging, новый cache и обработку других URL.

Regression или опровергающее доказательство: cached asset возвращается без
network; успешный asset response возвращается и сохраняется; rejected asset
fetch возвращает status `503`; rejected non-asset fetch остаётся rejected.

Среда и критерий приёмки: focused cache probe, strict `@startup/service`
typecheck/build, startup macro/server build и `git diff --check` проходят.
Runtime запускает и проверяет владелец.

Фактические действия: `cacheFirst()` вычисляет pathname до network fallback и
обрабатывает rejected `fetch()` только для `/assets/*`, возвращая пустой
response со status `503`. Успешный cache/network path и ошибки других URL не
изменены.

Результат и вывод: focused probe подтвердил четыре ветви — cache hit без
network, сохранение successful asset, `503` для rejected asset fetch и
сохранённый reject для `/main.js`. Strict package typecheck/build, focused host
check, startup macro/server build и `git diff --check` проходят. Runtime-проверка
владельца остаётся открытой.

Подготовительный commit: `5db70f04b`.

Result checkpoint: `a4cc50c75`.

### LOAD-001.14 — Назвать startup scripts по их владельцу

Статус и исполнитель: `REVIEW`; выполнял руководитель текущей задачи
Codex напрямую, без субагентов.

Классификация: согласование публичных HTTP-имён неизменяемых startup scripts с
принятой directory и package boundary.

Требование: startup main выдаётся как `/startup-main.js`, а Service Worker —
как `/startup-service.js`. HTML загружает первый URL, startup main регистрирует
Worker по второму, а startup cache сохраняет `/startup-main.js`. Управляющий
Window-модуль сохраняет отдельный endpoint `/main.js`.

Основание и связанная история: `LOAD-001.12` перенёс loader packages в
`@startup/main` и `@startup/service`, но сохранил прежние HTTP routes. Владелец
указал, что имена двух server bindings также должны выражать startup owner.

Наблюдаемое расхождение: package и source names уже используют startup, тогда
как server, HTML, registration и cache всё ещё используют `/import.js` и
`/service.js`.

Причина: HTTP names были введены до принятия единой startup boundary и не были
частью предыдущего package-only переноса.

Разрешённое изменение одного механизма: переименовать два server routes и все
их потребители в новом loader. Не добавлять aliases, redirects или
compatibility cache entries; не менять `/main.js`, WebSocket `/service`, cache
policy и поведение scripts.

Regression или опровергающее доказательство: новый source и server bundle не
содержат прежних script URLs; HTML содержит `/startup-main.js`; собранный main
регистрирует `/startup-service.js` и сохраняет внешний `import("/main.js")`;
Worker startup inventory содержит `/startup-main.js`.

Среда и критерий приёмки: strict startup package checks, focused host check,
server build, artifact inspection и `git diff --check` проходят. Runtime
запускает и проверяет владелец.

Результат и вывод: server выдаёт неизменяемые startup scripts как
`/startup-main.js` и `/startup-service.js`; HTML, Service Worker registration и
startup cache используют те же имена. `/main.js` и WebSocket `/service` не
изменены; aliases прежних URL отсутствуют. Strict package checks, focused host
check, server build, artifact inspection и `git diff --check` проходят.
Runtime-проверка владельца требует очистить прежние Service Worker registration
и Cache Storage, потому что старый неизменяемый HTML сохраняет `/import.js`.

Подготовительный commit: `3f4a0e6bc`.

Result checkpoint: `335f321ad`.

### LOAD-001.15 — Перенести Window importer в слой import

Статус и исполнитель: `REVIEW`; выполнял руководитель текущей задачи
Codex напрямую, без субагентов.

Классификация: новый package-ownership срез после разделения неизменяемого
startup, обновляемого import и загружаемых modules.

Требование: текущая заготовка `web/main` переносится в `web/import/main`, а
workspace-пакет `@web/main` переименовывается в `@import/main`. Он становится
Window importer между `@startup/main` и будущими modules. Он не резервирует
имя или placement загружаемого поведения. HTTP endpoint `/main.js` и исполняемое
поведение в этом срезе не изменяются.

Основание и связанная история: `LOAD-001.8` ввёл `/main.js` как первый
управляющий Window artifact, а `LOAD-001.12` оставил его отдельным
`@web/main`. Владелец уточнил, что текущий artifact принадлежит import-слою, а
не загружаемой логике Hamiltonian или MetaFor.

Наблюдаемое расхождение: directory и package name называют artifact Window
functionality, хотя в принятой архитектуре это Window importer.

Причина: прежняя двухуровневая граница `startup → functionality` была заменена
точной границей `startup → import → modules`.

Разрешённое изменение одного механизма: перенести directory, переименовать
package и обновить workspace, typecheck, build и server references. Не
создавать `@import/service`, не реализовывать module import, не менять
`/main.js`, cache policy, WebSocket protocol или executable behavior.

Regression или опровергающее доказательство: Bun workspace обнаруживает
`@import/main` и не обнаруживает `@web/main`; package проходит прежние strict
typecheck/build, server bundle продолжает содержать внешний `import("/main.js")`.

Среда и критерий приёмки: package typecheck/build, focused host check, server
build, artifact inspection и `git diff --check` проходят. Runtime behavior не
меняется и отдельно в этом package-only срезе не принимается.

Фактические действия: directory перенесена в `web/import/main`, package
переименован в `@import/main`; обновлены Bun workspace и lockfile, root и
Hamiltonian scripts, TypeScript project и server artifact path.

Результат и вывод: Bun workspace содержит `@import/main` вместо `@web/main`.
Package strict typecheck/build и focused host check проходят, server bundle
сохраняет внешний `import("/main.js")`; HTTP endpoint и executable behavior не
изменены. Runtime-проверка для package-only переноса не выполнялась.

Подготовительный commit: `544598550`.

Result checkpoint: `03ef50fc9`.

### LOAD-001.16 — Создать Service Worker importer в слое import

Статус и исполнитель: `REVIEW`; выполнял руководитель текущей задачи
Codex напрямую, без субагентов.

Классификация: следующий package-ownership срез browser loader; он создаёт
companion importer для другой execution-среды.

Требование: `web/import/service` является workspace-пакетом
`@import/service`. Пакет владеет Service Worker importer entrypoint, строгими
Service Worker types и собственной статической сборкой. В этом срезе он ещё не
подключается к `@startup/service` и не получает modules.

Основание и связанная история: owner-решение о границе `startup → import →
modules` определило два environment-specific importer.
`LOAD-001.15` материализовал `@import/main`; симметричная Service Worker
package-boundary ещё отсутствует.

Наблюдаемое расхождение: `web/import/main` и `@import/main` существуют, а
согласованные `web/import/service` и `@import/service` ещё не созданы.

Причина: Service Worker importer был определён только после уточнения
границы importer и не входил в package-only перенос `LOAD-001.15`.

Разрешённое изменение одного механизма: создать package source, manifest и
strict TypeScript project, добавить workspace, root typecheck и lockfile
references. Не подключать package к startup bundle, WebSocket message,
Cache Storage, module bytes или execution ABI.

Regression или опровергающее доказательство: Bun workspace обнаруживает
`@import/service`; package проходит собственные strict typecheck/build, root
workspace references и lockfile указывают на единственный canonical path.

Среда и критерий приёмки: package typecheck/build, workspace inspection и
`git diff --check` проходят. Runtime behavior отсутствует и не проверяется.

Фактические действия: созданы `web/import/service/index.ts`, package manifest и
strict Service Worker TypeScript project; workspace, root typecheck и Bun
lockfile направлены на `@import/service`.

Результат и вывод: Bun workspace обнаруживает `@import/service` по единственному
canonical path. Package strict typecheck/build проходит и закономерно создаёт
пустой bundle, потому что WebSocket и module behavior в этот structural срез
не входят.

Подготовительный commit: `02a26aad1`.

Result checkpoint: `6f539f0fe`.

### LOAD-001.17 — Хранить startup в отдельном cache

Статус и исполнитель: `REVIEW`; выполнил руководитель текущей задачи Codex
напрямую, без субагентов.

Классификация: отдельное именование уже работающего Cache Storage после
принятого владельцем разделения startup, import и загружаемых modules.

Требование: текущие HTML, startup scripts, manifest и лениво запрошенные
startup resources сохраняются в cache `startup`, а не в прежний `metafor`.
Будущие caches `import`, `internal` и `metafor` в этом срезе не открываются и
появляются только при первой реальной записи соответствующего artifact.

Основание и связанная история: `LOAD-001.6` ввёл один cache `metafor`, когда
browser path ещё не был разделён на три уровня. После `LOAD-001.15` и
`LOAD-001.16` владелец принял независимые cache boundaries для startup,
importers и загружаемых modules.

Наблюдаемое расхождение: действующий cache всё ещё называется `metafor` и не
показывает принадлежность сохранённых entries уровню startup.

Причина: имя cache было выбрано до отделения startup от import и modules.

Разрешённое изменение одного механизма: заменить имя cache, открываемого
startup Service Worker, с `metafor` на `startup`. Не переносить и не удалять
старый cache автоматически, не создавать caches `import`, `internal` и
`metafor`, не
менять inventory, fetch policy или responses.

Regression или опровергающее доказательство: source и собранный Worker не
открывают прежний универсальный cache `metafor`, открывают только `startup` и
не открывают `import`, `internal` или новый специализированный `metafor`.
Старые site data владелец очищает вручную перед live-проверкой.

Среда и критерий приёмки: strict typecheck/build `@startup/service`, focused
host check, server build, artifact inspection и `git diff --check` проходят.
Runtime-проверку после ручной очистки прежнего cache выполняет владелец.

Фактические действия: оба открытия Cache Storage в startup Service Worker
переведены с `metafor` на `startup`. Cache inventory, cache-first behavior,
lazy asset writes и offline responses не изменены.

Результат и вывод: strict package check, focused host check и server build
прошли. Source, standalone Worker artifact и server bundle открывают только
`startup`; ранних открытий `metafor`, `import` и `internal` нет. Старый cache
не удаляется и не переносится автоматически. Владелец очистил прежнее
состояние и подтвердил в live browser, что `caches.keys()` возвращает только
`startup` и `import`.

Подготовительный commit: `70d500476`.

Result checkpoint: `b38946f51`.

### LOAD-001.18 — Хранить Window importer в cache import

Статус и исполнитель: `REVIEW`; выполнил руководитель текущей задачи Codex
напрямую, без субагентов.

Классификация: первый product-срез принятой cache boundary между уровнями
`startup` и `import`.

Требование: запрос существующего Window importer `/main.js` обслуживается через
cache `import`. Этот cache создаётся лениво только при первом запросе importer;
HTML, startup scripts, manifest и фактически использованные assets продолжают
обслуживаться через cache `startup`.

Основание и связанная история: `LOAD-001.8` добавил cache-on-first-request для
`/main.js` в тогда ещё едином cache. `LOAD-001.15` определил этот artifact как
`@import/main`, а `LOAD-001.17` переименовал общий действующий cache в
`startup`, не меняя распределение entries.

Наблюдаемое расхождение: `/main.js` принадлежит import-слою, но после первого
запроса сохраняется в cache `startup`.

Причина: cache rule `/main.js` появился раньше разделения startup, import и
загружаемых modules.

Разрешённое изменение одного механизма: выбирать cache `import` только для
точного pathname `/main.js`, а для остальных текущих requests сохранять cache
`startup`. Не переименовывать endpoint, не добавлять `@import/service`, не
создавать caches `internal`/`metafor` и не менять network fallback, responses
или запуск
Window importer.

Regression или опровергающее доказательство: cache `import` не открывается при
startup navigation и создаётся только запросом `/main.js`; successful response
`/main.js` сохраняется и повторно возвращается из `import`, а startup inventory
и asset cache-on-first-request остаются в `startup`.

Среда и критерий приёмки: strict typecheck/build `@startup/service`, focused
host check, server build, artifact inspection и `git diff --check` проходят.
Live Cache Storage и offline import после ручной очистки проверяет владелец.

Фактические действия: `cacheFirst` вычисляет pathname до открытия Cache Storage
и для точного `/main.js` выбирает `import`; все остальные текущие requests
продолжают использовать `startup`. Сохранение successful `/main.js` response и
остальная cache-first policy не изменены.

Результат и вывод: focused execution подтвердил, что `/main.js` открывает и
записывает только `import`, а `/assets/*` — только `startup`. Strict package
check, focused host check и server build прошли; source, standalone Worker и
server bundle содержат ту же развилку и не открывают `internal` или
специализированный `metafor`.
В live browser владелец подтвердил подключение startup/service WebSocket,
регистрацию Service Worker, выполнение `main importer` и Cache Storage ровно с
`startup` и `import`. Затем при включённом browser Offline владелец подтвердил
`200` через Service Worker для navigation, startup main, manifest, `/main.js`
и фактически использованных assets: startup и Window importer полностью
восстанавливаются без network.

Подготовительный commit: `56d314a96`.

Result checkpoint: `4c1787606`.

### LOAD-001.19 — Запускать Service Worker importer через startup loader

Статус и исполнитель: `REVIEW`; выполнил руководитель текущей задачи Codex
напрямую, без субагентов.

Классификация: первый исполняемый переход `startup → import` внутри Service
Worker после доказанных раздельных caches.

Требование: после получения `connect` message startup Service Worker получает
готовый artifact `@import/service` обычным `fetch`, сохраняет его в cache
`import`, повторно читает сохранённые bytes и один раз за инкарнацию выполняет
их через `Function`. При повторном запуске с доступным cache network не нужен.

Основание и связанная история: `LOAD-001.16` создал пустую package boundary
`@import/service`, `LOAD-001.17` и `LOAD-001.18` доказали caches `startup` и
`import`. Решение владельца закрепило transport кода за `fetch`, WebSocket — за
RPC, а primitives загрузки и запуска — за `web/startup/service`.

Наблюдаемое расхождение: package `@import/service` существует, но server не
выдаёт её artifact, startup loader не сохраняет и не запускает её, поэтому
Service Worker остаётся на уровне startup.

Причина: structural package-срез намеренно не включал executable handoff между
startup и import.

Разрешённое изменение одного механизма: build-time macro слоя `web/import`
строго проверяет и собирает `@import/main` и IIFE artifact `@import/service`;
routes выдают их как `/main.js` и `/import-service.js`. Startup loader
cache-first сохраняет второй endpoint в `import`, читает сохранённый response и
выполняет source через `Function` при `connect`. Не добавлять internal или
Metafor modules,
RPC messages, digest contract, ready message или update behavior.

Regression или опровергающее доказательство: первый successful load создаёт
entry `/import-service.js` в `import` и пишет `service importer`; повторный load
текущей Worker-инкарнации не выполняет importer второй раз. Invalid HTTP
response не попадает в cache, а compile/runtime error удаляет его entry.
`/main.js` и offline startup сохраняют прежнее поведение; caches `internal` и
`metafor` не создаются.

Среда и критерий приёмки: strict checks/builds обоих import packages и startup
Service Worker, focused loader execution, server build, artifact inspection и
`git diff --check` проходят. Live online/offline запуск Service Worker importer
проверяет владелец.

Фактические действия: слой `web/import` получил macro и routes, которые при
server build строго проверяют оба package и возвращают готовые `/main.js` и
`/import-service.js` без runtime-чтения `dist`. `@import/service` собирается в
минимальный IIFE и пишет `service importer`. Startup loader использует один
Promise на инкарнацию, сохраняет successful response в `import`, повторно
читает его оттуда и выполняет через `Function`; при ошибке удаляет entry и
разрешает retry. Existing `connect` event удерживает startup cache и importer
load, а Hamiltonian `start` больше не выполняет отдельный prebuild main.

Результат и вывод: strict builds `@import/main`, `@import/service` и
`@startup/service` прошли; IIFE importer занимает 65 bytes. Focused execution
подтвердил один fetch и один запуск при конкурентных вызовах, cold cache
restoration без fetch, удаление invalid artifact и successful retry. Focused
host check и server build прошли; собранный server содержит новый route и
loader, не читает importer `dist` и не открывает module caches. Владелец
подтвердил live online/offline запуск обоих importers и восстановление их из
cache `import`.

Подготовительный commit: `181dc748c`.

Result checkpoint: `de20a6f34`.

### LOAD-001.20 — Назвать Window importer endpoint по слою import

Статус и исполнитель: `REVIEW`; выполнил руководитель текущей задачи Codex
напрямую, без субагентов.

Классификация: согласование публичного HTTP-имени Window importer с уже
принятыми package и cache boundaries.

Требование: `@import/main` выдаётся и импортируется как `/import-main.js`.
Server route, startup dynamic import, Bun external, TypeScript endpoint
declaration и Service Worker cache rule используют одно имя.

Основание и связанная история: `LOAD-001.15` перенёс package в `@import/main`,
`LOAD-001.18` перенёс artifact в cache `import`, а `LOAD-001.19` добавил
симметричный `/import-service.js`. Прежнее HTTP-имя `/main.js` осталось от
двухуровневой архитектуры.

Наблюдаемое расхождение: Service Worker importer уже называется
`/import-service.js`, тогда как Window importer того же слоя всё ещё выдаётся
без layer prefix как `/main.js`.

Причина: package и cache ownership менялись отдельными срезами без изменения
ранее доказанного HTTP endpoint.

Разрешённое изменение одного механизма: заменить `/main.js` на
`/import-main.js` во всех действующих producer и consumer нового loader. Не
оставлять alias или redirect, не менять cache policy, importer code, RPC,
internal/Metafor modules или update behavior.

Regression или опровергающее доказательство: source и собранные artifacts не
содержат literal `import("/main.js")`, route `/main.js` или cache condition для
старого pathname. `/import-main.js` по-прежнему сохраняется в `import` и
восстанавливается offline.

Среда и критерий приёмки: strict checks/builds startup main и Service Worker,
focused cache routing, server build, artifact inspection и `git diff --check`
проходят. Live online/offline import после очистки прежних entries проверяет
владелец.

Фактические действия: server route, startup dynamic import, Bun external,
TypeScript endpoint declaration и Service Worker cache rule переведены с
`/main.js` на `/import-main.js`. Старый route, alias и redirect не добавлены.

Результат и вывод: strict builds startup main и Service Worker, focused cache
routing, focused host check и server build прошли. Source, standalone startup
artifacts и server bundle содержат `/import-main.js`, сохраняют его в `import`
и не содержат старого route или literal dynamic import. Владелец подтвердил
live online/offline запуск `/import-main.js` и `/import-service.js` из cache
`import`.

Подготовительный commit: `297e5730a`.

Result checkpoint: `9bb109cdc`.

### LOAD-001.21 — Передавать Service Worker importer универсальные функции загрузки

Статус и исполнитель: `REVIEW`; выполнил руководитель текущей задачи
Codex напрямую, без субагентов.

Классификация: разделение неизменяемых startup primitives и конкретной
orchestration Service Worker importer перед первым internal module.

Требование: `web/startup/service/loader.ts` предоставляет универсальные функции
`verify`, `cache`, `read`, `remove` и `run`, которые не знают URL, cache name
или lifecycle конкретного importer. Обычный network request выполняется
напрямую через browser `fetch`. `startup/service/index.ts` сам
загружает `/import-service.js`, сохраняет и читает его из cache `import`, затем
запускает artifact с явно переданным объектом `loader`. `@import/service`
получает эти функции как startup ABI для последующей загрузки modules.

Основание и связанная история: `LOAD-001.19` доказал загрузку и cold
restoration Service Worker importer, но его `loader.ts` одновременно владеет
универсальными операциями, конкретным endpoint, cache name и importer
lifecycle. Владелец уточнил, что transport primitives должны оставаться в
startup, а importer-specific orchestration — находиться непосредственно в
Service Worker entrypoint и передавать primitives importer.

Наблюдаемое расхождение: текущий `loadServiceImporter()` скрывает операции
загрузки внутри importer-specific модуля и выполняет artifact без аргументов,
поэтому `@import/service` ещё не получает startup-функции, которыми должен
загружать modules.

Причина: первый executable handoff `.19` доказывал только сам переход
`startup → import` и намеренно не определял переиспользуемый ABI.

Разрешённое изменение одного механизма: заменить importer-specific содержимое
`loader.ts` универсальными функциями; перенести request, memoized Promise,
cache `import`, retry и cleanup в `startup/service/index.ts`; выполнить
importer source через `run(source, {loader})` и дать `@import/service` строгий
ambient contract переданного объекта. Не добавлять modules, их адреса,
RPC messages, digest contract, ready/active cache или update behavior.

Regression или опровергающее доказательство: универсальный `loader.ts` не
содержит `/import-service.js`, имени cache `import` или singleton importer;
`startup/service/index.ts` сохраняет прежние once-only, cold-cache и cleanup
ветви; startup передаёт `@import/service` точный namespace `loader`, а importer
компилируется против его типа без дублирующих runtime-проверок. Ошибочный HTTP
response не сохраняется, а ошибка выполнения удаляет конкретный importer entry
и допускает retry.

Среда и критерий приёмки: strict checks/builds `@startup/service` и
`@import/service`, focused tests универсальных функций и передачи ABI, server
build, artifact inspection и `git diff --check` проходят. Live online/offline
поведение не должно измениться; повторно его проверяет владелец.

Фактические действия: importer-specific orchestration удалена из `loader.ts`.
Модуль экспортирует независимые `verify`, `cache`, `read`, `remove` и `run`, а
network request выполняется обычным browser `fetch` без лишней обёртки;
конкретный request `/import-service.js`, cache `import`, singleton Promise,
cold-cache path, cleanup и retry перенесены в `startup/service/index.ts`.
Entrypoint выполняет сохранённый IIFE через `run(source, {loader})`, а
`@import/service` получает тип этого namespace из единственного startup source
без дублирующих runtime-проверок гарантированного объекта и выводит его ключи
в диагностический лог.

Результат и вывод: strict typecheck/build обоих пакетов прошли; standalone
startup Service Worker занимает `4.52 KB`, importer — `86 bytes`. Focused
проверка подтвердила успешные `verify`, `cache`, `read`, `remove` и именованный
binding `run`; собранный startup передаёт importer namespace `loader`, а
importer выводит ключи `cache`, `read`, `remove`, `run`, `verify`.
Полный Worker lifecycle probe подтвердил один fetch/запуск при конкурентных
messages, offline cold restoration, удаление ошибочного artifact и successful
retry без раннего создания module caches. Server build прошёл и содержит
передачу `loader` в `/import-service.js`; `git diff --check` чист. `verify` пока
проверяет только успешный HTTP status: digest contract намеренно не входит в
этот срез. Live online/offline проверка владельца остаётся открытой.

Подготовительный commit: `38cd04de6`.

Result checkpoint: `23011f66c`, review corrections `8b8d32e1c`, `83493fa47`.

### LOAD-001.22 — Загружать Service Worker internal modules

Статус и исполнитель: `REVIEW`; выполнил руководитель текущей задачи Codex
напрямую, без субагентов; live-сценарий проверил владелец.

Классификация: исправление первого internal-среза после owner review до
checkpoint; специальная загрузка RPC заменяется общим module contract.

Требование: `server.ts` явно регистрирует стабильный endpoint каждого
служебного module Hamiltonian под `/internal/…`. Startup service передаёт
importer только primitives, которыми сам загружает importer. Полную композицию
`fetch → verify → cache → read → run`, endpoint, cache и cleanup module хранит
слой `@import/service`. Первый выбранный internal module — Web service
`@internal/rpc`.

Основание и связанная история: `LOAD-001.21` передал Service Worker importer
универсальные startup primitives. Первоначальная незакоммиченная попытка `.22`
ошибочно записала цепочку загрузки непосредственно в `@import/service` и
создала специальный `/rpc-service.js`. Владелец уточнил, что importer будет
обновляться как оркестратор состава modules, поэтому механизм импорта и
публичный endpoint не могут зависеть от первого RPC module.

Наблюдаемое расхождение: текущий diff жёстко связывает importer с RPC request,
cache lifecycle и особым route, поэтому добавление следующего module
потребует копировать один и тот же механизм.

Причина: первый implementation pass смешал выбор modules, универсальную
доставку bytes и поведение конкретного package.

Разрешённое изменение одного механизма: создать `hamiltonian/internal`;
оставить в startup только используемые им `verify`, `cache`, `read`, `remove` и
`run`; поместить универсальную загрузку Service Worker modules и их storage
policy в `@import/service`; экспортировать из `@internal/rpc` готовый Web
artifact, `/sw` upgrade-логику и WebSocket handlers; явно зарегистрировать их
HTTP-адреса в `server.ts`; удалить общий internal registry, специальный
`/rpc-service.js` и startup WebSocket. Не добавлять update protocol, reconnect
policy, signaling payload, digest contract, server-side client implementation
или multi-peer discovery.

Regression или опровергающее доказательство: startup не содержит `Module`,
module registry, `importModule`, `/internal/*` или `/metafor/*`. Один loader в
`@import/service` загружает выбранный endpoint в переданный cache, cold load не
требует network, а invalid artifact удаляет только свой entry. `server.ts`
явно содержит exact internal endpoint и `/sw`, server bundle не содержит
общего internal registry или `/rpc-service.js`, а WebSocket handlers
принадлежат `@internal/rpc/server`.

Среда и критерий приёмки: strict checks/builds `@startup/service`,
`@import/service` и `@internal/rpc`, focused generic loader probe минимум с
двумя module namespaces, exact server route probe, server build, artifact
inspection и `git diff --check` проходят. Владелец проверяет online подключение
RPC и offline восстановление internal artifact.

Фактические действия: RPC размещён в `hamiltonian/internal/rpc` с package name
`@internal/rpc`. `server.ts` связывает parameter `rpc` с artifact через
`/internal/:module`, upgrade с `/sw` и подключает Bun WebSocket handlers.
Startup WebSocket удалён. `@import/service` выбирает `/internal/rpc`, хранит
описание cache `internal` и вызывает собственный `importModule`, составленный
из переданных startup primitives. Из startup удалены module type, registry,
storage policy и полная module-loading function; общий fetch path только ищет
exact response во всех Cache Storage.

Результат и вывод: strict typecheck всех startup/import/RPC packages и server
build прошли; audit не нашёл module policy в startup. Повторные clones
parameterized responses сохраняют JavaScript MIME и одинаковые непустые bytes.
Владелец подтвердил загрузку importers, internal RPC module и работающий
WebSocket после очистки caches.

Result checkpoint: `87928356f`, corrections `43c7f9de1`, `7f203bf81`,
`df3bcb663`, `a8a96d648`.

### LOAD-001.23 — Передавать Window importer универсальный module loader

Статус и исполнитель: `STOPPED`; преждевременный loader удалён после owner
review, потому что startup main сам его не использует.

Классификация: симметричный Window-механизм того же loader contract, отдельно
от Service Worker execution.

Требование: обновляемый `@import/main` является оркестратором Window modules:
он выбирает internal и Metafor modules и вызывает переданный неизменяемым
`@startup/main` универсальный import API. Startup импортирует только сам
orchestrator и не знает состав Window-контура. Module bytes приходят через
соответствующие `/internal/*` или будущие `/metafor/*`, а управляющий Service
Worker сохраняет их в независимых caches.

Основание и связанная история: `LOAD-001.15` создал `@import/main`, но он пока
является самозапускающимся диагностическим модулем без переданного API.
Owner review `.22` установил общий закон: оба environment-specific importer
обновляются и формируют состав modules, а неизменяемый startup владеет только
универсальным механизмом загрузки.

Наблюдаемое расхождение: `@startup/main` делает bare dynamic import, а
`@import/main` не получает API и не имеет async orchestrator entrypoint.

Разрешённое изменение одного механизма: добавить `@startup/main` универсальный
Window import API; сделать `@import/main` async default orchestrator и явно
вызвать его из startup; направить `/internal/*` и будущие `/metafor/*` fetch
requests в соответствующие caches. Не выбирать новый Window module и не менять
Service Worker module execution из `.22`.

Regression или опровергающее доказательство: startup main не содержит адресов
конкретных modules; importer получает точный API type, `/internal/*` относится
только к cache `internal`, а `/metafor/*` — только к ленивому cache `metafor`.
Существующий Service Worker registration, controller handoff и offline startup
не меняются.

Среда и критерий приёмки: strict checks/builds `@startup/main`, `@import/main`
и `@startup/service`, artifact inspection, focused cache routing, server build
и `git diff --check` проходят. Live запуск Window orchestrator и offline
restoration проверяет владелец.

Фактические действия: первоначально `@startup/main` получил `importModule` и
передал его `@import/main`. Владелец отклонил этот placement: функция не
использовалась startup и преждевременно расширяла неизменяемый слой.
`startup/main/loader.ts` удалён, а Window importer запускается без loader до
появления первого реального Window module.

Результат и вывод: startup main снова содержит только Service Worker
registration/controller handoff и запуск Window importer. Strict typecheck и
server build прошли, владелец подтвердил запуск. Универсальный Window loader
будет определён в слое import только вместе с первым Window module.

Result checkpoint отклонённого варианта: `87928356f`; correction: `df3bcb663`.

### LOAD-001.24 — Подтвердить двусторонний обмен по RPC WebSocket

Статус и исполнитель: `REVIEW`; выполнил руководитель текущей задачи Codex
напрямую, без субагентов; live heartbeat проверил владелец.

Классификация: первый наблюдаемый обмен данными по уже открытому internal RPC
WebSocket, отдельно от загрузки module и будущего RPC protocol.

Требование: после события `open` Web-реализация `@internal/rpc` сразу и затем
каждые 20 секунд отправляет точное сообщение `ping`. Bun-сторона отвечает на
каждое из них точным сообщением `pong`, а Web-сторона подтверждает получение
ответа в консоли. Закрытие WebSocket останавливает interval.

Основание и связанная история: `LOAD-001.22` загрузил internal RPC module и
открыл принадлежащий ему WebSocket, но намеренно не добавлял RPC messages.
Владелец подтвердил загрузку текущего контура и одноразовый ping/pong, затем
уточнил, что проверочный обмен должен повторяться каждые 20 секунд.

Наблюдаемое расхождение: одноразовый обмен доказывает передачу сразу после
handshake, но не показывает, что канал продолжает передавать сообщения.

Причина: Web service отправляет `ping` только внутри обработчика `open` и не
планирует следующий обмен.

Разрешённое изменение одного механизма: повторять literal ping/pong каждые
20 секунд и очищать timer при `close`. Не вводить envelope, request id,
сериализацию, pong timeout, reconnect policy или прикладные RPC methods.

Regression или опровергающее доказательство: сервер отправляет `pong` только
в ответ на точный `ping`; Web service подтверждает только точный `pong`, между
последовательными отправками проходит 20 секунд, а после `close` timer больше
не отправляет сообщения.

Среда и критерий приёмки: strict typecheck `@internal/rpc`, server build и
`git diff --check` проходят. В live browser после подключения видны минимум
два полученных `pong` с интервалом около 20 секунд, а server contour получает
соответствующие `ping` и отправляет ответы.

Фактические действия: Web RPC service отправляет literal `ping` сразу после
`open`, затем повторяет его через `setInterval(..., 20_000)` и очищает interval
на `close`. Bun handler отвечает literal `pong` только на точный `ping`.
Web service логирует каждый полученный `pong`.

Результат и вывод: strict RPC typecheck, server typecheck/build и
`git diff --check` прошли. Владелец подтвердил повторяющийся ping/pong в live
контуре. DevTools Offline не обязан закрывать TCP/WebSocket, поэтому быстрые
logical disconnect и reconnect остаются отдельной будущей policy с pong
deadline; этот срез их не заявляет.

Подготовительные commits: `7496b4d42`, `fe2c7e979`.

Result checkpoint: `e5ce8bd62`.

### LOAD-001.25 — Проверять первый importer по причинному результату

Статус и исполнитель: `REVIEW`; выполнил руководитель текущей задачи
Codex напрямую, без субагентов.

Классификация: test-only correction принятого browser loader contract без
изменения product source или поведения Service Worker.

Требование: первый запуск `@import/main` после перехода текущей страницы под
управление Service Worker доказывается точным controller, наблюдаемым request и
появлением exact entry в принадлежащем importer cache `import`. Метаданные
Puppeteer `HTTPResponse.fromServiceWorker()` не являются обязательным
свидетельством для takeover уже открытого document через `clients.claim()`.

Основание и связанная история: browser regression `LOAD-001` уже проверяет
controller, запрос `/code?module=@import/main` и cache boundaries. Позднее к
первому запуску добавили ещё одно ожидание `fromServiceWorker()`, которое не
описывает отдельного принятого результата.

Наблюдаемое расхождение: importer успешно запрашивается под точным controller
и сохраняется в cache `import`, однако Puppeteer возвращает для первого
response `fromServiceWorker() === false`, из-за чего suite сообщает один fail.

Причина: CDP/Puppeteer response metadata не даёт надёжного свидетельства
Service Worker для первого запроса во время takeover уже загруженного document,
хотя причинный результат fetch handler виден в Cache Storage.

Разрешённое изменение одного механизма: удалить только дублирующее ожидание
`fromServiceWorker()` для первого importer request. Не менять product code,
controller assertions, точный request, cache ownership и проверки offline/cold
ответов, где network недоступна и Service Worker response является отдельным
наблюдаемым результатом.

Regression или опровергающее доказательство: полный `test:load` проходит;
первый install по-прежнему требует точный controller, request и importer entry
в cache `import`, а offline navigation и cold restoration сохраняют проверки
ответов Service Worker.

Среда и критерий приёмки: полный `bun run test:load` и `git diff --check`
проходят. Production files не изменены.

Фактические действия: из сценария первого install удалено только ожидание
Puppeteer `fromServiceWorker()` для `/code?module=@import/main`. Проверки
точного controller, request, cache `import`, offline navigation и cold
restoration не изменены.

Результат и вывод: полный `bun run test:load` завершился результатом `5 pass`,
`0 fail`, `134 expect()`. Первый takeover теперь проверяется по его причинному
результату, а отдельные offline/cold ответы Service Worker по-прежнему
проверяются через `fromServiceWorker()`. Production files не изменены.

Подготовительный commit: `643c37fce`.

Result checkpoint: этот commit.

## Открытые вопросы

* Какой первый реальный module после стандартного окружения `HAM-005` загружает
  `@import/main`? Этот выбор не входит в minimal proof `LOAD-001`.
* Как RPC передаёт importer изменяемый source address, не меняя стабильный
  same-origin endpoint Service Worker?
* Какой минимальный ABI используют modules при запуске в Window и Dedicated
  Worker? Service Worker сейчас получает IIFE/CommonJS source и запускает его
  через переданный `run` primitive.
* Какой первый module создаёт пространство и cache `metafor`?

## Границы

Входит:

* новые source-директории `web` и `internal`, заготовленные для поздних
  реализаций `server` и `interface`, отдельные workspace-пакеты
  `@startup/main`, `@startup/service`, `@import/main` и `@import/service` для
  browser entrypoints и internal module `@internal/rpc`;
* статические HTML/main/Service Worker artifacts без Bun HMR;
* сохранение отдельно запускаемого прототипа через `server_proto.ts`;
* минимальный HTML/main/Service Worker startup;
* один signaling peer и WebSocket RPC/control transport;
* несколько сменяемых proof parts;
* origin-bound caches `startup`, `import` и `internal`, а позднее ленивый
  `metafor`;
* запуск первого internal module в Service Worker context;
* повторный запуск startup, importers и internal module из cache.

Не входит:

* рефакторинг или перенос прежнего Hamiltonian в новые source-директории;
* другие package manifests, workspace packages и package exports новой
  реализации кроме `@startup/main`, `@startup/service`, `@import/main`,
  `@import/service` и `@internal/rpc`;
* создание общего `interface` contract до двух реализаций;
* полный production artifact inventory, cryptographic release manifest,
  preparing/ready/active publication и update-transition `UPD-002`;
* каталог или выбор нескольких signaling peers;
* межсерверная координация, распределение VAPID authority и peer security;
* Oracle/Force payload по control/code WSS;
* обновление Bun/OS processes;
* server release, remote rollout, trust root и общий rollback;
* изменение предметного поведения Dark, Boundary, Matrix, Energy или Bulk.

## Критерии готовности

* Первый navigation получает только согласованный минимальный package.
* Minimal main устанавливает Service Worker и не загружает прикладной
  functionality напрямую со static host routes.
* Startup запускает `@import/main` и `@import/service`, но не modules напрямую.
* Service Worker importer выбирает первый internal module, а общий loader слоя
  import получает, проверяет, сохраняет и запускает его в cache `internal`.
* Неуспешный HTTP response не сохраняется, а ошибка выполнения удаляет только
  повреждённую exact cache entry и допускает повторную загрузку.
* После остановки Worker новый execution восстанавливает startup, оба importers
  и internal module из caches без обязательной сети.
* Неизменяемый startup не знает module endpoints, cache ownership, WebSocket
  или состав будущего Window/Metafor-контура.
* Доказательство явно отделяет minimal loader от будущего полного release и
  multi-peer extension.

## Проверка результата

* Strict checks и builds `@startup/main`, `@startup/service`, `@import/main`,
  `@import/service` и `@internal/rpc`.
* HTTP route probes parameterized importer/internal responses, повторных clones
  и правильного JavaScript MIME.
* Focused cache tests successful response, execution failure, exact cleanup,
  retry и cold restoration.
* Browser test первого install, перехода под Worker control, запуска обоих
  importers и internal RPC без прямой загрузки module из startup.
* Browser test остановки Worker и offline восстановления caches `startup`,
  `import` и `internal`.
* Автоматизированный Puppeteer regression запускает действующий `server.ts` в
  изолированном test-профиле Chrome, проверяет HTTP routes, Service Worker
  control, точные cache boundaries, ленивое сохранение asset, offline
  navigation, cold relaunch того же профиля без доступной HTTP-доставки,
  удаление ошибочного artifact и retry. Проверочный `ping`/`pong` в этот
  regression contract не входит.
* Browser test открытия internal RPC WebSocket без диагностического heartbeat.
* Строгие host/WebWorker TypeScript checks и `git diff --check`.
* Живой owner-сценарий в canonical Hamiltonian contour до объявления готовности.

## Текущее состояние и следующий шаг

`LOAD-001` находится в `IN_PROGRESS`. Срезы `.1` и `.2` остановлены после
owner-решений не создавать широкую package architecture и не использовать Bun
Fullstack/HMR. Срезы `.3`–`.22` находятся в `REVIEW`; они последовательно
доказали статический startup, Service Worker control, SPA/offline cache,
раздельные packages и caches, запуск обоих importers и первый internal module
`@internal/rpc`. Срез `.23` остановлен после удаления преждевременного Window
loader из startup. Срез `.24` находится в `REVIEW`: владелец подтвердил
повторяющийся двусторонний `ping`/`pong`.

Текущий доказанный путь:
`HTML → @startup/main → @startup/service → @import/main + @import/service →
@internal/rpc → /sw`. Caches `startup` и `import` восстановлены владельцем
offline; владелец также подтвердил cold-восстановление cache `internal`,
загрузку internal RPC и WebSocket. `LOAD-001` по решению владельца остаётся
`IN_PROGRESS`. Исторический срез `.24` доказал диагностический `ping`/`pong`,
но этот heartbeat позднее удалён и больше не входит в действующий loader
contract. Стандартное пустое visual-окружение больше не является её
незакрытым доказательством: оно зарегистрировано отдельной `HAM-005`. Первый
предметный Window/Metafor module и его ABI остаются будущим решением. Versioned
manifest, hashes и атомарная публикация полного release остаются в `UPD-002`.

Test-only Puppeteer suite `bun run --cwd hamiltonian test:load` защищает уже
принятую loader boundary без изменения product source. Два последовательных
прогона на `a537b62ed23c6bccc544b7892bc26b5fe90a3051` завершились результатом
`3 pass`, `0 fail`, `88 expect()` каждый. Cold-сценарий полностью закрывает
изолированный Chrome, повторно открывает тот же профиль на том же origin и
подменяет host test-only witness, который не отдаёт HTTP artifacts; успешная
navigation, запуск Window importer и новое `/sw`-соединение доказывают
восстановление `startup`, `import` и `internal` из Cache Storage. Это
автоматизированное regression evidence изолированного контура, а не замена
оставшемуся live owner-сценарию в canonical Hamiltonian contour.
