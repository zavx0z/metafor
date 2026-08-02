# Inference → Lada dissolve: cold-cut preparation

Status: non-live durable-candidate, detached acceptance and causal admission
prerequisites implemented; live evidence and activation remain preparatory
only. This document does not expose a runtime capability, authorize staging
against live data, or authorize activation/deletion.

The owner documents remain [`boundary/DOMAIN.md`](../boundary/DOMAIN.md),
[`docs/CHECKPOINTS.md`](../docs/CHECKPOINTS.md),
[`docs/FORCE.md`](../docs/FORCE.md), and
[`docs/domains/ENERGY.md`](../docs/domains/ENERGY.md).

## Confirmed implementation boundary

The integrated private proof has six parts:

1. `boundary/dissolve.ts` plans and executes one atomic transaction only on a
   caller-provided isolated Boundary database. It preserves the Lada Atom and
   descendants, transfers exactly five Mass identities, validates pre/planned
   Graph, and rolls back on a late CAS mismatch.
2. `boundary/dissolve-staging.ts` stores an immutable/idempotent receipt only in
   `sqlite::memory:`. The receipt has `effects: "none"`, has no cut/checkpoint
   identity, and is deliberately absent from Boundary exports/runtime.
3. `boundary/dissolve-mass-evidence.ts` reads only isolated Mass fixtures. Four
   regular files may be represented by lowercase SHA-256, while the explicitly
   allowlisted `chatOutbox` identity may be represented by
   `{kind: "absent", marker: "metafor/mass-absent/v1"}` without creating bytes.
4. `boundary/dissolve-candidate-staging.ts` stores a closed durable stage table
   only inside a detached candidate Boundary SQLite. Its receipt binds the
   checkpoint commit/identity, raw rollback manifest, full plan, five Mass
   entries and explicit `retain-until-explicit-gc` policy while keeping
   `effects: "none"`.
5. `dark/checkpoint/dissolve-candidate.ts` copies caller-certified stopped
   private Boundary/Mass/history/control inputs into a new private bundle,
   records ordered hashes and an immutable local current-sequence checkpoint,
   stages only the detached candidate, reopens it for verification, and keeps
   both successful and failed bundles.
6. `boundary/dissolve-candidate-execution.ts` reopens the exact stored plan,
   proves byte-identical current planning and all CAS, executes only inside the
   detached candidate and returns `BoundaryDissolveProof` plus post-Graph.
   The matching bridge receipt is passed into Bulk manifestation, while
   `runtime/dissolve-candidate-acceptance.ts` verifies a second private
   rollback restoration and produces browser/static evidence.
7. `boundary/dissolve-causal-admission.ts` persists an exact private
   admission/quiescence/commit/consequence record in caller-provided Boundary
   SQLite. It binds candidate, stage, proof, Bulk receipt, current held
   frontier and an ordered one-entity consequence plan, but dispatches
   nothing.
8. `energy/dissolve-retarget.ts` persists five exact source-generation
   fence/retarget entries with per-entry fsync, reopen/retry and a stable
   idempotency key. It has no release, delete, RPC or runtime caller.

The observed five authored mappings are:

- `messages → modelMessages`;
- `ssoSession → ssoSession`;
- `chatMessages → chatMessages`;
- `chatOutbox → chatOutbox` with the explicit absent marker;
- `greetingDraft → greetingDraft`.

The following existing primitives are reusable but do not close the live
dissolve gate:

- checkpoint identity `(cutId, acceptanceSequence)`, immutable local bare-Git
  commit, Boundary/Mass capture, and control baseline;
- Dark checkpoint delivery receipts and an in-memory
  `holdUnderClosedAdmission()` barrier model;
- per-identity Energy Mass `fence`/`release` RPC.

The remaining reusable primitives have narrower behavior:

- `runtime/checkpoint.ts` requires external stopped-contour proof, but
  its operational CLI still publishes only the first non-zero checkpoint.
  Generalized publication is deliberately reachable only through the private
  candidate orchestration and requires exact history/patch coverage;
- the private bundle includes Dark Force history, checkpoint-control state,
  raw rollback hashes and the dissolve stage; MF-115 proves its exact accepted
  declaration/runtime projection and detached Lada root, but it still does
  not define a canonical authored source transition for live activation;
- `holdUnderClosedAdmission()` still has no authenticated service endpoint or
  live lifecycle coordinator that closes external ingress and invokes all
  domain quiescence methods;
- Energy process-local gates now have a private durable five-handle
  orchestration receipt, but no installed live driver/caller;
- the private causal plan now fixes post-commit entity order without inventing
  a batch Force message, but has no Monad/Force admission endpoint or
  dispatcher.

## Implemented durable stage boundary

The implemented stage is Boundary-owned private service state, not a Particle,
Graph field, source commit, checkpoint-history row, or public Mass
observation. It can be created only from private copies whose caller explicitly
certifies a stopped contour.

The stage must contain closed, recoverably validated data:

- stage schema/version, `stageId`, `proposalId`, and `operation: "dissolve"`;
- immutable checkpoint binding:
  `cutId`, `acceptanceSequence`, checkpoint commit, Boundary blob SHA-256,
  canonical pre-Graph SHA-256, and complete Mass-capture manifest SHA-256;
- exact backup-package manifest SHA-256, without treating a mutable path as
  identity;
- canonical source `zavx0z/inference`, target `zavx0z/lada`, source/target Atom
  identities, target position, preserved runtime identities and order;
- complete serialized plan plus `proposalSha256`, `planSha256`,
  `structuralSha256`, pre-Graph SHA-256, and private-manifest SHA-256;
- exactly five source/target authored-key mappings with source/target
  declaration IDs, source global key ID, previous target global key ID, codec,
  dependent memberships, and closed Mass evidence;
- exactly four `present` evidence entries and the exact allowlisted
  `chatOutbox` `absent` entry tied to its existing global key ID and codec;
- explicit `effects: "none"` and a statement that the stage is preparation,
  not an execution receipt.

Durability requires:

- an explicit file path under private Boundary service state, mode `0600`
  beneath a `0700` directory;
- serialized create/read through one Boundary-owned queue/transaction;
- file and parent-directory sync before returning the receipt;
- reopen verification of exact schema, all nested closed shapes, hashes,
  checkpoint binding and SQLite integrity;
- same `proposalId` idempotent only for identical canonical bytes; collision,
  corruption, incomplete write, different checkpoint, or changed pre-state
  fails closed;
- no live Boundary/Mass reader and no automatic creation of a missing Mass
  payload.

The owner selected a stage table inside the detached candidate Boundary
SQLite. The immutable checkpoint remains the pre-stage truth; the rollback
manifest hash is part of the stage binding, and the post-stage candidate
Boundary hash is recorded separately in the bundle receipt.

## Required preflight evidence

The existing read-only observation of one Inference source Atom, its direct
Lada child, five mappings, and explicit absent `chatOutbox` is necessary but
not sufficient. Before a stopped stage can be approved, a redacted evidence
manifest must record:

1. Runtime ownership before stop: launcher PID/cwd/command, all five domain
   child PIDs/cwds/commands, and listeners `4000..4005`, proving that no
   unrelated/archive process is in scope.
2. Stopped proof: launcher/children exited and no scoped listener remains.
3. Dark state: current history `cutId`, accepted sequence, segment/catalog
   verification, checkpoint-control state digest, and absence of unresolved
   sent/applied frontiers.
4. Boundary state: SQLite/WAL/SHM hashes, `quick_check`, `foreign_key_check`,
   canonical pre-Graph digest, exact source/target Atom and runtime-origin
   rows, sibling position, preserved descendants and retired-execution fence.
5. Mass state: all five source and target declarations/memberships, source
   relations and dependent memberships, global key IDs/codecs, the four
   regular-file lengths/digests, the exact allowlisted missing `chatOutbox`,
   and hashes/existence of superseded target files that are retained.
6. Source truth: exact Git commits/digests for Inference and Lada and a
   real planned declaration projection rooted at Lada. The current synthetic
   test supplies a fake planned template; production code does not yet prove
   that the authored source after activation cannot rematerialize Inference.
7. Capacity and recovery: sufficient private disk, checkpoint limits, backup
   manifest, restore target paths, and an independently verified rollback
   command set.

Evidence may contain identities and digests but must not disclose Mass payloads.

## Minimal cold-cut runbook

No step below is authorized by this document.

### A. Preparation while the contour is still running

1. Record the scoped process/listener ownership and health without mutation.
2. Record the redacted source/target/five-mapping evidence and current
   history/control status through owner interfaces.
3. Freeze the exact source revisions used to build planned Graph evidence.
4. Prepare explicit backup and rollback paths; do not stop anything until the
   owner accepts the evidence manifest and rollback target.

### B. One full stop and rollback checkpoint

5. Stop the entire canonical contour once; prove all scoped processes and
   listeners are absent.
6. Copy Boundary SQLite with WAL/SHM, complete Mass directory, Dark Force
   history, checkpoint-control state, and required source Git evidence into a
   private backup. Hash every item and verify restore readability.
7. Publish and verify an immutable checkpoint for the current stopped state.
   The private candidate API now implements generalized current-sequence
   capture, but the existing first-sequence-only operational CLI remains
   intentionally insufficient for a live cut.
8. Keep the original active paths unchanged. All following preparation uses
   private copies.

### C. Durable stage, still with no world effects

9. Build the full dissolve plan from the stopped Boundary/Mass copies and the
   actual planned Lada declaration projection.
10. Write one durable Boundary-owned stage bound to the verified checkpoint
    and backup manifest. Reopen it in a fresh process and revalidate every
    digest, all five mappings and the absent marker.
11. Prove the stage did not change Boundary/Mass/history/control/source bytes.
    Stop here for a separate activation decision.

### D. Completed detached acceptance and future activation

12. Completed by MF-115: apply the exact staged transaction only to a detached
    candidate Boundary copy.
13. Completed by MF-115: verify planned Graph, SQLite integrity, exact
    runtime order, five Mass ownership transfers, four unchanged present
    files, absent `chatOutbox`, retained superseded target keys, Bulk reframe,
    browser/static scene and a second private rollback restoration.
14. Before any live publication, resolve the chosen causal model:
    either a new-cut cold baseline for the already transformed candidate, or
    an authenticated Monad→Force→Boundary multi-entity admission protocol.
15. Atomically publish the verified candidate according to that chosen model,
    then cold-start the entire contour once. Never partially restart or hot
    reload.
16. Accept health, exact topology, Energy Mass resolution, Auth/Chat/Lada
    behavior, and history/control coherence. Do not perform byte GC.

### E. Rollback on any mismatch

17. Stop the full candidate contour if it was started.
18. Restore Boundary SQLite/WAL/SHM, Mass, Dark Force history,
    checkpoint-control state and any changed source/config from the verified
    backup as one rollback package.
19. Re-hash restored bytes, rerun SQLite/history/control checks, and cold-start
    the prior contour once.
20. Accept rollback only when the prior Graph digest, topology, Mass
    evidence, history/control identity, health and required functional state
    match the pre-cut evidence. Preserve failed candidate/stage evidence
    privately without Mass payload disclosure.

## Remaining live Force, Energy and source integration

### Force/Monad

- No authenticated capability-scoped command accepts an exact
  `(stageId, checkpoint identity, receipt digest)` and rejects arbitrary
  Particle or stale-stage activation.
- No live service coordinator closes external admission, invokes every
  domain's quiescence, reaches/holds the applied-through frontier, and feeds
  its receipts to the private Boundary record.
- The non-live plan associates each changed runtime entity with one ordered
  one-Particle message entry, but no dispatcher emits those messages.
- The accepted private order is Energy retarget, target/scope replacements,
  source Atom remove, verified Bulk promotion, evidence retention and
  admission release; live routing/application remains unimplemented.
- An offline database replacement is not present in the old cut's Particle
  history. A new-cut baseline versus causally admitted Particles is therefore
  an owner decision, not an implementation detail.

### Energy

- Current `energy.mass.fence/release` remains unauthenticated operation-wise
  and process-local. The private durable receipt binds five declarations,
  key IDs, generations, checkpoint and stage, but no live adapter invokes it.
- Post-commit retarget/re-authorize is now durable and retryable only through
  an injected idempotent driver. Source fences remain held; the protocol has
  no release/delete step.
- Cold rehydration would naturally create new target handles and discard old
  process-local generations, but then no old Inference destroy hook runs.
  Whether cold rehydration is sufficient or pre-stop retire/destroy is required
  needs an owner decision.

### Canonical source

- The proof mutates only Boundary SQLite. It does not update canonical
  `meta.ts`.
- Its planned Graph validator is supplied by tests and does not derive the
  post-dissolve declaration graph from current Inference/Lada source.
- A later read/materialization rooted at `zavx0z/inference` can therefore
  reintroduce the source unless activation also defines the canonical authored
  source/root transition.

## Exact remaining owner decisions

> Historical gate record. The transition was subsequently completed; its
> one-off activation command and private live adapters were later retired.
> The generic candidate, rollback, admission and retarget primitives remain.

The owner selected causal no-stop preparation and MF-116 now proves its private
durable state machines. None of these decisions authorizes live paths.

The exact remaining activation gate is `MF-117`. There is currently no
activation command: MF-116 intentionally added neither caller nor RPC. The
next owner decision must approve:

1. canonical authored source/root transition that cannot rematerialize
   Inference;
2. authenticated capability-scoped caller and exact operational command;
3. live adapters for external-admission hold, all-domain quiescence, Energy
   fence/retarget, Boundary commit and ordered Force/Bulk dispatch;
4. a fresh candidate/stage/proof at the then-current cut/sequence plus live
   rollback evidence.

Retention is no longer open inside this slice: Mass bytes and key identities,
history, checkpoint/rollback artifacts, receipts and superseded source/target
binding metadata remain `retain-until-explicit-gc`. A separate owner GC
decision is required for any deletion.
