# Разработка Cosmos

Cosmos работает постоянно на `http://127.0.0.1:4444/`. Для обновления
клиентской сборки server не останавливать и не перезапускать.

Skill запускает development contour через `bun run dev`. Этот режим
минифицирует browser artifacts, сохраняет `console.debug`, временно создаёт
inline source map внутри package-owned build и затем выносит её в отдельный immutable
companion. Server связывает JavaScript и map заголовком `SourceMap`; Worker не
сохраняет map в Cache Storage. При поддержке browser server передаёт JavaScript
и map через Brotli, но SHA-256 и size продолжают описывать распакованные
canonical bytes. Временные diagnostics писать через `console.debug`; не помещать в
его аргументы обязательную рабочую логику. Первым аргументом передавать
постоянный scope владельца в квадратных скобках, вторым — короткое событие,
третьим — структурированные данные, например:

```ts
console.debug("[@cosmos/release:service:update]", "новая сборка загружена", {
  cache,
  source,
  status,
})
```

`bun run build` собирает production artifacts: они также минифицированы, но
`console.debug` вместе с аргументами удалён, а source map отсутствует.

Для server breakpoints dispatcher использует `restart-debug`, который запускает
`bun run dev:debug`. Startup остаётся обычным supervisor, а exact release child
получает выбранный dispatcher адрес `--inspect=127.0.0.1:<port>`: по умолчанию
`6499`, override — `METAFOR_DEV_BUN_INSPECT_PORT=<port>` при запуске нового
debug tree. `status` читает actual address из exact release child и считает
Inspector готовым только когда единственный listener PID совпадает с этим
child. Поэтому routes, publication и WebSocket отлаживаются в process, которому
они принадлежат. Подключаться нужно к WebKit Inspector URL из видимого
терминала. Debug mode не включает watch/HMR и не создаёт второй Cosmos process
tree. Обычные `dev` и `start` удаляют унаследованный
`COSMOS_RELEASE_INSPECT`; после проверки `restart` возвращает обычный
development mode на том же origin и browser target.

## Матрица diagnostics

Development diagnostics описывают причинный lifecycle, а не каждую выполненную
инструкцию. Один checkpoint имеет одного owner, один постоянный scope, одно
событие и только обязательные поля. Одна причинная граница не повторяется в
RPC, runtime и cache владельцах одновременно. Успешный исход, no-op,
восстановление и точная ошибка различимы. Повторные reconnect attempts после
первой ошибки не создают spam; новое сообщение появляется при восстановлении
соединения либо изменении состояния.

Обязательные stories:

| Story | Причинные границы |
|---|---|
| startup release runtime | bootstrap → artifact из cache/network → inert runtime подготовлен → release запущен → runtime активирован; failure содержит request и error |
| server startup release process | exact artifact проверен → один release child активирован → IPC ready; missing/invalid artifact и unexpected exit дают явную ошибку без restart |
| server build/publication | запрос → root intent → один package typecheck → env builds → publish или root restore → один signal |
| server publication recovery | найден root intent → недостающие artifacts восстановлены → child manifests сошлись; failure содержит packages и error |
| browser artifact delivery | package/env/version доставлен либо точный status отказа |
| release RPC lifecycle | server subscription и browser connection созданы/закрыты; первый разрыв содержит retry, восстановление отмечено отдельно |
| browser state synchronization | signal → actual current → server delta → no-op либо transaction; transport failure содержит endpoint и error |
| browser cache transaction | fresh/recovery intent → exact artifacts подготовлены → полный candidate проверен → новый release подготовлен → aggregate cleanup → transaction удалена последней |
| Window runtime lifecycle | Window reload start/result → visual environment → release main → controlled page ready |

Исполняемая test-owned матрица хранит для каждого checkpoint точные
`level/scope/event/details`, единственный story и поведенческие proofs. Test
перечисляет все production `console.debug` и `console.error`: отсутствующий,
лишний, неструктурированный либо не зарегистрированный log ломает regression.
Отдельные behavior tests доказывают порядок startup, build/recovery,
transaction/handover, reconnect и Window flows. Матрица не импортируется
production code и не создаёт test hooks.

`console.error` сохраняется для operational failure в production и использует
тот же трёхчастный структурированный формат. Не дублировать одну ошибку рядом
через `console.debug`. CLI output и platform diagnostics, не принадлежащие
runtime release lifecycle, в эту матрицу не входят.

Проверка уже согласованной host publication не называется recovery и ничего
не пишет: recovery checkpoints появляются только при фактически расходящихся
child versions либо отсутствующем artifact. `stderr` успешного typecheck может
содержать platform warning и поэтому не называется `error`; исход typecheck
однозначно задаёт `exitCode`.

## Изоляция тестов

Тесты читают рабочий checkout только без изменений. Они не переписывают
package manifests и versions, не собирают в рабочие `dist`, не публикуют
canonical artifacts и не обращаются к постоянному origin `127.0.0.1:4444`,
его browser profile или Cache Storage. Сценарии build, publication, recovery,
fault и browser update используют собственные временные artifacts, manifests,
origin и profile. Временное восстановление настоящего файла после теста не
считается изоляцией: рабочий файл вообще не должен изменяться.

Fixture владеет всеми test-only routes, fault controls и состоянием. Production
server, browser artifacts и runtime не получают ветки, globals, endpoints или
environment flags только ради тестирования. После success, failure, timeout
или interruption fixture останавливает только свои processes и удаляет только
свои временные files/profile; managed development contour остаётся в том же
состоянии, что до запуска tests.

## Пакеты

* `@internal/*` — внутренняя функциональность Cosmos. Один package может
  содержать разные entrypoints для Window, browser Worker, Service Worker,
  Bun server и server Worker; новую функциональность размещать в принадлежащем
  ей internal package.
* `@cosmos/release` — один package с env `main`, `service` и
  `server`. Он определяет состав используемых `@internal/*` packages и
  меняется вместе с этим составом. RPC Service Worker является внутренней
  частью env `service`, а не отдельным browser package.
  `@internal/visual` при этом остаётся самостоятельным artifact с cache owner
  `internal`; source и готовая сборка release main импортируют его как
  `@internal/visual`, а import map разрешает specifier в
  `/@internal/visual?env=main`.
  Env `server` того же package владеет чтением manifests, сборкой, версиями,
  атомарной публикацией, routes, `/code` и server-реализацией RPC; его artifact
  не загружается browser.
* `@cosmos/startup` — один фиксированный package с env `main` и
  `service`, а также env `server` для тонкого process supervisor. В обычной
  разработке его browser parts не менять через endpoint
  обновления не передавать. Он объявляет dependency на
  `@cosmos/release`; public loader/dependencies/runtime types принадлежат
  release, а startup предоставляет реализацию через type-only bare import.
  Startup синхронно регистрирует `install`, `activate`, `fetch`, `message`,
  сразу запускает release и только связывает browser event с текущим runtime.
  Server startup проверяет exact release artifact, запускает его через
  `Bun.spawn`, ждёт IPC `ready` и наблюдает exit без restart/rollback. Только
  release child создаёт `Bun.serve`. Cache policy, transaction, RPC и
  self-update startup не принадлежат.

Имя модуля брать только из поля `name` его `package.json`.
Сменяемый package также объявляет точную `version`. Cache owner не записывать в
manifest: `@cosmos/startup` принадлежит `startup`,
`@cosmos/release` — `release`, `@internal/*` — `internal`, а
`@metafor/*` — `metafor`.
Последние доказанные версии перечислены в dependencies корневого Cosmos
package как `workspace:^<version>`.

Caret dependencies `@cosmos/release` и `@internal/*` являются полным
browser release membership. Runtime dependency участника обязан находиться в
том же membership, а выбранная version — удовлетворять его workspace range.
Не обходить эту проверку ручным удалением либо несовместимым version bump.

Source во всех средах импортирует один bare package specifier, например
`@internal/visual`. Env не добавлять в specifier и не оформлять package
subpath. Разные entrypoints одного package объявлять стандартным conditional
`exports` корневого subpath `"."`:

```json
{
  "exports": {
    ".": {
      "internal:main": "./main/index.ts",
      "internal:server": "./server/index.ts"
    }
  }
}
```

Condition всегда имеет вид `<scope>:<env>`, а entrypoint — только
`./<env>/index.ts`. Package объявляет только поддерживаемые branches. `default`
fallback не добавлять: builder и TypeScript выбирают нужную condition.
Поддерживаемые env и цели:

| Env | Исполнение | Target |
| --- | ---------- | ------ |
| `main` | Window main realm | `browser` |
| `worker` | browser Dedicated Worker | `browser` |
| `service` | browser Service Worker | `browser` |
| `server` | основной Bun server process | `bun` |
| `server-worker` | Worker, созданный Bun server | `bun` |

`Service Worker` остаётся полным названием браузерной технологии и стандартных
Web API. Во всех управляемых Cosmos именах — env, condition, source path,
build script, outfile, URL/cache identity, RPC metadata и lifecycle kind — её
единственное сокращение имеет точный вид `service`. Проектный токен
`service-worker` не поддерживается. `server-worker` является отдельной Bun-средой
и этим правилом не сокращается.

`server` и `server-worker` всегда являются разными env, даже если используют
один target. Package объявляет один `typecheck` для всего source composition и
по одному `build:<env>`. `prebuild`, generic `build` и `typecheck:<env>` не
объявляются. Executor запускает `typecheck` один раз и только после успеха —
все нужные env builds. Один SemVer принадлежит всему package: изменение
исполняемой part одного env или её canonical JavaScript bytes требует новой
package version и полного набора объявленных artifacts этой версии.
Неизменившийся package не пересобирать и не заменять.

Изменение только body TSDoc comments не меняет исполняемую part. Drift
`sourcesContent` в development source map от такого изменения сам по себе не
является release и не требует build, publication или новой version. Уже
опубликованная exact map остаётся companion последней executable version и не
заменяется ради совпадения с текущим TSDoc; при следующем изменении executable
JavaScript новая version снова публикует согласованные JavaScript и map.

Direct production-команда `build:<env>` повторяет `./<env>/index.ts`, выбирает
condition `<scope>:<env>` и точный target. Bun `1.4.0` не разрешает bare package specifier как CLI build
entrypoint, поэтому команда повторяет source path branch `exports`; release
server принимает её только при точном совпадении. Bare imports внутри source и
готового ESM artifact при этом сохраняются.

Package-owned `--outfile` определяет внутренний путь artifact. Outfile разных
env одного package не должен совпадать; обязательного `dist/<env>` layout нет.
Release server кеширует только найденные root и manifest path, а содержимое
`package.json` перечитывает и проверяет перед каждым typecheck/build.

Изменение executable source, исполняемого состава или canonical JavaScript
bytes package требует новой версии и нового immutable artifact; прежний
versioned artifact не заменять другими bytes.
Window composition packages собираются с внешними package dependencies и
сохраняют bare imports; transport URL, conditional browser adapter или имя
отдельной зависимости в source build adapter не добавлять.
Named public types browser package доступны зависимому workspace package сразу
из source и не требуют build или generated declaration. Side-effect type
entrypoint допустим только для package без public exports; он не должен скрывать
named exports runtime entrypoint.

Тип можно реэкспортировать только внутри границы одного workspace package.
Package не реэкспортирует тип, объявленный другим package: consumer импортирует
его напрямую из package-владельца, а новый public type текущего package должен
быть объявлен внутри его собственного root. Правило одинаково действует для
`export type { ... } from`, `export { type ... } from`, `export *` и схемы
`import type → export`; владельца определяет ближайший `package.json` source
файла и target declaration.

## Получить пакет release

```http
GET /<package-name>?env=<env>
```

Endpoint возвращает artifact выбранного package и browser env. Path остаётся
каноническим package name; env передаётся только query parameter. Endpoint не
определяет весь состав package и не заменяет его server-entrypoints. Если
готового artifact ещё нет, он собирается автоматически.

Exact version использует тот же pathname:

```http
GET /<package-name>?env=<env>&version=<semver>
```

Service Worker перехватывает стабильный package URL, но сохраняет code только
по точному versioned endpoint в cache владельца: `@cosmos/release` —
`release`, `@internal/*` — `internal`, `@metafor/*` — `metafor`. Имя отдельного
package в правила кэширования не добавлять. После commit каждый canonical owner cache
содержит ровно одну exact entry на `(package, env)` и не содержит stable либо
state entries.

Из обычных `/assets/*` Worker сохраняет только требуемый runtime font
`/assets/fonts/JetBrainsMono-Bold.ttf`. PWA screenshots, manifest icons и
favicon не входят в offline contract и не занимают Cache Storage.

Во время обновления на origin существует не более одного технического Cache
Storage с точным именем `transaction`. Его первой entry всегда становится
marker `/transaction`; delta, desired composition и IDs в marker не хранятся. Затем
Worker сохраняет там только проверенные `update` artifacts, добавляет все
candidates в canonical caches без old deletion и повторно проверяет полный
candidate composition. После этого cleanup идёт только вперёд; старый
`@cosmos/release:service` удаляется последним из old entries,
а `transaction` — последней durable операцией после final verification.

После остановки release заново собирает canonical current и получает fresh
delta от server. Startup не открывает `transaction`, не разбирает delta и не ждёт
cleanup. Он полностью проверяет и запускает только первую exact service
entry в Cache order; повреждение первой entry завершается fail closed. Прежние
state keys, UUID storages и migration-ветки в действующем source отсутствуют.

Startup передаёт release один замороженный dependency object только вниз, а
release factory возвращает отдельный inert runtime с `start`, `fetch`,
`message`, `destroy`. При self-update новый runtime готовится после проверки
всех canonical candidates и до cleanup, но запускается только после final
verification и удаления `transaction`. Затем startup направляет новые events
ему, ждёт in-flight events прежнего runtime и вызывает его `destroy`, который
закрывает RPC, timers и AbortController. Registration не удаляется; release
один раз навигирует каждый Window.

Пример:

```text
GET http://127.0.0.1:4444/@cosmos/release?env=service
GET http://127.0.0.1:4444/@internal/visual?env=main&version=0.1.3
```

Текущее доказанное состояние всех сменяемых packages возвращает отдельный
control endpoint без параметров:

```http
GET /code
```

Это диагностическое чтение server state, а не источник current state для
Service Worker. После RPC connect и каждого payload-free `release-changed`
Worker заново сканирует exact entries caches `release`, `internal` и
существующий `metafor`, вычисляет фактические SHA-256/size и отправляет полный
current. Server отвечает только `update` и `remove`; URL, cache owner, полный
desired list и release/request/transaction IDs не передаются.

## Опубликовать release

```http
POST /code
Content-Type: application/json

{"packages": [{"name": "<package-name>", "change": "patch"}]}
```

Для нескольких зависимых packages передать все имена в одном массиве:

```http
POST /code
Content-Type: application/json

{
  "packages": [
    {"name": "@cosmos/release", "change": "patch"},
    {"name": "@internal/visual", "change": "minor"}
  ]
}
```

`change` принимает только `patch`, `minor` или `major`. Готовый номер версии не
передавать: host вычисляет его от последней доказанной версии. Передавать одной
группой все изменённые взаимозависимые `@cosmos/release` и `@internal/*`
packages.
Query parameters для `POST` не использовать. После успешного ответа browser
транзакционно обновит всю группу и перезагрузится сам.

Host сначала записывает target caret versions в корневой package manifest, а
затем выполняет checks, builds, immutable artifacts и child version writes.
Обычная ошибка откатывает root; после аварийной остановки следующий server
startup до открытия listener доводит видимый root intent вперёд. Поэтому не
исправлять child versions или `dist/versions` вручную и не заменять
существующий exact artifact под тем же SemVer.

Ответ имеет форму:

```text
{
  success: true,
  results: [{module, change, previousVersion, version, success, exitCode, stdout, stderr, outputs}],
  packages: [{name, env, version, sha256, size}]
}
```

`endpoint` и cache owner в ответ не входят. Canonical URL строится из
`name + env + version`, а cache owner — из namespace; SHA-256 и size относятся
к фактическим опубликованным bytes.

* `200` и `success: true` — обновление принято;
* `400` — JSON или форма body неверны;
* `422` — хотя бы одна сборка не прошла; версии и доступные artifacts не
  изменились, использовать `stdout` и `stderr` из `results`;
* `404` — имя неизвестно или не разрешено для обновления;
* `415` — не указан `Content-Type: application/json`.

После `200` проверить, что страница снова загрузилась и работает с ожидаемым
изменением. Если Worker спал или пропустил RPC, он сверится через `GET /code`
после подключения и применит то же обновление. Cosmos не перезапускать и
страницу вручную не перезагружать.
