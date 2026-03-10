### Goal

Refactor the current string preparation flow so that Matrix initialization receives only truly shared CPU/GPU execution input, while GPU-specific string atlas materialization is performed strictly inside the GPU branch.

### Context

The current Matrix shared input was partially cleaned up already, but the string pipeline remains architecturally inconsistent with the intended rule that only data required by both CPU and GPU may cross the common init boundary.

Current repository state shows:

- `MatrixInitParams` now contains only common execution data:
  - `heap`
  - `states`
  - `bytecode`
  - `bytecodeOffsets`
  - `blockPtrs`
- however `MatrixRuntimeInitContext` still carries `atlasExport`, even though it is consumed only by the GPU branch
- `createMatrixRuntime()` passes `atlasExport` only into `GPUMatrixRuntime.create(...)`, while CPU runtime does not use it at all
- GPU runtime uses `atlasExport` only to create `stringRegistry` and `stringHeap` storage buffers
- string encoding currently happens too early in the preparation pipeline:
  - `encodeValue()` for `TYPE.STRING` immediately interns strings through `StringAtlas`
  - this produces `string_id + hash` during general preparation rather than during GPU-local materialization
- as a result, the current common preparation flow already contains GPU-oriented string representation decisions before backend branching

This violates the intended architecture rule:

- common init must carry only data required by both CPU and GPU
- backend-specific technical materialization must happen only after branching
- nothing GPU-specific should remain “in the air” above the branch point

The intended direction is:

- common preparation keeps string data in a semantic / backend-neutral form
- CPU uses the data it actually needs for execution
- GPU derives its own atlas / storage-buffer representation locally inside the GPU branch

This task is not just a Matrix signature cleanup. It must correct the upstream string preparation pipeline that currently forces `atlasExport` to exist above the branch point.

### Required Actions

1. Inspect the current end-to-end string flow across the relevant modules, including at minimum:
   - `boundary/boundary.ts`
   - `boundary/fields/values.ts`
   - `boundary/fields/*` string-related preparation paths
   - `boundary/atlas/*`
   - `boundary/matrix/matrix.t.ts`
   - `boundary/matrix/runtime.ts`
   - `boundary/matrix/gpu/*`
   - CPU transition/runtime code where string values are consumed

2. Identify the exact places where string data is prematurely converted into GPU-oriented representation during general preparation.

3. Refactor the preparation model so that common pre-branch data no longer depends on `StringAtlas` export as a required Matrix runtime input.

4. Remove `atlasExport` from the shared Matrix runtime init boundary.
   After the refactor, no GPU-only atlas payload should be part of the common Matrix runtime init context.

5. Redesign string preparation so that backend-neutral/common data remains in a form justified by actual shared execution needs.
   Do not keep GPU-ready atlas buffers or GPU-oriented export structures above the branch point.

6. Move GPU-specific string atlas materialization fully into the GPU branch.
   GPU runtime may build its own atlas-related storage buffers locally, but only from data that belongs to the correct pre-branch preparation result.

7. Ensure CPU path uses only the data actually required for CPU execution and does not inherit GPU-oriented string preparation artifacts.

8. Refactor the relevant type definitions and preparation outputs so that the repository clearly distinguishes:
   - common prepared execution input
   - GPU-local string materialization
   - CPU execution data
   - temporary preparation intermediates

9. Update all affected call sites, helper functions, and internal contracts so the new flow is coherent and there is no leftover requirement to pass GPU-only atlas state through Matrix init.

10. Remove stale code paths and obsolete assumptions left by the old model, including:
   - unnecessary `atlasExport` plumbing through Matrix runtime init
   - premature atlas-dependent string encoding in common preparation where it is no longer justified
   - comments or docs that still describe the old cross-boundary atlas flow

11. Verify that string-dependent execution still works correctly for both backends, including:
   - string equality / comparison behavior
   - string-related bytecode or condition evaluation
   - CPU/GPU parity where applicable

12. Run the relevant tests and add or update tests where necessary so the new architecture is covered by observable behavior.

### Constraints

- Do not keep GPU-specific atlas export in the common Matrix init path.
- Do not introduce new shared init fields unless they are truly required by both CPU and GPU.
- Do not solve this by merely relocating `atlasExport` without fixing the upstream preparation model that currently forces it to exist.
- Do not reintroduce GPU-oriented data representation into common preparation for convenience.
- Do not break existing FSM semantics.
- Do not change entanglement ownership or move entanglement origin back out of `force/strong`.
- Do not perform a superficial refactor limited only to parameter renaming; the real string preparation boundary must be corrected.
- Keep the final architecture explicit about what is shared, what is branch-local, and why.

### Expected Result

After completion, the repository has a clean staged boundary around Matrix initialization and string preparation.

Specifically:

- Matrix common init contains only data genuinely required by both CPU and GPU
- `atlasExport` is no longer part of the common Matrix runtime init boundary
- GPU builds its string atlas/storage representation only inside the GPU branch
- common preparation no longer forces strings into GPU-oriented representation prematurely
- CPU path remains free of GPU-only init payload
- the string pipeline is architecturally aligned with the rule that only shared execution data may cross the common init boundary
- code, types, and tests consistently reflect this separation