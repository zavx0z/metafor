# Immutable checkpoints

Checkpoint — отдельная immutable replay-опора живой Вселенной. Он не является
Particle, строкой Dark Force history, MetaJSON snapshot или source commit.

## Идентичность и причина создания

Checkpoint имеет identity `(cutId, acceptanceSequence)` и создаётся только в
одной из подтверждённых точек:

- завершённая semantic materialization;
- доказанная quiescent point;
- material Mass boundary;
- явный owner bookmark;
- превышенный measured replay-cost budget.

Timer и голый count не являются trigger. Trigger только запрашивает capture:
сам checkpoint появляется после coherent causal fence.

Каждый coherent snapshot создаёт ровно один immutable Git commit. Checkpoint
commits принадлежат отдельному private repository
[`zavx0z/metafor-checkpoints`](https://github.com/zavx0z/metafor-checkpoints),
никогда не source repository MetaFor или Meta package. Remote, credentials и
push требуют отдельной owner authority.

## Содержимое commit

Commit содержит один closed manifest и content-addressed bytes полного
согласованного capture:

- standalone canonical Boundary SQLite checkpoint;
- все Mass files, выбранные Boundary membership данного capture;
- canonical forward JSON Patch span от предыдущего snapshot до `S`;
- точные byte length, whole-file SHA-256 и ordered SHA-256 chunks;
- `(cutId, acceptanceSequence)`, canonical capture time и trigger kind.

Forward span является deterministic checkpoint/replay artifact, производным
от immutable Particle timeline. Он содержит запись для каждой acceptance
sequence в точном диапазоне
`[previousSnapshotSequence + 1, S]`; sequence без изменения выбранной JSON
projection имеет пустой operations array. Artifact имеет собственный digest и
не добавляет control rows в Particle history. Он не становится второй
canonical change history и не определяет новых mutation semantics.

Boundary остаётся владельцем declaration, membership, source relations и
`keyId`. Energy/Mass остаётся владельцем bytes и materialization локальных
handles. Checkpoint repository не создаёт новые live identities и не выводит
internal `keyId` в public observation API.

Одинаковые chunks могут занимать один Git object. Это storage dedup, а не
новое live sharing Mass: при restore каждый Boundary `keyId` получает свой
локальный файл и handle.

## Publication

Capture выполняется в таком порядке:

1. Dark Force закрывает новое admission и фиксирует accepted sequence `S`.
2. Все причинные последствия до `S` проходят проверяемый applied-through
   barrier.
3. Boundary создаёт standalone checkpoint в своём serialized cut.
4. Единый Mass-owner fence включает все prior writes/copies и исключает later.
5. Boundary+Mass bytes становятся immutable staging capture.
6. Git objects и commit строятся и полностью проверяются.
7. Immutable sequence ref и cut head публикуются одной compare-and-swap ref
   transaction.

Commit object до ref publication не является checkpoint. Ошибка или crash
оставляет capture unpublished; Particle history не переписывается.

Normal branches, worktrees, amend, rebase, reset, force-update, merge и
cherry-pick в checkpoint repository отсутствуют.

## Replay и cache

Particle timeline остаётся единственной canonical change history. Для target
`T` replay выбирает nearest prior checkpoint `C ≤ T`, восстанавливает его
только в isolated projection и применяет canonical Particles либо проверенные
forward JSON Patch spans `C+1..T` вперёд. Committed patch span обеспечивает
прямую state navigation/distribution, а Particle сохраняет causal provenance и
позволяет полностью перестроить/проверить span. Backward navigation выбирает
более ранний checkpoint и снова replay forward. Canonical inverse patches не
создаются и не хранятся.

Derived JSON-patch/state indexes и cache могут ускорять navigation, но являются
server-side, disposable и полностью rebuildable из checkpoint commits и
Particle timeline. Они не входят в Git и не становятся источником истины.

Live Energy objects (`WebSocket`, `MediaStream`, tracks и другие handles
процессов) не serializable и не синхронизируются. Другой device проверяет
выбранный commit, materialize локальные Mass files по сохранённым Boundary
identities и создаёт новые локальные Energy handles обычным lifecycle.

Read-only isolated replay не меняет live contour. Применение checkpoint в live
Universe является отдельным owner-approved full cold cut с backup, новым
`cutId`, acceptance или rollback. Hot/partial restart запрещён.

## Initial foundation boundary

Первый foundation slice использует только synthetic bytes и temporary bare Git
repositories. Он доказывает closed manifest, digest/chunk integrity,
closed forward-patch coverage, exactly-one commit, immutable refs,
compare-and-swap publication, crash и corruption rejection. Он не читает live
Boundary, Mass или Particle history, не конфигурирует remote и не выполняет
push.

До real capture/publication отдельно утверждаются:

- encryption и device key distribution;
- blob size/checkpoint/repository budgets;
- точное правило material Mass trigger;
- retention/GC и bookmark holds;
- GitHub credentials/push;
- live cold restore.
