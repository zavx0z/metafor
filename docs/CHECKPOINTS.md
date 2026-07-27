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
commits принадлежат отдельному local bare Git repository, никогда не source
repository MetaFor или Meta package. Созданный
[`zavx0z/metafor-checkpoints`](https://github.com/zavx0z/metafor-checkpoints)
остаётся пустым и не является настроенным remote. Credentials, remote и push
требуют отдельной owner authority.

## Содержимое commit

Commit содержит один closed manifest и content-addressed bytes полного
согласованного capture:

- standalone canonical Boundary SQLite checkpoint;
- все Mass files, выбранные Boundary membership данного capture;
- canonical MetaJSON v1 projection результата;
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

Canonical patch target — ровно один validated complete MetaJSON v1 document.
Его bytes являются UTF-8 без BOM, пробелов и завершающего LF с RFC 8785/JCS
object-key order и lowercase SHA-256. `base` указывает digest projection
предыдущего checkpoint, `result` — digest projection этого commit. Diff
детерминирован: object members используют только `add/remove/replace`, а
изменённый массив заменяется целиком. Bulk manifestation, ELK layout и другие
UI-проекции не входят в digest law.

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

## Applied-through control plane

Checkpoint barrier является внутренним service/control-plane contract и не
меняет canonical Particle, Force wire frame или строку Dark Force history.
Для каждого принятого Particle Dark Force атомарно с полным destination set
назначает отдельный монотонный `sentOrdinal` каждому целевому домену. Sideband
receipt содержит только `cutId`, domain, `sentOrdinal` и
`acceptanceSequence`.

Domain может подтвердить receipt только после последовательного применения
всех deliveries до этого ordinal и возврата в Dark Force acceptance всех
Particle, причинно испущенных их применением. При закрытом external admission
barrier продолжает принимать такие causal Particles, расширяет per-domain sent
frontiers и достигает fixed point только когда для каждого домена
`appliedOrdinal == sentOrdinal`. После этого frontier удерживается неизменным
до окончания coherent capture.

Dark персистит barrier state после durable Particle acceptance до routing.
Domain получает receipt отдельным Monad RPC до неизменённого ForceMessage,
применяет вход через свой последовательный Force handler и подтверждает его
только после возврата всех причинно испущенных Particles в durable Dark Force
acceptance. Перезапуск восстанавливает точные sent/applied и outgoing
frontiers; unresolved delivery после crash вызывает fail-stop, а не
пропускается.

Пустой tracker с sequence `0` не доказывает applied-through состояние уже
существующих Boundary/Mass. Первый live baseline строится только остановленным
cold capture: pre-cut Boundary copy для sequence `0` и остановленный current
Boundary at sequence `1` должны дать один и тот же canonical MetaJSON digest и
пустой deterministic patch. Любое отличие отклоняет capture. После verified
checkpoint `(cutId, 1)` создаётся durable control baseline `1`; отсутствие или
расхождение baseline с history закрывает следующий cold start.

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

Целевой operational contour для первого Lada checkpoint — существующий live
contour, не clone и не параллельная replacement environment. Его выполнение
разрешается только одной отдельной authority на полный controlled cold cut:
verified backup/hash, остановка всего contour, coherent local snapshot commit,
cold start Lada в том же contour, health/functional acceptance и точный
rollback из backup при любой ошибке. До этой authority никакие live lifecycle
или data actions не выполняются.

## Local capture boundary

Source foundation использует synthetic bytes и temporary bare Git repositories
для доказательства closed manifest, digest/chunk/projection integrity, exact
forward-patch coverage, exactly-one commit, immutable refs, compare-and-swap,
crash/resume и corruption rejection. Operational capture разрешён только после
полной остановки contour: он копирует history и обе SQLite inputs в private
temporary staging, создаёт standalone SQLite bytes после WAL checkpoint,
считывает все regular UUID `.json/.bin` Mass files и публикует local bare Git
ref только после полной проверки. Он не открывает live SQLite in place и не
настраивает remote.

Для первого local owner-bookmark capture действуют пределы: 64 MiB на один
logical blob, 256 MiB на checkpoint и не более 256 Mass entries. Другие
triggers, retention/GC, encryption/device distribution, remote и push остаются
отдельными будущими gates.

Generalized current-sequence capture разрешён только для private detached
candidate/rollback bundle после доказанной полной остановки. Он принимает
current `(cutId, S)`, существующий previous snapshot либо доказанный initial
base и полный canonical forward-patch span для каждой history sequence от
`previous + 1` до `S`. Отсутствующая sequence, invented empty patch при
изменившейся projection, несовпадающий previous digest или history gap
отклоняют публикацию.

Bundle копирует Boundary SQLite/WAL/SHM, Mass, Dark Force history и checkpoint
control state в новый private target, не открывая source paths in place.
Rollback manifest фиксирует deterministic ordered hashes/lengths каждого
regular file, checkpoint commit/identity и полный bundle digest. Detached
candidate Boundary затем может добавить только Boundary-owned stage table;
pre-stage checkpoint остаётся rollback truth, а staged Boundary получает
отдельный digest в candidate receipt.

Candidate bundle имеет `effects: none` и retention
`retain-until-explicit-gc`. Ни успешный preparation, ни corruption/failure не
удаляют bundle автоматически. Такой capture не является live restore,
activation, новым Force cut или правом менять canonical source; эти действия
остаются отдельными owner gates.

Offline promotion bridge не читает live Boundary или Bulk tree. Он сначала
привязывает явно захваченный former-root frame к точным `bundleId`, stage
receipt и checkpoint candidate. Read-only Bulk promotion receipt появляется
только после успешного dissolve proof с теми же source/target Atom identities,
serialized plan, structural и private Mass manifest digests. Отсутствующий
proof, устаревшая stage binding или любое расхождение дают `null`, поэтому
stage с `effects: none` сам по себе никогда не становится promotion.

Bridge возвращает значение только для уже существующего локального аргумента
Bulk manifestation. Он не создаёт Monad/Force/RPC endpoint, не публикует
external capability и не разрешает activation или lifecycle transition.

Owner-approved detached acceptance может передать bridge proof только после
выполнения exact staged plan внутри candidate Boundary copy. Перед выполнением
private executor заново связывает bundle, checkpoint, rollback manifest,
stage receipt и сохранённые proposal/plan bytes; любое расхождение закрывает
gate до transaction. Post-dissolve Boundary projection и Bulk manifestation
являются read-only evidence этого candidate, а не новым checkpoint или live
state.

Rollback acceptance не перезаписывает active paths. Она восстанавливает ещё
одну private copy только из `rollback/`, сверяет каждый ordered
`path + length + SHA-256`, SQLite integrity, history/control identity и
pre-MetaJSON digest. Даже успешные detached execution, browser proof и
restoration proof не разрешают live publication, source/root transition,
Force/Monad admission, Energy retarget, restart или hot reload.
