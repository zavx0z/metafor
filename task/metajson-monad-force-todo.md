# MetaJSON, Monad и Force: приоритетный исполнимый TODO

Этот backlog исполняется по
[`task/metajson-monad-force-plan.md`](metajson-monad-force-plan.md).

## Правила

- Приоритет: `P0` выше `P1`, затем `P2` и так далее.
- Брать highest-priority item со статусом `READY`, у которого завершены все
  dependencies.
- `GATE` означает конкретное owner decision. Он не требуется перед каждым
  structural patch, если capability и policy уже утверждены.
- `WAITING` означает незавершённые dependencies.
- `BLOCKED` содержит фактическое препятствие и evidence.
- `IN_PROGRESS` содержит исполнителя/текущую Codex task.
- `DONE` содержит diff/commit, выполненные проверки и наблюдаемый результат.
- После `DONE` перевести в `READY` непосредственно зависимые items, у которых
  завершены dependencies и нет gate.
- Параллельно выполняются только независимые items.
- Plan/TODO не заменяют domain owner documents.
- До завершения `MF-000` implementation items не начинаются.

Статусы: `GATE`, `WAITING`, `BLOCKED`, `READY`, `IN_PROGRESS`, `DONE`.

## P0 — принять план и восстановить flat topology

### MF-000 — Совместно утвердить обновлённый living plan

- Status: `DONE`
- Dependencies: нет
- Evidence:
  - owner approval получен в Codex task `019f9b10-44b2-7ab2-9ae8-e831d4f9ccea`;
  - consolidated plan/TODO принят как основание последовательной реализации;
  - реализация начинается только с `MF-010`.
- Scope:
  - owner и coordinator перечитывают plan/TODO после documentation patch;
  - подтверждают, что consolidated owner decisions отражены без противоречий.
- Done when:
  - подтверждён продуктивный Codex↔Universe iteration loop;
  - Monad и Force разведены;
  - `pending/active` и Force v2 не являются prerequisites первого patch slice;
  - flat topology является первым implementation priority;
  - creation использует существующий Create MetaFor path;
  - оставшиеся решения перечислены отдельно.

### MF-010 — Зафиксировать flat topology в owner contracts

- Status: `DONE`
- Dependencies: `MF-000`
- Evidence:
  - owner documents и public comments фиксируют только
    `cluster/<owner>/<repository>` и `<owner>/<repository>`;
  - Dark и Matter/template validators отклоняют third segment до filesystem
    read/materialization;
  - `bun test pkg/template/node/test/meta/attr.src.test.ts dark/load.spec.ts`:
    22 pass, 0 fail;
  - `bun run typecheck`: pass;
  - независимый review выявил и после исправления не оставил расхождения
    `Meta/Matter/Monad references`;
  - `git diff --check`: pass;
  - commit `e208bc8c feat(topology): enforce flat peer meta addresses`.
- Owners: architecture, Dark, Matter/template, Meta package docs
- Law:
  - physical path `cluster/<owner>/<repository>`;
  - canonical address ровно `<owner>/<repository>`;
  - peer repository имеет собственный Git;
  - nesting и third segment запрещены;
  - composition выполняется Meta/Matter/Monad references.
- Acceptance:
  - domain documents и public comments согласованы;
  - strict validators имеют negative three-segment cases;
  - compatibility alias отсутствует;
  - `git diff --check`.

### MF-011 — Восстановить flat peer Create MetaFor

- Status: `DONE`
- Dependencies: `MF-010`
- Evidence:
  - archaeology `b10a4c0724bc2bf74596e65048178ebb22800486 →
    dd66370112ed0d443b04bcad0905b6ffb80ad2f8` локализовала root/internal
    experiment без побайтного отката новых улучшений;
  - CLI всегда создаёт `resolve(parentDirectory, repositoryName)` с identity
    только `owner/repository`;
  - CLI tests фактически доказали два flat peers, полный template, lockfile,
    отдельный `.git`, один `Initial commit` и чистый worktree каждого;
  - overwrite, nested creation и repository argument с slash отклоняются до
    target write;
  - `bun test create-metafor`: 32 pass, 0 fail, 169 expect;
  - `bun run --filter create-metafor build`: pass;
  - `bun run typecheck`: pass;
  - независимый read-only review: `PASS`;
  - `git diff --check`: pass;
  - commit `10f12ed8 feat(create-metafor): restore flat peer repositories`.
- Archaeology: baseline `b10a4c0724bc2bf74596e65048178ebb22800486`,
  experiment begins at `dd66370112ed0d443b04bcad0905b6ffb80ad2f8`.
- Scope:
  - удалить root/internal branching;
  - arbitrary flat parent + new peer target;
  - полный актуальный template set;
  - `bun install`;
  - отдельный Git + `Initial commit`;
  - owner/repository npm identity и HTML source;
  - no nested creation и no workspace child template.
- Acceptance:
  - два peers создаются рядом;
  - оба имеют полный template, lockfile, `.git` и один initial commit;
  - target overwrite и nested repository creation отклоняются;
  - current DSL/Mass/Energy/type improvements сохранены;
  - `bun test create-metafor`;
  - `bun run --filter create-metafor build`;
  - `bun run typecheck`.

### MF-012 — Решить execution details миграции Inference

- Status: `DONE`
- Dependencies: `MF-011`
- Evidence:
  - owner approval получен в Codex task
    `019f9b10-44b2-7ab2-9ae8-e831d4f9ccea`;
  - `zavx0z/inference` сохраняется существующим composition/load root и
    независимым flat repository;
  - пять child Meta создаются с нуля через Create MetaFor как peers
    `lada`, `lada-auth`, `lada-chat`, `lada-chat-send`, `lada-model`;
  - новые peers получают только template `Initial commit`, без переноса
    Inference Git history и без push;
  - Лада сохраняет Fields, States, Processes, Matter, Mass bindings, поведение
    и acceptance semantics; меняются только topology/package references;
  - semantic redesign Chat/Send boundary требует остановки и нового owner
    decision;
  - old nested packages, Store/Mass и live contour на `MF-013` не удаляются и
    не изменяются;
  - migration является offline evolution; fresh Lada cold start выполняется
    позднее после завершения approved plan.

### MF-013 — Разделить Inference на peer repositories

- Status: `DONE`
- Dependencies: `MF-012`
- Evidence:
  - пять target directories созданы исключительно прямыми Create MetaFor
    invocations с `--dir cluster/zavx0z --lang en`;
  - каждый новый peer имеет полный template, lockfile, отдельный Git,
    template `Initial commit` и отдельный verified migration commit;
  - migration commits:
    - `zavx0z/lada`: `0d46d2a feat: migrate Lada agent package`;
    - `zavx0z/lada-auth`: `357ffc1 feat: migrate Lada auth package`;
    - `zavx0z/lada-chat`: `5478b76 feat: migrate Lada chat package`;
    - `zavx0z/lada-chat-send`: `a795503 feat: migrate Lada chat send package`;
    - `zavx0z/lada-model`: `e2da1a8 feat: migrate Lada model package`;
    - `zavx0z/inference`: `ea92008 refactor: compose flat Lada peer packages`;
  - Chat/Send boundary перенесён механически через стабильный package subpath
    export; action semantics не менялись;
  - normalized Lada `meta.ts` совпадает с исходным после замены ровно трёх
    `src`; `consider-message.ts` совпадает побайтно, greeting меняет только
    import boundary;
  - peer tests: Lada 3, Auth 7, Chat 6, Chat Send 2, Model 4 — все pass;
  - все пять peer builds и strict typechecks pass;
  - Inference composition suite: 20 pass, typecheck/build pass;
  - core `bun run typecheck`: pass;
  - production source active topology не содержит three-segment `src` или
    cross-repository relative imports;
  - все шесть repositories clean; старые nested directories сохранены;
  - live contour, runtime processes, Store/Mass, remotes и push не изменялись.
- Scope:
  - не менять product runtime сверх необходимого source boundary split;
  - каждый новый peer target directory создаётся исключительно вызовом
    восстановленного Create MetaFor CLI и начинается с полного template;
  - authored content переносится только после успешного canonical creation;
  - перенести Meta/actions/tests по ownership;
  - удалить cross-repository relative imports;
  - обновить Matter references на двухсегментные;
  - сохранить root Mass declarations и relationships.
- Acceptance:
  - шесть независимых Git repositories;
  - active topology не содержит nested Meta repository/address;
  - unit checks каждого peer проходят отдельно;
  - root composition test использует logical addresses;
  - старые nested packages сохранены до отдельного cleanup/cold-cut item;
  - live contour, Store/Mass и процессы не изменены.

### MF-014 — Доказать strict resolver и cold materialization

- Status: `DONE`
- Dependencies: `MF-013`
- Current task: Codex task `019f9b10-44b2-7ab2-9ae8-e831d4f9ccea`
- Authority:
  - owner approved pre-cut evidence/backup, controlled full contour stop/start,
    fresh Lada launch, acceptance and recoverable rollback;
  - no hot reload, cleanup, source evidence deletion, remote creation or push.
- Evidence:
  - canonical runtime ownership был проверен по launcher и шести child
    processes до stop; unrelated/archive processes не затрагивались;
  - recoverable snapshot
    `.metafor/backups/mf014-flat-peers-20260725T230711Z` содержит integrity-ok
    SQLite, byte-identical Dark history/Mass и verified Git bundles core плюс
    шести Meta repositories;
  - full cold birth прошёл: Force, Boundary, Dark, Energy, Bulk и Matrix
    ответили `200`, Force вошёл в `running`, Matrix использовал GPU backend;
  - `zavx0z/inference` прочитал все пять flat peer references, но Boundary
    сохранил шесть legacy WIMP declarations и добавил пять flat declarations:
    получилось 11 WIMP вместо ожидаемых 6;
  - первый Auth process не получил ожидаемый Mass handle и завершился
    технической ошибкой; chat acceptance поэтому не выполнялся;
  - failed candidate сохранён отдельно без message/Mass disclosure;
  - candidate остановлен, pre-cut SQLite/Dark history/Mass восстановлены
    побайтно; rollback contour снова отвечает `200` на всех шести health
    endpoints и содержит исходные 6 WIMP/6 Atom и прежние states;
  - source repositories остались clean, cleanup, push и hot reload не
    выполнялись.
  - owner-approved clean retry сначала materialize 177 canonical Dark
    declarations офлайн, до рождения Matrix/Energy Processes;
  - semantic root Mass declarations были сопоставлены с пятью сохранёнными
    global key identities; все 18 memberships сохранили source relations, а
    четыре существующих Mass files снова стали доступны flat graph;
  - cold retry materialize ровно 6 flat WIMP/6 Atom, 5 Matter WIMP edges,
    18 Mass declarations/memberships и 13 Mass source relations; legacy WIMP
    в candidate отсутствовали;
  - Auth успешно восстановилась из сохранённой session; HTTP rooms/history
    phase прошла, после чего внешний Realtime WebSocket завершился ошибкой при
    открытии и Chat перешёл в `ошибка подключения`;
  - повторные сетевые attempts остановлены; flat failure snapshot сохранён,
    затем verified legacy SQLite/Dark history/Mass восстановлены;
  - итоговый rollback contour снова отвечает `200` на всех health endpoints и
    находится в прежних состояниях `auth=авторизована`,
    `chat=ожидание события`, `lada=работа`.
  - canonical `bun run runtime:universe` и owner architecture определяют
    полный contour ровно как launcher плюс Force, Boundary, Dark, Energy,
    Bulk и Matrix-last; отдельного DNS resolver, outbound proxy или WebSocket
    gateway process в lifecycle нет;
  - повторный запуск flat candidate выполнен тем же canonical full launcher:
    все шесть child processes присутствовали, все health endpoints ответили
    `200`, topology/Matter/Mass/Auth снова прошли, а Chat получил тот же
    Realtime open failure signature;
  - evidence сохранён в
    `.metafor/backups/mf014-full-contour-20260726T020320Z`; candidate
    остановлен, verified legacy SQLite/history/Mass восстановлены и полный
    rollback contour снова healthy.
  - owner вручную запустил единственный prepared flat contour вне Codex
    network namespace; один launcher владеет шестью domain processes и
    listener ports `4000..4005`;
  - live Boundary: integrity ok, ровно 6 flat WIMP/6 Atom, 5 Matter WIMP
    edges, 18 Mass memberships и 13 source relations;
  - fresh executions из пустой execution history: 3 committed, 1 pending,
    0 failed; Auth `авторизована`, Lada `работа`;
  - fresh Chat `подключение` committed, `ожидание события` pending,
    `connected=true`, `historyReady=true`; root Lada получил
    `chatConnected=true`, `chatHistoryReady=true`;
  - сохранённые `ssoSession`, `greetingDraft` и `messages` Mass не изменены,
    `chatMessages` обновлён штатным чтением истории; Dark history вырос
    `2186 → 2216` записей без раскрытия payload;
  - owner явно принял `MF-014`; live flat contour оставлен без изменений.
- Acceptance:
  - two-segment resolver positive/negative tests;
  - third segment rejected before filesystem read;
  - Dark BFS загружает ровно шесть peers;
  - Boundary materialize ожидаемый graph;
  - Mass source relationships сохранены;
  - повторный read является no-op;
  - полный cold lifecycle пройден без hot reload;
  - backup/migration evidence записано до Store cut.

## P1 — MetaJSON read/observe loop

### MF-100 — Утвердить MetaJSON v1 read contracts

- Status: `DONE`
- Dependencies: `MF-014`
- Current task: Codex task `019f9c3a-a2ec-7460-bd80-34ec2a630697`
- Contract baseline:
  [`task/metajson-v1-read-contract.md`](metajson-v1-read-contract.md)
- Evidence:
  - current `MetaDSL → Dark` normalization и declaration flattening audited;
  - historical `MonadJson → ActorAST → MetaAST` line audited without restoring
    old AST literally;
  - Boundary current Atom/topology/origin data и Monad RPC envelope/router
    audited;
  - focused order review separated semantic/materialization order from
    incidental declaration/display order;
  - owner completed real-time review and locked every public v1 decision;
  - `docs/ARCHITECTURE.md`, living plan, TODO and contract baseline reconciled;
  - independent mechanical verification: one public schema, no stale positive
    shapes, valid local links, balanced fences and `git diff --check` pass;
  - no implementation/runtime/Lada/Store/Mass change began.
- Authority:
  - owner approved A0 documentation/contract reconciliation and local
    checkpoint commit;
  - code and child implementation work begin only after G1 report.
- Acceptance:
  - один полный public MetaJSON document и одна schema;
  - stateless Monad assembly Dark declaration + Boundary current projection;
  - compact complete normalized MetaDSL template;
  - nested sparse current Atom values без provenance/status envelope;
  - public structural paths/references без raw storage identities;
  - порядок сохраняется только по доказанным domain/materialization laws;
  - revisions/digests/CAS и directed ports/stubs/global edges отсутствуют;
  - Mass bytes, live Energy, history и patches отсутствуют в snapshot.

### MF-101 — Реализовать единый MetaJSON v1 read

- Status: `READY`
- Dependencies: `MF-100`
- Start gate:
  - текущий A0 заканчивается G1 report; implementation и child work в этой
    задаче не начинаются;
  - перед будущими child tasks выполняется Organization Governance permission
    preflight для полного native ai-srv profile, наследуемого children;
  - harmless preflight подтверждает canonical cwd, обычные read/write
    permissions в выделенном worktree, Bun и non-mutating Git access;
  - child authority запрещает live runtime/process, Store/Mass, Lada, contour
    lifecycle и push;
  - если launcher не может дать такой inherited profile без per-command
    prompts, item получает один platform capability blocker до child launch.
- Acceptance:
  - один public document/schema и один runtime validator;
  - `template` содержит полный сериализуемый normalized MetaDSL graph, включая
    defaults, Process/Reaction descriptors, Matter bindings и Bulk;
  - `runtime` содержит nested Atom occurrences, current State и только
    присутствующие current Field values;
  - identity/relations выражены structure и public paths/references; raw
    Atom/Field/Value IDs отсутствуют;
  - semantic/materialization order сохранён без universal order vector;
  - Dark предоставляет declaration projection, Boundary — current projection,
    Monad statelessly собирает и валидирует результат;
  - no authored MetaJSON Store.

### MF-103 — Добавить read-only operation/history/Mass observation

- Status: `WAITING`
- Dependencies: `MF-101`
- Scope:
  - structural operation outcomes;
  - particle history отдельно;
  - разрешённые Mass results через owner API.
- Acceptance:
  - MetaJSON snapshot не смешивается с history/Mass;
  - direct Store/SQLite/filesystem reads со стороны Codex отсутствуют;
  - selector/time/operation filters валидируются.

### MF-104 — Доказать первый read/observe iteration

- Status: `WAITING`
- Dependencies: `MF-103`
- Acceptance:
  - Codex читает полный MetaJSON либо partial retrieval над тем же contract;
  - связывает его с history и Mass result;
  - формулирует проверяемое improvement intent;
  - никаких writes на этом item.

## P2 — Monad structural patch vertical slice

### MF-200 — Утвердить structural operation contract

- Status: `WAITING`
- Dependencies: `MF-100`, `MF-104`
- Acceptance:
  - operation id и target;
  - JSON Patch;
  - optional base source/meta digests как CAS, не VCS;
  - capability/policy identity;
  - runtime validation и negative tests;
  - один patch может содержать несколько поддерживаемых entity operations.

### MF-201 — Реализовать fast Monad validator

- Status: `WAITING`
- Dependencies: `MF-200`
- Checks:
  - schema/JSON Pointer;
  - references;
  - semantic DSL constraints;
  - forbidden cycles/graph constraints;
  - capability/policy;
  - supported round-trip source form.
- Acceptance:
  - invalid operation не пишет filesystem и не меняет Universe;
  - error указывает точную phase/path.

### MF-202 — Реализовать atomic update source adapter

- Status: `WAITING`
- Dependencies: `MF-201`
- Scope: существующая fixture Meta, один поддерживаемый `meta.ts`.
- Acceptance:
  - same-directory temp + atomic rename;
  - CAS guard;
  - unsupported/dynamic source rejected;
  - no Git branch/commit/push;
  - no pending/active Store.

### MF-203 — Добавить append-only operational journal

- Status: `WAITING`
- Dependencies: `MF-200`
- Acceptance:
  - serialized/idempotent `operationId`;
  - полный serialized patch и patch/base/written/normalized digests;
  - distinct validation/write/execute/round-trip/materialize phases;
  - exact outcome/error;
  - journal не является MetaJSON, Particle history или VCS.

### MF-204 — Немедленно materialize через текущий runtime path

- Status: `WAITING`
- Dependencies: `MF-202`, `MF-203`
- Acceptance:
  - successful write запускает MetaFor execution/normalization/round-trip;
  - structure применяется в живую Universe;
  - entity consequences идут отдельными Particles через существующий Force;
  - Force v2/ACK/replay не являются dependency;
  - journal фиксирует materialized либо exact failure.

### MF-205 — Реализовать retry/reconcile post-write failure

- Status: `WAITING`
- Dependencies: `MF-204`
- Acceptance:
  - `written_materialization_failed` наблюдаем;
  - retry с тем же operation id не создаёт duplicate write;
  - reconcile перечитывает и валидирует source;
  - source не откатывается и не перезаписывается молча.

### MF-206 — Принять optional Field vertical slice

- Status: `WAITING`
- Dependencies: `MF-101`, `MF-103`, `MF-205`
- Fixture: существующая изолированная Meta, не Лада.
- Path:
  - MetaJSON read;
  - patch optional scalar Field без default;
  - fast validation;
  - atomic write;
  - immediate materialization;
  - operation/particle history read;
  - MetaJSON reread;
  - next Codex iteration.
- Acceptance:
  - invalid/stale/no-op/idempotent cases;
  - Field declaration materialized;
  - sparse runtime Atom не содержит key, для которого current value
    отсутствует;
  - post-write failure recovery доказан;
  - без VCS workflow, pending/active, Force v2, restart или hot reload.

## P3 — unified Create через существующий template path

### MF-300 — Выделить нематериализующий Create MetaFor template boundary

- Status: `WAITING`
- Dependencies: `MF-011`, `MF-201`
- Acceptance:
  - используются существующие templates;
  - возвращается полный template file set до target write;
  - параллельный Monad generator отсутствует;
  - CLI behavior не дублируется.

### MF-301 — Реализовать create template→patch→validate→materialize

- Status: `WAITING`
- Dependencies: `MF-205`, `MF-300`
- Exact path:
  - Create MetaFor template;
  - Monad validation(template);
  - target patch;
  - Monad validation(result);
  - atomic directory publication;
  - Create MetaFor install/Git bootstrap;
  - MetaFor execution/normalization/round-trip;
  - apply to Universe;
  - operation outcome.
- Acceptance:
  - template является semantic-empty legal start;
  - полный package, не `directory + meta.ts`;
  - filesystem target отсутствует до обеих validation phases;
  - failure phases наблюдаемы и reconcileable.

### MF-302 — Доказать единый contract create/update

- Status: `WAITING`
- Dependencies: `MF-301`
- Acceptance:
  - общий operation schema/journal;
  - различаются только template start и target existence precondition;
  - результат читается тем же MetaJSON RPC.

## P4 — отложенные расширения

### MF-400 — Force v2 durability/replay

- Status: `GATE`
- Dependencies: `MF-206`
- Deferred decision:
  - delivery control frames/channel;
  - journal, ACK/NACK/resume;
  - authoritative consumer cursors.

### MF-401 — Multi-entity Boundary staging

- Status: `GATE`
- Dependencies: `MF-206`
- Реализуется только при доказанной operation, которой недостаточно
  последовательных single-entity Particles.

### MF-402 — Full VCS model

- Status: `GATE`
- Dependencies: `MF-302`
- Scope: branches, merges, generic rollback, push и source version graph.
- Не является продолжением Create MetaFor initial Git bootstrap автоматически.

### MF-403 — Causal convergence barrier

- Status: `GATE`
- Dependencies: `MF-206`

### MF-404 — Process generator/updater

- Status: `WAITING`
- Dependencies: `MF-302`

### MF-405 — Runtime Agent structural capabilities

- Status: `GATE`
- Dependencies: `MF-302`
- Capability/policy определяется отдельно; внешний Codex loop не запрещает
  будущую внутреннюю автономию.

### MF-406 — Constrained Lada self-evolution

- Status: `GATE`
- Dependencies: `MF-405`
- Scope:
  - только собственная structural scope через тот же MetaJSON contract;
  - resource limits;
  - Monad validation;
  - operational observability;
  - не является изменением текущей Lada topology.

## Evidence log

Заполнять только после фактической работы:

| Item | Commit/diff | Checks | Result |
| --- | --- | --- | --- |
