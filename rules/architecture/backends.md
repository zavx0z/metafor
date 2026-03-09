# Backend API Symmetry

This rule defines how parallel backend implementations of one contract must align.

## Purpose

Keep one stable public contract across backends while allowing internal implementation differences.

## When to apply

Apply this rule when designing or reviewing parallel backend modules such as CPU and GPU variants.

## Scope boundary

This rule covers API symmetry only. It does not define runtime class state ownership.

## Requirements

- Use the same operation names across backends for the same semantics.
- Parallel backend implementations of one role must begin from one shared conceptual prepared input before branching.
- Keep backend difference in module namespace, not in operation naming.
- Keep the public contract stable across backends.
- Keep method signatures aligned for the same operation across backends:
  - same required arguments;
  - same optional arguments;
  - same return type shape.
- Allow backend-specific internal implementation details.
- Forbid semantic divergence across backend variants.
- Treat CPU/GPU as execution backends, not different business models.
- Do not introduce public contract divergence for convenience.

## Forbidden

Do not:

- publish `cpuStep` and `gpuStep` as separate semantic operations when both mean `step`;
- change business meaning between backend variants;
- fork public API shape per backend without a contract-level reason.
- keep one backend requiring external state in a signature while another backend does not for the same operation.
- use optional parameters as a compromise when operation semantics are actually asymmetric.
- let different backends branch from conceptually different prepared input models for the same role.

## Checklist

- [ ] Backend modules expose matching semantic operation names
- [ ] Public contract stays stable
- [ ] One shared conceptual prepared input exists before backend branching
- [ ] Differences are implementation-specific, not semantic
- [ ] Required/optional arguments are symmetric across backends
- [ ] Return type shape is symmetric across backends
