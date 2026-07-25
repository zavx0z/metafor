# MetaJSON, Monad и Force: живой архитектурный план

Статус: направление подтверждено тремя независимыми read-only ревью; перед
реализацией остаются явно перечисленные owner gates.

Этот файл — изменяемый рабочий план. Он не заменяет документы-владельцы из
`docs/README.md`. После утверждения нового закона он сначала переносится в
соответствующий domain document, затем в public types, код и тесты.

Исполнимый backlog находится в
[`task/metajson-monad-force-todo.md`](metajson-monad-force-todo.md).

## 1. Утверждённое онтологическое основание

> Monad — законы мироздания.

Monad создаёт новое, описывает возможное, преобразует intent в структуру,
работает с cluster, Meta, TypeScript, Processes, собственными Stores и
recovery, выполняет вычисления, строит план и оформляет его в Particles.

> Force — законы существования.

Force определяет, как изменение становится причинным событием Вселенной, какой
Particle его выражает, куда он распространяется, как сохраняются source
authority и порядок и какие домены обязаны его воспринять.

Короткий закон:

```text
Monad создаёт и изменяет устройство возможного мира.
Force причинно вводит принятое изменение в существующую Вселенную.
```

Monad имеет право записывать сервисные ресурсы собственного домена. Она не
имеет права невидимо менять факт существующей Вселенной или напрямую писать
канонический Store другого домена.

Одна изменённая entity передаётся одним `ForceMessage` с одной `Particle`.
Один план может содержать одну или несколько причинно упорядоченных Particles.

## 2. Режимы взаимодействия

### 2.1 Детерминированное изменение мира

```text
User / внешний Agent
→ Force ingress
→ разрешённый Gluon или Higgs
→ Boundary canonical commit
→ доменные consequences
```

Прямой внешний Inflaton запрещён в целевой модели.

### 2.2 Изменение устройства мира

```text
User / Authoring AI
→ Dark Monad RPC
→ Meta/source/Store
→ minimal-impact plan
→ Inflaton(s)
→ Dark Force
→ Boundary canonical commit
→ доменные consequences
```

Runtime Agent Atom не вызывает Force, Monad, Git или source-writing API
напрямую. Он изменяет предметные Fields окружающего Meta Tool/Service Atom.
Process этого Atom может скрыто обратиться к Dark Monad.

Автономная структурная мутация Runtime Agent не входит в первый срез. Сначала
разрешена только trusted local authoring identity.

## 3. Иерархия истин

Разные артефакты владеют разными фактами и не замещают друг друга:

| Артефакт | Владелец | Значение |
| --- | --- | --- |
| `meta.ts`, Git/npm/local source | Dark Monad | human-authored intent и `SourceRevision` |
| Process/action source set | Dark Monad | исполняемый source и `SourceSetRevision` |
| MetaJSON | Dark Monad Store | нормализованная декларативная operational projection |
| `active` Meta head | Dark Monad Store | Meta revision, подтверждённая Boundary commit |
| `pending` Meta head | Dark Monad Store | подготовленная/опубликованная, но ещё не подтверждённая структура |
| Boundary DB | Boundary Force | канонический текущий мир и `BoundaryRevision` |
| Force Journal | Dark Force | принятые причинные события, delivery status и `ForceSequence` |
| Matrix/Energy/Bulk Store | соответствующий домен | локальная проекция или сервисный ресурс |
| Authoring/Planner/Diagnostic view | derived | read-only агрегация с вектором revisions |

`meta.ts` остаётся каноническим human-authored представлением. MetaJSON не
редактируется как второй authored source. При `initialize(metaJSON)` входной
JSON является intent: Monad генерирует source, повторно выполняет MetaFor,
нормализует результат и только round-tripped документ может стать `pending`.

Dark Store не хранит канонические Atom values и не восстанавливает Boundary из
собственной runtime-копии. Runtime sections всегда являются derived Boundary
projection с её revision.

## 4. Целевая процессная модель

После миграции отдельного package/process `force` нет. Остаются пять процессов:

```text
Dark
Boundary
Matrix
Energy
Bulk
```

### 4.1 Dark

```text
Dark
├── Monad
│   ├── MonadRouter
│   ├── cluster registry
│   ├── filesystem/source adapter
│   ├── MetaFor loader
│   ├── MetaJSON validator
│   ├── active/pending Meta Store
│   ├── Meta/TypeScript/Process generators
│   ├── impact analyzer
│   ├── mutation planner
│   ├── transactional outbox
│   └── recovery/reconcile
│
└── Force
    ├── external ingress
    ├── local Dark authoritative adapter
    ├── remote domain channels
    ├── source × Particle authority
    ├── append journal
    ├── routing
    ├── delivery control
    ├── replay/deduplication
    └── lifecycle/fail-stop
```

Dark Force является корневым transport/relay, но не всей Force. Boundary,
Matrix, Energy и Bulk сохраняют собственные локальные Force laws.

### 4.2 Остальные домены

| Домен | Monad | Force |
| --- | --- | --- |
| Boundary | запросы, projections, aggregation, recovery | единственный commit канонического мира |
| Matrix | расчёты и объяснение State/Superposition | применение переходов и причинная обработка |
| Energy | Mass catalog, resources, executions, recovery | разрешённый Process и его consequences |
| Bulk | подготовка projection/layout | проявление committed изменений |

Междоменное чтение выполняется через Monad владельца. Dark не читает Boundary
SQLite или Store напрямую.

## 5. MetaJSON и проекции

### 5.1 MetaDocument

Один `MetaDocument` описывает ровно одну Meta:

```ts
type MetaRevision = `sha256:${string}`
type SourceRevision = `sha256:${string}`
type SourceSetRevision = `sha256:${string}`
type BoundaryRevision = `${bigint}`
type ForceSequence = `${bigint}`
type JSONPointer = "" | `/${string}`

interface MetaDocumentV1 {
  schema: "metafor/meta-document/v1"
  meta: string
  metaRevision: MetaRevision
  name: string
  description?: string
  fields: Record<string, FieldDeclarationV1>
  superposition: SuperpositionV1
  mass: Record<string, MassDeclarationV1>
  processes: ProcessDeclarationV1[]
  reactions: ReactionDeclarationV1[]
  matter: MatterNodeV1[]
}
```

Обязательные законы:

- Mass declaration содержит `format`, `label`, `description`; `mime` отсутствует;
- Mass bytes и живые Energy-объекты отсутствуют;
- Bulk отсутствует в публичном MetaDocument;
- canonical Matter хранит только действующий `MatterBindingValue`;
- derived semantic binding не входит в hash и не патчится;
- nested JSON задаёт structural path;
- точные ссылки и JSON Patch используют JSON Pointer;
- JSONPath допустим только в selector;
- незагруженные ветви остаются `$ref`;
- history и patches отсутствуют в snapshot;
- generated executable descriptors входят в полный MetaDocument;
- compact projection не возвращает executable source по умолчанию;
- новые persisted UUID AtomKey/ValueKey не вводятся.

```text
MetaRevision =
  SHA-256(UTF-8(JCS(MetaDocument без metaRevision)))
```

`SourceSetRevision` защищает исполняемый набор файлов отдельно:

```text
SourceSetRevision =
  SHA-256(JCS(sorted map: relativePath → SourceRevision))
```

Изменение action/process module может не менять MetaRevision, но обязано менять
SourceSetRevision и `restartImpact`.

### 5.2 AuthoringProjection

Предназначена для User/Authoring AI:

- одна или несколько Meta;
- declarations и Matter;
- source references;
- полный semantic diff по явному compare;
- executable descriptors только по явному selector;
- nested expansion и `$ref`.

### 5.3 PlannerProjection

Предназначена для Runtime Agent Atom:

- текущий State;
- значимые Fields;
- релевантные States, transitions и Conditions;
- назначения окружающих Tool/Device/Service Atoms;
- доступные предметные изменения;
- nested child instances/templates;
- materialized значения напрямую в `values`;
- действительно отсутствующие rows один раз в `missing`;
- shared materialized Value через JSON Pointer в `aliases`;
- `complete: true` либо `omitted`.

Planner не содержит module paths, wrapper source, Git, Monad routes, source API,
runtime lineage и default diagnostics.

### 5.4 Diagnostic projection

Debug selector может вернуть существующие `atom.id`, `valueId`,
`atom_field_source`, row status и default relation. Эти данные не входят в
compact Planner и не создают новую identity.

## 6. Revisions и identity

Не смешивать:

| Значение | Закон |
| --- | --- |
| `SourceRevision` | hash raw bytes одного файла |
| `SourceSetRevision` | hash набора source files |
| `MetaRevision` | hash нормализованной семантики одной Meta |
| `BoundaryRevision` | monotonic generation канонического Boundary Store |
| `ForceSequence` | append order одного Force Journal |
| `ChangeSetId` | content digest структурного изменения |
| `PlanRevision` | content digest вычисленного плана |

`ForceSequence` не является самой причинностью. Он задаёт устойчивый порядок
journal append. Причинность задают:

```text
causedBy   — непосредственный причинный предок;
causalRoot — общий корень/такт группы последствий;
observedAt — wall-clock telemetry, не порядок.
```

Текущий `Particle.ts` нельзя удалить без отдельной миграции всех потребителей.

Область `ForceSequence` в целевой модели — один `UniverseId` и один durable
Dark Force Journal. `ContourId` указывает причинный contour операции.

## 7. Authority matrix

| Actor | Разрешено | Запрещено |
| --- | --- | --- |
| trusted local User/Authoring AI | Dark Monad read/plan/apply; Gluon/Higgs ingress | прямой Inflaton; чужой Store |
| Runtime Agent Atom | предметные Field proposals окружающим Atoms | прямой Force/Monad/source/Git |
| Meta Tool Process | capability-scoped Dark Monad RPC | обход собственного State/Process |
| Dark Monad internal emitter | Inflaton с подготовленным ChangeSet | прямой Boundary write |
| Boundary Force | canonical commit и consequences | authoring/source decisions |
| Matrix/Energy/Bulk Force | локальная projection/application | изменение Boundary Store |

Force не принимает из payload `by`, `sequence`, `causedBy`, `causalRoot`,
destinations или audit identity. Причинный emitter назначается из доверенной
connection/internal identity. Actor/audit identity хранится отдельно и не
подменяет `by`.

## 8. ChangeSet и plan

```ts
interface StructuralChangeSetV1 {
  schema: "metafor/change-set/v1"
  changeSetId: `sha256:${string}`
  universe: string
  contour: string
  actor: AuditIdentityV1
  base: {
    metas: Record<string, MetaRevision>
    sources: Record<string, SourceRevision>
    sourceSet?: SourceSetRevision
    memberships?: Record<string, MetaRevision>
    /** Только для операции с доказанной live-world precondition. */
    boundary?: BoundaryRevision
  }
  targetDigest: `sha256:${string}`
  operations: EntityOperationV1[]
  idempotencyKey: string
}
```

`EntityOperationV1` является discriminated union конкретных declaration
operations. Универсальный `part/path/value` не считается достаточной
public-validation границей первого среза.

Каждая operation компилируется в отдельную Particle и отдельный ForceMessage.
Все сообщения несут `changeSetId`, `index`, `count` и устойчивый key:

```text
changeSetId + ":" + index
```

Для структурного ChangeSet, каноническим владельцем которого является Boundary,
целевая модель предполагает staging всех entity operations и один SQLite
transaction commit. Это не multi-particle wire message и не распределённая
транзакция. Derived domains сходятся вперёд после Boundary commit.

Первый вертикальный срез содержит одну entity operation и не зависит от
multi-entity staging.

Глобальная `BoundaryRevision` не является обязательным guard каждой
структурной операции. Простое добавление независимого Field проверяет source,
Meta revision и membership редактируемой Meta. Boundary generation входит в
commit receipt и snapshot; как base guard она используется только при
доказанной live-world precondition.

## 9. State machine операции

```text
planned
→ staged
→ source_committed
→ force_accepted
→ canonical_committed
→ converged
```

Дополнительные терминальные/ожидающие состояния:

```text
rejected
blocked
```

Точный смысл:

- `planned`: pure result; записи отсутствуют;
- `staged`: pending Meta, source manifest и outbox durable, active не изменён;
- `source_committed`: authored source опубликован, мир ещё может быть старым;
- `force_accepted`: событие durably присутствует в Force Journal;
- `canonical_committed`: Boundary атомарно зафиксировал ChangeSet; изменение
  стало фактом канонического мира;
- `converged`: обязательные derived domain projections применили объявленный
  causal closure;
- `rejected`: операция признана недопустимой до публикации source;
- `blocked`: recovery требует operator decision; автоматическая перезапись
  source или откат мира запрещены.

После `canonical_committed` распределённого rollback нет: только fail-stop и
forward recovery.

После `source_committed` невосстановимый отказ не переводит операцию в
`rejected`: она становится `blocked`. Retryable failure сохраняет текущее
ожидающее состояние. Outbox, записанный в `staged`, недоступен для drain и
становится eligible только после durable `source_committed`.

Синхронный `apply` первого среза возвращает успех на
`canonical_committed`. Он не заявляет `converged`.

## 10. Force delivery v2 — предлагаемый технический закон

Это обязательный owner gate до реализации journal/replay.

`ForceMessage` по-прежнему содержит ровно одну Particle. Delivery control не
является Particle и не является событием мира:

```ts
type ForceFrameV2 =
  | {kind: "particle"; event: AcceptedForceEventV2}
  | {
      kind: "ack"
      universe: string
      sequence: ForceSequence
      boundaryCommit?: BoundaryCommitReceiptV1
    }
  | {kind: "nack"; universe: string; sequence: ForceSequence; error: string}
  | {kind: "resume"; universe: string; throughSequence: ForceSequence}

interface BoundaryCommitReceiptV1 {
  sequence: ForceSequence
  changeSetId: string
  metaRevision: MetaRevision
  boundaryRevision: BoundaryRevision
}
```

Законы:

- у каждого домена ровно один authoritative runtime consumer;
- browser/observer sockets не участвуют в commit receipt;
- routing вычисляется при journal append;
- event, рассчитанные authoritative destinations и idempotency index
  сохраняются одной транзакцией;
- replay использует сохранённые destinations и не пересчитывает старое событие
  по новой routing law;
- доставка authoritative consumer идёт в relevant sequence order;
- destination atomically фиксирует local projection и delivery cursor;
- Boundary в одной SQLite transaction фиксирует canonical mutation, delivery
  cursor, monotonic BoundaryRevision и commit receipt; no-op revision не
  увеличивает;
- Boundary ACK содержит commit receipt, по которому Dark продвигает
  `pending → active`;
- derived domain без durable inbox рождается из projection с
  `throughSequence`, затем получает replay только более новых events;
- ACK подтверждает локальный projection commit, но не внешний Process side
  effect и не browser render;
- NACK или потеря обязательного channel закрывает lifecycle gate;
- recovery происходит только новым полным contour lifecycle;
- reconnect не оживляет runtime из `error`.

Event считается напрямую применённым после ACK всех его declared
destinations. `converged` относится к ChangeSet/causal root и требует отдельного
closure/barrier закона; первый срез его не реализует.

## 11. Dark Store и source saga

Минимальная durable форма:

```ts
interface DarkMetaStoreRecordV1 {
  meta: string
  active: {
    document: MetaDocumentV1
    sourceSet: SourceSetRevision
    boundaryRevision: BoundaryRevision
  } | null
  pending: {
    document: MetaDocumentV1
    sourceSet: SourceSetRevision
    changeSetId: string
    state: "staged" | "source_committed" | "force_accepted" | "blocked"
  } | null
}
```

`DarkHistory` остаётся очищаемой диагностикой и не используется как Force
Journal или recovery authority.

### 11.1 Apply

```text
1. Проверить source/meta/boundary guards.
2. Применить JSON Patch в памяти.
3. Валидировать MetaDocument.
4. Сгенерировать source в staged overlay.
5. Выполнить/нормализовать generated source и доказать round-trip.
6. Подготовить recoverable source manifest.
7. Транзакционно записать pending + manifest + ordered outbox.
8. Опубликовать source files.
9. Пометить source_committed.
10. Разрешить drain outbox и передать каждую Particle Dark Force с persistent
    idempotency key.
11. Получить Force acceptance и Boundary canonical commit.
12. Проверить Boundary commit receipt и продвинуть pending → active.
13. Derived domains выполняют forward convergence.
```

Git commit, contour restart и hot reload не являются скрытыми шагами.

### 11.2 Recovery cuts

| Cut | Recovery |
| --- | --- |
| `staged`, source старый | проверить guards, повторить publish либо blocked |
| часть multi-file manifest опубликована | продолжить только при точном manifest; иначе blocked |
| source новый, Store ещё staged | доказать target revisions и отметить source_committed |
| source committed, outbox не принят | повторить по idempotency keys |
| Force accepted, Boundary не commit | handshake/replay, active не продвигать |
| Boundary commit, Dark active старый | сверить `changeSetId/metaRevision/boundaryRevision`, продвинуть active |
| source committed, Boundary окончательно отклонил | blocked; source не откатывать автоматически |
| source drift | blocked; ничего не перетирать |

Recovery не перечитывает cluster для обычного продолжения. Явный
`reconcile/sync` обнаруживает внешние изменения source во время простоя.

## 12. Minimal-impact planning

Проверка чужих зависимостей и live topology выполняется только при доказанной
необходимости и только через Monad владельца:

| Изменение | Reads |
| --- | --- |
| добавить независимое Field | редактируемая Meta |
| изменить label/description | редактируемая Meta |
| rename/delete referenced Field | declaration graph и bindings |
| удалить child Meta | reverse Matter refs; Boundary topology при live impact |
| изменить Process reads/writes | Field/Process graph |
| изменить executable module | source set; execution projection при live impact |

Если binding analysis неизвестен, planner возвращает `analysis: "unknown"` и
не придумывает semantic relation.

## 13. Инициализация

### 13.1 `initialize(src)`

```text
canonical src
→ cluster read
→ MetaFor execution
→ MetaDocument validation
→ lazy/BFS child refs
→ compare with active/pending Store
→ minimal plan
→ optional apply
```

No-op initialize не пишет source/Store/journal/Boundary и не испускает Particle.

### 13.2 `initialize(metaJSON)`

```text
validate intent JSON
→ generate canonical fluent source
→ generate supported Process modules
→ staged typecheck
→ execute generated MetaFor
→ round-trip MetaDocument
→ plan/apply
```

Неизменяемый npm source не переписывается; требуется fork/new version.
Ambiguous dynamic TypeScript отклоняется source adapter.

## 14. Первый вертикальный срез

Перед новым срезом выполняется behavior-preserving перенос standalone Force
kernel под Dark с compatibility host. Нельзя одновременно менять process
ownership, routing и wire semantics.

Функциональный срез:

```text
одна fixture Meta
→ MetaDocument
→ dry-run add optional scalar Field без default
→ guarded write одного meta.ts
→ pending/active Dark Store
→ durable outbox
→ один исходный Field Inflaton
→ Dark Force append journal
→ Boundary canonical commit
→ Authoring + Planner reread
```

Границы:

- одна существующая Meta и один существующий Atom;
- одно optional scalar Field без default;
- один `meta.ts`;
- одна исходная Inflaton; derived consequences не ограничиваются;
- trusted local authoring identity;
- без Process generation, package creation, Matter deletion и Runtime Agent autonomy;
- без Git commit, restart, hot reload и multi-file apply;
- срез доказывает `canonical_committed`, но не заявляет `converged`;
- это fixture/integration contour, а не сокращённый production Universe.

Acceptance:

1. Повторное чтение даёт byte-identical normalized MetaDocument и MetaRevision.
2. Dry-run не меняет source, Store, journal или Boundary.
3. Planner читает только редактируемую Meta; topology read отсутствует.
4. Stale Source/Meta guard отклоняется без записи.
5. После apply source, active Store и Boundary согласованы по revisions.
6. Journal содержит ровно одну исходную Field Inflaton с обязательным key.
7. Boundary содержит новую declaration; существующий Atom сохраняет identity.
8. Planner показывает новое Field в `missing`.
9. Повторный apply является no-op и не создаёт вторую Particle.
10. Unsupported/dynamic AST не переписывается.
11. Crash injection проверяет каждый durable cut.
12. Crash после Boundary commit восстанавливается вперёд без rollback.
13. Оператор может прочитать blocked plan и безопасно продолжить recovery.
14. Никаких commit, restart или hot reload.

## 15. User stories

| ID | История |
| --- | --- |
| US-01 | Authoring AI читает детерминированный MetaDocument |
| US-02 | User выполняет `initialize(src)` |
| US-03 | User передаёт MetaJSON intent для создания Meta |
| US-04 | Authoring AI dry-run/apply добавления независимого Field |
| US-05 | Planner строит multi-particle удаление связанной Meta |
| US-06 | Monad обновляет Process source и возвращает restart impact |
| US-07 | Runtime Agent меняет существующий Field через Gluon/Higgs |
| US-08 | Runtime Agent предлагает структуру через Meta Tool Atom |
| US-09 | Повторный apply дедуплицируется |
| US-10 | Stale source/template CAS не пишет данные |
| US-11 | Recovery продолжает операцию после каждого durable cut |
| US-12 | Явный reconcile обнаруживает source drift |
| US-13 | No-op initialize не испускает Particle |
| US-14 | Operator читает и возобновляет blocked plan |
| US-15 | Diagnostic projection доказывает shared Value lineage |

## 16. Миграционные этапы

1. Утвердить открытые owner gates и обновить domain documents.
2. Перенести Force kernel в `dark/force/*` с compatibility host и parity tests.
3. Ввести точный Dark birth: local adapter, ports/health и five-process launcher.
4. Удалить standalone Force entry/package после parity.
5. Ввести Force v2 types, authoritative consumers и control frames.
6. Добавить Journal append/idempotency без replay.
7. Добавить domain ACK/inbox либо cold projection `throughSequence`.
8. Включить replay/fail-stop recovery.
9. Ввести read-only MetaDocument, validators и revisions.
10. Ввести active/pending Dark Meta Store.
11. Ввести one-file source adapter, planner и outbox.
12. Реализовать первый Field vertical slice.
13. Добавить multi-entity Boundary staging.
14. Добавить полные Authoring/Planner projections.
15. Добавить package/process generation.
16. Добавить Meta Tool/Service Atoms.
17. Добавить explicit contour lifecycle Tool.

## 17. Owner gates

До реализации соответствующего блока требуется явное утверждение:

| Gate | Решение |
| --- | --- |
| G-01 | Force v2 control frames против отдельного delivery-control channel |
| G-02 | Точные ports/health и compatibility host во время слияния Force/Dark |
| G-03 | Authority × Particle matrix и trusted local authoring identity |
| G-04 | UniverseId/ContourId и область ForceSequence/idempotency |
| G-05 | Boundary multi-entity staging/atomicity |
| G-06 | SourceSetRevision и restart impact для Process modules |
| G-07 | Определение causal closure/barrier для будущего `converged` |
| G-08 | Права Runtime Agent на Meta Tool после authoring slice |
| G-09 | Точный MetaJSON v1 contract в Dark/Boundary owner documents |

## 18. Как обновлять план

- Не удалять обнаруженное ограничение без evidence или owner decision.
- Решение gate фиксировать здесь и в domain owner document.
- Исполнимый статус менять в TODO, а не в архитектурном narrative.
- После завершения этапа записывать проверенные acceptance evidence.
- Новый scope добавлять после текущего highest-priority ready item.
- Не считать прошлый partial result доказательством нового runtime path.

## 19. Независимое ревью

Три независимых read-only ревью дали один вердикт:
`APPROVE_WITH_REQUIRED_CHANGES`.

В этот план включены совпавшие обязательные изменения:

- active/pending Store heads;
- раздельные `force_accepted`, `canonical_committed`, `converged`;
- отдельный delivery-control contract;
- journal order отдельно от causality;
- Universe/Contour identity;
- обязательная idempotency на трёх границах;
- Process source-set revision;
- authority matrix;
- recovery cuts и forward-only recovery;
- первый срез заканчивается на Boundary canonical commit.
