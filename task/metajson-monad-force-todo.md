# MetaJSON, Monad и Force: приоритетный TODO

Этот backlog исполняется по
[`task/metajson-monad-force-plan.md`](metajson-monad-force-plan.md).

## Правила

- Приоритет: `P0` выше `P1`, затем `P2` и так далее.
- Брать highest-priority item со статусом `READY`, у которого завершены все
  dependencies.
- `GATE` требует явного owner approval; агент не выбирает решение сам.
- `WAITING` означает, что ещё не завершены объявленные dependencies.
- `BLOCKED` используется только для фактического препятствия и обязан содержать
  точную причину и evidence.
- `IN_PROGRESS` содержит исполнителя/задачу.
- `DONE` содержит команды проверки и наблюдаемый результат.
- После перевода item в `DONE` проверить все непосредственно зависимые
  `WAITING` items и перевести в `READY` те, у которых завершены все
  dependencies и нет owner gate.
- Параллельно можно выполнять только независимые items.
- Plan и TODO не отменяют domain owner documents.

Статусы: `GATE`, `WAITING`, `BLOCKED`, `READY`, `IN_PROGRESS`, `DONE`.

## P0 — утверждение контрактов

### MF-000 — Финально утвердить living plan

- Status: `GATE`
- Dependencies: нет
- Scope: утвердить `task/metajson-monad-force-plan.md` как основание работы.
- Done when:
  - owner подтвердил план;
  - решения, ещё не подтверждённые владельцем, остались отдельными gates;
  - реализация не выдаёт proposal за действующий контракт.

### MF-001 — Зафиксировать source-of-truth hierarchy

- Status: `WAITING`
- Dependencies: `MF-000`
- Owners: Dark, Boundary, architecture docs
- Scope:
  - authored source;
  - Meta Store `active/pending`;
  - Boundary canonical world;
  - Force Journal;
  - derived views.
- Acceptance:
  - Dark MetaJSON не содержит канонические runtime values;
  - Boundary не восстанавливается из Dark runtime mirror;
  - `initialize(metaJSON)` использует round-trip source proof.

### MF-002 — Утвердить Force v2 delivery-control contract

- Status: `GATE`
- Dependencies: `MF-000`
- Decision:
  - versioned `particle/ack/nack/resume` frames; либо
  - отдельный delivery-control channel.
- Acceptance:
  - `ForceMessage` по-прежнему содержит одну Particle;
  - ACK не является Particle;
  - observer/browser sockets не участвуют в commit receipt;
  - authoritative consumer определён для каждого домена.

### MF-003 — Утвердить ordering, causality и identity

- Status: `GATE`
- Dependencies: `MF-000`
- Decide:
  - `UniverseId`/`ContourId`;
  - scope `ForceSequence`;
  - `causedBy`, `causalRoot`, `observedAt`;
  - migration текущего `Particle.ts`;
  - uniqueness idempotency keys.
- Acceptance:
  - sequence не объявляется причинностью;
  - shared Field consequences сохраняют общий causal root;
  - append и idempotency index атомарны.

### MF-004 — Утвердить authority × Particle matrix

- Status: `GATE`
- Dependencies: `MF-000`
- Acceptance:
  - external Agent/User может испускать только разрешённые Gluon/Higgs;
  - Inflaton исходит только из Dark Monad;
  - `by` и routing metadata не принимаются из payload;
  - Runtime Agent не вызывает Force/Monad напрямую;
  - audit identity отделена от causal emitter.

### MF-005 — Зафиксировать operation state machine в owner documents

- Status: `WAITING`
- Dependencies: `MF-002`, `MF-003`
- States:
  - `planned`;
  - `staged`;
  - `source_committed`;
  - `force_accepted`;
  - `canonical_committed`;
  - `converged`;
  - `rejected`/`blocked`.
- Acceptance:
  - фактом мира считается Boundary canonical commit;
  - после него только forward recovery;
  - первый slice не заявляет convergence.

### MF-006 — Утвердить Process source revision law

- Status: `GATE`
- Dependencies: `MF-000`
- Proposed: `SourceSetRevision` как hash sorted path → SourceRevision.
- Acceptance:
  - изменение action module наблюдаемо даже без изменения MetaRevision;
  - возвращается explicit restart impact;
  - partial hot reload отсутствует.

### MF-007 — Утвердить multi-entity Boundary staging

- Status: `GATE`
- Dependencies: `MF-002`, `MF-003`, `MF-005`
- Proposed:
  - одна entity operation на Particle/ForceMessage;
  - общий ChangeSet correlation;
  - Boundary staging;
  - один SQLite commit;
  - derived domains сходятся вперёд.
- Первый slice от этого решения не зависит.

## P1 — behavior-preserving перенос Force в Dark

### MF-100 — Зафиксировать parity baseline standalone Force

- Status: `WAITING`
- Dependencies: `MF-000`
- Acceptance:
  - endpoints, routing, lifecycle, birth gate и fail-stop покрыты тестами;
  - текущий agent Inflaton отмечен как legacy;
  - Matrix-last birth доказан.

### MF-101 — Извлечь transport-neutral Force kernel в `dark/force/*`

- Status: `WAITING`
- Dependencies: `MF-100`
- Scope: relay, lifecycle, routing, channel Store без semantic изменений.
- Acceptance: старый compatibility host проходит parity suite.

### MF-102 — Спроектировать Dark compatibility host

- Status: `GATE`
- Dependencies: `MF-101`
- Decide:
  - один или два временных HTTP listeners;
  - ports;
  - unified health;
  - local in-process Dark adapter вместо self-WebSocket.

### MF-103 — Реализовать Dark birth без startup cycle

- Status: `WAITING`
- Dependencies: `MF-102`
- Target order:
  - Dark host/root Force;
  - Boundary;
  - Energy;
  - Bulk;
  - Matrix;
  - running.
- Acceptance:
  - local Dark readiness + четыре authoritative remote domains;
  - reconnect из `error` не оживляет Universe.

### MF-104 — Переключить launcher на пять процессов

- Status: `WAITING`
- Dependencies: `MF-103`
- Acceptance:
  - production contour не имеет standalone Force process;
  - endpoints/health работают по утверждённому compatibility law;
  - `runtime:universe` и `runtime:universe:once` доказаны.

### MF-105 — Удалить compatibility Force package/entry

- Status: `WAITING`
- Dependencies: `MF-104`
- Scope: перенести server, REST/WS transport, MonadRouter, lifecycle, fixtures,
  tests и документацию.
- Acceptance:
  - отдельного runtime process/domain Force нет;
  - `shared/protocol/force` остаётся общим языком.

## P2 — Force v2 durability

### MF-200 — Добавить public Force v2 envelopes

- Status: `WAITING`
- Dependencies: `MF-002`, `MF-003`, `MF-004`, `MF-105`
- Acceptance: runtime validators и negative tests для source authority.

### MF-201 — Добавить durable append Journal и idempotency index

- Status: `WAITING`
- Dependencies: `MF-200`
- Acceptance:
  - sequence + idempotency одной transaction;
  - routing destinations вычислены и сохранены в той же transaction;
  - replay использует сохранённые destinations;
  - duplicate key возвращает существующий receipt;
  - `DarkHistory` не используется как journal.

### MF-202 — Выделить authoritative consumers и observer channels

- Status: `WAITING`
- Dependencies: `MF-200`
- Acceptance:
  - один authoritative consumer на domain;
  - browser sockets не блокируют receipt.

### MF-203 — Boundary atomic inbox/cursor

- Status: `WAITING`
- Dependencies: `MF-201`, `MF-202`
- Acceptance:
  - canonical mutation, cursor, monotonic BoundaryRevision и commit receipt
    фиксируются одной SQLite transaction;
  - receipt содержит `sequence`, `changeSetId`, `metaRevision` и
    `boundaryRevision`;
  - no-op BoundaryRevision не увеличивает;
  - duplicate sequence не меняет мир;
  - ACK с receipt отправляется только после commit;
  - после restart неизвестные authoritative sequences запрашиваются/доставляются
    повторно без зависимости от полного derived-domain replay.

### MF-204 — Derived-domain cold cut

- Status: `WAITING`
- Dependencies: `MF-201`, `MF-202`
- Scope: Matrix/Energy/Bulk projection с `throughSequence` либо durable inbox.
- Acceptance: replay начинается строго после hydrated cut.

### MF-205 — Включить ACK/NACK, fail-stop и replay

- Status: `WAITING`
- Dependencies: `MF-203`, `MF-204`
- Acceptance:
  - relevant sequence order;
  - NACK/потеря channel закрывает gate;
  - полный restart восстанавливает delivery;
  - observer delivery и external side effect не входят в ACK.

## P3 — MetaDocument и Dark Store

### MF-300 — Утвердить MetaJSON v1 owner contracts

- Status: `GATE`
- Dependencies: `MF-001`, `MF-006`
- Acceptance:
  - Dark declaration contract;
  - Boundary runtime projection addition;
  - public types/validators;
  - MetaDocument не содержит Bulk/history/runtime authority.

### MF-301 — Реализовать pure MetaDSL → MetaDocument normalizer

- Status: `WAITING`
- Dependencies: `MF-300`
- Acceptance:
  - one Meta;
  - deterministic JCS/hash vectors;
  - runtime validation;
  - canonical MatterBindingValue без derived duplicate.

### MF-302 — Реализовать read-only Dark Meta Store

- Status: `WAITING`
- Dependencies: `MF-301`
- Acceptance:
  - content-addressed documents либо эквивалент;
  - отдельные `active/pending`;
  - Store не содержит Boundary runtime truth.

### MF-303 — Реализовать Authoring read RPC

- Status: `WAITING`
- Dependencies: `MF-302`
- Acceptance:
  - source refs;
  - nested expansion/$ref;
  - executable descriptors только по selector;
  - RPC consumer повторно валидирует payload.

### MF-304 — Реализовать minimal planner для `add optional field`

- Status: `WAITING`
- Dependencies: `MF-301`
- Acceptance:
  - читает только редактируемую Meta;
  - выдаёт одну typed entity operation;
  - dry-run не пишет;
  - no-op не создаёт plan/outbox Particle.

### MF-305 — Реализовать one-file source adapter

- Status: `WAITING`
- Dependencies: `MF-304`
- Acceptance:
  - guarded SourceRevision;
  - AST update canonical fluent chain;
  - unsupported/dynamic source rejected;
  - Bulk span сохраняется внутренне;
  - round-trip semantic proof;
  - Git commit отсутствует.

### MF-306 — Реализовать pending/active saga и outbox

- Status: `WAITING`
- Dependencies: `MF-005`, `MF-201`, `MF-203`, `MF-302`, `MF-305`
- Acceptance:
  - durable recovery manifest;
  - keys `changeSetId:index`;
  - outbox eligible для drain только после durable `source_committed`;
  - active продвигается только после Boundary commit;
  - active promotion проверяет полный Boundary commit receipt;
  - permanent отказ после source publication переводит plan в blocked, не
    rejected;
  - source drift переводит plan в blocked.

## P4 — первый функциональный vertical slice

### MF-400 — Подготовить изолированную fixture Meta

- Status: `WAITING`
- Dependencies: `MF-304`, `MF-305`, `MF-306`, `MF-203`
- Scope: одна Meta, один Atom, optional scalar Field без default.

### MF-401 — Реализовать end-to-end Field apply

- Status: `WAITING`
- Dependencies: `MF-400`
- Path:
  - read;
  - dry-run;
  - guarded source write;
  - pending/outbox;
  - один исходный Inflaton;
  - Journal;
  - Boundary canonical commit;
  - active promotion.

### MF-402 — Добавить Authoring/Planner reread

- Status: `WAITING`
- Dependencies: `MF-401`
- Acceptance:
  - Atom identity сохранена;
  - Field declaration присутствует;
  - Planner показывает Field в `missing`;
  - compact projection не содержит debug/source internals.

### MF-403 — Доказать idempotency, CAS и no-op

- Status: `WAITING`
- Dependencies: `MF-401`
- Acceptance:
  - stale source/meta rejected без writes;
  - repeat apply не создаёт вторую Particle;
  - no-op initialize не испускает Particle.

### MF-404 — Доказать crash/recovery matrix

- Status: `WAITING`
- Dependencies: `MF-401`
- Cuts:
  - staged/source old;
  - partial manifest;
  - source committed/outbox pending;
  - Force accepted/Boundary pending;
  - Boundary committed/Dark active old;
  - source committed/Boundary permanently rejected;
  - source drift.
- Acceptance: forward recovery без duplicate commit и silent overwrite.

### MF-405 — Принять vertical slice

- Status: `WAITING`
- Dependencies: `MF-402`, `MF-403`, `MF-404`
- Acceptance:
  - результат называется `canonical_committed`;
  - convergence не заявлена;
  - нет Git commit, restart или hot reload;
  - минимальные релевантные проверки пройдены.

## P5 — расширение после первого среза

### MF-500 — Multi-entity ChangeSet и Boundary staging

- Status: `WAITING`
- Dependencies: `MF-007`, `MF-405`

### MF-501 — Полный dependency/topology impact planner

- Status: `WAITING`
- Dependencies: `MF-500`

### MF-502 — `initialize(src)` и explicit reconcile

- Status: `WAITING`
- Dependencies: `MF-405`

### MF-503 — `initialize(metaJSON)` и package creation

- Status: `WAITING`
- Dependencies: `MF-502`

### MF-504 — Process generator/updater и SourceSetRevision

- Status: `WAITING`
- Dependencies: `MF-006`, `MF-503`

### MF-505 — Полные Authoring/Planner/Diagnostic projections

- Status: `WAITING`
- Dependencies: `MF-405`

### MF-506 — Causal closure и `converged`

- Status: `GATE`
- Dependencies: `MF-205`, `MF-405`

### MF-507 — Meta Catalog/Edit/Create Tool/Service Atoms

- Status: `WAITING`
- Dependencies: `MF-503`, `MF-505`

### MF-508 — Runtime Agent structural capabilities

- Status: `GATE`
- Dependencies: `MF-507`

### MF-509 — Explicit Contour Service/Tool

- Status: `GATE`
- Dependencies: `MF-506`, `MF-507`

## Evidence log

Заполнять только после фактической работы:

| Item | Commit/diff | Checks | Result |
| --- | --- | --- | --- |
