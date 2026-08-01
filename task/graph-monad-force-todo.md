# Graph, Monad и Force: приоритетный исполнимый TODO

Этот backlog исполняется по
[`task/graph-monad-force-plan.md`](graph-monad-force-plan.md).

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
  - Monad и Force разведены как peer layers Dark, а не отдельные runtime
    domains;
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
    declarations офлайн, до рождения рабочих Processes;
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
  - в полном contour нет отдельного DNS resolver, outbound proxy или WebSocket
    gateway process;
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

## P1 — Graph read/observe loop

### MF-100 — Утвердить Graph read contracts

- Status: `DONE`
- Dependencies: `MF-014`
- Current task: Codex task `019f9c3a-a2ec-7460-bd80-34ec2a630697`
- Contract baseline:
  [`task/graph-read-contract.md`](graph-read-contract.md)
- Evidence:
  - current `MetaDSL → Dark` normalization и declaration flattening audited;
  - historical AST projection line audited without restoring old AST literally;
  - Boundary current Atom/topology/origin data и Monad RPC envelope/router
    audited;
  - focused order review separated semantic/materialization order from
    incidental declaration/display order;
  - owner completed real-time review and locked every public contract decision;
  - `docs/ARCHITECTURE.md`, living plan, TODO and contract baseline reconciled;
  - independent mechanical verification: one public schema, no stale positive
    shapes, valid local links, balanced fences and `git diff --check` pass;
  - no implementation/runtime/Lada/Store/Mass change began.
- Authority:
  - owner approved A0 documentation/contract reconciliation and local
    checkpoint commit;
  - code and child implementation work begin only after G1 report.
- Acceptance:
  - один public Graph и одна schema; JSON является только его технической
    сериализацией, а не вторым форматом;
  - stateless Dark Monad assembly Dark declaration + Boundary current
    projection;
  - compact complete normalized MetaDSL template;
  - nested sparse current Atom values без provenance/status envelope;
  - public structural paths/references без raw storage identities;
  - порядок сохраняется только по доказанным domain/materialization laws;
  - revisions/digests/CAS и directed ports/stubs/global edges отсутствуют;
  - Mass bytes, live Energy, history и patches отсутствуют в snapshot.

### MF-101 — Реализовать единый Graph read

- Status: `DONE`
- Dependencies: `MF-100`
- Current task: Codex task `019f9c3a-a2ec-7460-bd80-34ec2a630697`
- Evidence:
  - public Graph types/closed validator: commit `b8e061e3`;
  - Dark complete declaration projection и Boundary coherent current
    projection: commit `f9779aba`;
  - stateless Monad assembly, provider isolation и final public validation:
    commit `9a0a8739`;
  - независимые verifier gates приняли Public, Dark, Boundary temporal
    coherence и Monad assembly после adversarial corrections;
  - final targeted integration:
    `bun test dark/monad/graph.spec.ts dark/graph.spec.ts
    boundary/graph.spec.ts tests/graph/public.spec.ts` —
    70 pass, 0 fail, 282 expect;
  - `bun run typecheck`: pass;
  - `git diff --check`: pass;
  - push, live runtime/process, Store/Mass, Lada, contour lifecycle и hot
    reload не выполнялись.
- Acceptance:
  - один public document/schema и один runtime validator;
  - `template` содержит полный сериализуемый normalized MetaDSL graph, включая
    defaults, Process/Reaction descriptors, Matter bindings и Bulk;
  - `runtime` содержит nested Atom occurrences, current State и только
    присутствующие current Field values;
  - identity/relations выражены structure и public paths/references; raw
    Atom/Field/Value IDs отсутствуют;
  - semantic/materialization order сохранён без universal order vector;
  - Dark Monad предоставляет declaration projection, Boundary — current
    projection, Dark Monad statelessly собирает и валидирует результат;
  - no authored Graph Store.

### MF-102 — Перенести standalone Force runtime в Dark

- Status: `DONE`
- Dependencies: `MF-101`
- Current task: Codex coordinator task
  `019f9ea9-8bbc-7f60-9b7a-5f12b40a32d4`; один canonical checkout и один
  последовательный integration owner, без дополнительных branches/worktrees.
- Locked architecture:
  - Dark содержит два равноправных слоя: Monad и Force;
  - весь runtime/domain нынешнего `force` переносится в Dark;
  - отдельный Force package/entry/process после migration отсутствует;
  - `shared/protocol/force` остаётся общим wire language;
  - Dark Monad подготавливает structural intent и испускает Inflaton через Dark
    Force; Gluon/Higgs и остальные Particles используют тот же Force;
  - Dark Force владеет complete filesystem Particle history.
- Historical continuity:
  - owner law зафиксирован в upstream turn
    `019f97d3-6ece-7d82-8405-e298ad122e1d` /
    `019f9abc-aa84-7403-8f09-74a59c30d4dc`;
  - первоначальный plan commit `51874304` уже содержал behavior-preserving
    Force→Dark migration, но rewrite `0b775e75` удалил этот dependency;
  - выполненные MF-014 six-process proofs остаются pre-migration evidence.
- Gate:
  - архитектура не переоткрывается;
  - owner принял parity/source migration и public ingress compatibility на
    `4000`;
  - owner разрешил backup, controlled full cold cut, acceptance и rollback;
  - legacy Dark JSONL не объявляется ретроактивно полной: после verified
    pre-cut backup/hash он удаляется из active contour, не пересоздаётся и не
    exposes read/clear continuity;
  - новая history boundary утверждена: portable каталог
    `.metafor/dark-force-history/v1/`, отдельный immutable manifest/cut,
    Particle-only bounded NDJSON segments и rebuildable navigation catalog;
    live cut требует явного нового `cutId`.
- G0 parity baseline:
  - canonical clean HEAD `f4a770a9`;
  - подтверждены current standalone endpoints `/health`, `/force`, `/ws`,
    `/monad/channels`, `/monad/rpc`, `/monad/channel`;
  - зафиксированы текущая схема маршрутизации, жизненный цикл четырёх удалённых
    каналов,
    Monad source binding, fail-stop и six-process launcher;
  - isolated baseline
    `bun test force/server.spec.ts force/force.spec.ts force/monad.spec.ts
    force/rpc.spec.ts runtime/universe.spec.ts`: 17 pass, 0 fail, 77 expect;
  - тест использовал только ephemeral listeners и temporary Store/history;
    live contour и owner data не затрагивались.
- Source migration gate:
  - бывшие server/REST/WebSocket ingress, `ForceLifecycle`, routing, channel
    Store, fixtures, health и tests находятся в `dark/force`; `MonadRouter` и
    local Monad channel находятся в `dark/monad`; отдельный `force`
    workspace/entry удалён;
  - Dark self-WebSocket заменён локальным process adapter, сохранены четыре
    удалённых доменных канала;
  - `dark/server.ts` содержит Dark Monad + Dark Force, сохраняет public ingress
    `4000` и предоставляет same-process compatibility health на `4002`;
  - complete post-cut history содержит только accepted `SourcedParticle`;
    record ID — `<cutId>:<sequence>`, `acceptedAt` отделён от `particle.ts`,
    сегменты ограничены 4096 entries, catalog rebuildable, append+fsync
    завершается до routing;
  - все восемь Part kinds, включая Gluon/Higgs и Inflaton, проходят один
    lifecycle acceptance point; ошибка history append закрывает gate без
    доставки;
  - targeted migration proof after legacy-surface removal:
    61 pass, 0 fail, 314 expect;
  - полный `bun run check`: typecheck и expect-error verification pass,
    1600 tests pass, 0 fail, 5281 expect;
  - `git diff --check`: pass; проверки использовали только ephemeral listeners
    и temporary data, live contour/Store/Mass/legacy history не изменялись.
- Cold-cut evidence:
  - source migration зафиксирована commit
    `ba08361a492bb7687aa908a1f3da107f0741b331`, legacy history surface удалён
    follow-up commit `873dc9a3a65045470107aedf5db3f78ed2d104f7`;
  - перед cut старый contour и listeners `4000..4005` отсутствовали, поэтому
    останавливать live six-process contour не потребовалось;
  - verified backup
    `.metafor/backups/mf102-dark-force-cut-20260726T150016Z` содержит
    byte-identical SQLite с WAL/SHM, четыре Mass files и legacy
    `dark-history.jsonl`; legacy hash
    `f8e7173ac849119950c85a38b5e543be8a07a2f1983942f6746a757c13ff1f29`;
  - legacy JSONL удалён только из active contour после backup/hash/cmp proof и
    не был пересоздан;
  - новый immutable manifest получил cut
    `mf102-20260726T150016Z-53b4bd78-0930-4ccf-b83e-c147f3cea66a`,
    `retroactiveComplete:false` и `legacyHistory:"removed-after-backup"`;
  - standalone `force/server.ts` process отсутствует, health `4000..4005`
    отвечает `200`, а `4002` является same-process Dark compatibility health;
  - acceptance probe принят с sequence `1`, durably записан до routing в
    segment `00000000000000000001.ndjson` с SHA-256
    `76007c85cb297c879b9517fd028da5949434caf1fa24a9dd15668ea42484345d`
    и доставлен во все доменные каналы;
  - live `readGraph` для `zavx0z/inference` вернул schema
    `metafor/graph`, шесть template entries и один runtime root;
  - SQLite `PRAGMA quick_check` вернул `ok`; SQLite/WAL/SHM и четыре Mass files
    остались byte-identical pre-cut backup;
  - candidate остаётся запущенным; hot reload, rollback и push не выполнялись.
- Required order:
  1. `DONE` — зафиксировать parity baseline endpoints, routing, lifecycle, history,
     birth gate, fail-stop и tests.
  2. `DONE` — перенести server, REST/WebSocket ingress, `MonadRouter`,
     `ForceLifecycle`, particle relay/routing, channel Store, fixtures,
     health, `/force`, `/monad/*`, tests и docs в Dark.
  3. `DONE` — перенести functionality нынешнего `dark/dark.ts` в Dark Monad и
     разместить там Meta/source/service operations; отдельного третьего Dark
     runtime layer не оставлять.
  4. `DONE` — разместить ingress/history/relay/routing/lifecycle в Dark Force.
  5. `DONE` — заменить Dark self-WebSocket локальной process boundary без изменения wire
     semantics удалённых domains.
  6. `DONE` — переключить launcher на пять domain processes.
  7. `DONE` — удалить standalone Force package/entry после source parity.
  8. `DONE` — owner-approved backup/full stop/cold start/acceptance выполнены;
     rollback не потребовался, hot reload не применялся.
- Acceptance:
  - каждая принятая Particle, включая Gluon/Higgs и Inflaton, проходит один
    Dark Force ingress и сохраняется в complete filesystem history;
  - structural Inflaton проходит Dark Force до Boundary materialization;
  - endpoint/routing/lifecycle/fail-stop compatibility доказана;
  - `/force`, `/monad/*`, REST/WebSocket и health доступны через Dark;
  - `runtime:universe` и `runtime:universe:once` рождают пять domain processes;
  - standalone Force workspace, domain и process отсутствуют;
  - `shared/protocol/force` остаётся общим protocol package;
  - targeted/parity tests, typecheck, `git diff --check` и full cold proof pass;
  - никакого hot reload, silent Store/Mass/history rewrite или push.

### MF-103 — Добавить read-only operation/history/Mass observation

- Status: `READY`
- Dependencies: `MF-102`
- Current task: нет
- Execution DAG:
  - `H1` — `DONE`: read-only evidence существующего Dark particle-history
    surface; единственный существующий Dark Technical Lead session
    `019f9da9-3c09-7823-9bc6-395865a8725a`, callback
    `MF103_HISTORY_EVIDENCE|BLOCKED` Архитектору;
  - `M1` — `DONE`: read-only evidence Energy/Mass owner surface, callback
    `MF103_MASS_EVIDENCE|BLOCKED` Архитектору;
  - `G1` — `SUPERSEDED`: вывод commit `04580a91` о Dark-surface-only history и
    переносе structural observation целиком в `MF-203` отозван после
    восстановления upstream owner law;
  - `I1` — `READY`: complete Dark Force Particle-history/Mass observation
    contract и stateless Dark Monad integration, с отдельным independent
    verifier gate.
- Read-only evidence:
  - `H1` принят на clean `dac81d10`: существующий pre-migration
    `dark.history.read` наблюдает только incoming/outgoing Particles на Dark
    surface, сохраняет целые equal-timestamp steps и имеет только time/limit
    filters; request не закрыт, direction/by/part/op/path selectors и
    completeness отсутствуют;
  - `M1` принят на clean `7148ed72`: Energy владеет guarded Mass `readJson`,
    catalog и internal handles, но read-only owner RPC, public structural
    selector, JSON-result DTO и observation error contract отсутствуют;
  - обе evidence sessions работали read-only без чтения live Mass/history
    data, source/docs/Git, runtime или contour mutations;
  - H1 доказывает текущее расхождение реализации, но не сужает owner law:
    после `MF-102` Dark Force history полна для всех принятых Particles.
- Scope:
  - complete Dark Force Particle history с closed filters;
  - Gluon/Higgs, structural Inflaton и остальные Particles доступны через один
    owner read contract;
  - разрешённые Mass results через owner API.
- Acceptance:
  - Graph read projection не смешивается с history/Mass;
  - direct Store/SQLite/filesystem reads со стороны Codex отсутствуют;
  - Particle selector/time/type/direction/identity filters закрыты и
    валидируются;
  - structural Particle observation не зависит от `MF-203`;
  - external Mass identity использует canonical root, public runtime Atom path
    и authored Mass key; internal IDs и raw bytes не выходят наружу;
  - Mass result является detached JSON-only data.

### MF-104 — Доказать первый read/observe iteration

- Status: `WAITING`
- Dependencies: `MF-103`
- Acceptance:
  - Codex читает полный Graph либо partial retrieval над тем же contract;
  - связывает его с history и Mass result;
  - формулирует проверяемое improvement intent;
  - никаких writes на этом item.

## P1.5 — Immutable checkpoint foundation

Эта линия независима от read-only `MF-103`. Она не меняет Particle history и
сходится с `MF-103` только в replay/navigation.

### MF-105 — Утвердить checkpoint и Git/Mass contract

- Status: `DONE`
- Dependencies: `MF-102`
- Evidence:
  - owner contract добавлен в `docs/CHECKPOINTS.md` и карту
    `docs/README.md`;
  - closed manifest/forward-patch types и validators экспортированы как
    `@metafor/types/dark/checkpoint`;
  - planned private distribution repository зафиксирован как
    `zavx0z/metafor-checkpoints`, но remote не настроен и push отсутствует;
  - deterministic forward JSON Patch span имеет whole/chunk digest и exact
    sequence coverage, но Particle timeline остаётся единственной causal
    change history;
  - `bun run typecheck`, expect-error proof и `git diff --check` проходят.
- Locked owner law:
  - coherent snapshot создаётся только в semantic, quiescent, material-Mass,
    owner-bookmark либо measured replay-cost point, никогда по timer/count;
  - один snapshot `(cutId, acceptance sequence)` создаёт ровно один immutable
    commit с полным Boundary+Mass capture;
  - checkpoint commits принадлежат отдельному private repository
    [`zavx0z/metafor-checkpoints`](https://github.com/zavx0z/metafor-checkpoints),
    а не source repository;
  - Particle timeline является единственной canonical change history;
  - commit содержит deterministic forward JSON Patch span с digest и точным
    coverage `[previousSnapshotSequence + 1, S]`; Particle остаётся causal
    truth, control rows в history отсутствуют;
  - replay использует snapshot и только forward Particle/JSON patches;
    canonical inverse patches отсутствуют;
  - derived patch/state cache server-side, disposable, rebuildable и не Git.
- Remaining owner decisions:
  - encryption и distribution device keys;
  - Git-native blob chunks либо отдельно утверждённый blob backend и hard
    budgets;
  - точное правило material Mass trigger;
  - retention/GC и bookmark holds;
  - remote credentials/push и live cold restore имеют отдельную authority.
- Acceptance:
  - domain documents, closed types и recovery laws согласованы;
  - source repository, live contour, Store/Mass и Particle history не
    используются как checkpoint storage.

### MF-106 — Реализовать isolated checkpoint Git substrate

- Status: `DONE`
- Dependencies: `MF-105`
- Evidence:
  - `dark/checkpoint/repository.ts` принимает только переданные capture bytes
    и не имеет Boundary/Mass/history/runtime reader;
  - temporary bare repository не создаёт normal branches, worktree или
    remotes;
  - one snapshot создаёт один linear commit и immutable sequence ref; cut head
    обновляется compare-and-swap transaction;
  - одинаковые Mass chunks переиспользуют один SHA-256-addressed Git object;
  - closed manifest, complete forward-patch span, whole/chunk digests и exact
    tree проверяются до ref publication;
  - duplicate identity, incomplete span, pre-publication crash, concurrent
    head conflict, corrupt object/manifest и explicit size budget violation
    отклоняются;
  - targeted `bun test dark/checkpoint/repository.spec.ts`: 8 pass, 0 fail,
    32 expect;
  - полный `bun run check`: 1608 pass, 0 fail, 5313 expect; 42 expected type
    errors подтверждены;
  - live Boundary/Mass/history, contour, runtime, source repository Git
    metadata и GitHub remote не использовались; push отсутствует.
- Acceptance:
  - dedicated bare repository без worktree/normal branches;
  - immutable `(cutId, sequence)` ref и exactly-one commit;
  - Boundary/Mass manifests, canonical forward-patch span, content digests,
    blob dedup и size guards;
  - patch coverage не имеет gaps, inverse operations или history control rows;
  - crash до atomic ref publication не создаёт видимый checkpoint;
  - tests используют только synthetic temporary data;
  - remote и push отсутствуют.

### MF-107 — Реализовать coherent Boundary+Mass capture

- Status: `DONE`
- Current executor: closed by the owner-authorized AI-server cold cut.
- Dependencies: `MF-105`
- Isolated foundation: `DONE`
- Evidence:
  - `dark/checkpoint/barrier.ts` задаёт transport-neutral coordinator, а
    `dark/checkpoint/control.ts` персистит его exact state и восстанавливает
    non-zero baseline только при совпадении с Dark Force history;
  - Monad sideband подготовляет receipt до неизменённого ForceMessage; domain
    подтверждает применение только после Dark acceptance всех причинных
    outputs;
  - `dark/checkpoint/capture.ts` копирует stopped history/SQLite в private
    staging, требует одинаковый Graph digest at sequence 0/1 и публикует
    local bare Git checkpoint до durable control baseline;
  - один accepted sequence атомарно назначает per-domain `sentOrdinal`;
  - closed applied acknowledgement продвигает монотонный per-domain frontier;
  - settling barrier принимает причинно испущенные accepted Particles,
    расширяет frontier и удерживает fixed point только при равенстве всех
    applied/sent ordinals;
  - held frontier блокирует acceptance/ack до явного release;
  - sequence 0 по-прежнему отклоняется без equality proof и stopped capture;
  - source gate: 1671 pass, 0 fail, 5518 expect без parallel Universe fixture;
    typecheck проходит, 42 expected type errors подтверждены,
    `git diff --check` проходит;
  - canonical Particle, Force wire/history row и routing semantics не
    изменены;
  - owner-authorized AI-server cut: active Boundary, Force history и четыре
    Mass files сохранены в `.metafor/backups/mf107-retry-20260726T233344Z`;
    stopped capture опубликовал local checkpoint commit `757700c6714e0da8d3ac98f3b43b2caecbd22d72` для
    `(mf102-20260726T150016Z-53b4bd78-0930-4ccf-b83e-c147f3cea66a, 1)` и
    создал durable control baseline;
  - full cold start на `2fc9de0a` прошёл; Bulk projection подтверждает
    `zavx0z/inference`, 6 Atom, 54 Fields, 24 States и 13 Processes;
  - remote push, Node View и пользовательские auth/chat действия не выполнялись.
- Acceptance:
  - Dark Force фиксирует `S` и доказывает applied-through causal fence;
  - Boundary создаёт полный standalone checkpoint в своём serialized cut;
  - единый Mass-owner fence включает prior writes/copies и исключает later;
  - immutable staging capture содержит exact Boundary+Mass state at `S`;
  - Particle payload/history format не изменяется.

### MF-108 — Опубликовать один commit на coherent snapshot

- Status: `DONE`
- Dependencies: `MF-106`, `MF-107`
- Evidence:
  - AI-server stopped capture опубликовал один local bare-Git checkpoint
    commit `757700c6714e0da8d3ac98f3b43b2caecbd22d72` для
    `(mf102-20260726T150016Z-53b4bd78-0930-4ccf-b83e-c147f3cea66a, 1)`;
  - immutable sequence ref присутствует, control baseline записан только
    после verified publication;
  - source Git, GitHub remote/push и live restore не использовались.
- Acceptance:
  - verified staging capture порождает ровно один commit;
  - sequence ref и cut head публикуются atomically/CAS;
  - incomplete/corrupt capture остаётся unpublished;
  - никаких source Git commits, data push или live restore.

### MF-111 — Доказать offline prerequisite Inference→Lada dissolve

- Status: `DONE`
- Current executor: isolated Codex worktree `fdd1`, delegated from task
  `019fa120-7413-7d32-938c-16aa6dac3fdc`.
- Dependencies: `MF-101`
- Authority:
  - owner разрешил только synthetic/offline SQLite и test Mass fixtures;
  - live Inference, Boundary/Mass data, processes, source Meta repositories,
    deletion, restart и hot reload запрещены;
  - этот proof не переводит `MF-401` из `GATE` и не разрешает live dissolve.
- Scope:
  - две соседние, разные проверки: действующий recursive
    `inflaton remove wimp` и новый offline dissolve;
  - exact five-handle fence;
  - aggregate и per-membership CAS;
  - перенос существующих global Mass key identities на целевые Lada
    declarations без copy/delete bytes;
  - прежние target key IDs остаются unreferenced metadata; byte/key GC не
    выполняется и остаётся отдельным activation decision;
  - атомарный synthetic dissolve/reparent;
  - rollback всей SQLite transaction при позднем mismatch;
  - validated `readGraph` до и внутри transaction после planned state;
  - private source/target equality manifest по authored key mapping, codec,
    global key и SHA-256 metadata.
- Acceptance:
  - реализация не exposed через Monad/Force/runtime;
  - focused tests используют только temporary SQLite/Mass fixtures;
  - recursive remove через существующий API удаляет parent и descendants по
    действующему контракту;
  - dissolve сохраняет target Atom и descendants, reparent/reorder-ит их и
    явно переносит Mass ownership, меняя root;
  - mismatch после нескольких CAS updates не оставляет partial transfer;
  - Mass fixture filenames/bytes/digests остаются неизменными;
  - remaining live activation blockers и следующий owner gate перечислены.
- Evidence:
  - scoped implementation: этот commit; новый `boundary/dissolve.ts` намеренно
    не экспортирован через public Boundary API;
  - `bun test boundary/dissolve.spec.ts`: `3 pass`, `0 fail`, `26 expect()`;
  - `bun test boundary/dissolve.spec.ts boundary/incremental.spec.ts
    boundary/graph.spec.ts boundary/mass.spec.ts`: `49 pass`, `0 fail`,
    `212 expect()`;
  - `bun run check`: typecheck, `42` expected type diagnostics и `1645 pass`,
    `0 fail` в `184` файлах;
  - `git diff --check`: clean;
  - проверки выполнялись только с temporary SQLite и injected temporary Mass
    catalog; live contour и процессы не читались и не изменялись.
- Remaining blockers / next gate:
  - proof не предоставляет live multi-entity staging/receipt API, post-commit
    Energy handle retarget, Force consequences или activation lifecycle;
  - реальные Inference/Lada mappings, present digests/explicit absent evidence,
    backup и cold activation требуют отдельного preflight;
  - судьба unreferenced прежних target keys/bytes требует явного GC policy;
  - следующий шаг остаётся owner decision в `MF-401`; этот item не разрешает
    live dissolve или deletion.

### MF-112 — Добавить isolated dissolve staging/receipt prerequisite

- Status: `DONE`
- Current executor: isolated Codex worktree `fdd1`, delegated from task
  `019fa120-7413-7d32-938c-16aa6dac3fdc`.
- Dependencies: `MF-111`
- Authority:
  - owner разрешил следующий non-live integration prerequisite;
  - live Inference/Boundary/Mass, deletion, Force command, runtime export,
    processes, restart и hot reload запрещены;
  - `MF-401` остаётся live owner gate.
- Acceptance:
  - private adapter принимает только closed `dissolve` proposal и не смешивает
    его с recursive `inflaton remove wimp`;
  - validation повторно использует proven plan, exact five mappings, current
    full Graph и whole-plan CAS до staging write;
  - отдельная in-memory SQLite атомарно сохраняет immutable receipt с proposal,
    plan/pre-state и Graph digests;
  - одинаковый `proposalId` идемпотентен только для того же proposal, collision
    или mismatch не оставляет partial receipt;
  - staging не вызывает execution/materialize/fence/Force, не меняет Boundary
    или Mass и ничего не удаляет;
  - focused tests сохраняют recursive-remove/dissolve distinction и late
    five-key rollback proof;
  - remaining live preflight перечислен явно.
- Evidence:
  - scoped implementation: этот commit; `boundary/dissolve-staging.ts`
    отсутствует в `boundary/index.ts` и package exports;
  - staging storage всегда `sqlite::memory:` и receipt имеет `effects: none`;
  - `bun test boundary/dissolve.spec.ts`: `6 pass`, `0 fail`;
  - `bun test boundary/dissolve.spec.ts boundary/incremental.spec.ts
    boundary/graph.spec.ts boundary/mass.spec.ts`: `52 pass`, `0 fail`,
    `241 expect()`;
  - `bun run check`: typecheck, `42` expected type diagnostics и `1648 pass`,
    `0 fail` в `184` файлах;
  - `git diff --check`: clean;
  - все проверки использовали только temporary Boundary/Mass fixtures; live
    contour, runtime и filesystem data не читались и не изменялись.
- Remaining live preflight gate:
  - in-memory receipt ещё не является durable Boundary-owned serialized stage
    и не связан с stopped checkpoint/cut;
  - нужны проверенные реальные source/target mappings и declarations, exact
    Graph/Mass evidence, backup и cold rollback package;
  - нужны actual Energy five-handle fence/retarget, authenticated Monad/Force
    admission и post-commit consequences;
  - GC policy для superseded target keys/bytes остаётся неразрешённым;
  - только отдельное owner decision в `MF-401` может разрешить live staging;
    deletion и activation этим item не разрешены.

### MF-113 — Зафиксировать explicit absent Mass evidence для dissolve

- Status: `DONE`
- Current executor: isolated Codex worktree `fdd1`, delegated from task
  `019fa120-7413-7d32-938c-16aa6dac3fdc`.
- Dependencies: `MF-112`
- Authority:
  - owner выбрал deterministic explicit absent marker для `chatOutbox`;
  - empty Mass file и любые придуманные bytes запрещены;
  - только offline/synthetic fixtures; live Boundary/Mass, staging,
    activation, deletion и процессы запрещены.
- Acceptance:
  - private manifest использует closed present/absent evidence union;
  - absent marker привязан к exact existing `global key ID + codec` и
    детерминирован между plan, staging и post-state proof;
  - только явно разрешённое отсутствие получает marker; неразрешённый missing,
    symlink, directory или unreadable path являются ошибкой;
  - reader не создаёт file или payload, а dissolve сохраняет global key
    identity и проверяет обычную source/target manifest equality;
  - focused tests доказывают valid absence, отсутствие materialization,
    corruption rejection и сохранение пяти-key rollback proof;
  - remaining live preflight gate перечислен явно.
- Evidence:
  - scoped implementation: этот commit; новый private
    `boundary/dissolve-mass-evidence.ts` отсутствует в Boundary exports и
    использует только read-only `lstat/open/read`;
  - `chatOutbox` fixture сохраняет существующий global key ID и codec, но
    private manifest вместо digest содержит
    `{kind: "absent", marker: "metafor/mass-absent/v1"}`;
  - repeated plan, isolated receipt и post-state proof получают один manifest
    digest; absent file остаётся `ENOENT` до и после dissolve;
  - unmarked `ENOENT` отклонён как `missing_mass`, directory на allowlisted
    identity — как `corrupt_mass`, staging receipt не записан;
  - `bun test boundary/dissolve.spec.ts`: `8 pass`, `0 fail`,
    `73 expect()`;
  - `bun test boundary/dissolve.spec.ts boundary/incremental.spec.ts
    boundary/graph.spec.ts boundary/mass.spec.ts`: `54 pass`, `0 fail`,
    `259 expect()`;
  - `bun run check`: typecheck, `42` expected type diagnostics и `1650 pass`,
    `0 fail` в `184` файлах;
  - `git diff --check`: clean;
  - все Mass paths были temporary synthetic fixtures; live contour, Mass,
    Boundary и процессы не читались и не изменялись.
- Remaining mandatory live gate:
  - durable Boundary-owned serialized stage, связанный со stopped
    checkpoint/cut и содержащий exact live allowlist/absent marker, всё ещё
    отсутствует;
  - evidence-only design и cold-cut runbook зафиксированы в
    [`task/inference-lada-dissolve-cold-cut-preparation.md`](inference-lada-dissolve-cold-cut-preparation.md);
    это не owner contract и не authority на staging/activation;
  - только после него отдельно нужны backup/cold rollback proof, actual Energy
    five-handle fence/retarget и authenticated Monad/Force admission;
  - этот item не разрешает live staging, Mass materialization, activation или
    deletion; `MF-401` остаётся owner gate.

### MF-114 — Добавить durable detached candidate stage и rollback capture

- Status: `DONE`
- Current executor: canonical Inference integration checkout, delegated from
  Codex task `019fa120-7413-7d32-938c-16aa6dac3fdc`.
- Dependencies: `MF-113`, `MF-108`
- Authority:
  - owner выбрал stage table внутри detached candidate Boundary SQLite;
  - входами могут быть только stopped private checkpoint copies и synthetic
    fixtures; live Boundary/Mass/Inference и процессы запрещены;
  - разрешён generalized current-sequence checkpoint/rollback capture только
    для private candidate bundle с hashes, receipts и explicit retention;
  - activation, deletion, materialization, Force/Energy admission/retarget,
    runtime lifecycle, hot reload и canonical source/root transition
    запрещены.
- Acceptance:
  - owner law сначала фиксирует detached candidate и rollback retention;
  - candidate создаётся копированием stopped Boundary/Mass/history/control
    inputs в новый private bundle и никогда не открывает source paths in place;
  - generalized capture связывает current `(cutId, sequence)`, verified history
    coverage, Boundary/projection/Mass/history/control hashes и immutable local
    checkpoint commit без first-sequence-only restriction;
  - candidate Boundary SQLite содержит durable closed stage table/receipt,
    exact checkpoint/backup binding, пять mappings и Mass evidence, но world
    tables и Mass bytes не меняются;
  - reopen/corruption/idempotency/CAS/retention/rollback tests используют
    только temporary fixtures;
  - bundle retention явная: successful preparation и failed candidates не
    удаляются автоматически; GC остаётся отдельным owner gate;
  - live activation и canonical source/root transition остаются `BLOCKED`
    owner gates.
- Evidence:
  - `boundary/dissolve-candidate-staging.ts` добавляет closed strict stage
    table только в caller-provided detached Boundary SQLite; receipt связывает
    canonical proposal/plan, checkpoint commit/digests, raw rollback manifest,
    пять Mass mappings/evidence, `effects: "none"` и
    `retain-until-explicit-gc`;
  - `dark/checkpoint/dissolve-candidate.ts` копирует stopped private
    Boundary/WAL/SHM, Mass, history и control в новый bundle, фиксирует ordered
    raw-file hashes, публикует local bare-Git checkpoint текущей sequence,
    fsync/reopen-проверяет candidate и сохраняет successful/failed targets;
  - generalized publisher проверяет exact contiguous history/patch span,
    previous checkpoint identity и byte-identical resume; gap либо changed
    retry отклоняются;
  - temporary synthetic proof на sequence `2` подтверждает неизменность всех
    source bytes, точный raw rollback hash, отсутствие remote, retained Lada,
    отсутствующий `chatOutbox`, stage reopen/idempotency, wrong-binding и
    corruption rejection; failure bundle также сохраняется с
    `effects: "none"`;
  - `bun test dark/checkpoint/capture.spec.ts
    dark/checkpoint/repository.spec.ts
    dark/checkpoint/dissolve-candidate.spec.ts boundary/dissolve.spec.ts`:
    `22 pass`, `0 fail`, `139 expect()`;
  - `bun run check`: typecheck, `42` expected type diagnostics и `1654 pass`,
    `0 fail` в `185` файлах;
  - `git diff --check`: clean;
  - live Boundary/Mass/Inference, процессы и listeners не читались и не
    изменялись; runtime lifecycle и hot reload не вызывались.
- Remaining blocked gates:
  - live preflight/stage/activation и publication не разрешены;
  - detached transaction execution закрыт следующим non-live item `MF-115`,
    но не создаёт live capability;
  - canonical Inference→Lada source/root transition не определён;
  - Force/Monad admission и Energy five-handle fence/retarget не реализованы;
  - retention GC требует отдельного owner decision.

### MF-115 — Принять detached dissolve, Bulk reframe и browser proof

- Status: `DONE`
- Current executor: canonical Inference integration checkout, delegated from
  Codex task `019fa120-7413-7d32-938c-16aa6dac3fdc`.
- Dependencies: `MF-114`
- Authority:
  - owner разрешил exact staged dissolve только внутри detached candidate,
    заново собранного из exact accepted stopped cut;
  - разрешены `BoundaryDissolveProof`, post-dissolve projection, non-null
    `BulkRootPromotionReceipt`, isolated browser/static visual proof и private
    rollback restoration proof;
  - live Inference/Boundary/Mass mutation, activation, authored source/root
    transition, Force/Monad, Energy, processes, restart и hot reload запрещены.
- Acceptance:
  - candidate+rollback bundle заново связывает exact accepted
    `(cutId, sequence)`, pre-projection и former Inference root frame;
  - executor читает и повторно проверяет exact stored proposal/plan bytes,
    stage/bundle/checkpoint digests и current CAS до detached transaction;
  - proof и post-projection подтверждают отсутствие Inference, Lada root,
    сохранение всей Lada subtree identity/order и пяти Mass mappings;
  - matching non-null promotion receipt передаётся в Bulk manifestation, а
    captured former-root frame применяется ко всему Lada subtree;
  - реальный browser check из isolated launch/static fixture показывает
    здоровую candidate scene и сохраняет screenshot/DOM evidence;
  - отдельная private restoration из rollback bytes повторно проходит ordered
    hashes, SQLite/history/control и pre-projection verification;
  - live activation остаётся отдельным owner gate.
- Evidence:
  - private executor повторно читает exact stored proposal/plan, требует
    byte-identical fresh plan, stage Graph digest и все structural/Mass CAS,
    затем вызывает transaction только на caller-owned detached Boundary;
  - exact accepted checkpoint
    `757700c6714e0da8d3ac98f3b43b2caecbd22d72` /
    `(mf102-20260726T150016Z-53b4bd78-0930-4ccf-b83e-c147f3cea66a, 1)`
    с pre-projection
    `ea0511057c063d0aaa40f34888ce8d70102e8733581ddc0f719f7dd5b8484cd1`
    породил retained bundle
    `6129bd683cc1f1f39103b33ee0662d088a2a17f8581cee3b335b85c651d317e8`
    и private checkpoint commit
    `a97c057c3520fcd63afd6b38df99504ba1c634be`;
  - `BoundaryDissolveProof` сохранил Atom `2..6`, перенёс пять global Mass
    identities, включая deterministic absent `chatOutbox`, и post-projection
    получил SHA-256
    `9d4d8bb5976c1988095ed2eeb445056dc846882a22b97b17031e98207a0edd5d`;
  - non-null promotion receipt проявил ровно пять Lada Atom, depth `2`, без
    Inference; former/promoted outer diameter совпал `100 mm`;
  - headless Chrome static fixture выставил `data-acceptance="pass"` и
    `PASS · SCENE HEALTHY`; PNG `1440×1000` имеет SHA-256
    `3e0b35bc949e9eaa50b548affb5f9ca89c131dbba9f4ce0abf58acf7ab065b9e`;
    WebGPU probe точно вернул `adapter unavailable`, поэтому production WebGPU
    renderer этим browser proof не заявлен;
  - rollback restoration повторно проверил `11` ordered files, Boundary
    `quick_check=ok`, zero foreign-key violations, history/control exact
    cut/sequence и вернул исходный pre-projection digest;
  - source stopped inputs и checkpoint-control hash остались неизменны;
    launcher/domain PIDs до/после совпали, lifecycle command не выполнялся;
  - focused dissolve/promotion/manifestation: `24 pass`, `0 fail`,
    `160 expect`;
  - `bun run check`: typecheck pass, `42` expected diagnostics,
    `1663 pass`, `0 fail`, `5562 expect` в `187` test files;
  - `git diff --check`: clean; scoped implementation: этот commit.

### MF-116 — Подготовить durable causal admission и Energy retarget

- Status: `DONE`
- Current executor: canonical Inference integration checkout, delegated from
  Codex task `019fa120-7413-7d32-938c-16aa6dac3fdc`.
- Dependencies: `MF-115`
- Authority:
  - owner выбрал causal no-stop dissolve preparation;
  - разрешены только private non-live protocol/storage/tests без endpoint или
    caller;
  - live admission/dissolve, Boundary/Mass data, Force routing, processes,
    restart, stop/start и hot reload запрещены;
  - dissolve удаляет только structural parent role; Mass bytes/keys/history,
    rollback/checkpoint artifacts, receipts и superseded bindings сохраняются
    до отдельного owner GC decision.
- Acceptance:
  - Boundary-owned durable admission/quiescence record связан с exact
    candidate bundle, stage/proof/Bulk receipt and checkpoint;
  - duplicate exact admission идемпотентен, changed receipt или stale frontier
    fail closed;
  - ordered causal plan фиксирует no effects before commit и отдельный
    one-entity-per-`ForceMessage` post-commit порядок;
  - Energy-owned durable five-handle fence/retarget receipt переживает reopen,
    late fifth-handle failure и retry без release/delete;
  - retarget и post-commit consequences невозможны до exact Boundary commit;
  - immutable receipts сохраняют source/target/superseded binding metadata и
    прежние target key IDs с `retain-until-explicit-gc`;
  - focused happy-path, late failure/retry, stale/duplicate и pre-commit
    no-effects tests; typecheck/check и clean commit.
- Remaining gate:
  - никакой public live RPC/caller не создаётся;
  - actual live admission/activation и exact operational command требуют
    отдельного owner gate после source/root transition proof.
- Evidence:
  - `boundary/dissolve-causal-admission.ts` хранит private Boundary-owned
    admission/quiescence/commit/consequence record, exact candidate/stage/
    proof/Bulk binding, complete five-domain held frontier и ordered plan;
  - runtime consequences выводятся только из exact retained runtime identities:
    target и реально сменившие scope entities получают отдельный
    one-entity/one-message replace, source Atom remove следует после них;
  - `energy/dissolve-retarget.ts` fsync-ит каждый из пяти fence/retarget
    outcomes, reasserts exact idempotency entry after reopen и не имеет
    release/delete path;
  - immutable Boundary/Energy receipts сохраняют source/target declarations,
    global keys, previous target keys, dependent bindings, generations,
    candidate/checkpoint/proof receipts и policy
    `retain-until-explicit-gc`;
  - focused causal tests: `4 pass`, `0 fail`, `28 expect`;
  - dissolve/candidate/promotion/Energy/Bulk integration suite:
    `32 pass`, `0 fail`, `203 expect`;
  - `bun run check`: typecheck pass, `42` expected diagnostics,
    `1667 pass`, `0 fail`, `5590 expect` в `188` test files;
  - `git diff --check`: clean;
  - live data/listeners/processes и runtime lifecycle не читались и не
    изменялись; endpoint/caller не добавлен; scoped implementation: этот
    commit.

### MF-118 — Сделать Graph единственной стартовой основой Bulk

- Status: `DONE`
- Dependencies: `MF-101`
- Current executor: Cloud checkout, delegated Codex task.
- Owner approval:
  - Bulk Monad при старте сам вызывает `Dark.readGraph`;
  - тот же Bulk-owned Graph Store владеет initial и всеми последующими
    актуальными read cuts;
  - Boundary initial projection не является стартовым источником Bulk;
  - browser получает полный текущий Graph, Visual остаётся stateless.
- Evidence:
  - `bulk/graph.ts` содержит typed full-document Store и единственный
    Graph-to-Bulk adapter с Bulk-local identity;
  - startup вызывает `Dark.readGraph`; production source guard запрещает
    возврат `Boundary.initialProjection.read`;
  - обычный Particle используется только как causal invalidation: после
    Boundary quiescence Bulk повторно читает Dark и атомарно заменяет validated
    cut, а browser получает full initial/current Graph control payload;
  - invalid Graph/root mismatch не заменяют предыдущий Store и переводят
    runtime в fail-closed error;
  - прежние `BulkObserverSnapshot`, fixture lifecycle и retained MF-117 v1/v2
    receipts остаются совместимыми без выдачи Boundary IDs за public identity;
  - focused Bulk suite: `29 pass`, `0 fail`; `bun run typecheck` и
    `git diff --check`: pass;
  - runtime/browser не запускались, live state не изменялся.

### MF-117 — Активировать causal Inference→Lada dissolve

- Status: `IN_PROGRESS`
- Dependencies: `MF-116`
- Current executor: canonical Inference integration checkout,
  current Codex desktop task.
- Current slice: `pkg/visual` production hardening and the
  `centered-nested` Bulk render integration are complete in the canonical
  working tree. MF-117 remains `IN_PROGRESS` because this slice does not close
  the wider causal dissolve/activation item.
- Owner approval:
  - owner explicitly approved one canonical no-stop live
    `zavx0z/inference → zavx0z/lada` causal transition;
  - implementation must add only an authenticated internal capability caller,
    run a fresh exact-cut preflight with recoverable rollback evidence, and
    stop without live mutation on any failed invariant;
  - after a successful preflight, authority permits exactly one atomic causal
    dissolve with no process stop/start/restart or hot reload and no GC;
  - after clean implementation commit and passing checks, owner separately
    authorized exactly one standard
    `metafor-inference-universe.service` restart with no config, environment
    or port changes, followed by live preflight.
- Implementation readiness:
  - loopback-only Dark route accepts only the exact operation and a private
    owner capability stored with mode `0600`; no public or generic Monad/Force
    write RPC was added;
  - fresh read-only preflight rebuilds the exact plan from the current
    cut/sequence, verifies Boundary integrity/current projection, eleven
    rollback files, five Energy handles and the pre-projection Bulk toruses,
    and writes no stage/admission/fence on failure;
  - Boundary root transition and durable admission commit share one SQLite
    transaction; a failure before commit rolls back structural rows, active
    root and receipt together;
  - the actual accepted candidate yields exactly two ordered one-entity Force
    consequences: Lada Atom replace, then Inference Atom remove;
  - post-projection acceptance requires no Inference Atom/Inflaton/torus,
    exactly one Lada root torus in the former-root frame, and the unchanged
    whole Lada subtree;
  - Energy fences exactly five source generations and retargets without
    release/delete; Mass bytes/key identities/history/checkpoint/rollback,
    receipts and superseded metadata remain `retain-until-explicit-gc`;
  - restored exact-cut Boundary, Energy and Bulk adapter tests pass;
  - the one approved activation committed all six durable Boundary steps and
    reopened admission, but its final Bulk verification returned HTTP `409`:
    legacy v1 compared a volatile full manifestation hash after ordinary
    Gluon/Photon consequences had advanced the same intact projection;
  - offline repair verifies immutable exact structural proof instead:
    source absence, Lada identities, full five-Atom recursive subtree,
    former-root frame and retention. Existing v1 receipt is read-only
    backward-validated by closed shape/self-hash and the same live structural
    invariants; dynamic state no longer conflicts;
  - server/browser selected root advances on the accepted Lada root
    `replace`; before it Inference remains normally manifested, after complete
    projection only its torus is absent and Lada owns the root frame;
  - existing State markers on Capsule toruses use bounded GPU line-glow
    material contrast: current is strongest, potential markers are readable
    but secondary, inactive sleeves remain subdued. The follow-up readability
    slice uses the same marker object and per-object uniform with deterministic
    state-change phase plus bounded spatial shimmer; no CPU particle
    simulation, extra marker geometry or perpetual render-loop condition is
    added;
  - deployed readability commit `e0e27766` exposed a real browser-only WGSL
    regression: the fragment stage declared `finalColor` with immutable `let`
    and then applied `*=`, invalidating the whole shader module and therefore
    the line render pipeline during Bulk initialization;
  - follow-up repair changes only that shader-local declaration to mutable
    `var`; the luminance/shimmer uniforms, current-versus-potential contrast,
    marker geometry and render-loop law remain unchanged;
  - executable Dawn/WebGPU gate compiles the production line WGSL into the
    production-shaped vertex/fragment render pipeline and proves the exact
    former `let finalColor` variant is rejected as `Invalid ShaderModule`;
  - fresh-browser evidence after the shader repair proves that the Lada root,
    five-Atom subtree and State markers are present, but the markers remain
    tiny and dim at the retained 100 mm root scale;
  - exact material-boundary cause: the State visual resolver computed
    `luminanceBoost`, `shimmerAmount` and `shimmerPhase`, while Bulk's orbital
    adapter forwarded only color/glow/glowIntensity. New materials therefore
    took neutral defaults and updates explicitly reset those controls to
    neutral values;
  - a read-only deployment/cache audit proved the failed browser screenshot
    received the commit `46f0b817` bundle with the complete adapter and raised
    values. HTML/JS return full `200` responses even for matching ETags and no
    service worker exists, so stale browser cache is not the cause;
  - exact remaining render cause: near-white RGB was already saturated by the
    UNORM presentation target, while native one-pixel markers remained behind
    scene depth and were attenuated again by 4× MSAA resolve;
  - the final bounded visual repair leaves the current marker at its earlier
    softer `4.8` glow / `1.45` luminance scene-depth look. State identity now
    deterministically controls hue across occurrences, while activity changes
    only brightness/opacity. Potential and inactive State balls retain their
    secondary hierarchy in one final single-sample additive material overlay,
    where `potential > inactive > background`;
  - the then-current non-root overlay and nested-only red Field accent were
    intermediate visual choices; the later owner Torus-consistency review below
    supersedes both and they are not part of the current law;
  - owner live review superseded the spherical placement introduced by
    `faa6a33d`, refined by `b325f7b7` and bounded by `9d9f375d`; its accepted
    visual baseline is the immediately preceding `41e76f48`;
  - the correction restores that placement wholesale: Fields consume their
    materialized Atom-local nucleus coordinates, State markers keep the
    toroidal manifestation composition, all marker/proxy/connection visuals
    use the owning Atom container, and root torus returns to readable
    scene-depth material;
  - no spherical marker frame/remap remains; marker count, radius and identity
    do not derive a renderer placement. Persisted coordinates, semantic parent
    ownership, causal layout, topology, identity, data, RPC, camera and
    render-loop conditions remain unchanged;
  - focused placement/torus/material/manifestation/camera/render-loop suite:
    `38 pass`, `0 fail`, `1636 expect`;
  - browser bundle compiled `150` modules; `bun run check` passed typecheck,
    `42` expected diagnostics and `1703 pass`, `0 fail`, `5782 expect` in
    `199` test files; `git diff --check` is clean;
  - no runtime lifecycle command, restart, hot reload, activation retry,
    rollback, deletion or GC was performed; scoped correction: this commit;
  - initial root fit and click/focused fit consume one conservative final-world
    envelope of the owning Atom's torus, marker spheres, Field proxies,
    transitions and local relations. The target remains the owning torus
    center and the existing camera direction, persisted pose and click-focus
    interaction remain unchanged;
  - that intermediate executable Dawn/WebGPU readback proved the bounded
    `current > potential > inactive > background` output hierarchy and the
    then-current nucleus material; the later owner Torus-consistency review
    supersedes the depth-specific nucleus material while retaining the State
    hierarchy and production shader compilation gate;
  - focused shader/material/readability/core/torus/navigation/render-loop suite:
    `50 pass`, `0 fail`, `235 expect`; browser bundle compiled `121` modules
    successfully;
  - `bun run check`: typecheck pass, `42` expected diagnostics,
    `1706 pass`, `0 fail`, `5846 expect` in `199` test files.
  - owner rejected the sole post-baseline centering commit
    `7cb0d80ee527529c1ae3da5575c6eafe47b75ec5`; canonical
    `codex-local-integration` was reset exactly to accepted baseline
    `2651e064f70a1e22592a48cda7cec6f23909672b`;
  - one owner-authorized standard cold restart restored that source without
    config/environment/port changes. All six health endpoints returned `ok`,
    and the post-restart journal recorded a new Bulk browser connection;
  - the follow-up source slice is contract/test-only: the existing accepted
    five-Atom Lada projection is shared as one deterministic fixture, with
    Auth/Chat/Model directly under Lada and ChatSend under Chat. The explicit
    three-level law composes translation plus uniform scale as
    `Lada → Chat → ChatSend`, checks direct-owner local/world bounds and
    forbids a root-skipping ChatSend frame;
  - focused coordinate plus existing MF-117 Monad proof:
    `11 pass`, `0 fail`, `69 expect`; current `bun run check`: typecheck pass,
    `42` expected diagnostics, `1706 pass`, `0 fail`, `5819 expect` in `200`
    test files; `git diff --check` clean;
  - no renderer/layout implementation, visual geometry, data, DB, receipts,
    State computation, topology/identity, config/ports, activation/preflight,
    GC, navigation, links or Monad capture changed. No new visual success is
    claimed.
  - owner then authorized one minimal recursive geometry slice on this
    accepted contract. Bulk layout now preserves Monad-supplied sibling order
    on one bounded immediate-parent planar orbit; spherical/Fibonacci
    elevation is removed, and nested Matter starts a new local orbit instead
    of joining a root/global allocation;
  - exact Lada proof keeps Auth/Chat/Model as the only direct Lada children,
    composes ChatSend only through Chat, rejects a root-authored ChatSend
    coordinate, checks local/world bounds and proves the direct layout is
    neither a row nor spherical packing;
  - current architecture/layout docs name the Monad-supplied recursive
    snapshot as structural source. Stale ELK-provider/integration claims were
    removed without adding an adapter;
  - focused layout/manifestation/Monad/HUD proof: `37 pass`, `0 fail`,
    `1650 expect`; current `bun run check`: typecheck pass, `42` expected
    diagnostics, `1708 pass`, `0 fail`, `5847 expect` in `200` test files;
    `git diff --check` clean;
  - the implementation does not change data, topology, State computation,
    links/proxies, navigation, Monad capture, ports/config or unrelated
    styling; scoped implementation: this commit;
  - exactly one authorized normal cold restart installed that commit without
    config/environment/port changes. All six health endpoints returned `ok`,
    and a fresh standard `/initial → /ws` browser-observer handshake logged
    `browser connected` for the five-Atom `zavx0z/lada` manifest;
  - pre-restart browser tabs that retained consumed one-shot observer sessions
    continued to disconnect until a fresh page/session; no transport or
    reconnect semantics were changed in this geometry slice. No screenshot was
    captured and no visual acceptance is claimed.
  - owner rejected both previous interpretations after live Monad Capture:
    Matter on the torus centreline mixed with State, while moving nested State
    to a parent orbit broke local Torus composition;
  - the approved recursive Torus law is identical on every Atom level: Fields
    remain in the nucleus; complete immediate Matter toruses leave the nucleus
    and occupy the first inner orbit of the owning parent torus; the owning
    Atom's own State sleeves occupy the following outer orbits, with all
    geometry still inside that Atom;
  - each child Atom repeats the same order recursively. Cross-level State
    translation, renderer re-parent, Matter in the Field nucleus and
    Matter/State band overlap are forbidden;
  - `snapshot.ts` now places each complete immediate Matter subtree with one
    uniform transform in `[r_inner, r_torus]`; `manifestation.ts` keeps every
    owning Atom's State sleeves after that band in `[r_torus, r_outer]`.
    Focused recursive-layout/manifestation proof: `31 pass`, `0 fail`,
    `1670 expect`;
  - full `bun run check`: typecheck pass, `42` expected diagnostics,
    `1747 pass`, `0 fail`, `6022 expect` in `209` test files;
    `git diff --check` clean;
  - one normal cold restart installed the corrected source as invocation
    `978c8583194c429d919f08ee618c8289`, PID `2354452`. All six contour
    `/health` endpoints returned HTTP `200`; Bulk was initialized with five
    Atom and root `zavx0z/lada`;
  - fresh Monad Capture from observer
    `bulk-web-360289a2-e3b2-473f-b142-494dade50954` returned a non-black
    `1450×2178` PNG of the cold-installed contour. Its exact structural
    snapshot proves for Lada and nested Chat:
    `fieldOuter = r_inner = matterInner = 16.667`,
    `matterOuter = r_torus = 33.333`, and the first State inner edges are
    `38.531` and `39.183`; every Atom's State cross-section remains below
    `torusTube = 16.667`. The image shows the three complete child Atom toruses
    on Lada's inner Matter orbit and the owning State sleeves on the following
    outer orbits.
  - a subsequent owner review identified the three non-Field spheres in the
    Auth screenshot as Process declarations, rejected their former placement
    in the Field nucleus and rejected the depth-specific red/scaled nested
    Field material. The clarified law is now owned by
    current `bulk/VISUAL.md` owner document: one Atom-local component pipeline at
    every depth, semantic Fields only in the nucleus, immediate Matter on the
    inner band, then State sleeves and their causal elements in the outer
    band;
  - `Process`, `Finally`, `Reaction` and state-Axion now each manifest exactly
    one stable visible particle at the canonical root occurrence of a related
    State. The whole causal particle keeps the anchor State's `rho` and `z`
    and receives only a tangential slot transform; repeated State path
    occurrences do not multiply the declaration. An unresolved declaration
    receives no arbitrary core or outside-Torus fallback;
  - root and nested Atom now share the same Field and torus visual functions:
    depth no longer changes semantic Field color, unit `visualScale`,
    opacity, glow or scene/overlay mode. The causal stage traverses the same
    materialized parent-child Atom tree as the structural stage;
  - final focused proof: `37 pass`, `0 fail`, `1656 expect`; final
    `bun run check`: typecheck pass, `42` expected diagnostics, `1748 pass`,
    `0 fail`, `6044 expect` in `209` test files; `git diff --check` clean;
  - one owner-requested normal cold restart installed the final source without
    config, environment or port changes as invocation
    `53f8d20c2e87434eacc7936754106405`, PID `2543671`. All six `/health`
    endpoints returned `ok`; Force was `running` with all five domains
    connected, and Bulk was initialized;
  - final Monad Capture from observer
    `bulk-web-bb3e1c4f-055c-46ea-a498-d101d1e5d77e` returned a non-black
    `1450×2178` PNG, `489804` bytes, SHA-256
    `1115e7aff1b58d2b01b772c4df857a295436b9788e97b14581a3ea43ca235e47`.
    Its latched structural proof reports every Field inside its owning core,
    every immediate Matter child inside `[r_inner, r_torus]`, every State and
    causal particle inside the owning torus cross-section, valid State anchors
    and one visible causal particle per declaration. Auth contains exactly
    eight Fields (`5 string`, `3 boolean`) and exactly three Process particles;
    all three Processes are anchored to their canonical Auth State
    occurrences at unchanged orbit radius and height.
  - owner follow-up review found two remaining Field-marker inconsistencies:
    Auth Fields retained `sphereRadius = 4.353398` while its State markers had
    `sphereRadius = 0.8`; after geometric equality was installed, Fields still
    inherited Torus `wireframeOpacity` and rendered at effective opacity
    `0.072`, making them almost invisible;
  - the owner contract now requires one exact Field/State `sphereRadius` inside
    every Atom with State. The State-density result uniformly scales both the
    Field sphere geometry and the whole local Field lattice, while the
    semantic colors remain distinct for `string`, `number`, `boolean`, `enum`
    and `array`;
  - an intermediate follow-up made Field and potential State reuse one
    readable marker class. Field kept its type color and unit visual scale but
    used the potential-State `overlay`, alpha `0.5`, glow intensity `2.4`,
    luminance `1.1` and material opacity `1`; it no longer inherited torus
    `wireframeOpacity` and did not claim current/active State semantics;
  - final focused manifestation/material/WebGPU proof: `22 pass`, `0 fail`,
    `165 expect`; final `bun run check`: typecheck pass, `42` expected
    diagnostics, `1748 pass`, `0 fail`, `6058 expect` in `209` test files;
    `git diff --check` clean;
  - one owner-requested normal cold restart installed the completed marker
    source without config, environment or port changes as invocation
    `78b43fcdc6c444d09ad8d1a6b64f564f`, PID `2622413`. All six `/health`
    endpoints returned `ok`; Force was `running` with all five domains
    connected, and Bulk was initialized;
  - fresh Monad Capture from observer
    `bulk-web-2b5c440d-309d-41a4-adba-c9c9e5d8dd45` returned a non-black
    `1676×2178` PNG, `729799` bytes, SHA-256
    `693a0137d33283e7329df9c84a52e33caf2c1d6ae71ba055b7989881a0aad5f7`.
    Its latched proof reports `Field radius = State radius = 0.8` in every one
    of the five Lada Atom, distinct colors for every Field type present and
    the readable potential-State marker material on every Field. Auth retains
    exactly eight Fields, now at the State radius with separate pink
    `string` and cyan `boolean` colors.
  - owner rejected that intermediate material because additive overlap of
    differently colored Fields in the dense nucleus saturated into a white
    patch. The final law keeps the common sphere-marker geometry and exact
    Field/State radius but renders Fields as opaque depth-tested `scene`
    markers: original type RGB, alpha/opacity `1`, glow intensity `0.8`,
    luminance `1`, unit visual scale and no additive color accumulation;
  - final focused manifestation/material/WebGPU proof after removing the
    additive Field pass: `22 pass`, `0 fail`, `160 expect`; final
    `bun run check`: typecheck pass, `42` expected diagnostics, `1748 pass`,
    `0 fail`, `6053 expect` in `209` test files; `git diff --check` clean;
  - one owner-requested normal cold restart installed the final non-additive
    material without config, environment or port changes as invocation
    `7a37bdd02f144fa984fa53c7a8d9fe71`, PID `2654327`. All six `/health`
    endpoints returned `ok`; Force was `running` with all five domains
    connected, and Bulk was initialized;
  - fresh Monad Capture from observer
    `bulk-web-54dcca24-5e94-41c6-8ddd-282e379a7c78` returned a non-black
    `1676×2178` PNG, `734560` bytes, SHA-256
    `6a4fcbb2ed8e8b2456e47462720274ca38799ed3eb963c9b134b6ec3591d6133`.
    Its latched proof retains `Field radius = State radius = 0.8` in every
    Lada Atom, distinct Field type RGB and the opaque depth-tested material on
    every Field. The captured nucleus shows separate saturated pink and cyan
    particles instead of the rejected white additive patch.
  - owner accepted the non-additive color separation but rejected the final
    opaque Field look as visually flat and required the same soap-bubble style
    used by State. The domain contract now names one shared bubble-style
    sphere-marker function: translucent surface, colored glow and bounded stable
    spatial shimmer. Field reuses the potential-State effect level while
    preserving raw type RGB and the ordinary depth-tested `scene` blend; it
    does not re-enter the rejected additive overlay;
  - implementation extracts that style into
    `pkg/visual/internal/marker-bubble.ts`. Potential State and Field both consume
    it; Field refresh forwards shimmer amount and phase together with the
    existing material controls. Focused State/Field/material/WebGPU proof:
    `15 pass`, `0 fail`, `86 expect`; final `bun run check`: typecheck pass,
    `42` expected diagnostics, `1749 pass`, `0 fail`, `6058 expect` in `209`
    test files; `git diff --check` clean;
  - one owner-requested normal cold restart installed the shared bubble style
    without config, environment or port changes as invocation
    `6dbca8b719a547a6aed50b5b2f8353ed`, PID `2691583`. All six `/health`
    endpoints returned `ok`; Force was `running` with all five domains
    connected, and Bulk was initialized;
  - fresh Monad Capture from observer
    `bulk-web-24711576-f700-45cb-8760-754f8b2ea213` returned a non-black
    `1676×2178` PNG, `980794` bytes, SHA-256
    `341433c6812d4eeb43daf1e396681cd0460dfdc5f17c6c5b3b5ada6104b4c7e1`.
    Latched proof reports `Field radius = State radius = 0.8` in all five
    Lada Atom, common potential-State bubble alpha/glow/luminance/shimmer on
    every Field, stable per-Field shimmer phase, raw semantic type RGB, unit
    scale and depth-tested `scene` mode. The captured nuclei show separate
    translucent pink/cyan/yellow bubble surfaces without the rejected additive
    white patch.
  - owner follow-up replaced the playground entity enumeration with the
    public `pkg/visual` layout catalog. `Visual` now contains the current
    `outside-in` strategy marked `in-progress`; reusable entity lenses moved
    to `VisualComponents` and remain outside top-level navigation. The
    outside-in scene composition moved from a playground-local lab into the
    production package root, while future `inside-out` remains a distinct
    strategy rather than a hidden flag;
  - the `416×1170` browser/CDP proof measured a `75 px` compact layout bar and
    a `416×1095` stage with active `Снаружи → внутрь`; the former
    `Atom/Matter/Field/...` links are absent. The page bundle completed, DOM
    counts reported `5` Atom/Matter Torus, `54` nucleus Fields, `23`
    State sleeves, `98` State-Torus and `130` Transition;
  - WebGPU pixel acceptance for this local proof remains open: headless capture
    failed on the known SharedImage/external-instance boundary and Xvfb
    capture returned a black GPU canvas. No visual geometry success is claimed
    from those frames;
  - a reported Bun runtime overlay after the module move was localized to the
    default full-stack HMR graph, not to the clean `client.ts` bundle. The
    playground now disables HMR because its top-level client owns GPU devices,
    canvases and document listeners until full page unload. Clean browser proof
    serves one ordinary bundled chunk with no `/_bun/client`, loads all six
    navigation links and reports no `Failed to load bundled module` overlay;
  - owner screenshots then exposed a separate outside-in composition defect:
    graph fitting reduced State form radius together with its distances, the
    fixed Field hole remained mostly empty and leaf Atom still reserved a
    Matter band despite having no child Torus. An intermediate `12 px`
    camera-dependent screen floor made the mismatch more obvious and was
    explicitly rejected;
  - that screen floor is removed completely from the viewport API and render
    loop. The corrected `outside-in` geometry is computed once from snapshot
    content: the inner Torus edge follows the actual Field nucleus, Matter is
    allocated only for immediate child Atom-Tori, State starts after the last
    occupied layer and the outer edge ends after the real State sleeves.
    Camera distance, zoom and viewport size never change an individual form;
  - State graph compaction changes centre distances only. Every State keeps
    the owning Atom's exact static Field/State marker radius: root `0.8`,
    depth one `0.133333` and ChatSend depth two `0.022222` in world units.
    The full fixture root contracts from production `[inner=16.667,
    outer=50]` to the then-current static visual `[inner=4.171,
    outer=28.427]`; leaf Model and ChatSend use no phantom Matter reservation;
  - `bun test pkg/visual`: `73 pass`, `0 fail`, `1433 expect`;
    package and root typecheck plus `git diff --check`: pass. The authorized
    `metafor-visual-playground.service` restart entered active state at
    `2026-07-29 12:25:05 MSK`, PID `1753959`, and serves ordinary chunk
    `chunk-31hhscax.js` without `/_bun/client` or a new runtime overlay. No
    fresh GPU pixel capture is claimed for the corrected static geometry. No
    domain runtime, Store, data, config, port or activation was changed.
  - owner review removed the duplicate Bulk surface name: it had no independent
    entity, ownership or geometry law and only duplicated the existing Torus
    radius, Torus tube and State-sleeve terminology. Public `LevelGeometry`
    now exposes `torusRadiusMm` and `torusTubeMm`; the lattice implementation
    uses neutral `layer` terminology. Focused level/layout proof: `20 pass`,
    `0 fail`, `1542 expect`; root typecheck and `git diff --check`: pass.
  - owner clarified that self-similarity belongs to the reusable Torus visual
    component, not to Atom: Atom, State, Fuzzy, MACHO and Axion are semantic
    owners of the same form. `pkg/visual/Torus.ts` now owns the recursive
    component, code-owned proportions and mesh detail; `outside-in` no longer
    drops Axion or labels every Dark particle as Atom. State consumes the same
    constructor, while its condition Fields remain in the Torus core;
  - the three playground geometry sliders (`inner diameter`, `marker radius`,
    `orbit gap`) and their mutable browser handlers are removed. Named layouts
    no longer read Torus defaults from `localStorage`; isolated algorithm labs
    may still vary their own experiment without feeding a layout. Internal
    production Bulk defaults remain frozen code values;
  - State Graph rendering now reuses Torus/Sphere geometry per viewport and
    compiles all Transition into at most two `LineSegments` batches
    (forward/returning) instead of one draw object per Transition. Focused
    Visual/Bulk proof after the shared Fields promotion: `109 pass`, `0 fail`,
    `3146 expect`; package and root
    typecheck plus `git diff --check`: pass.
  - the authorized visual-playground-only restart entered active/running at
    `2026-07-29 13:05:58 MSK`, PID `1881205`, and serves
    `chunk-bbjdg47t.js`. Fresh HTTP proof contains `Visual layouts` and the
    layout-mode rule that hides development visibility controls, while the
    removed Layout fieldset, its three input ids and the rejected Fields
    surface name are absent. No domain contour was restarted and no GPU pixel
    acceptance is claimed from this HTTP proof.
  - owner promoted the deterministic Fibonacci pseudo-sphere from
    `Analysis → Fields` into the shared Torus Field-core law. The pure cached
    `FieldsLayout` now derives the minimum non-overlapping distribution radius
    from the actual marker size; production manifest coordinates remain input
    data and are not mutated;
  - owner then rejected the inverse State-core fit and the resulting
    content-dependent marker sizes. The named layout now uses one recursive
    baseline from the approved Torus study: an actually empty root is
    `[inner=5.56, outer=50]` (`100 мм` outer diameter,
    `radius=27.78`, `tube=22.22`) with fixed `5 мм` Fields. Empty Torus and
    Fields both scale by exactly `0.5` at every containment level. Contents are
    never reduced to fit: the Field nucleus expands the inner boundary and
    Matter/State content expands the outer boundary while preserving at least
    the empty Torus radial thickness;
  - Outside-In no longer consumes production `sphereRadius` or `torusScale` as
    presentation sizes. Condition Fields use the same direct fixed-size
    Fibonacci law as nucleus Fields, so State-Torus grows around one, two or
    more equal Fields instead of rescaling them into a pre-existing hole;
  - an attempted follow-up incorrectly collapsed all per-start State sleeves
    into one unique-State ring. Owner rejected that structural regression.
    Outside-In again keeps every declared root State as a separate fully
    expanded causal sleeve with its paths, branches and Transition; repeated
    State occurrences retain sleeve context without creating new domain
    identity. The full fixture is restored to `5` Dark Tori, `54` nucleus
    Fields, `98` State-Torus occurrences (`23` identities) and `130`
    Transition occurrences;
  - the recursive size law remains independent of that correction: the filled
    root is `[inner=23.598, outer=868.664]`; observed nucleus Field radii are
    exactly `5`, `2.5`, `1.25`, and condition Field radii are exactly `2.5`,
    `1.25`, `0.625`. Visual plus related Bulk-geometry proof: `111 pass`,
    `0 fail`, `3170 expect`; root typecheck and `git diff --check`: pass. The
    authorized visual-playground-only restart entered active/running at
    `2026-07-29 13:46:26 MSK`, PID `2001557`, and serves
    `chunk-whnqmkjs.js`; host-namespace bundle proof contains the restored
    `отдельный причинный рукав` description. No production manifestation or
    domain contour is changed, and no GPU pixel acceptance is claimed.
  - owner then identified that equal angular State slots still treated every
    sleeve as the largest sleeve and pushed all seven leaf Auth sleeves onto a
    needlessly distant orbit. Outside-In now packs the actual polar envelope
    of every separate sleeve. Exact disk demand, a direct safe sector bound
    and one fixed midpoint verification require at most three linear node
    passes plus one sleeve prefix pass; there is no pairwise sleeve collision
    search, convergence loop, binary fit or frame-time layout work;
  - the remaining all-pairs State-node scale fit was also removed. Each sleeve
    now uses one organic linear level sweep: adjacent fixed State radii define
    row distances and adjacent level maxima define forward distances. Input
    coordinates no longer become a content-dependent scale. A structural
    update builds one new immutable scene in work proportional to its emitted
    occurrences; no layout work remains in the render loop;
  - the full fixture retains `5` Dark Tori, `54` nucleus Fields, `98`
    State-Torus occurrences (`23` identities) and `130` Transition
    occurrences. Leaf `lada-auth` has no child Torus and contracts from the
    rejected `[inner=8.946, outer=290.582, State inner=86.665]` to
    `[inner=8.946, outer=175.608, State inner=23.862]`; the measured minimum
    cross-sleeve surface gap is positive (`3.891`). The filled root is now
    `[inner=23.598, outer=763.427]`. Visual plus related Bulk-geometry proof:
    `113 pass`, `0 fail`, `3419 expect`; root typecheck and
    `git diff --check`: pass. The authorized visual-playground-only restart
    entered active/running at `2026-07-29 14:30:42 MSK`, PID `2135446`, and
    serves `chunk-cd9ge3k0.js`; host-namespace proof contains
    `packStateSleeves` and `Math.asin` but not `/_bun/client`. No domain
    contour was restarted and no GPU pixel acceptance is claimed from the
    bundle proof. A warm `5000`-run measurement of
    `buildOutsideInVisualScene` over the prepared full fixture
    (`5` Tori / `98` State occurrences / `130` Transition) averaged
    `0.1047 ms` per immutable scene build; this measurement deliberately
    excludes upstream graph construction.
  - owner screenshots then showed that the former `0.75 × Field radius`
    State-node spacing was visually consumed by the translucent Torus edge,
    while branch/level maxima made other intervals look larger. Outside-In now
    has one code-owned self-similar minimum surface gap of exactly one owning
    Field radius for adjacent State-Torus: root `5`, depth-one `2.5` and
    depth-two `1.25` mm. Branching may create a larger real interval, but no
    adjacent State pair receives a smaller one and no browser control is added;
  - owner also promoted `Analysis → Fields → Псевдокруг` from a
    playground-only experiment to the shared Field-core law. The generic
    cached `FieldsLayout` takes the actual marker radius and fills the nearest
    triangular-lattice positions at one-diameter spacing. Both owning Torus
    nuclei and condition Fields inside State-Torus now reuse this flat
    hexagonal packing; the Fibonacci pseudo-sphere remains only as the sibling
    comparison lab. Production Bulk coordinates are still input-only;
  - the full fixture retains `5` Dark Tori, `54` nucleus Fields, `98`
    State-Torus occurrences and `130` Transition occurrences. All nucleus
    Fields are planar; leaf Auth is now
    `[inner=11.953, outer=176.260, State inner=22.466]` and its minimum
    adjacent-State surface gap is `2.5`. Visual plus related Bulk-geometry
    proof: `114 pass`, `0 fail`, `3541 expect`; root typecheck and
    `git diff --check`: pass. The authorized visual-playground-only restart
    entered active/running at `2026-07-29 14:42:47 MSK`, PID `2174605`, and
    serves `chunk-swj0jdhg.js`; host-namespace proof contains both
    `layoutFieldsInPseudoCircle` and `packStateSleeves` but not
    `/_bun/client`. No domain contour was restarted and no GPU pixel
    acceptance is claimed.
  - owner then fixed every solid Sphere highlight at `1` and rejected the
    remaining horizontal faceting of Torus. `createQuantumSphereMaterial`
    centrally owns the fixed Sphere highlight for nucleus Fields, condition
    Fields, Fields Analysis and Sphere Skin Lab; Torus keeps its independent
    highlight default. Every Torus role now reuses the same fixed
    `radialSegments = 32` / `tubularSegments = 192` mesh detail, including the
    formerly separate `22` / `44` Form Skin Lab geometry. Visual plus related
    Bulk-geometry proof: `116 pass`, `0 fail`, `3549 expect`; root typecheck
    and `git diff --check`: pass. The authorized visual-playground-only
    restart entered active/running at `2026-07-29 14:51:02 MSK`, PID
    `2198787`, and serves `chunk-9matgvaa.js`; host-namespace proof contains
    `createQuantumSphereMaterial`, `SPHERE_QUANTUM_HIGHLIGHT_SIZE`,
    `radialSegments: 32` and `tubularSegments: 192` but not `/_bun/client`.
    No domain contour was restarted and no GPU pixel acceptance is claimed.
  - the next fresh screenshot showed that the preceding one-radius State gap
    was still not visually distinguishable and exposed a real inconsistency:
    within-sleeve layout used `1 × owning Field radius`, while cross-sleeve
    packing still used only the unrelated Torus content gap
    `0.75 × Field radius`. Both paths now receive one shared State surface gap
    equal to a full owning Field diameter: root `10`, depth-one `5` and
    depth-two `2.5` mm. Full-fixture world-space measurement finds those exact
    within-sleeve minima; cross-sleeve minima are no smaller (`lada-auth`:
    `7.054` mm for a required `5` mm). The direct linear packing formula and
    pass count are unchanged. Visual plus related Bulk-geometry proof:
    `116 pass`, `0 fail`, `3549 expect`; root typecheck and
    `git diff --check`: pass. The authorized visual-playground-only restart
    entered active/running at `2026-07-29 14:56:06 MSK`, PID `2214708`, and
    serves `chunk-ddfswmt5.js`; host-namespace proof contains
    `stateNodeSurfaceGap` and `STATE_NODE_GAP_TO_FIELD_RADIUS` but not
    `/_bun/client`. No domain contour was restarted and no GPU pixel
    acceptance is claimed.
  - owner requested a visual trial with top-level Field diameter increased
    from `10` to `22` mm. The single code-owned baseline is now radius `11`
    mm, yielding nucleus Field radii `[11, 5.5, 2.75]`, condition Field radii
    `[5.5, 2.75, 1.375]` and State surface-gap diameters `[22, 11, 5.5]`
    across the three observed levels. No control or dynamic scale was added.
    The full fixture remains `5` Tori / `54` Fields / `98` State occurrences /
    `130` Transition occurrences; its root Torus grows around the trial
    content to `[inner=72.121, outer=1206.434]`. Visual plus related
    Bulk-geometry proof: `116 pass`, `0 fail`, `3549 expect`; root typecheck
    and `git diff --check`: pass. The authorized visual-playground-only
    restart entered active/running at `2026-07-29 14:59:59 MSK`, PID
    `2226403`, and serves `chunk-315m6gjk.js`; host-namespace proof contains
    `rootFieldRadius: 11` but not `/_bun/client`. No domain contour was
    restarted and no GPU pixel acceptance is claimed.
  - the `pkg/visual` production-hardening slice now exposes executable
    immutable layout strategies through `@metafor/visual/layout`, keeps
    production materials at the package root and the identity-dropping
    renderer adapter at `@metafor/visual/viewport`. Shared Dark-tree,
    self-similar Torus and State-sleeve composition are strategy-neutral;
    `centered-nested` is `ready`, while `outside-in` remains explicitly
    `in-progress` and is never an unknown-slug fallback;
  - complete scenes reject missing, duplicate, mismatched or swapped
    State-owner bindings and preserve both Atom and Dark occurrence identity.
    Inputs and outputs are deeply immutable; cached Field layouts have exact
    keys and bounded retention; topology count/depth/cycle guards fail before
    recursive composition, and absent parents are rejected. Manifest and graph
    current State identities are required to be unambiguous and consistent.
    Those package invariants now feed the Bulk-owned projection described
    below; the subsequent full-contour cold restart is recorded with the
    runtime evidence below;
  - the completed Bulk slice introduces a pure fail-closed
    `bulk/visual-layout.ts` projection over the immutable canonical
    `BulkManifest`. `BulkVisualRenderManifest` keeps only compact canonical
    source counts, renderer-compatible geometry, all Field aliases, exact
    State-Torus and condition-Sphere sidecars and fixed package-owned Torus
    and Sphere detail as separate data; `bulk/web` imports only its
    lightweight type contract;
  - initial manifestation and every changed browser projection use the same
    `applyViewportManifest` path. The full Bulk observer fixture proves `5` centered
    Dark Torus, `54` canonical Field occurrences represented by `28` render
    markers and `54` aliases, plus unchanged exact sets of `142` orbital,
    `165` Transition, `315` proxy and `511` relation identities. All `129`
    State occurrences receive exact Torus forms and `185` condition proxies
    receive exact Sphere forms;
  - State mapping comes only from explicit `nodeId ↔ orbitalParticleId`;
    condition proxies resolve by exact `(stateOrbitalParticleId, fieldId)`.
    Every Visual edge matches exactly one canonical Transition, every relation
    endpoint stays in its channel's centered root component, causal particles
    use explicit package-owned placements beside their exact State anchor, and
    missing identities fail closed;
  - the viewport consumes fixed `64 × 192` detail for large Dark Torus,
    `32 × 192` for embedded State/Field-proxy Torus and `32 × 24` for Sphere,
    together with production quantum surfaces. Synthetic grouped Field ids
    remain render-only: Force targeting resolves through canonical
    `(parentDarkParticleId, fieldId)` aliases. Direct Higgs/Gluon geometry
    mutations and the canonical renderer fallback were removed;
  - owner explicitly deferred Bulk Axion activation to a later slice.
    `pkg/visual` retains the reusable Axion-capable Torus form, while the
    Bulk adapter removes Axion and its exclusive geometry before layout, so it
    cannot consume a causal slot or change visible placement. The renderer
    rejects any Axion-bearing render manifest;
  - the renderer boundary carries geometry plus compact canonical counts, not
    the full semantic manifest. Orbital and proxy forms are exhaustive,
    disjoint sidecars without duplicated `sphereRadius`/`ringRadius`, missing
    parents fail closed, and production State sizing is runtime-frozen;
  - the previous `bulk/gravity/layout` snapshot/stream implementation,
    `bulk/gravity/level`, layout settings/types, wireframe/LOD/fallback/cosmos
    render paths and billboard/card residue were physically removed. Only
    Transition and Relation retain `LineSegments` as first-class connections;
  - the production layout import uses only
    `@metafor/visual/layout/centered-nested`. The minified browser proof
    contains `centered-nested` and contains neither `outside-in`,
    `projectVisualSceneToViewport` nor playground. Its engine-neutral narrow
    entrypoint is `43760` minified bytes and contains no
    `ThinFilmMaterial`, `outside-in` or playground. Independent focused proofs
    pass: `pkg/visual` — `121/121` in `23` files, `2271` expectations; `bulk`
    — `181/181` in `31` files, `5440` expectations;
  - package and root typechecks pass; `npm pack --dry-run` contains `26`
    entries, `59290` packed bytes, `232374` unpacked bytes and no
    playground/spec/annotation artifacts;
  - full `bun run check`: typecheck and `42` expected diagnostics pass,
    `1830 pass`, `0 fail`, `11616 expect` in `227` test files;
    `git diff --check`: clean;
  - the complete-scene playground viewport no longer projects the named layout
    back through `StateGraphViewport`: the current fixture sends all `490`
    Mesh placements and `31` package-owned line batches directly to
    `createVisualSceneViewport`, preserving `165` Transition and `511`
    Relation sampled paths. A clean GPU browser capture of the live
    `#/centered-nested` route at `816 × 957` produced a non-black `191210`
    byte PNG and the live manifest reported `5` Dark Torus, `28` rendered
    Fields, `129` State Torus, `13` causal particles and `315` Field proxies;
  - production indexes scan Fields and State occurrences once per snapshot,
    index each State graph once per owner and resolve exact ordered-condition
    Transitions without repeated source scans. Independent audit benchmark for
    terminal State roots grows linearly at `12.1/24.7/48.1/92.3 ms` for
    `800/1600/3200/6400` States; the remaining `stateName` source lookup is
    confined to the development description path;
  - after the integrated code changes the canonical five-domain contour was
    cold-restarted as
    `metafor-inference-universe-codex.service`: it is `active/running`, and
    host-context HTTP probes return `200` from both Bulk `:4004` and the
    independently running Visual playground `:4014`. The browser observer
    reconnected after restart. A fresh authenticated Monad capture of live
    Bulk root `zavx0z/lada` returned a non-black `3840 × 2176` PNG of
    `2580683` bytes: its former Atom slot contains
    `ВРЕМЯ · causal stack` with Force/Mass/Boundary, and the separate bottom
    dock contains `Пауза`/`Продолжить`/`Шаг` while the scene keeps the
    package-owned centered layout.
- Activation constraints:
  - visual commit `faa6a33d` received one authorized standard cold restart;
    the service returned active/running, all six ports listened and startup
    evidence showed all five domains connected to Force. Direct HTTP health
    remained inaccessible from the isolated executor network namespace;
  - `b325f7b7` then received one authorized standard cold restart and returned
    healthy, but its fresh screenshot rejected the still-unbounded local spherical frame:
    the owning frame was correct while the `sqrt(markerCount)` radius could
    outgrow its nested Atom. A three-level render fixture measures the former
    busy-frame center at `0.9242` of its own torus diameter. The bounded law
    measures marker centers at `0.5900` and the worst outward Field-proxy
    relation endpoint at `0.6365` after the full recursive `matrixWorld`;
  - `9d9f375d` received one authorized standard cold restart and returned
    active/running with all five domains connected to Force. Its fresh
    screenshot showed that bounded geometry was still framed as torus-only:
    in the actual portrait viewport the old initial fit kept the torus at
    NDC `0.927` while legal marker centers reached `1.154` and a local
    Field-proxy endpoint reached `1.287`;
  - the pre-sphere visual restoration keeps that later camera-fit algorithm
    unchanged. Accepted baseline `2651e064` is now cold-installed with health
    and browser reconnect proof only; no fresh screenshot or new visual
    acceptance is claimed;
  - the world is already complete at active root `zavx0z/lada`; activation
    must not be retried and a new preflight is neither required nor valid;
  - the immediate-parent planar-orbit slice and the later owner-requested
    recursive Torus/Field-marker corrections received their separate cold
    proofs and Monad Captures recorded above. The latest installed state is the
    shared State/Field bubble-style capture; no further restart, hot reload,
    activation retry, rollback or GC is required by this slice.

### MF-109 — Реализовать Pause/Stack branchable execution workspace

- Status: `WAITING`
- Dependencies: `MF-103`, `MF-108`
- Acceptance:
  - Force ставит внешний admission на pause, дренирует уже причинно начатые
    deliveries и публикует доказуемый causal layer frontier;
  - accepted Particle собираются в причинные параллельные слои, привязанные к
    checkpoint/sequence/frontier; слой cache disposable и rebuildable;
  - workspace выбирает прежний layer либо checkpoint, восстанавливает только
    isolated Boundary+Mass projection и строит состояние canonical forward
    Particle/JSON Patch replay без inverse storage;
  - от выбранной точки создаётся execution branch с альтернативным следующим
    input; ветви сравнимы и не меняют live contour;
  - неудачная ветвь удаляется без следа в canonical history, promotion удачной
    ветви в live contour остаётся отдельным cold owner gate.

### MF-110 — Добавить Interpreter pause/stack control surface

- Status: `WAITING`
- Dependencies: `MF-109`
- Owner-approved narrow precursor `MF-110C`:
  - Status: `DONE`;
  - Current task: canonical integration delegated from Codex task
    `019fa7d5-59ce-7fc3-9be7-350e1bc5770c`;
  - authority is limited to the existing Dark Force pause/stack/resume
    service, Bulk Monad relay and visible causal-time HUD;
  - this precursor does not complete `MF-109`, does not add backward
    reconstruction, execution branches, promotion, generic Interpreter
    commands or a new Force wire message;
  - target-native Mass history resolution policy may classify future
    measured capture pressure, but this precursor does not invent capture
    metrics or attach an unmeasured resolution to a frame;
  - completion requires focused/full source checks, one ordinary full cold
    restart, a fresh observer, Monad PNG evidence of the keyframe and verified
    pause/resume behavior.
  - Evidence:
    - Dark time controller/Monad/HUD baseline remains commit `85cedcad`;
      target-native Mass resolution policy is commit `47dbbb13`; semantic
      non-conflicting `ff462229` remainder is commit `a1b077b7`;
    - focused policy/relay/frame/HUD/Dark tests: `13 pass`, `0 fail`;
      full `bun run check`: typecheck pass, `42` expected diagnostics,
      `1744 pass`, `0 fail`, `5973 expect` in `209` test files;
    - exactly one ordinary full restart produced systemd invocation
      `e2bca877c70c4a7b9c03745f3cde87e8`; all six health endpoints passed, and
      fresh observer `bulk-web-280b3710-d94f-43a9-ab5b-72a78bbce6c9`
      connected;
    - live stack began empty; Pause created frame `1` at acceptance sequence
      `29` with checkpoint phase `held` and closed external admission;
    - Monad observer capture returned a real non-black `2560×1440` PNG,
      `817658` bytes, SHA-256
      `329659dbaf1f1755440352af9dbfdad2c31f018de5e0c41026aae4240ab29fda`;
      the frame visibly contains one keyframe on Force/Mass/Boundary,
      disabled Pause/Step and active Resume;
    - live `dark.force.step` was reachable and rejected missing explicit
      Particle input without mutation; the focused controller test proves
      exactly-one stepping only with an owner-supplied Particle;
    - Resume returned `{ok:true}`, cleared stack to `[]` and reopened external
      admission. The same PNG leaves the nested torus visual gate open:
      Chat/ChatSend ownership is not yet visibly separated; no coefficient or
      layout change was made in this precursor.
- Completed precursor evidence:
  - `MF-110T` — `CODE COMPLETE / VISUAL ACCEPTANCE PENDING`: read-only Bulk
    current-cut timeline adapter integrated as commit
    `1274fe76da42fc1ea74902f79f228c1ac8475820`;
  - adapter consumes the real Inference Bulk Atom projection and shared
    `throughTs`; cold projection is `unknown`, and no historical sample,
    Force-history/Mass read or command is invented;
  - focused
    `bun test bulk/timeline.spec.ts bulk/hud.spec.ts bulk/web/render-loop.spec.ts pkg/ui/hud/timeline.test.ts`
    passes: 8 tests, 0 failures, 20 expectations;
  - cold AI-server contour served Bulk and kept all five domains connected,
    but the captured frame remained blank with the host
    `WebgpuSwapChainTexture`/SharedImage backing defect; therefore visual
    acceptance requires a known-working browser/GPU context and remains open.
- Next gate `MF-110R` — RPC discovery и read-only selected-tick projection:
  - Status: `GATE`; Production One audit has no final evidence yet and at the
    time of this update is waiting for approval after a failed read-only probe;
  - first record only discovered RPC methods plus read/status response forms;
    presence of pause/step may be observed, but no control method is invoked;
  - define a closed selected-tick result reconstructed only into an isolated
    projection from verified checkpoint + canonical forward history, with
    explicit `exact`/`coarse`/`unknown` resolution;
  - keep pause/step outside Force wire and keep UI controls inactive until
    `MF-103` and `MF-109` are complete and an independent verifier accepts the
    read-only reconstruction boundary.
- Documentation authority gate `MF-110R-DOC`:
  - Status: `GATE`; canonical RPC law belongs to Create MetaFor in the separate
    general MetaFor repository, under All Rules `create-metafor/rules/`;
  - read-only inspection of published general MetaFor `origin/main` revision
    `35c201f04d814ef5028bf1b8a0841185cb0e6da1` found only
    `create-metafor/rules/metafor.md`, an authoring guide with no RPC/service,
    Monad, history, checkpoint or pause/step contract;
  - exact missing rule slot is `create-metafor/rules/rpc.md`;
  - next available general-MetaFor executor must create that rule, define
    method ownership/discovery, closed read/status DTOs, pause/step commands,
    selected-tick isolated projection and Force-wire exclusions, then register
    the owner document in general MetaFor `docs/README.md`;
  - this Inference worktree must not create or edit the external rule; its
    plan/TODO remain evidence pointers until the canonical rule is accepted.
- Acceptance:
  - Interpreter через closed Dark Monad contract умеет pause, inspect layer,
    step forward/backward и create/list/discard execution branch;
  - Interpreter не вызывает Boundary/Mass напрямую и не может hot-replace
    live contour;
  - UI показывает только structural/debug metadata, не raw Mass payload.

## P2 — Dark Monad structural patch vertical slice

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

### MF-201 — Реализовать fast Dark Monad validator

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

- Status: `GATE`
- Dependencies: `MF-200`
- Owner decision:
  - нужен ли отдельный Dark Monad operation-service log для pre-Force phases;
  - он не является Force history и не нужен для наблюдения structural
    Inflaton;
  - без отдельного approval storage/implementation не создаются.
- Acceptance:
  - serialized/idempotent `operationId`;
  - полный serialized patch и patch/base/written/normalized digests;
  - distinct validation/write/execute/round-trip/materialize phases;
  - exact outcome/error;
  - read-only service-phase observation валидирует operation/target/time
    filters;
  - journal не дублирует Dark Force Particles и не является Graph, Particle
    history или VCS.

### MF-204 — Немедленно materialize через текущий runtime path

- Status: `WAITING`
- Dependencies: `MF-202`
- Acceptance:
  - successful write запускает MetaFor execution/normalization/round-trip;
  - Dark Monad испускает structural Inflaton через Dark Force;
  - Boundary materialize structure только после Dark Force acceptance;
  - derived entity consequences идут отдельными Particles через Dark Force;
  - Force v2/ACK/replay не являются dependency;
  - exact service result возвращает materialized либо точную failure;
  - approved `MF-203` log, если он существует, фиксирует тот же outcome, но не
    блокирует materialization.

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
  - Graph read;
  - patch optional scalar Field без default;
  - fast validation;
  - atomic write;
  - immediate materialization;
  - operation/particle history read;
  - Graph reread;
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
  - параллельный Dark Monad generator отсутствует;
  - CLI behavior не дублируется.

### MF-301 — Реализовать create template→patch→validate→materialize

- Status: `WAITING`
- Dependencies: `MF-205`, `MF-300`
- Exact path:
  - Create MetaFor template;
  - Dark Monad validation(template);
  - target patch;
  - Dark Monad validation(result);
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
  - результат читается тем же Graph RPC.

## P4 — отложенные расширения

### MF-400 — Dark Force v2 durability/replay

- Status: `GATE`
- Dependencies: `MF-206`
- Deferred decision:
  - delivery control frames/channel;
  - journal, ACK/NACK/resume;
  - authoritative consumer cursors.

### MF-401 — Обобщить растворение структурного родителя

- Status: `GATE`
- Dependencies: `MF-206`
- Execution task:
  [`task/generic-parent-dissolve.md`](generic-parent-dissolve.md)
- Current boundary:
  - `MF-111 → MF-117` доказал и выполнил только точный
    `zavx0z/inference → zavx0z/lada` переход с одним прямым целевым ребёнком;
  - общий случай с несколькими прямыми детьми в действующем коде отсутствует;
  - старые изменения `963f52b3` и `0a55845a` сохраняют полезный замысел, но не
    имеют настоящей Boundary/Energy/Force реализации и не применяются
    выборочно поверх `main`.
- Next gate:
  - owner утверждает необходимость общего случая, его область и право на
    живое выполнение;
  - реализация строится на действующих Boundary, Energy, Mass, Force и
    Graph контрактах, не заменяя специальный принятый путь `MF-117`;
  - до этого задача не `READY`.
- Acceptance:
  - все прямые дети детерминированно поднимаются в прежний интервал родителя;
  - судьба каждого Mass-ключа указана ровно один раз;
  - полный набор изменений проходит проверку до одной транзакции Boundary;
  - после commit каждая изменённая сущность идёт отдельной Particle;
  - ошибка либо несовпадение не оставляют частичного результата.

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
  - только собственная structural scope через тот же Graph contract;
  - resource limits;
  - Dark Monad validation;
  - operational observability;
  - не является изменением текущей Lada topology.

## Evidence log

Заполнять только после фактической работы:

| Item | Commit/diff | Checks | Result |
| --- | --- | --- | --- |
