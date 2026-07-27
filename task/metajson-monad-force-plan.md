# MetaJSON, Monad и Force: живой архитектурный план

Статус: consolidated owner-направление и living plan утверждены owner в Codex
task `019f9b10-44b2-7ab2-9ae8-e831d4f9ccea`; `MF-000` и контрактный срез
`MF-010`, восстановление Create MetaFor `MF-011`, migration gate `MF-012` и
offline source split `MF-013` завершены. Шесть Meta находятся в независимых
flat peer repositories. `MF-014` принят owner: единственный вручную запущенный
flat contour materialize ровно шесть Meta, сохранил Matter/Mass relationships,
восстановил Auth и открыл свежий Chat Realtime connection. Live contour
остаётся без изменений. Owner завершил `MF-100` review и утвердил один полный
MetaJSON v1 read-contract. `MF-101` implementation gate завершён и независимо
принят: public contract, Dark/Boundary projections и stateless Monad assembly
зафиксированы тремя локальными commits. `MF-102` также завершён: standalone
Force runtime перенесён в Dark, legacy history surface удалён, а
owner-approved full cold cut принял новый five-process contour и complete
post-cut Dark Force Particle history. Следующий обязательный item — read-only
`MF-103`; параллельный isolated checkpoint foundation `MF-105/MF-106`
зафиксировал contract и synthetic bare-Git proof без live capture. Принятый
contour остаётся запущенным без hot reload.

Этот файл — изменяемая рабочая карта. Он не заменяет документы-владельцы из
`docs/README.md`. Новый действующий закон сначала переносится в соответствующий
domain document, затем в public types, код и тесты.

Исполнимый backlog находится в
[`task/metajson-monad-force-todo.md`](metajson-monad-force-todo.md).

## 1. Фундаментальная рабочая модель

Owner даёт Codex доступ к Вселенной и цель. После этого Codex должен иметь
возможность работать с ней итеративно:

```text
прочитать всю или выбранную проекцию
→ прочитать релевантную историю и разрешённые Mass results
→ определить место улучшения
→ построить и проверить структурный patch
→ отправить patch через Dark Monad
→ запустить разрешённые runtime consequences через Force
→ прочитать результат и историю
→ продолжить работу
```

Это продуктивный control loop, а не одноразовая передача результата и не
обязательная ручная церемония перед каждым patch.

Пользователь задаёт цель, границы capability и policy. Codex является внешним
интеллектом и исполнителем в этих границах: он может читать, проектировать,
планировать, применять разрешённые patches и наблюдать последствия. Отдельное
owner approval требуется только там, где TODO явно помечен `GATE`, либо когда
операция расширяет ранее данную authority.

Codex и Пользователь не являются Runtime Agent Atom внутри Вселенной. Они не
пишут напрямую в чужие domain Stores и не обходят Monad, Force или владельца
данных.

Настроенные внутренние Processes могут работать автономно по уже действующим
States, Transitions и законам. Автономность не означает бесплатное вычисление:
model, tool, network и другие computations потребляют объявленные ресурсы.

## 2. Monad и Force

> Monad — уровень создания и изменения устройства мира.

Monad работает со структурой, Meta, законами, States, Transitions, Processes,
Matter и тем, что в принципе может существовать. Monad читает projections,
валидирует структурный intent, изменяет канонический source и инициирует
материализацию принятой структуры.

> Force — причинный runtime-канал живой Вселенной.

Force переносит события, текущие факты и последствия под уже активными
законами. Force не является вторым представлением Monad patch и не подменяет
структурную валидацию.

Monad и Force являются двумя равноправными слоями Dark, а не отдельными
runtime-доменами:

```text
Dark
├── Monad — законы мироздания и service level
└── Force — законы существования и Particle causality
```

Весь runtime/domain нынешнего standalone `force` переносится в Dark на
`MF-102`; после migration отдельного Force package/entry/process нет.
`shared/protocol/force` остаётся общим wire language.

Короткий закон:

```text
Monad изменяет возможное устройство мира.
Force причинно проводит жизнь уже принятого устройства.
```

Dark Monad подготавливает структурное изменение и испускает Inflaton в Dark
Force до Boundary materialization. После materialization производные
consequences также проходят Dark Force. Gluon/Higgs и Inflaton используют один
причинный канал. Каждая изменённая entity по-прежнему передаётся отдельным
`ForceMessage` с одной `Particle`; это wire law, а не формат structural patch.

## 3. Источники истины и наблюдаемость

| Артефакт | Владелец смысла | Значение |
| --- | --- | --- |
| `meta.ts` | Meta package | каноническое human-authored описание |
| Create MetaFor templates | Create MetaFor | законная исходная структура нового Meta package |
| MetaJSON v1 read operation | Dark Monad | stateless assembly одного полного declaration/runtime document |
| Declaration projection | Dark Monad | полная compact normalization загруженного MetaDSL graph |
| Current projection | Boundary | текущие sparse Atom values в structural occurrences |
| Boundary Store | Boundary | канонический текущий materialized мир |
| Domain Stores | соответствующий домен | локальные projections и живые ресурсы |
| Operation-service log, если утверждён | Dark Monad | фазы service operation, не выраженные Particle |
| Particle history | Dark Force | полная filesystem history всех принятых Particles |
| Mass bytes/results | Energy/Mass owner | данные и результаты, читаемые отдельным разрешённым API |

`meta.ts` остаётся каноническим authored source. MetaJSON собирается из Dark
declaration и текущей Boundary projection и не редактируется как второй source
of truth.

MetaJSON snapshot не содержит:

- historical data;
- JSON Patch history;
- Mass bytes;
- живые Energy objects.

Dark Force Particle history является portable append-only каталогом
`.metafor/dark-force-history/v1/`. Immutable `manifest.json` задаёт только
post-cut identity, а Particle truth хранится только в bounded NDJSON segments.
Каждая запись имеет стабильный `(cutId, acceptance sequence)` ID, Force
`acceptedAt` и неизменённую `SourcedParticle` с её authored `particle.ts`.
Производный `catalog.json` ускоряет навигацию по segment/sequence/time, но
полностью rebuildable и не участвует в acceptance. Durable append завершается
до routing; snapshots, Mass, Store и иные events в эту history не входят.
Legacy `.metafor/dark-history.jsonl` после verified pre-cut backup удаляется из
active contour; Dark Monad больше не предоставляет его read/clear surface.

History, operation outcomes, Mass results и JSON Patch передаются отдельными
форматами/API. Чтение этих данных не даёт права напрямую писать их Stores.

Полная система контроля версий не входит в первый срез. В нём нет branches,
merges, generic rollback, push workflow или отдельной модели source versions.
Допустимы только:

- serialized structural operations;
- content digest/CAS текущего файла как guard конкурентной записи;
- atomic filesystem writes;
- отдельно утверждённый append-only Dark Monad operation-service log.

Initial Git repository и `Initial commit`, выполняемые Create MetaFor, остаются
bootstrap-поведением template creator. Dark Monad не развивает это в VCS
subsystem.

## 4. Flat topology — обязательный первый приоритет

### 4.1 Закон адреса и физического layout

Под физическим owner directory каждая Meta является независимым peer
repository:

```text
cluster/<owner>/<repository>/
├── .git/
├── meta.ts
├── package.json
└── ...
```

Canonical logical address имеет ровно два сегмента:

```text
<owner>/<repository>
```

Обязательные следствия:

- root/internal creation branching отсутствует;
- nested Meta repositories отсутствуют;
- третьего address segment нет;
- repository names уникальны внутри owner;
- смысловая композиция выражается Meta/Matter/Monad references, а не вложением
  директорий;
- сложные имена разворачиваются через hyphenated repository names, как в
  проверенных исторических примерах `git-commit`, `git-history-commit`,
  `git-worktree`;
- permanent compatibility alias старого трёхсегментного адреса запрещён.

### 4.2 Археологическое основание

Commit `dd66370112ed0d443b04bcad0905b6ffb80ad2f8` ввёл эксперимент:

- `cluster/<owner>/<root>/<internal>`;
- root/internal ветвление Create MetaFor;
- internal packages без собственного Git и install;
- canonical address из двух либо трёх сегментов.

Его parent `b10a4c0724bc2bf74596e65048178ebb22800486` является проверенным
pre-experiment baseline для Create MetaFor:

- произвольный flat parent directory через `--dir`;
- полный template set;
- `bun install`;
- отдельный Git repository;
- один initial commit на созданную Meta.

Восстановление является концептуальным: более новые исправления DSL, Mass,
Energy, types и templates сохраняются. Возвращается topology law, а не старый
код побайтно.

### 4.3 Точные изменения Create MetaFor

Целевая реализация:

1. Удаляет `CreationContext` и root/internal branches.
2. Всегда создаёт новый target `resolve(parentDirectory, repositoryName)`.
3. Не создаёт Meta внутри существующего Meta Git repository.
4. Генерирует полный актуальный template set.
5. Отказывается перезаписывать существующий target.
6. Выполняет `bun install`.
7. Инициализирует Git и делает `Initial commit` для каждой Meta.
8. Генерирует npm identity и HTML `src` только из `owner/repository`.
9. Не добавляет child workspace contract в стандартный template.
10. Проверяет два независимых peer repositories отдельными CLI tests.

Owner механически определяется как basename переданного parent; для canonical
Cluster это `cluster/<owner>`. Утверждённая migration использует этот canonical
parent напрямую и не добавляет отдельный `--owner`. Owner нельзя выводить из
Git config, cwd repository либо другого нестабильного окружения.

### 4.4 Миграция текущей Inference topology

Целевое отображение:

| Текущий address | Новый peer address |
| --- | --- |
| `zavx0z/inference` | `zavx0z/inference` |
| `zavx0z/inference/lada` | `zavx0z/lada` |
| `zavx0z/inference/auth` | `zavx0z/lada-auth` |
| `zavx0z/inference/chat` | `zavx0z/lada-chat` |
| `zavx0z/inference/chat-send` | `zavx0z/lada-chat-send` |
| `zavx0z/inference/model` | `zavx0z/lada-model` |

Целевая композиция:

```text
zavx0z/inference
└── zavx0z/lada
    ├── zavx0z/lada-auth
    ├── zavx0z/lada-chat
    │   └── zavx0z/lada-chat-send
    └── zavx0z/lada-model
```

Эта схема является Meta/Matter graph. Она не задаёт filesystem nesting.

При миграции нужно устранить текущие cross-repository relative imports:

- Lada greeting contract больше не импортируется по `../chat`;
- `lada-chat-send` не импортирует implementation по `../chat`;
- unit tests принадлежат своему peer repository;
- один composition test проверяет graph через logical addresses.

Package boundary между Chat и Chat Send меняется только механически: новый peer
может импортировать стабильный export Chat package без изменения семантики.
Если для независимых repositories потребуется изменить сам Energy/send
contract либо поведение, `MF-013` останавливается и возвращается к owner
decision.

Рабочая Лада переносится без редизайна: её Fields, States, Processes, Matter,
Mass bindings, поведение и acceptance semantics сохраняются. Допустимы только
необходимые изменения двухсегментных `src` и package import/export boundaries.
Перепроектирование Лады по Field/State laws является отдельной будущей задачей.

Новые `lada`, `lada-auth`, `lada-chat`, `lada-chat-send` и `lada-model`
создаются с нуля через полный Create MetaFor path. Каждый получает собственный
Git и template `Initial commit`; история Inference в новые repositories не
переносится. Target directories запрещено создавать вручную через
`mkdir`/копирование scaffold: authored content переносится только после
успешного canonical Create MetaFor invocation. `zavx0z/inference` остаётся
существующим независимым composition и load root.

### 4.5 Compatibility и cold proof

Source split выполняется offline относительно живого contour: текущие процессы
не останавливаются, не перезапускаются и не получают hot reload. Старые nested
packages пока не удаляются. Store/Mass cut и запуск новой topology выполняются
только отдельным последующим item после сохранения source/Mass/Store evidence.
Текущая live chat session не мигрируется и не является acceptance criterion:
после завершения согласованного плана Лада запускается заново и принимается как
fresh cold start.

Acceptance cold materialization:

1. `canonicalMetaSource` принимает только два safe segments.
2. Legacy three-segment address отклоняется до filesystem access.
3. Dark начинает с `zavx0z/inference`.
4. BFS загружает ровно шесть ожидаемых peer Meta.
5. Каждый source читается только как
   `cluster/<owner>/<repository>/meta.ts`.
6. Boundary материализует тот же смысловой Matter graph.
7. Root Mass declarations и их source relationships сохраняются.
8. Повторное чтение не испускает structural changes.
9. Derived domains рождаются полным обычным lifecycle.
10. Fresh cold start после завершения approved plan доказывает авторизацию,
    подключение к чату, чтение истории, обработку входящего сообщения и ответ.
11. Никакого runtime, Store cut, process restart или запуска Лады нет на
    `MF-013`.

Первый фактический `MF-014` cut подтвердил full cold lifecycle и чтение всех
пяти новых peer references, но не acceptance всего graph. Boundary сохранил
шесть legacy three-segment WIMP declarations и добавил пять flat declarations
вместо замены identities; первый Auth process затем завершился ошибкой
неразрешённого Mass handle. Failed candidate сохранён отдельно, а pre-cut
SQLite, Dark history и Mass восстановлены побайтно. Следующая попытка требует
owner decision из раздела 15 о clean derived-store cut либо явной migration
старых identities.

Owner-approved clean retry построил Boundary офлайн из canonical Dark stream,
сопоставил новые semantic Mass declarations с сохранёнными global Mass key
identities и затем выполнил единый cold birth. Результат содержал ровно шесть
flat WIMP/Atom, пять Matter edges, 18 Mass memberships и 13 source relations.
Auth восстановилась из сохранённой SSO session; HTTP-чтение комнат/истории
дошло до Realtime phase. Внешний WebSocket завершился ошибкой при открытии,
поэтому chat behavior acceptance не пройден. Failure snapshot сохранён, а
verified legacy SQLite/Mass/history и healthy contour восстановлены.

Финальный owner-run использовал подготовленный flat Store в единственном полном
contour. Fresh execution evidence подтвердил Auth, Chat Realtime connect и
переход Лады в рабочее состояние без failed executions. Owner принял
`MF-014`; дальнейшая MetaJSON работа не изменяет этот live contour.

## 5. MetaJSON v1

Утверждённый read-contract `MF-100`, его аудит и точная implementation boundary
находятся в
[`task/metajson-v1-read-contract.md`](metajson-v1-read-contract.md).

MetaJSON v1 — один полный public JSON document с одной schema. Он содержит:

- `template`: полный сериализуемый результат действующей compact normalized
  `MetaDSL`, включая Fields/defaults, Superposition, Mass, Processes,
  Reactions, Matter bindings и объявленный Bulk;
- `runtime`: вложенные structural occurrences текущих Atom, их State и только
  реально присутствующие Field values.

`meta.ts` и Git остаются canonical authored source. MetaJSON собирается при
чтении и не хранится как второй Store. В нём нет альтернативных
`authoring`/`planner`/`diagnostic` schemas или compact views. Partial
selection/query является retrieval operation над тем же документом и не
создаёт второй payload.

Runtime не сообщает, появился value из default или из последующей write.
Отсутствующий у Atom key означает только отсутствие текущего value; default
читается в `template`. Отдельных status cells и `values/missing` envelope нет.

Public identity и relations задаются canonical Meta addresses, вложенной JSON
structure и public paths/references. Raw Boundary/SQLite identities, включая
Atom/Field IDs и `valueId`, не выходят в MetaJSON. Directed ports, boundary
stubs и отдельный global edges graph отсутствуют; Matter relations остаются в
нормализованной structure.

Порядок сохраняется только там, где текущий runtime либо materialization
придают ему смысл: States, per-State Transitions, enum variants,
materialization identities Fields/Processes/Reactions, `finally` Process
causality и Matter sibling/occurrence order. Conditions одного Transition
остаются конъюнкцией; Mass/display order не становятся новым законом.
Универсального `order` vector нет.

MetaJSON v1 не содержит revisions, digests или CAS fields. History, patches,
Mass bytes и live Energy objects остаются отдельными разрешёнными read
interfaces.

## 6. Итеративный read/observe contract

Codex должен уметь через объявленные RPC:

- запросить через Dark Monad весь MetaJSON для canonical root Meta;
- выполнить partial retrieval над тем же document contract без второй schema;
- запросить полную Dark Force Particle history, включая Gluon/Higgs и
  структурные Inflaton;
- запросить разрешённые Mass results без включения Mass bytes в MetaJSON;
- при отдельно утверждённом Dark Monad operation-service log запросить
  pre-Force service phases по operation/target/time;
- сравнить projection до/после operation;
- продолжить работу с новым наблюдением.

MetaJSON RPC и history RPC read-only. Mass read проходит через Monad владельца
или объявленный Energy/Mass service; Codex не читает Boundary SQLite, domain
Store или files другого domain напрямую.

`MF-103` реализует complete Dark Force Particle-history read и разрешённые Mass
results только после `MF-102`. Текущее `DarkHistory` является неполной
pre-migration surface-реализацией: её evidence сохраняется, но не сужает owner
law. Structural Particles уже принадлежат Force history; будущий
operation-service log не заменяет их и не является prerequisite такого
наблюдения.

## 7. Structural operation первого среза

### 7.1 Request

```ts
interface MonadStructuralOperationV1 {
  schema: "metafor/structural-operation/v1"
  operationId: string
  target: {
    src: `${string}/${string}`
    kind: "create" | "update"
  }
  base?: {
    sourceDigest: Digest
    metaDigest: Digest
  }
  patch: JsonPatchOperation[]
  intent?: string
}
```

`operationId` обеспечивает serialization/idempotency операции. `base` является
optimistic concurrency guard текущего source, а не началом version model.

Один JSON Patch может изменять несколько связанных entities, если validator и
materializer поддерживают эту operation. Закон «одна entity на patch» не
является общим. Каждая структурно изменяемая entity компилируется Dark Monad в
отдельную Inflaton/ForceMessage до materialization; производные runtime
consequences также передаются отдельными Particles.

### 7.2 Fast Dark Monad validation

До filesystem write Dark Monad синхронно проверяет:

1. JSON и runtime schema.
2. Canonical two-segment target address.
3. JSON Pointer и patch operation validity.
4. Base digest/CAS, если он передан.
5. Field, State, Transition, Process и Matter reference integrity.
6. Semantic constraints DSL.
7. Forbidden cycles и требуемые graph constraints.
8. Capability/policy вызывающего identity.
9. Round-trip способность поддерживаемого source adapter.

Validation rejection не меняет filesystem или живую Вселенную. При отдельном
`MF-203` approval его точный service result может быть записан в Dark Monad
operation-service log.

### 7.3 Write, materialize, observe

Целевой happy path:

```text
request
→ fast validation
→ atomic filesystem write
→ MetaFor execution/normalization
→ round-trip proof
→ structural Inflaton(s)
→ Dark Force persist/route
→ Boundary materialization into the living Universe
→ derived Particles через Dark Force
→ optional approved service outcome
→ reread projection/history/Mass result
```

Update одного source выполняется через same-directory temporary file,
flush/close и atomic rename. Create materializes полный предварительно
валидированный directory set через отдельный staging target и atomic namespace
publication, после чего выполняет остальные объявленные Create MetaFor
bootstrap steps.

Первый срез не требует `pending/active` Meta heads, transactional outbox,
source publication saga или Force v2 receipt protocol.

#### 7.3.1 Offline gate для multi-entity Boundary dissolve

`dissolve` сначала доказывается только над detached structural projection и
изолированной Boundary fixture. План обязан детерминированно удалить выбранного
родителя, поднять его прямых детей в прежний lexical interval и потребовать
явную disposition каждого authored Mass key родителя. Отсутствующая, лишняя
либо направленная не в promoted child disposition отклоняет весь plan.

Multi-entity materialization остаётся атомарным staged proof: до commit
проверяются полный набор изменяемых entities, references, sibling order и
Mass disposition. Каждая изменённая entity всё равно компилируется в отдельный
`ForceMessage` с одной `Particle`; batch не становится новой Force wire
семантикой. Первый proof не имеет capability на live Boundary, Energy destroy,
Mass, Force history или runtime processes.

Даже успешный offline proof не разрешает live dissolve/delete. Live execution,
Energy cleanup/destroy и cold rollout остаются отдельными owner gates после
основного structural slice.

Owner-approved следующий non-live prerequisite использует только detached
candidate bundle из caller-certified stopped private copies. Raw
Boundary/WAL/SHM, Mass, Dark Force history и checkpoint control сохраняются как
hashed rollback set. Отдельный candidate Boundary получает standalone SQLite
и только Boundary-owned durable stage table с `effects: none`, exact
checkpoint/rollback binding и explicit retention без automatic GC.

Generalized current-sequence checkpoint требует полный verified history/forward
patch coverage от предыдущего snapshot до current `S`; count не превращается в
invented empty patches. Candidate stage не exposed в runtime и не разрешает
transaction execution, materialization, Force/Energy admission/retarget,
source/root transition, lifecycle или deletion.

Если filesystem write успешен, а execution/materialization не удались:

- source не откатывается автоматически;
- failure возвращается как точный service result;
- при утверждённом `MF-203` log entry содержит phase, error и digests;
- retry использует тот же `operationId`;
- reconcile перечитывает source, повторно валидирует его и либо продолжает
  materialization, либо возвращает точный conflict/error.

### 7.4 Предлагаемый operation-service log (`MF-203` owner gate)

```ts
type StructuralOutcome =
  | "validation_rejected"
  | "write_failed"
  | "written_materialization_failed"
  | "materialized"
  | "reconciled"

interface MonadOperationJournalEntryV1 {
  schema: "metafor/operation-journal/v1"
  operationId: string
  target: `${string}/${string}`
  receivedAt: string
  patch: JsonPatchOperation[]
  patchDigest: Digest
  baseSourceDigest?: Digest
  writtenSourceDigest?: Digest
  normalizedMetaDigest?: Digest
  outcome: StructuralOutcome
  failedPhase?: "validation" | "write" | "execute" | "round_trip" | "materialize"
  error?: {code: string; message: string}
}
```

Если owner отдельно утверждает эту capability, log append-only и достаточен
для ответа:

- какой patch был принят;
- что проверено;
- был ли записан filesystem;
- была ли structure materialized;
- почему operation остановилась;
- можно ли повторить или reconcile.

Это не Dark Force Particle history, не MetaJSON snapshot и не VCS history.
Такой service log является отдельным будущим owner gate: если он будет
утверждён, он описывает только validation/write/execute/round-trip и другие
Dark Monad phases, которые ещё не выражены принятой Particle. Inflaton и
последующие structural Particles уже наблюдаются через Dark Force history.

## 8. Creation и update — единый закон

Create и update используют один patch/validation/materialization contract.
Create отличается только законным начальным template и отсутствием target.

Точный create flow:

```text
Create MetaFor template
→ Dark Monad validation(template)
→ target patch applied to validated template
→ Dark Monad validation(result)
→ filesystem write/materialization
→ MetaFor execution/normalization
→ round-trip proof
→ apply to Universe
→ append operation outcome
```

Create MetaFor template является законным, но семантически пустым стартом.
Target patch придаёт ему требуемый смысл.

Dark Monad:

- интегрирует существующий Create MetaFor template path;
- не копирует templates;
- не создаёт параллельный минимальный generator;
- не заменяет полный package на `directory + meta.ts`;
- сохраняет flat peer repository, install и initial Git bootstrap laws;
- валидирует template до patch и result после patch;
- не публикует target filesystem до обеих валидаций.

Текущий Create MetaFor CLI непосредственно пишет target. Для интеграции нужен
reuse boundary, который может сначала получить полный нематериализованный
template set. Форма этого boundary проектируется в отдельном TODO item; source
templates остаются единственными.

## 9. Границы ответственности

| Компонент | Ответственность |
| --- | --- |
| DSL / `meta.ts` | human-readable canonical declaration |
| Create MetaFor | полный законный template нового flat peer Meta repository |
| Dark Monad | projections, Meta/package/source/TS/Process service operations, validation, structural planning, atomic source write, execution/round-trip orchestration, retry/reconcile и Inflaton generation |
| Dark Force | полный Particle ingress/history, causal order, relay/routing, lifecycle gate и domain channels |
| Boundary | канонический materialized мир и runtime instance values |
| Matrix | States, Transitions, Conditions и их runtime evaluation |
| Energy | Processes, Mass handles/results и живые resources |
| Bulk | manifestation и projection/layout, не source authority |
| Operational journal | исход structural operations |

Ни Monad, ни Codex не пишут напрямую в Boundary/Matrix/Energy/Bulk Stores.
Dark не читает Boundary SQLite напрямую. Mass bytes не проходят через MetaJSON.
После `MF-102` отдельного standalone Force runtime/domain/process нет.

## 10. Лада

Лада — автономная изолированная внутренняя галактика:

```text
incoming message
→ configured processing
→ response
```

Она живёт по уже настроенным States, Transitions, Processes и законам. Лада не
является центром текущего authoring, topology restoration или первого Monad
patch slice и не используется как его fixture.

Это ограничение текущего этапа, а не вечный запрет. В будущем Лада может
получить capability-scoped возможность изменять собственную structural scope.
Такое право требует отдельной policy, resource limits, validation и
observability, но не должно заранее исключаться архитектурой.

## 11. Первый Monad patch vertical slice

Он начинается только после завершения flat topology restoration и cold proof.

Scope:

- изолированная существующая fixture Meta, не Лада;
- один поддерживаемый `meta.ts`;
- JSON Patch добавления optional scalar Field без default;
- fast validation;
- atomic write;
- немедленные execution, round-trip и materialization;
- optional operation-service outcome только после `MF-203` owner approval;
- reread MetaJSON, runtime Atom occurrence и history;
- retry/reconcile для post-write materialization failure;
- без Git branch/merge/push, pending/active Store, Force v2, hot reload и
  generic rollback.

Acceptance:

1. Dry validation не пишет filesystem и не меняет Universe.
2. Invalid JSON/schema/reference/cycle отклоняется до write.
3. Stale base digest отклоняется до write.
4. Atomic write не оставляет partial target.
5. Успешный source порождает Inflaton через Dark Force и materialize в
   Boundary.
6. Structural Inflaton до materialization и derived runtime Particles проходят
   Dark Force.
7. Dark Force history показывает Particles; при утверждённом `MF-203` service
   log отдельно различает validation, write и materialization phases.
8. После post-write failure retry/reconcile не выполняет silent overwrite.
9. Reread показывает Field declaration и отсутствие этого key в sparse
   runtime Atom occurrence.
10. Повтор той же operation дедуплицируется по `operationId`.
11. Codex может прочитать outcome и продолжить следующий iteration.
12. Никаких изменений Лады, Cluster topology или runtime lifecycle вне fixture.

## 12. Отложено после первого среза

Отдельными будущими инициативами остаются:

- full VCS: branches, merges, rollback, push и source version graph;
- `pending/active` Meta heads и сложная publication saga;
- durable Dark Force v2 delivery control, ACK/NACK/resume и replay;
- multi-domain convergence barrier;
- multi-entity Boundary staging, если его потребует конкретная operation;
- Process generator/updater beyond supported patch adapters;
- autonomous Runtime Agent structural capabilities;
- constrained Lada self-evolution;
- hot reload — по-прежнему запрещён; lifecycle остаётся полным.

Эти пункты не являются prerequisites topology restoration или первого Monad
patch vertical slice.

## 13. User stories

| ID | История |
| --- | --- |
| US-01 | Codex читает один полный MetaJSON declaration/runtime document |
| US-02 | Codex выполняет partial retrieval над тем же MetaJSON contract |
| US-03 | Codex сопоставляет projection, particle history и разрешённый Mass result |
| US-04 | Codex валидирует и применяет разрешённый structural patch |
| US-05 | Codex наблюдает materialized result и продолжает улучшение |
| US-06 | Monad отклоняет invalid reference/cycle до filesystem write |
| US-07 | Post-write materialization failure виден и reconcileable |
| US-08 | Create использует Create MetaFor template, затем target patch |
| US-09 | Flat peer Meta ссылаются друг на друга только двухсегментными addresses |
| US-10 | Cold load Inference materialize тот же смысловой graph без nesting |
| US-11 | Configured internal Process автономно обрабатывает runtime event |
| US-12 | Будущая Lada self-evolution остаётся возможной, но не входит в текущий slice |

## 14. Порядок реализации

1. Совместно принять обновлённый living plan (`MF-000`).
2. Зафиксировать flat topology law в owner documents/types.
3. Восстановить flat peer behavior Create MetaFor.
4. Разрешить оставшиеся migration decisions для Inference.
5. Создать независимые peer repositories и мигрировать references/source.
6. Доказать strict two-segment resolver и cold materialization.
7. Утвердить MetaJSON v1 read contracts.
8. Реализовать один MetaJSON read через stateless Dark Monad assembly
   Dark + Boundary.
9. Behavior-preserving перенести весь standalone Force runtime/domain в два
   слоя Dark, доказать endpoint/routing/history parity, переключить launcher на
   пять processes и удалить standalone Force entry/package.
10. Добавить complete Dark Force Particle-history и Mass-result observation.
11. Реализовать structural operation schema и fast Dark Monad validation.
12. Реализовать atomic update adapter и, только после отдельного owner gate,
    operation-service log.
13. Испускать structural Inflaton через Dark Force и materialize в Boundary.
14. Реализовать retry/reconcile.
15. Принять первый Field vertical slice.
16. Интегрировать нематериализованный Create MetaFor template path для create.
17. Только затем выбирать отложенные Dark Force/VCS/agent capabilities.

## 15. Owner decisions и последующие gates

`MF-100` owner review и `MF-101` implementation gate завершены. Для MetaJSON
v1 закрыты и реализованы следующие решения:

1. существует один полный public JSON document без alternate views/schemas;
2. stateless Dark Monad собирает его из Dark declaration и Boundary current
   projections, не владея Store state;
3. `template` является compact complete normalized MetaDSL, включая Bulk и
   executable declaration descriptors;
4. `runtime` содержит только присутствующие current Atom values без provenance
   и status/missing envelope;
5. revisions, digests, CAS и raw internal identities в MetaJSON отсутствуют;
6. directed ports/stubs/global edges отсутствуют;
7. сохраняется только порядок, доказанный runtime/materialization semantics.

Owner-approved upstream law реализован в `MF-102`: Dark содержит peer layers
Monad и Force; весь standalone Force runtime/domain перенесён в Dark, а
отдельный Force process/package прекратил существовать. После принятого cold
cut `MF-103` разблокирован как следующий read-only item.

Предыдущий вывод commit `04580a91`, ограничивший `MF-103` Dark-surface history
и отложивший structural observation целиком в `MF-203`, superseded. H1/M1
остаются достоверным evidence текущего кода, но structural Inflaton являются
Particles и входят в complete Dark Force history. После `MF-102` read-only
`MF-103` добавляет closed filters над этой history и отдельный Mass-result
observation: external Mass identity задаётся canonical root, public runtime
Atom path и authored Mass key, результат является detached JSON-only data.

Owner отдельно утвердил checkpoint-направление. Coherent snapshot создаётся
только в semantic, quiescent, material-Mass, explicit owner bookmark либо
measured replay-cost point; timer и голый count не являются trigger. Один
snapshot `(cutId, acceptance sequence)` создаёт ровно один immutable commit с
полным согласованным Boundary+Mass capture в отдельном private checkpoint
repository, никогда не в source repository. Particle timeline остаётся
единственной canonical change history. Каждый commit также содержит
deterministic canonical forward JSON Patch span с digest и точным coverage
`[previous snapshot sequence + 1, S]`, выведенный из Particle timeline без
новых mutation semantics и без control rows в history. Forward Particle/JSON
patch replay остаётся единственным способом построить состояние из
checkpoint; canonical inverse patches не создаются. Derived patch/state cache
является server-side, disposable и rebuildable и не хранится в Git.

Owner создал будущий distribution repository
[`zavx0z/metafor-checkpoints`](https://github.com/zavx0z/metafor-checkpoints).
Текущий implementation использует только local bare Git; GitHub остаётся
пустым. Его remote, credentials и push не настраиваются без отдельной
authority.
Checkpoint foundation выполняется независимо от read-only `MF-103` и сходится
с ним только на replay/navigation. До реализации остаются gates по шифрованию
и device keys, blob backend/size budgets, точному определению material Mass
trigger, retention/GC и live cold restore.

Owner разрешил полный `MF-107` source slice и один controlled live cold cut.
Внутренний control-plane contract назначает принятым Dark Force Particles
per-domain sent ordinals, принимает applied acknowledgements и удерживает
causal fixed point только после равенства applied/sent frontiers. Receipt и
ack не являются Particle, не меняют Force wire/history и не добавляют control
rows. Receipt sideband подключается без изменения Particle/wire/history; Dark
персистит frontiers и fail-stop восстанавливает unresolved delivery. Первый
non-zero baseline не выводится из пустого tracker: stopped pre-cut/current
Boundary должны дать одинаковый canonical MetaJSON digest at sequence 0/1,
после чего checkpoint `(cutId, 1)` и control baseline создаются до cold start.

Live target для первого Lada checkpoint — тот же действующий contour, а не
clone или параллельная replacement environment. Выданная authority разрешает
ровно один полный cold cut: backup/hash → stop whole contour → coherent local
snapshot commit → cold start Lada в том же contour → health/functional
acceptance либо точный rollback. Hot/partial restart и remote push запрещены.

До будущего write slice отдельно потребуется локальная capability
identity/policy первого Codex→Monad write endpoint за пределами trusted
development contour. Structural-operation CAS/digests относятся к будущему
`MF-200` contract, а не к MetaJSON v1.

Checkpoint-specific applied-through coordinator не утверждает общий
multi-domain delivery protocol: персистентный Dark Force v2, общий causal
convergence barrier, full VCS и права внутренних Runtime Agents остаются
будущими решениями и не блокируют этот изолированный foundation.

Owner отдельно утвердил `MF-114` как bounded continuation dissolve proof.
Durable stage принадлежит таблице только detached candidate Boundary SQLite,
а Dark checkpoint orchestration копирует stopped private inputs, публикует
current-sequence local checkpoint, связывает raw rollback hashes/receipt и
сохраняет successful/failed bundle до explicit GC. Live activation,
canonical Inference→Lada source/root transition, Force admission и Energy
retarget этим решением не утверждены.

Owner отдельно утвердил следующий `MF-115` NON-LIVE acceptance gate. Exact
serialized plan разрешено выполнить только внутри candidate, собранного из
принятого stopped cut; rollback copy и исходные accepted inputs остаются
неизменными. Успех связывает `BoundaryDissolveProof`, post-dissolve projection,
non-null Bulk root-promotion receipt и browser/static visual evidence. Fence
hooks на этом gate являются только локальным proof и не обращаются к Energy.
Rollback проверяется восстановлением ещё одной private copy с повторной
проверкой hashes/SQLite/history/control/pre-projection. Live activation,
source/root transition, Force/Monad, Energy и lifecycle по-прежнему требуют
отдельного owner gate.

Owner затем выбрал causal no-stop направление и разрешил `MF-116` только как
durable non-live admission preparation. Boundary persistence связывает exact
candidate/stage/proof/Bulk receipt с held applied-through frontier и ordered
plan; Energy persistence доказывает five-handle fence/retarget retry. До exact
Boundary commit запрещены retarget, Bulk projection и entity consequences.
После commit порядок фиксирован как Energy retarget → отдельные target/scope
entity consequences → source Atom remove → verified Bulk promotion →
admission release, причём каждая entity остаётся одним `ForceMessage` с одной
Particle. Endpoint/caller, live admission, live dissolve и lifecycle этим
решением не разрешены.

Retention law закрыт консервативно: dissolve снимает structural parent role,
но не удаляет Mass bytes/keys, history, rollback/checkpoint artifacts,
receipts или superseded bindings. Active binding transition сохраняет полную
source/target identity в immutable admission/Energy receipts; прежние target
keys и все evidence остаются `retain-until-explicit-gc` до отдельного owner
decision.

Owner затем явно утвердил `MF-117`: ровно один canonical
`zavx0z/inference → zavx0z/lada` causal transition через закрытый loopback
caller с owner capability и exact private Boundary/Energy/Bulk adapters.
Fresh preflight обязан заново связать текущий cut/sequence, полный plan,
rollback, пять Energy handles и Bulk projection; любое расхождение завершает
command без live mutation. Для установки clean implementation разрешён ровно
один обычный полный restart `metafor-inference-universe.service` без изменения
config, environment или ports. После него transition выполняется в уже
рождённых пяти processes без дополнительного restart либо hot reload.
Inference снимает только structural parent role; Lada сохраняет identity,
work и всё поддерево и получает former-root frame. Поскольку Bulk torus
принадлежит manifestation Inflaton/Atom, исчезновение Inference из принятой
post-projection обязано удалить его torus, а promoted Lada обязана иметь ровно
один собственный root torus; ghost/stale decorative torus запрещён.

Фактический world commit завершил все шесть durable steps и сохранил полное
пяти-Atom Lada subtree, но финальный Bulk verify ошибочно сравнил
старый full manifestation hash с тем же projection после обычных dynamic
consequences и вернул `409`. Repair меняет только verification/observer
projection: durable proof связывает immutable structural identities, frame,
полное рекурсивное subtree и retention, а volatile state values из сравнения
исключены; существующий v1 receipt остаётся неизменным и проходит строгую
backward validation. Принятый Lada root `replace` обновляет selected root уже
открытых observer. Установка repair требует отдельного owner-approved
standard restart и browser reload; повторять activation/preflight, выполнять
rollback/GC либо hot reload нельзя.

State markers остаются существующими single-object Capsule markers. Их
readability material может использовать только bounded per-object GPU
luminance и пространственный shimmer с детерминированной state-change phase;
ни отдельная particle geometry/CPU simulation, ни новый perpetual render-loop
condition для этого visual effect не допускаются.

### 15.5 Pause/Stack и ветвящийся execution workspace

Owner уточнил назначение checkpoint line: это не только offline replay, а
временная машина отладки и исследования выполнения. После pause Force должен
собирать принятые Particle в причинные слои параллельного исполнения. Слой —
не новая history row и не источник истины: это временный cache, привязанный к
checkpoint, acceptance sequence и frontier evidence, который можно удалить и
построить заново из checkpoint плюс canonical Particle timeline.

Backward navigation означает выбор ранее сохранённого layer cache либо
checkpoint и восстановление рабочей **изолированной** проекции; обратные
Particle/patch не становятся canonical storage. От этой точки можно создать
ветку execution workspace, подать альтернативный следующий input и двигаться
вперёд по ней. Ветки позволяют отбросить путь с плохим результатом, сравнить
результаты и продолжить выбранную ветку без перезапуска исходного live contour.
Они не меняют live Boundary/Mass/Lada и не являются hot rollback: перенос
удачной ветки в live мир остаётся отдельным owner-gated cold activation.

Force владеет pause/admission и causal слоями; Dark Monad предоставляет
контракт workspace; Interpreter — только пульт pause/step/back/branch и не
обходит Force или Boundary. Старый монолитный Atom stack/debugger служит UX и
семантическим референсом (`lock`, `step`, history view), но его ограниченный
UI-стек не переносится как canonical runtime contract.

Интегрированный Bulk timeline — более узкий завершённый adapter текущего
observer cut. Он строит по одному marker для каждого реально материализованного
Inference Atom на общем `throughTs`; cold projection помечается как
`unknown`. Adapter не создаёт исторические samples, не читает Mass/Force
history и не предоставляет pause/step либо Boundary/runtime commands.
Code slice зафиксирован commit
`1274fe76da42fc1ea74902f79f228c1ac8475820`; focused
timeline/HUD/render-loop tests проходят. Visual acceptance не закрыта:
AI-server cold page открывается, но capture остаётся blank из-за host WebGPU
`WebgpuSwapChainTexture`/SharedImage backing defect.

Следующий control gate начинается с read-only RPC discovery/read/status audit.
Audit фиксирует фактически опубликованные methods и DTO, но не вызывает
pause/step. Затем отдельно утверждается closed selected-tick reader: он может
восстановить только изолированную projection из verified checkpoint и
canonical forward history, явно сохраняя `exact`/`coarse`/`unknown`
resolution. Pause/step являются service commands владельцев, не входят в
Force wire и не активируются в UI либо live contour до завершения
`MF-103`/`MF-109` и отдельного verification gate.

Canonical documentation authority этого RPC contract находится не в
Inference-specific plan, а в отдельном общем MetaFor: Create MetaFor,
директория All Rules `create-metafor/rules/`. На проверенном published general
MetaFor `origin/main` revision `35c201f04d814ef5028bf1b8a0841185cb0e6da1`
там существует только
`create-metafor/rules/metafor.md` с правилами authoring `meta.ts`; RPC rule либо
соответствующего section нет. Целевой missing slot —
`create-metafor/rules/rpc.md`. До его появления этот plan фиксирует только
Inference evidence и dependency, но не становится вторым владельцем RPC law.
Создание canonical rule и регистрация его в `docs/README.md` общего MetaFor
выполняются отдельным executor в том репозитории.

## 16. Как обновлять план

- Новый обязательный закон сначала фиксируется у domain owner.
- TODO хранит порядок и evidence, plan — архитектурные законы.
- `GATE` используется только для реального owner decision, а не для каждого
  обычного patch внутри уже выданной capability.
- Не удалять обнаруженное ограничение без нового owner decision.
- Не считать source write доказательством materialization.
- Не считать materialization доказательством всех будущих consequences.
- Не заявлять runtime/cold proof без фактической проверки полного пути.

## 17. Что этим решением superseded

Следующие положения предыдущего варианта больше не являются законами первого
среза:

- mandatory human approval каждого structural patch;
- `trusted local authoring identity` как единственный рабочий actor;
- `pending/active` Meta heads как prerequisite;
- full source saga и transactional outbox как prerequisite;
- Force v2 journal/ACK/replay как prerequisite Monad patch;
- full VCS graph/push как обязательная функция Dark Monad первого slice;
- root/internal Create MetaFor topology;
- nested Meta addresses;
- новый минимальный Monad package generator;
- Лада как центральный authoring example;
- вечный запрет внутренней структурной эволюции.

Сохраняются:

- `meta.ts` как canonical authored source;
- Dark Monad как владелец Meta/package/source/TS/Process service operations;
- Dark Force как единственный Particle ingress/history/relay внутри Dark;
- MetaJSON как generated semantic projection;
- history и patches отдельно от snapshots;
- JSON Patch/JSON Pointer laws;
- Mass bytes и Energy objects вне MetaJSON;
- одна Particle на изменённую entity при runtime transport;
- no hot reload;
- прямые writes в чужие Stores запрещены.
