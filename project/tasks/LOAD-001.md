# LOAD-001 — Загружать браузерный функционал через минимальный Service Worker

## Коротко

Новый browser code разделён на три последовательных уровня: `startup`,
`import` и `runtime`. Минимальный startup получает управление, запускает
importers в Window и Service Worker, а уже они загружают сменяемые runtime
packages и запускают их в выбранном execution context. Runtime package не
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
* Browser code имеет три последовательных уровня: неизменяемый `startup`,
  environment-specific `import` и сменяемый `runtime`. Startup не является
  runtime и не исполняет его предметное поведение самостоятельно.
* `main` и `service` в именах `@import/main` и `@import/service` обозначают
  среду importer, а не вид загружаемого runtime package. Runtime состоит из
  разных функциональных пакетов; их имена не зеркалят Window, Dedicated Worker
  или Service Worker, а placement одного пакета может между ними меняться.
  Фиксированные runtime-пакеты `@web/main` и `@web/service` не создаются.
* Минимальный package определяется до полного browser functional release.
* Package состоит из минимальных HTML, main-процесса и неизменяемой Service
  Worker оболочки.
* В первом контуре Service Worker знает один signaling Hamiltonian peer.
* Startup Service Worker открывает WebSocket только для управления и RPC.
  Указанный peer может менять адрес source, но code bytes loader получает
  через `fetch`, проверяет и сохраняет до запуска.
* `web/startup/service` содержит неизменяемые primitives
  `fetch → verify → cache → read → Function` и с их помощью загружает и
  запускает `@import/service`. Сам `@import/service` владеет логическими
  адресами runtime packages, их placement и взаимодействием с `@import/main`,
  но не дублирует эти primitives.
* Cache Storage разделён по трём уровням: `startup` хранит минимальную оболочку
  и реально использованные ею resources, `import` — importer artifacts,
  `runtime` — функциональные packages. `import` и `runtime` создаются лениво
  только при первой записи своего artifact.
* Стабильный cache endpoint строится на исходном origin Service Worker и не
  меняется вместе с внешним адресом, откуда loader выполняет `fetch`.
* Minimal main устанавливает связь с Service Worker, запрашивает готовность
  подготовленного cache и запускает `@import/main`, но не runtime напрямую.
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
  что каждый требует строгой проверки в своей runtime-среде. Физическая и
  package-граница сменяемого `runtime` определяется его функциональностью, а не
  execution context, и уточняется последующими срезами.
* Fullstack runtime bundling HTML/main отклонён из-за Bun HMR и неподходящего
  runtime URL importer. HTML остаётся статическим, оба browser entrypoint
  собираются заранее, а `server.ts` только выдаёт готовые bytes.
* `web/startup/main` владеет минимальным main-потоком: получает от Service
  Worker готовый кэшированный endpoint и запускает `@import/main`.
* `web/import/main` владеет Window importer, а `web/import/service` — Service
  Worker importer. Текущий `web/main` и пакет `@web/main` являются заготовкой
  первого из них и переименовываются в `web/import/main` и `@import/main`.
  Оба importer загружают runtime packages и не являются runtime; их имена
  определяют место работы importer, но не навсегда закрепляют placement
  загруженного package.
* Service Worker importer получает логические адреса и placement через
  открытый startup-оболочкой RPC WebSocket. Загрузку, проверку, cache и запуск
  самого importer выполняет loader в `web/startup/service`; точные contracts и
  ABI фиксируются отдельными последовательными срезами.
* `web/startup/service` владеет минимальной неизменяемой оболочкой Service
  Worker: перехватывает первоначальные requests, готовит кэшированные endpoints
  и сообщает main-потоку о готовности. Вместе `web/startup/main` и
  `web/startup/service` образуют минимальный loader этой задачи.
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
1. Minimal main регистрирует Worker, дожидается управления страницей и
   запускает Window importer.
1. Service Worker открывает WSS для RPC с единственным известным signaling
   peer и получает адрес требуемого source.
1. Startup loader получает importer bytes через `fetch`, проверяет, сохраняет
   и запускает Service Worker importer.
1. Importers выбирают runtime packages и placement; loader primitives получают
   и сохраняют package bytes до запуска.
1. Каждый runtime package запускается через согласованный ABI в выбранном
   Window, Dedicated Worker или Service Worker context.
1. Только готовый cache публикуется как набор same-origin endpoints.
1. После остановки Worker готовые packages восстанавливаются из cache.

## Поведение процесса

Первый широкий package-срез остановлен до product implementation: общая
package architecture не создаётся. Диагностический Fullstack-срез также
остановлен после доказанного Bun HMR; приняты только необходимые browser
пакеты со статической сборкой.

Первая navigation теперь доказала регистрацию, переход страницы под управление
Worker, создание постоянного startup cache и открытие control WebSocket.
Принятые срезы доказали получение `/main.js` после controller и сохранение его
первого network response. Решение владельца уточнило его роль: этот artifact
становится `@import/main`, а не Window runtime. Следующий срез переносит его в
import-слой без изменения поведения; затем отдельно создаётся
`@import/service` и только после этого реализуется загрузка runtime code.

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

Классификация: новый package-ownership срез после принятого владельцем
трёхуровневого browser path `startup → import → runtime`.

Требование: текущая заготовка `web/main` переносится в `web/import/main`, а
workspace-пакет `@web/main` переименовывается в `@import/main`. Он становится
Window importer между `@startup/main` и будущими runtime packages. Он не
резервирует имя или placement runtime. HTTP endpoint `/main.js` и исполняемое
поведение в этом срезе не изменяются.

Основание и связанная история: `LOAD-001.8` ввёл `/main.js` как первый
управляющий Window artifact, а `LOAD-001.12` оставил его отдельным
`@web/main`. Владелец уточнил, что browser code состоит из трёх уровней и
текущий artifact принадлежит промежуточному import-слою, а не runtime.

Наблюдаемое расхождение: directory и package name называют artifact Window
runtime, хотя в принятой архитектуре это Window importer.

Причина: прежняя двухуровневая граница `startup → functionality` была заменена
точной трёхуровневой границей `startup → import → runtime`.

Разрешённое изменение одного механизма: перенести directory, переименовать
package и обновить workspace, typecheck, build и server references. Не
создавать `@import/service`, не реализовывать runtime import, не менять
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

Классификация: следующий package-ownership срез трёхуровневого browser path;
он создаёт companion importer для другой browser runtime-среды.

Требование: `web/import/service` является workspace-пакетом
`@import/service`. Пакет владеет Service Worker importer entrypoint, строгими
Service Worker types и собственной статической сборкой. В этом срезе он ещё не
подключается к `@startup/service` и не получает runtime packages.

Основание и связанная история: owner-решение о слоях
`startup → import → runtime` определило два environment-specific importer.
`LOAD-001.15` материализовал `@import/main`; симметричная Service Worker
package-boundary ещё отсутствует.

Наблюдаемое расхождение: `web/import/main` и `@import/main` существуют, а
согласованные `web/import/service` и `@import/service` ещё не созданы.

Причина: Service Worker importer был определён только после уточнения
трёхуровневой границы и не входил в package-only перенос `LOAD-001.15`.

Разрешённое изменение одного механизма: создать package source, manifest и
strict TypeScript project, добавить workspace, root typecheck и lockfile
references. Не подключать package к startup bundle, WebSocket message,
Cache Storage, runtime bytes или execution ABI.

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
пустой bundle, потому что WebSocket и runtime behavior в этот structural срез
не входят.

Подготовительный commit: `02a26aad1`.

Result checkpoint: `6f539f0fe`.

### LOAD-001.17 — Хранить startup в отдельном cache

Статус и исполнитель: `IN_PROGRESS`; выполняет руководитель текущей задачи
Codex напрямую, без субагентов.

Классификация: отдельное именование уже работающего Cache Storage после
принятого владельцем разделения `startup`, `import` и `runtime`.

Требование: текущие HTML, startup scripts, manifest и лениво запрошенные
startup resources сохраняются в cache `startup`, а не в прежний `metafor`.
Будущие caches `import` и `runtime` в этом срезе не открываются и появляются
только при первой реальной записи соответствующего artifact.

Основание и связанная история: `LOAD-001.6` ввёл один cache `metafor`, когда
browser path ещё не был разделён на три уровня. После `LOAD-001.15` и
`LOAD-001.16` владелец принял независимые cache boundaries для startup,
importers и runtime packages.

Наблюдаемое расхождение: действующий cache всё ещё называется `metafor` и не
показывает принадлежность сохранённых entries уровню startup.

Причина: имя cache было выбрано до принятия архитектуры
`startup → import → runtime`.

Разрешённое изменение одного механизма: заменить имя cache, открываемого
startup Service Worker, с `metafor` на `startup`. Не переносить и не удалять
старый cache автоматически, не создавать caches `import` и `runtime`, не
менять inventory, fetch policy или responses.

Regression или опровергающее доказательство: source и собранный Worker не
открывают cache `metafor`, открывают только `startup` и не открывают `import`
или `runtime`. Старые site data владелец очищает вручную перед live-проверкой.

Среда и критерий приёмки: strict typecheck/build `@startup/service`, focused
host check, server build, artifact inspection и `git diff --check` проходят.
Runtime-проверку после ручной очистки прежнего cache выполняет владелец.

Подготовительный commit: ожидается.

Result checkpoint: ожидается.

## Открытые вопросы

* Как выглядит минимальный message contract между main и Service Worker?
* Как называются cached endpoints и как importer получает выбранные runtime
  packages и их placement?
* Как Worker атомарно различает preparing, ready и active cache?
* Как восстанавливается готовый functionality после остановки и нового запуска
  Service Worker без доступного HTTPS host?
* Какой минимальный ABI используют runtime packages при запуске в Window,
  Dedicated Worker и Service Worker?

## Границы

Входит:

* source-директории `web`, `server`, `interface` и отдельные workspace-пакеты
  `@startup/main`, `@startup/service`, `@import/main` и `@import/service` для
  browser entrypoints;
* статические HTML/main/Service Worker artifacts без Bun HMR;
* сохранение отдельно запускаемого прототипа через `server_proto.ts`;
* минимальный HTML/main/Service Worker startup;
* один signaling peer и WebSocket RPC/control transport;
* несколько сменяемых proof parts;
* origin-bound cache и same-origin cached endpoints;
* запуск runtime packages в выбранном browser execution context;
* повторный запуск из уже готового cache.

Не входит:

* рефакторинг или перенос прежнего Hamiltonian в новые source-директории;
* другие package manifests, workspace packages и package exports новой
  реализации кроме `@startup/main`, `@startup/service`, `@import/main` и
  `@import/service`;
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
* Startup запускает `@import/main` и `@import/service`, но не runtime напрямую.
* Importers получают первоначальные runtime packages согласованным transport,
  проверяют их и публикуют только целиком готовый cache.
* Runtime package запускается через согласованный ABI в выбранном Window,
  Dedicated Worker или Service Worker context без привязки package name к
  placement.
* Interrupted или неверная доставка не становится ready/active cache.
* После остановки Worker новый execution восстанавливает готовый functionality
  из cache без повторной обязательной доставки.
* Доказательство явно отделяет minimal loader от будущего полного release и
  multi-peer extension.

## Проверка результата

* Frozen contract tests минимального package и main/Worker handoff.
* HTTP/WebSocket/cache tests нескольких packages, interruption, invalid bytes
  и retry.
* Cache tests preparing/ready/active, atomic publication и cold restoration.
* Service Worker fetch tests cached endpoints.
* Browser test первого install, перехода под Worker control и запуска runtime
  package через importer без прямой static загрузки.
* Browser test остановки и нового запуска Worker с восстановлением cache.
* Строгие host/WebWorker TypeScript checks и `git diff --check`.
* Живой owner-сценарий в canonical Hamiltonian contour до объявления готовности.

## Текущее состояние и следующий шаг

`LOAD-001` находится в `IN_PROGRESS`. Package-срез `LOAD-001.1` остановлен до
implementation решением владельца, Fullstack-срез `LOAD-001.2` остановлен после
диагностики HMR. Регистрация, control WebSocket, статические browser builds и
offline startup находятся в `REVIEW`; `LOAD-001.7` подтверждён владельцем.
`LOAD-001.8` находится в `REVIEW` после offline-получения управляющего main,
`LOAD-001.9` — после реализации единого SPA navigation fallback, `LOAD-001.10` —
после переноса сборки в route macro. `LOAD-001.11 — Принять startup как термин
начальной загрузки` находится в `REVIEW`: новый loader и действующее описание
его понятия переименованы без изменения поведения. `LOAD-001.12 — Поместить
минимальные загрузчики внутрь startup` находится в `REVIEW`: два loader package
перенесены под их принятого владельца без изменения HTTP и runtime behavior.
`LOAD-001.13 — Не отклонять запрос отсутствующего asset без сети` находится в
`REVIEW`: expected offline failure ограничен одним контролируемым response.
`LOAD-001.14 — Назвать startup scripts по их владельцу` находится в `REVIEW`:
два HTTP script URL согласованы с package boundary без compatibility aliases;
runtime-проверка владельца остаётся открытой. `LOAD-001.15 — Перенести Window
importer в слой import` находится в `REVIEW`: `@web/main` перенесён в
`@import/main` без изменения endpoint или поведения. `LOAD-001.16 — Создать
Service Worker importer в слое import` находится в `REVIEW`: companion package
`@import/service` создан без подключения runtime behavior.
`LOAD-001.17 — Хранить startup в отдельном cache` является текущим срезом:
он заменяет прежнее имя `metafor` на `startup`, не создавая заранее caches
`import` и `runtime`.
