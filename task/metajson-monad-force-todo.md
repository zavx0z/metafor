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
  - stateless Dark Monad assembly Dark declaration + Boundary current
    projection;
  - compact complete normalized MetaDSL template;
  - nested sparse current Atom values без provenance/status envelope;
  - public structural paths/references без raw storage identities;
  - порядок сохраняется только по доказанным domain/materialization laws;
  - revisions/digests/CAS и directed ports/stubs/global edges отсутствуют;
  - Mass bytes, live Energy, history и patches отсутствуют в snapshot.

### MF-101 — Реализовать единый MetaJSON v1 read

- Status: `DONE`
- Dependencies: `MF-100`
- Current task: Codex task `019f9c3a-a2ec-7460-bd80-34ec2a630697`
- Evidence:
  - public MetaJSON v1 document/types/closed validator:
    commit `b8e061e3 feat(metajson): define public v1 contract`;
  - Dark complete declaration projection и Boundary coherent current
    projection: commit
    `f9779aba feat(metajson): add Dark and Boundary projections`;
  - stateless Monad assembly, provider isolation и final public validation:
    commit `9a0a8739 feat(metajson): assemble reads through Monad`;
  - независимые verifier gates приняли Public, Dark, Boundary temporal
    coherence и Monad assembly после adversarial corrections;
  - final targeted integration:
    `bun test monad/meta-json.spec.ts dark/meta-json.spec.ts
    boundary/meta-json.spec.ts tests/metajson/public.spec.ts` —
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
  - no authored MetaJSON Store.

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
  - зафиксированы current routing matrix, five-remote-channel lifecycle,
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
  - Dark self-WebSocket заменён локальным process adapter, remote channels
    ограничены Boundary, Matrix, Energy и Bulk;
  - `dark/server.ts` содержит Dark Monad + Dark Force, сохраняет public ingress
    `4000` и предоставляет same-process compatibility health на `4002`;
  - `runtime/universe.ts` рождает пять процессов и Matrix последней;
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
  - canonical launcher родил ровно пять domain processes, Matrix последней;
    standalone `force/server.ts` process отсутствует, health `4000..4005`
    отвечает `200`, а `4002` является same-process Dark compatibility health;
  - acceptance probe принят с sequence `1`, durably записан до routing в
    segment `00000000000000000001.ndjson` с SHA-256
    `76007c85cb297c879b9517fd028da5949434caf1fa24a9dd15668ea42484345d`
    и доставлен Dark, Boundary, Matrix, Energy и Bulk;
  - live `readMetaJSON` для `zavx0z/inference` вернул schema
    `metafor/meta-json/v1`, шесть template entries и один runtime root;
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
  - MetaJSON snapshot не смешивается с history/Mass;
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
  - Codex читает полный MetaJSON либо partial retrieval над тем же contract;
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
    staging, требует одинаковый MetaJSON digest at sequence 0/1 и публикует
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
  - full cold start на `2fc9de0a` прошёл: Dark, Boundary, Matrix (GPU), Energy
    и Bulk healthy; Bulk projection подтверждает `zavx0z/inference`, 6 Atom,
    54 Fields, 24 States и 13 Processes;
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
  - validated `readMetaJSON` до и внутри transaction после planned state;
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
    boundary/meta-json.spec.ts boundary/mass.spec.ts`: `49 pass`, `0 fail`,
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
    full MetaJSON и whole-plan CAS до staging write;
  - отдельная in-memory SQLite атомарно сохраняет immutable receipt с proposal,
    plan/pre-state и MetaJSON digests;
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
    boundary/meta-json.spec.ts boundary/mass.spec.ts`: `52 pass`, `0 fail`,
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
    MetaJSON/Mass evidence, backup и cold rollback package;
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
    boundary/meta-json.spec.ts boundary/mass.spec.ts`: `54 pass`, `0 fail`,
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
    byte-identical fresh plan, stage MetaJSON digest и все structural/Mass CAS,
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
  - journal не дублирует Dark Force Particles и не является MetaJSON, Particle
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
  - результат читается тем же MetaJSON RPC.

## P4 — отложенные расширения

### MF-400 — Dark Force v2 durability/replay

- Status: `GATE`
- Dependencies: `MF-206`
- Deferred decision:
  - delivery control frames/channel;
  - journal, ACK/NACK/resume;
  - authoritative consumer cursors.

### MF-401 — Multi-entity Boundary staging

- Status: `GATE`
- Dependencies: `MF-206`
- Read-only evidence boundary:
  - detached branch commit
    `963f52b386a9d33ab0731c632628aa3add833f51` proves only a local pure
    `dissolve(parent, massDisposition)` planner and its synthetic tests;
  - that commit is not integrated into the canonical Inference branch and has
    no Boundary write, Force Particle, RPC write endpoint or runtime proof, so
    it does not make dissolve implementation complete or ready.
- Next gate `MF-401A` — offline multi-entity Boundary dissolve proof:
  - Status: `GATE`, explicitly not `READY`;
  - run only on detached synthetic input and an isolated Boundary fixture; no
    live Boundary/Mass/history/process may be read or changed;
  - deterministically promote direct children into the removed parent's
    lexical interval and require one explicit promoted-child disposition for
    every parent Mass key;
  - validate the complete staged batch before apply, preserve untouched
    identities/order, reject missing references or partial apply, and emit the
    expected one-entity-per-`ForceMessage` Particle plan;
  - verify pre/post MetaJSON projection, Boundary integrity and zero mutation
    on validation failure.
- Live dissolve/delete, Energy destroy/cleanup, runtime rollout and any
  deletion from the current Inference contour remain separate owner-gated
  work; none is complete or ready.

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
  - Dark Monad validation;
  - operational observability;
  - не является изменением текущей Lada topology.

## Evidence log

Заполнять только после фактической работы:

| Item | Commit/diff | Checks | Result |
| --- | --- | --- | --- |
