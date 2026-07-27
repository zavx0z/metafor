# Inference → Lada dissolve: cold-cut preparation

Status: evidence and proposed runbook only. This document does not change a
domain law, expose a runtime capability, authorize staging against live data,
or authorize activation/deletion.

The owner documents remain [`boundary/DOMAIN.md`](../boundary/DOMAIN.md),
[`docs/CHECKPOINTS.md`](../docs/CHECKPOINTS.md),
[`docs/FORCE.md`](../docs/FORCE.md), and
[`docs/domains/ENERGY.md`](../docs/domains/ENERGY.md).

## Confirmed implementation boundary

The integrated private proof has three parts:

1. `boundary/dissolve.ts` plans and executes one atomic transaction only on a
   caller-provided isolated Boundary database. It preserves the Lada Atom and
   descendants, transfers exactly five Mass identities, validates pre/planned
   MetaJSON, and rolls back on a late CAS mismatch.
2. `boundary/dissolve-staging.ts` stores an immutable/idempotent receipt only in
   `sqlite::memory:`. The receipt has `effects: "none"`, has no cut/checkpoint
   identity, and is deliberately absent from Boundary exports/runtime.
3. `boundary/dissolve-mass-evidence.ts` reads only isolated Mass fixtures. Four
   regular files may be represented by lowercase SHA-256, while the explicitly
   allowlisted `chatOutbox` identity may be represented by
   `{kind: "absent", marker: "metafor/mass-absent/v1"}` without creating bytes.

The observed five authored mappings are:

- `messages → modelMessages`;
- `ssoSession → ssoSession`;
- `chatMessages → chatMessages`;
- `chatOutbox → chatOutbox` with the explicit absent marker;
- `greetingDraft → greetingDraft`.

The following existing primitives are reusable but do not close the dissolve
gate:

- checkpoint identity `(cutId, acceptanceSequence)`, immutable local bare-Git
  commit, Boundary/Mass capture, and control baseline;
- Dark checkpoint delivery receipts and an in-memory
  `holdUnderClosedAdmission()` barrier model;
- per-identity Energy Mass `fence`/`release` RPC.

They have narrower current behavior:

- `runtime/checkpoint.ts` requires external stopped-contour proof, but
  `captureOfflineCheckpoint()` only publishes the first non-zero checkpoint
  where history sequence is exactly `1` and base/current MetaJSON are equal;
- checkpoint capture does not include Dark Force history, checkpoint-control
  state, a dissolve stage, source Git evidence, or a complete rollback bundle;
- `holdUnderClosedAdmission()` has no authenticated service endpoint or
  lifecycle coordinator that closes external ingress and invokes all domain
  quiescence methods;
- Energy fence state is process-local and per identity. It has no durable
  aggregate five-handle receipt, no crash recovery, and no post-commit retarget
  from source declarations to target declarations;
- the dissolve proof returns no Force/Graviton consequence plan and has no
  Monad/Force admission path.

## Minimal durable stage required before any activation gate

A minimal future stage must be Boundary-owned private service state, not a
Particle, MetaJSON field, source commit, checkpoint-history row, or public Mass
observation. It must be created only from private copies made after the whole
contour is proven stopped.

The stage must contain closed, recoverably validated data:

- stage schema/version, `stageId`, `proposalId`, and `operation: "dissolve"`;
- immutable checkpoint binding:
  `cutId`, `acceptanceSequence`, checkpoint commit, Boundary blob SHA-256,
  canonical pre-MetaJSON SHA-256, and complete Mass-capture manifest SHA-256;
- exact backup-package manifest SHA-256, without treating a mutable path as
  identity;
- canonical source `zavx0z/inference`, target `zavx0z/lada`, source/target Atom
  identities, target position, preserved runtime identities and order;
- complete serialized plan plus `proposalSha256`, `planSha256`,
  `structuralSha256`, pre-MetaJSON SHA-256, and private-manifest SHA-256;
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

Storage ownership still needs an owner choice:

- a separate Boundary-owned stage SQLite keeps operation service state outside
  the canonical world, but the rollback package must include it explicitly; or
- a stage table inside a detached candidate Boundary SQLite is automatically
  covered by that candidate's bytes, but it mixes service state into the
  canonical database and therefore requires an explicit Boundary law.

The existing checkpoint manifest cannot accept a new sidecar artifact without
a schema/closed-tree change. A stage may instead reference an already verified
checkpoint commit, but then the separate stage file and its hash must be part
of the rollback/operation evidence.

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
   canonical pre-MetaJSON digest, exact source/target Atom and runtime-origin
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
3. Freeze the exact source revisions used to build planned MetaJSON evidence.
4. Prepare explicit backup and rollback paths; do not stop anything until the
   owner accepts the evidence manifest and rollback target.

### B. One full stop and rollback checkpoint

5. Stop the entire canonical contour once; prove all scoped processes and
   listeners are absent.
6. Copy Boundary SQLite with WAL/SHM, complete Mass directory, Dark Force
   history, checkpoint-control state, and required source Git evidence into a
   private backup. Hash every item and verify restore readability.
7. Publish and verify an immutable checkpoint for the current stopped state.
   This requires a generalized current-sequence capture implementation; the
   existing first-sequence-only CLI is insufficient.
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

### D. Future activation, only after a new owner gate

12. Apply the staged transaction only to a detached candidate Boundary copy.
13. Verify planned MetaJSON, SQLite integrity, exact runtime order, five Mass
    ownership transfers, four unchanged present files, absent `chatOutbox`,
    retained superseded target keys, and zero unexpected files.
14. Resolve the chosen causal model before publication:
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
20. Accept rollback only when the prior MetaJSON digest, topology, Mass
    evidence, history/control identity, health and required functional state
    match the pre-cut evidence. Preserve failed candidate/stage evidence
    privately without Mass payload disclosure.

## Missing Force, Energy and source contracts

### Force/Monad

- No authenticated capability-scoped command accepts an exact
  `(stageId, checkpoint identity, receipt digest)` and rejects arbitrary
  Particle or stale-stage activation.
- No service coordinator closes external admission, invokes every domain's
  quiescence, reaches/holds the applied-through frontier, and persists the
  hold/release outcome.
- No contract explains how multiple one-entity `ForceMessage` Particles are
  associated with one atomic Boundary stage without turning a batch into new
  Force wire semantics.
- No accepted consequence set/order exists for source removal, target
  promotion, descendant scope changes, Mass ownership changes and retired
  executions.
- An offline database replacement is not present in the old cut's Particle
  history. A new-cut baseline versus causally admitted Particles is therefore
  an owner decision, not an implementation detail.

### Energy

- Current `energy.mass.fence/release` is unauthenticated operation-wise,
  process-local, per identity, and unavailable after full stop.
- No atomic five-handle fence receipt binds source declarations, key IDs,
  generations, checkpoint identity and stage ID.
- No post-commit retarget/re-authorize contract moves live ownership to Lada,
  and no crash rule proves whether source fences remain held or are released.
- Cold rehydration would naturally create new target handles and discard old
  process-local generations, but then no old Inference destroy hook runs.
  Whether cold rehydration is sufficient or pre-stop retire/destroy is required
  needs an owner decision.

### Canonical source

- The proof mutates only Boundary SQLite. It does not update canonical
  `meta.ts`.
- Its planned MetaJSON validator is supplied by tests and does not derive the
  post-dissolve declaration graph from current Inference/Lada source.
- A later read/materialization rooted at `zavx0z/inference` can therefore
  reintroduce the source unless activation also defines the canonical authored
  source/root transition.

## Exact remaining owner decisions

The next reversible implementation gate can be narrow only if the owner
approves all of the following:

1. Implement a **non-live durable stage only**, created from stopped private
   checkpoint copies and still returning `effects: "none"`.
2. Choose stage storage ownership: separate Boundary service SQLite
   (recommended for separation) or a table in a detached candidate Boundary
   SQLite.
3. Authorize a generalized current-sequence checkpoint/rollback capture,
   without remote/push or live restore.

Live activation must remain a later gate. Before it, the owner must separately
choose:

4. **Cold new-cut activation**: publish an offline-transformed candidate,
   start a new cut, let Energy cold-rehydrate target handles, and accept that
   old live generations/destroy hooks do not participate; or
5. **Causal activation**: first implement authenticated Monad/Force admission,
   persistent external-admission hold, atomic multi-entity staging,
   five-handle Energy fence/retarget and explicit post-commit consequences.

The owner must also decide the canonical source/root transition and whether
superseded target key metadata/files remain indefinitely. Current evidence
supports retention with no GC; it does not support deletion.
