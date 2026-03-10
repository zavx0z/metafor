### Goal

Finish the Matrix GPU cleanup after the shared-input refactor by removing stale protocol inconsistencies, eliminating unnecessary duplication, and aligning the GPU data layout, WGSL implementation, and documentation around the most efficient runtime representation.

### Context

The shared Matrix input was already corrected and now properly carries canonical common execution input through:

- `heap`
- `states`
- `bytecode`
- `bytecodeOffsets`
- `blockPtrs`

That part must remain intact.

However, the current GPU implementation is still internally inconsistent:

- `gpu/init.ts` builds `braneDescriptors` from both `blockPtrs` and `bytecodeOffsets`
- `gpu/evolution.wgsl` reads `block_ptr` from `brane_descriptors`, but reads `bytecode_base` from the separate `bytecode_offsets` buffer
- `boundary/matrix/README.md` still documents `braneDescriptors` as `[block_ptr, bytecode_offset, ...]`
- README also contains at least one behavior mismatch with WGSL around lock handling

This means the repository currently has an unresolved mismatch between:
- actual WGSL consumption
- GPU runtime materialization
- documented GPU protocol

From the current code path, there is real duplication of `bytecode_offset` data inside GPU-local materialization, even though the shared Matrix contract is already correct.

The cleanup must choose one coherent GPU representation and then align code and documentation to that decision.

### Required Actions

1. Inspect the current GPU runtime data path end to end, including:
   - `boundary/matrix/gpu/init.ts`
   - `boundary/matrix/gpu/index.ts`
   - `boundary/matrix/gpu/pipeline.ts`
   - `boundary/matrix/gpu/evolution.wgsl`
   - `boundary/matrix/README.md`

2. Determine the minimal GPU-local representation that is best for the current runtime from the standpoint of:
   - allocation cost
   - upload cost
   - runtime memory footprint
   - direct indexed access in WGSL
   - consistency with the existing execution model

3. Based on that determination, make the GPU representation fully coherent.
   Choose one model and remove the other:
   - either keep separate specialized buffers and remove redundant packed data,
   - or keep one packed GPU descriptor representation and remove the redundant separate offset source.

4. Remove all stale GPU-local duplication and dead protocol remnants related to the old descriptor layout.

5. Align WGSL helper logic and comments with the actual chosen GPU buffer model.

6. Update GPU init helpers, buffer types, bind group wiring, and related naming so they describe the real representation and no longer imply an outdated layout.

7. Update `boundary/matrix/README.md` so it matches the actual implementation exactly, including:
   - real buffer structure
   - real source of `block_ptr`
   - real source of `bytecode_offset`
   - actual lock behavior in the shader
   - any other protocol details that currently diverge from code

8. Verify that no old pre-refactor assumptions remain in Matrix-related code paths, especially:
   - no GPU packaging convenience leaking back into shared Matrix input
   - no stale descriptor builders outside the GPU branch
   - no leftover comments or helper names that describe removed protocol shapes

9. Run the relevant Matrix tests and confirm that:
   - CPU behavior remains unchanged
   - GPU behavior remains unchanged unless explicitly corrected by the chosen cleanup
   - CPU/GPU parity still holds
   - the final GPU protocol is internally consistent and free from obsolete duplicated paths

### Constraints

- Do not reintroduce `braneDescriptors` or any other GPU-specific derived structure into the shared Matrix input contract.
- Do not change the canonical shared Matrix input shape unless strictly required by a proven implementation issue.
- Do not introduce a new transition IR.
- Do not change FSM semantics unless fixing a proven implementation/documentation mismatch that already exists.
- Do not leave the repository in a mixed state where README, WGSL, and runtime wiring describe different GPU protocols.
- Do not preserve duplicated GPU-local data without a justified performance reason grounded in the current implementation.
- Keep the change limited to Matrix GPU cleanup and related documentation alignment.

### Expected Result

The Matrix shared input contract remains clean and unchanged, while the GPU runtime becomes internally consistent.

After completion:

- GPU uses one coherent representation for brane execution metadata
- redundant GPU-local duplication is removed
- WGSL, runtime wiring, helper naming, and documentation all describe the same protocol
- no stale legacy descriptor assumptions remain
- Matrix CPU/GPU behavior stays aligned
- the repository no longer contains misleading or obsolete GPU protocol code after the last refactor