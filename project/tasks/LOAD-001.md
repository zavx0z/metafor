# LOAD-001 — Загружать браузерный функционал через минимальный Service Worker

## Коротко

Новый браузер получает только минимальные HTML, main-процесс и Service Worker.
Service Worker загружает сменяемый функционал по WSS, готовит его в cache и
предоставляет main-процессу кэшированные endpoints для запуска.

Прежний Hamiltonian остаётся отдельно запускаемым прототипом. Новый loader
создаётся с нуля в чистых source-директориях и не получает перенесённый
prototype-код.

## Зачем

Первоначальный HTTPS server может быть временным, поэтому настоящий browser
functionality нельзя навсегда загружать напрямую с его static routes. В
браузере должна остаться минимальная неизменяемая оболочка, способная получить
и запустить функционал через действующий Hamiltonian signaling peer.

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
  Worker, поэтому HTTPS host обязан вернуть минимальный bootstrap.
* Текущие page JavaScript, CSS, orchestration и Worker resources загружаются
  напрямую с host; release cache Service Worker обслуживает только
  `/versions/...` synthetic module.
* Service Worker уже открывает control WSS, сохраняет bootstrap в Cache Storage
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
* Минимальный package определяется до полного browser functional release.
* Package состоит из минимальных HTML, main-процесса и неизменяемой Service
  Worker оболочки.
* В первом контуре Service Worker знает один signaling Hamiltonian peer.
* Service Worker загружает сменяемые части по WSS, готовит их в origin-bound
  cache, предоставляет main-процессу кэшированные endpoints и запускает
  предназначенную ему сменяемую часть.
* Minimal main устанавливает связь с Service Worker, запрашивает готовность
  подготовленного cache и запускает предназначенный Window functionality.
* Сменяемый functionality состоит из нескольких частей, а не одного
  обязательного bundle.
* Каталог адресов нескольких signaling peers и peer-security обсуждаются и
  реализуются на следующем сетевом этапе.
* Весь ранее написанный Hamiltonian считается прототипом. Он запускается через
  `server_proto.ts`, остаётся рабочим наглядным образцом и не рефакторится;
  прежние `browser`, `core`, `public`, `update`, `visual` и остальные исходники
  также принадлежат прототипу.
* Новая реализация создаётся с нуля рядом в `web`, `server` и `interface`.
  Минимальные browser entrypoint `web/import` и `web/service` оформлены
  workspace-пакетами `@web/import` и `@web/service`, потому что оба требуют
  строгой проверки и собственной статической сборки. Остальные вложенные
  boundaries пакетами автоматически не становятся.
* Fullstack runtime bundling HTML/main отклонён из-за Bun HMR и неподходящего
  runtime URL importer. HTML остаётся статическим, оба browser entrypoint
  собираются заранее, а `server.ts` только выдаёт готовые bytes.
* `web/import` владеет минимальным main-потоком: получает от Service Worker
  готовый кэшированный endpoint и импортирует модуль.
* `web/service` владеет минимальной неизменяемой оболочкой Service Worker:
  получает код по WSS, проверяет его, готовит кэшированные endpoints и сообщает
  main-потоку о готовности. Вместе `web/import` и `web/service` образуют
  минимальный loader этой задачи.
* `server/import` и `server/service` позднее реализуют тот же принцип для Bun.
  Общий договор выделяется в `interface` только после появления обеих
  реализаций, а не проектируется заранее и не оформляется отдельным пакетом.
* `update` остаётся отдельным механизмом обновления уже загруженного
  функционала и не смешивается с первоначальным `import`.
* Каждый следующий срез берёт один механизм: наблюдает его поведение в
  прототипе, реализует заново в новом пакете, проверяет и только затем открывает
  следующий механизм.

## Целевой минимальный путь

1. HTTPS host возвращает минимальные HTML, main и Service Worker.
1. Minimal main регистрирует Worker, дожидается управления страницей и
   запрашивает подготовленный functionality.
1. Service Worker открывает WSS к единственному известному signaling peer.
1. Worker получает сменяемые части, проверяет их и целиком готовит cache.
1. Только готовый cache публикуется как набор same-origin endpoints.
1. Minimal main получает Window entrypoint и запускает его.
1. Service Worker восстанавливает и запускает собственную сменяемую часть из
   того же подготовленного набора.

## Поведение процесса

Первый широкий package-срез остановлен до product implementation: общая
package architecture не создаётся. Диагностический Fullstack-срез также
остановлен после доказанного Bun HMR; приняты только два необходимых browser
пакета со статической сборкой.

Первая navigation теперь доказала регистрацию, переход страницы под управление
Worker, создание постоянного bootstrap cache и открытие control WebSocket.
Следующий срез начинает payload loading: Worker должен получить по WSS первый
сменяемый functionality, проверить его и опубликовать готовый cached endpoint.

Затем по одному причинному механизму регистрируются WSS loading, cache
preparation, cached endpoint serving, Window launch и Service Worker functional
activation. Каждый новый механизм получает отдельную последовательную
подзадачу и checkpoint.

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

### LOAD-001.6 — Восстанавливать минимальный bootstrap без сети

Статус и исполнитель: `REVIEW`; выполнял руководитель текущей задачи Codex
напрямую, без субагентов; offline-сценарий проверил владелец.

Классификация: новый cache-механизм после принятого статического bootstrap.

Требование: после получения управления Worker один раз сохраняет HTML,
`import.js` и Web App Manifest в постоянный Cache Storage. Последующие GET этих
URL обслуживаются cache-first и не требуют доступного server; уже сохранённые
bytes не заменяются текущим host response.

Основание и связанная история: `LOAD-001.5` сделал bootstrap стабильными
same-origin endpoints. Прототипный release cache не переносится, потому что он
владеет synthetic `/versions/...` module и update behavior.

Наблюдаемое расхождение: после первой регистрации navigation и main всё ещё
зависели от доступности host.

Причина: новый Worker не имел собственного bootstrap inventory и fetch policy.

Разрешённое изменение одного механизма: добавить постоянный cache только для
HTML, importer и manifest; продлить `connect` message через `waitUntil`, пока
bootstrap готовится. Не добавлять ready message, version switching, payload
cache или update.

Regression или опровергающее доказательство: bootstrap inventory содержит
ровно `/`, `/import.js` и `/manifest.webmanifest`; отсутствующий endpoint не
становится cached после unsuccessful response.

Среда и критерий приёмки: после одного online запуска владелец включает offline
и повторно получает HTML/importer через активный Worker; WebSocket закономерно
остаётся сетевым и не входит в offline criterion.

Фактические действия: Worker получил cache-first fetch policy и идемпотентную
подготовку трёх bootstrap endpoints в cache `metafor`. Main отправляет
`connect` только после появления controller, а Worker удерживает message event
до завершения подготовки cache.

Результат и вывод: owner-проверка подтвердила offline navigation и выполнение
`import.js`; отсутствие PWA images выявило отдельную политику assets и вынесено
в `LOAD-001.7`.

Подготовительный commit: отдельный project-коммит до прямой owner-итерации не
записывался.

Result checkpoint: `8bc7a3774`.

### LOAD-001.7 — Встраивать static assets и кэшировать только использованные

Статус и исполнитель: `IN_PROGRESS`; implementation checkpoint готовит
руководитель текущей задачи Codex напрямую, без субагентов; остаётся повторная
owner-проверка после очистки прежнего Cache Storage.

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
resources в bootstrap cache. Owner-проверка Cache Storage показала `2.6 MB`, а
после полного исключения assets offline manifest requests стали падать.

Наблюдаемое расхождение: полный precache хранит неиспользованные варианты icon
и screenshot; отсутствие любого asset cache ломает реально запрошенные PWA
resources offline. Manifest дополнительно объявлял multi-size ICO как PWA icon,
из-за чего Chromium сравнивал его как один кадр `256x256` и выдавал warnings.

Причина: manifest inventory ошибочно использовался как обязательный bootstrap
inventory, а runtime static scan смешивал подготовку assets с запуском server.

Разрешённое изменение одного механизма: вынести filesystem scan в Bun macro,
оставить handler в `web/static`, исключить manifest resources из bootstrap и
записывать `/assets/*` cache-on-first-request. Не оптимизировать изображения,
не добавлять release versions и не менять функциональный payload.

Regression или опровергающее доказательство: собранный Worker содержит только
три bootstrap URL; static asset macro не остаётся runtime filesystem code;
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
оставляет только bootstrap, а успешный network fallback `/assets/*` сохраняет
через clone. Favicon и Apple touch link остаются в HTML и удалены из manifest.

Результат и вывод: проверки build/typecheck подтверждают статический server
bundle и Worker inventory без полного asset precache. Финальная повторная
offline/manifest проверка владельца после очистки прежнего cache ещё не
зафиксирована.

Подготовительный commit: отдельный project-коммит до прямой owner-итерации не
записывался.

Result checkpoint: текущий result-коммит.

## Открытые вопросы

* Как выглядит минимальный message contract между main и Service Worker?
* Как WSS передаёт manifest и несколько частей первого proof functionality?
* Как называются cached endpoints и как main получает предназначенный ему
  entrypoint?
* Как Worker атомарно различает preparing, ready и active cache?
* Как восстанавливается готовый functionality после остановки и нового запуска
  Service Worker без доступного WSS?
* Какой минимальный ABI предоставляет сменяемая Worker-часть стабильным
  обработчикам событий?

## Границы

Входит:

* source-директории `web`, `server`, `interface` и отдельные workspace-пакеты
  `@web/import` и `@web/service` для browser entrypoints;
* статические HTML/main/Service Worker artifacts без Bun HMR;
* сохранение отдельно запускаемого прототипа через `server_proto.ts`;
* минимальный HTML/main/Service Worker bootstrap;
* один signaling peer и WSS code delivery;
* несколько сменяемых proof parts;
* origin-bound cache и same-origin cached endpoints;
* запуск Window- и Service Worker-частей;
* повторный запуск из уже готового cache.

Не входит:

* рефакторинг или перенос прежнего Hamiltonian в новые source-директории;
* другие package manifests, workspace packages и package exports новой
  реализации кроме `@web/import` и `@web/service`;
* создание общего `interface` contract до двух реализаций;
* полный production artifact inventory и update-transition `UPD-002`;
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
* Service Worker получает по WSS от одного signaling peer минимум отдельные
  Window- и Worker-части, проверяет их и публикует только целиком готовый cache.
* Main запускает Window entrypoint через cached endpoint Service Worker.
* Service Worker запускает свою сменяемую часть через согласованный ABI.
* Interrupted или неверная доставка не становится ready/active cache.
* После остановки Worker новый execution восстанавливает готовый functionality
  из cache без повторной обязательной доставки.
* Доказательство явно отделяет minimal loader от будущего полного release и
  multi-peer extension.

## Проверка результата

* Frozen contract tests минимального package и main/Worker handoff.
* WSS tests нескольких частей, interruption, invalid bytes и retry.
* Cache tests preparing/ready/active, atomic publication и cold restoration.
* Service Worker fetch tests cached endpoints.
* Browser test первого install, перехода под Worker control и запуска Window
  functionality без прямой static загрузки.
* Browser test остановки и нового запуска Worker с восстановлением cache.
* Строгие host/WebWorker TypeScript checks и `git diff --check`.
* Живой owner-сценарий в canonical Hamiltonian contour до объявления готовности.

## Текущее состояние и следующий шаг

`LOAD-001` находится в `IN_PROGRESS`. Package-срез `LOAD-001.1` остановлен до
implementation решением владельца, Fullstack-срез `LOAD-001.2` остановлен после
диагностики HMR. Регистрация, control WebSocket, статические browser builds и
offline bootstrap находятся в `REVIEW`. Текущий `LOAD-001.7 — Встраивать static
assets и кэшировать только использованные` ждёт повторной owner-проверки после
очистки прежнего Cache Storage. После неё следующий срез отдельно регистрирует
доставку, проверку и публикацию первого сменяемого functionality по WSS.
