### Goal

Perform the final documentation cleanup after the Matrix GPU protocol refactor so that the remaining docs and nearby comments exactly match the current implementation.

### Context

The GPU cleanup has already been completed correctly in code:

- packed `braneDescriptors` was replaced by `braneBlockPtrs`
- `bytecodeOffsets` remains a separate specialized GPU buffer
- WGSL, bind group wiring, and GPU runtime types now follow that model

The remaining issue is a small documentation inconsistency and a final sweep for stale wording.

Confirmed remaining mismatch:

- `boundary/matrix/README.md` now says the GPU runtime uses **9 GPU buffers** plus one `stagingBuffer`
- but later in the initialization flow section it still says `Создание GPU-буферов (10 шт)`

This should be cleaned up together with any nearby stale wording that may still reflect the removed packed descriptor protocol.

### Required Actions

1. Update `boundary/matrix/README.md` so the initialization flow no longer says `10` GPU buffers if the actual implementation now uses `9`.

2. Perform a short consistency sweep of the same README and closely related Matrix GPU comments to ensure there are no remaining stale references to:
   - packed `braneDescriptors`
   - `[block_ptr, bytecode_offset, ...]` as the active GPU layout
   - outdated lock behavior
   - outdated buffer counts

3. Keep the cleanup minimal:
   - no protocol redesign
   - no code refactor
   - no behavior changes
   - documentation and comment alignment only

4. Verify that the final wording consistently matches the current implementation across:
   - `boundary/matrix/README.md`
   - nearby GPU-facing comments in the touched files, if needed

### Constraints

- Do not modify the shared Matrix input contract.
- Do not change runtime logic.
- Do not reintroduce removed protocol terminology unless it is explicitly marked as historical.
- Do not expand beyond final doc/comment cleanup.

### Expected Result

The Matrix GPU cleanup is fully closed out from a repository hygiene perspective.

After completion:

- README buffer counts are correct
- no stale packed-descriptor wording remains in the relevant Matrix GPU docs/comments
- documentation and implementation describe the same protocol without leftover contradictions
