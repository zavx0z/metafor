# MetaJSON, Monad и Force: живой архитектурный план

Статус: consolidated owner-направление и living plan утверждены owner в Codex
task `019f9b10-44b2-7ab2-9ae8-e831d4f9ccea`; `MF-000` и контрактный срез
`MF-010`, восстановление Create MetaFor `MF-011`, migration gate `MF-012` и
offline source split `MF-013` завершены. Шесть Meta находятся в независимых
flat peer repositories; live contour, cleanup и cold cut не затрагивались.
Следующий runtime этап остаётся отдельным owner-approved cold gate `MF-014`.

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
→ отправить patch через Monad
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

Короткий закон:

```text
Monad изменяет возможное устройство мира.
Force причинно проводит жизнь уже принятого устройства.
```

Структурная Monad operation может после materialization породить одну или
несколько разрешённых Particles. Каждая изменённая entity по-прежнему
передаётся отдельным `ForceMessage` с одной `Particle`; это wire law, а не
формат структурного patch.

## 3. Источники истины и наблюдаемость

| Артефакт | Владелец смысла | Значение |
| --- | --- | --- |
| `meta.ts` | Meta package | каноническое human-authored описание |
| Create MetaFor templates | Create MetaFor | законная исходная структура нового Meta package |
| MetaJSON `MetaDocument` | DSL → Dark | детерминированная семантическая проекция одной Meta |
| MetaJSON `MetaProjection` | владелец projection RPC | составная lazy read-model для Codex, AI и Bulk |
| Boundary Store | Boundary | канонический текущий materialized мир |
| Domain Stores | соответствующий домен | локальные projections и живые ресурсы |
| Operational journal | Monad operation service | append-only исход и фазы структурных operations |
| Particle history | соответствующий runtime/history service | наблюдаемая причинная runtime-история |
| Mass bytes/results | Energy/Mass owner | данные и результаты, читаемые отдельным разрешённым API |

`meta.ts` остаётся каноническим source. MetaJSON генерируется из него и не
редактируется как второй source of truth.

MetaJSON snapshot не содержит:

- historical data;
- JSON Patch history;
- Mass bytes;
- живые Energy objects;
- каноническую runtime authority Boundary;
- generated executable source в compact projection по умолчанию.

History, operation outcomes, Mass results и JSON Patch передаются отдельными
форматами/API. Чтение этих данных не даёт права напрямую писать их Stores.

Полная система контроля версий не входит в первый срез. В нём нет branches,
merges, generic rollback, push workflow или отдельной модели source versions.
Допустимы только:

- serialized structural operations;
- content digest/CAS текущего файла как guard конкурентной записи;
- atomic filesystem writes;
- append-only operational journal.

Initial Git repository и `Initial commit`, выполняемые Create MetaFor, остаются
bootstrap-поведением template creator. Monad не развивает это в VCS subsystem.

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

## 5. MetaJSON и nested projections

### 5.1 MetaDocument

Один `MetaDocument` описывает ровно одну Meta и используется на границе
`MetaDSL → Dark`.

```ts
type Digest = `sha256:${string}`
type JSONPointer = "" | `/${string}`

interface MetaDocumentV1 {
  schema: "metafor/meta-document/v1"
  meta: string
  revision: Digest
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

Законы:

- Mass declaration содержит `format`, `label`, `description`; `mime` отсутствует;
- одна загружаемая единица — одна Meta;
- declaration представлена template;
- runtime Atom представлены sparse instance projections на template;
- nested JSON задаёт structural paths;
- точные ссылки и JSON Patch используют JSON Pointer;
- JSONPath используется только для выбора частичной projection;
- рёбра находятся у ближайшего общего предка endpoints;
- edges адресуются occurrence ports, а не `contract/fields`;
- незагруженная внешняя Meta представлена `$ref` и минимальным контрактом;
- history и patches не входят в snapshot.

Revision документа вычисляется детерминированно:

```text
revision = SHA-256(UTF-8(JCS(MetaDocument без revision)))
```

Это content digest и CAS guard, а не VCS revision graph.

`templateRevision` instance projection равен `revision` соответствующего
`MetaDocument`.

### 5.2 MetaProjection

`MetaProjection` — составная lazy read-model для Codex, AI и Bulk. Она может
вложенно раскрывать child templates и child instances, оставляя `$ref` на
нераскрытых ветвях.

Partial projection сохраняет nested structure и не превращается в плоский
`matches[path,value]`.

Правила:

- selector определяет раскрываемые branches;
- раскрытый child содержит template и запрошенные sparse instances;
- нераскрытый child сохраняет `$ref`, identity и минимальный contract;
- occurrence port принадлежит конкретному появлению endpoint в Matter graph;
- crossing edge сохраняется boundary stub на каждой видимой стороне;
- relative JSON Pointer считается от ближайшего общего предка;
- `position` присутствует только там, где порядок семантически значим;
- compact projection не содержит source modules, Git details и executable
  source по умолчанию.

### 5.3 Sparse instance completeness

Для каждого раскрытого instance:

- `complete: true` означает, что перечислены все materialized rows template;
- иначе `omitted` точно описывает невыданные branches/fields;
- materialized shared Field имеет один source row, остальные occurrences
  ссылаются на него через JSON Pointer alias;
- `missing` означает отсутствие materialized row;
- inherited `default` вычисляется из template и не считается записанным value;
- explicit value — реально materialized row, даже если он равен default.

Полная sparse instance projection имеет вычислимую revision:

```text
instanceRevision =
  SHA-256(UTF-8(JCS({
    templateRevision,
    boundaryRevision,
    occurrence,
    values,
    aliases
  })))
```

Здесь `values` содержит только materialized rows, а `aliases` — canonical
shared-source pointers. `missing` и inherited defaults выводятся из отсутствия
row вместе с `templateRevision` и отдельно в hash не дублируются. Partial
projection переносит `instanceRevision` полной source instance и не вычисляет
новую revision из обрезанного selector result.

## 6. Итеративный read/observe contract

Codex должен уметь через объявленные RPC:

- запросить весь `MetaDocument`;
- запросить nested `MetaProjection` выбранных branches;
- запросить текущие runtime instance values с Boundary revision;
- запросить operational journal по operation/target/time;
- запросить particle history отдельно от structural history;
- запросить разрешённые Mass results без включения Mass bytes в MetaJSON;
- сравнить projection до/после operation;
- продолжить работу с новым наблюдением.

Projection RPC и history RPC read-only. Mass read проходит через Monad владельца
или объявленный Energy/Mass service; Codex не читает Boundary SQLite, domain
Store или files другого domain напрямую.

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
является общим. При передаче runtime consequences каждая entity всё равно
компилируется в отдельную Particle/ForceMessage.

### 7.2 Fast Monad validation

До filesystem write Monad синхронно проверяет:

1. JSON и runtime schema.
2. Canonical two-segment target address.
3. JSON Pointer и patch operation validity.
4. Base digest/CAS, если он передан.
5. Field, State, Transition, Process и Matter reference integrity.
6. Semantic constraints DSL.
7. Forbidden cycles и требуемые graph constraints.
8. Capability/policy вызывающего identity.
9. Round-trip способность поддерживаемого source adapter.

Validation rejection не меняет filesystem или живую Вселенную. Его точный
результат может быть записан в operational journal.

### 7.3 Write, materialize, observe

Целевой happy path:

```text
request
→ fast validation
→ atomic filesystem write
→ MetaFor execution/normalization
→ round-trip proof
→ immediate materialization into the living Universe
→ allowed Force particles/consequences
→ append exact outcome
→ reread projection/history/Mass result
```

Update одного source выполняется через same-directory temporary file,
flush/close и atomic rename. Create materializes полный предварительно
валидированный directory set через отдельный staging target и atomic namespace
publication, после чего выполняет остальные объявленные Create MetaFor
bootstrap steps.

Первый срез не требует `pending/active` Meta heads, transactional outbox,
source publication saga или Force v2 receipt protocol.

Если filesystem write успешен, а execution/materialization не удались:

- source не откатывается автоматически;
- journal фиксирует `written_materialization_failed`;
- entry содержит phase, error и digests;
- retry использует тот же `operationId`;
- reconcile перечитывает source, повторно валидирует его и либо продолжает
  materialization, либо возвращает точный conflict/error.

### 7.4 Operational journal

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

Journal append-only и достаточен для ответа:

- какой patch был принят;
- что проверено;
- был ли записан filesystem;
- была ли structure materialized;
- почему operation остановилась;
- можно ли повторить или reconcile.

Это не Force Journal, не MetaJSON snapshot и не VCS history. Текущий
`DarkHistory` хранит particle history и сам по себе не покрывает structural
operation lifecycle.

## 8. Creation и update — единый закон

Create и update используют один patch/validation/materialization contract.
Create отличается только законным начальным template и отсутствием target.

Точный create flow:

```text
Create MetaFor template
→ Monad validation(template)
→ target patch applied to validated template
→ Monad validation(result)
→ filesystem write/materialization
→ MetaFor execution/normalization
→ round-trip proof
→ apply to Universe
→ append operation outcome
```

Create MetaFor template является законным, но семантически пустым стартом.
Target patch придаёт ему требуемый смысл.

Monad:

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
| Monad | projections, validation, structural patch, atomic source write, execution/round-trip orchestration, retry/reconcile |
| Dark | DSL loading/normalization и участие в текущей structural materialization path |
| Force | runtime causal transport событий и consequences |
| Boundary | канонический materialized мир и runtime instance values |
| Matrix | States, Transitions, Conditions и их runtime evaluation |
| Energy | Processes, Mass handles/results и живые resources |
| Bulk | manifestation и projection/layout, не source authority |
| Operational journal | исход structural operations |

Ни Monad, ни Codex не пишут напрямую в Boundary/Matrix/Energy/Bulk Stores.
Dark не читает Boundary SQLite напрямую. Mass bytes не проходят через MetaJSON.

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
получить capability-scoped возможность изменять собственную branch projection.
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
- append-only operation outcome;
- reread MetaProjection, runtime instance и history;
- retry/reconcile для post-write materialization failure;
- без Git branch/merge/push, pending/active Store, Force v2, hot reload и
  generic rollback.

Acceptance:

1. Dry validation не пишет filesystem и не меняет Universe.
2. Invalid JSON/schema/reference/cycle отклоняется до write.
3. Stale base digest отклоняется до write.
4. Atomic write не оставляет partial target.
5. Успешный source немедленно materialize в Boundary.
6. Разрешённые runtime Particles проходят существующим Force channel.
7. Journal точно различает validation, write и materialization outcomes.
8. После post-write failure retry/reconcile не выполняет silent overwrite.
9. Reread показывает Field declaration и `missing` instance row.
10. Повтор той же operation дедуплицируется по `operationId`.
11. Codex может прочитать outcome и продолжить следующий iteration.
12. Никаких изменений Лады, Cluster topology или runtime lifecycle вне fixture.

## 12. Отложено после первого среза

Отдельными будущими инициативами остаются:

- full VCS: branches, merges, rollback, push и source version graph;
- `pending/active` Meta heads и сложная publication saga;
- durable Force v2 journal, ACK/NACK/resume и replay;
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
| US-01 | Codex читает полную MetaDocument одной Meta |
| US-02 | Codex читает nested projection только выбранных branches |
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
8. Реализовать MetaDocument и nested MetaProjection RPC.
9. Добавить read-only operation history и Mass-result observation.
10. Реализовать structural operation schema и fast Monad validation.
11. Реализовать atomic update adapter и operational journal.
12. Немедленно materialize через существующие Dark/Force/Boundary paths.
13. Реализовать retry/reconcile.
14. Принять первый Field vertical slice.
15. Интегрировать нематериализованный Create MetaFor template path для create.
16. Только затем выбирать отложенные Force/VCS/agent capabilities.

## 15. Оставшиеся owner decisions

До соответствующих implementation items нужны только следующие решения:

1. CLI owner input для arbitrary non-Cluster `--dir`.
2. GitHub remote names и provenance/history policy при физическом split
   существующего Inference repository.
3. Форма общего `lada-chat` / `lada-chat-send` Energy/send contract.
4. Cold migration policy существующих runtime Stores: clean derived-store cut
   либо явное удаление старых WIMP identities.
5. Локальная capability identity/policy первого Codex→Monad write endpoint до
   его открытия за пределы trusted development contour.

Force v2, full VCS и права внутренних Runtime Agents остаются будущими
решениями и не блокируют текущую последовательность.

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
- Dark как владелец Git/source version control;
- root/internal Create MetaFor topology;
- nested Meta addresses;
- новый минимальный Monad package generator;
- Лада как центральный authoring example;
- вечный запрет внутренней структурной эволюции.

Сохраняются:

- `meta.ts` как canonical authored source;
- MetaJSON как generated semantic projection;
- history и patches отдельно от snapshots;
- JSON Patch/JSON Pointer laws;
- Mass bytes и Energy objects вне MetaJSON;
- одна Particle на изменённую entity при runtime transport;
- no hot reload;
- прямые writes в чужие Stores запрещены.
