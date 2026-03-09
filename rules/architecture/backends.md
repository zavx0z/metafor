# Backend API Symmetry

This rule defines how parallel backend implementations of one contract must align.

## Purpose

Keep one stable public contract across backends while allowing internal implementation differences.

## When to apply

Apply this rule when designing or reviewing parallel backend modules such as CPU and GPU variants.

## Requirements

- Use the same operation names across backends for the same semantics.
- Keep backend difference in module namespace, not in operation naming.
- Keep the public contract stable across backends.
- Allow backend-specific internal implementation details.
- Forbid semantic divergence across backend variants.
- Treat CPU/GPU as execution backends, not different business models.

## Forbidden

Do not:

- publish `cpuStep` and `gpuStep` as separate semantic operations when both mean `step`;
- change business meaning between backend variants;
- fork public API shape per backend without a contract-level reason.

## Checklist

- [ ] Backend modules expose matching semantic operation names
- [ ] Public contract stays stable
- [ ] Differences are implementation-specific, not semantic
