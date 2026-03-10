
### Goal

Correct the Matrix input contract so that the shared Matrix entry point contains only canonical common execution input, while GPU-local derived materialization is created only after backend branching.

### Context

The current Matrix initialization flow mixes two layers:

- common prepared execution input
- GPU-specific branch-local materialization

Current repository behavior shows:

- `MatrixInitParams` includes `bytecode`, `bytecodeOffsets`, `states`, `braneDescriptors`, and `heap`
- `blockPtrs` is passed separately through `MatrixRuntimeInitContext`
- CPU runtime actually needs `heap`, `states`, `bytecode`, `bytecodeOffsets`, and `blockPtrs`
- GPU runtime additionally needs GPU-local derived structures and string atlas buffers
- `braneDescriptors` is currently built before backend branching even though it is a GPU-oriented derived representation
- both CPU and GPU execute directly from `bytecode` and `bytecodeOffsets`; there is no separate canonical transition IR today

The shared Matrix input is therefore defined incorrectly:
- a shared item is missing from the canonical contract (`blockPtrs`)
- a GPU-local derived item is incorrectly included in the shared contract (`braneDescriptors`)

### Required Actions

1. Update the shared Matrix initialization types so the canonical common Matrix input includes:
   - `heap`
   - `states`
   - `bytecode`
   - `bytecodeOffsets`
   - `blockPtrs`

2. Remove `braneDescriptors` from the shared Matrix input contract.

3. Refactor Matrix runtime initialization so:
   - CPU runtime receives the shared input directly
   - GPU runtime derives `braneDescriptors` only inside the GPU branch, after backend selection
   - GPU-only inputs remain GPU-local and do not shape the shared Matrix contract

4. Keep `atlasExport` out of the canonical shared Matrix input shape.
   It may still be passed into the GPU creation path as backend-local materialization input, but it must not define or pollute the shared execution contract.

5. Update the relevant Matrix runtime wiring and helper code so the new contract is consistently used across:
   - Matrix type definitions
   - `matrixInit`
   - `createMatrixRuntime`
   - CPU runtime creation
   - GPU runtime creation and GPU init helpers

6. Remove or relocate any helper that exists only to precompute `braneDescriptors` before branching.
   If a descriptor builder is still needed, keep it inside the GPU implementation boundary.

7. Update tests that assume the old input shape so they validate the corrected contract and still verify CPU/GPU parity.

8. Run the relevant test suite and verify that:
   - CPU runtime still behaves the same
   - GPU runtime still behaves the same
   - shared Matrix behavior remains unchanged
   - the contract no longer exposes GPU-local derived input as shared input

### Constraints

- Do not introduce a new transition IR.
- Do not change transition semantics.
- Do not change entanglement ownership or move preparation back into `boundary/fields`.
- Do not expand the refactor beyond Matrix input contract correction and the minimum related wiring.
- Do not keep `braneDescriptors` in the shared contract for convenience.
- Do not remove `atlasExport` from GPU materialization if GPU still needs it internally.
- Preserve the single shared runtime contract for CPU and GPU.

### Expected Result

Matrix has one corrected common prepared input contract based on real shared execution needs.

After completion:

- `blockPtrs` is part of the shared Matrix input
- `braneDescriptors` is no longer part of the shared Matrix input
- GPU derives its own descriptor representation only after branching
- CPU and GPU still execute from the same canonical prepared execution model
- runtime behavior and parity remain intact
- the Matrix entry point no longer reflects GPU packaging convenience instead of true shared input