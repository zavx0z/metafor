## Goal

Stabilize and harden the current gravity-derived entanglement pipeline so that the implementation introduced in the latest `arch` commit becomes a durable architectural contract rather than a still-partially transitional refactor.

The current pipeline is already significantly improved and must be preserved:

- `bulk.gravity` is now flattened into an actor-oriented graph,
- gravity payloads are explicit,
- runtime actor binding is explicit,
- `strong` builds entanglement blocks upstream,
- `boundary/fields` consumes prepared projection instead of inventing entanglement locally.

This task must continue that direction and remove the remaining architectural softness.

## Current State

The latest commit already delivered several important corrections:

- `flattenGravity()` now performs a single projection pass and explicitly collects scopes, actors, links, and gravity payloads;
- `GravityEntanglementPayload` was introduced with `sourcePaths`, `fieldRefs`, `semanticKey`, and optional `expr`;
- `buildStrongEntanglement()` now builds blocks from scope/payload structure instead of simple field-name coincidence only;
- `GravityRuntimeBinding` and `GravityRuntimeMatch` were introduced to make runtime actor binding explicit;
- the fragile `graph.actors.length === runtimeActors.length` assertion was removed;
- `setGravitySource()` was removed, and gravity now enters the pipeline through `updateBoundary(options)`;
- prepared boundary projection now includes explicit prepared fields, payload ids, semantic keys, and representative branes. 

All of that is correct and must be kept. The task is now to refine what still remains weak or transitional.  [oai_citation:1‡[refactor] force - упрощение flattenGravity и улучшение привязки runtime-акторов

### Основные изменения:
- `flattenGravity()` теперь проходит по AST только один раз, явно собирая скоупы, акторы, ссылки и пэйлоады
- Добавлена явная модель `GravityEntanglementPayload` с семантическими ключами
- `buildStrongEntanglement()` строит блоки на основе скоупов и пэйлоадов, а не field-name coincidence
- Добавлены `GravityRuntimeBinding` и `GravityRuntimeMatch` для явной привязки runtime-акторов к gravity-нодам
- Удалена хрупкая ассерция `graph.actors.length === runtimeActors.length`
- Удалён `setGravitySource()` в пользу передачи gravity через `updateBoundary(options)`

### Улучшения кода:
- Упрощена навигация по AST в `flattenGravity()` за счёт единого `collectActorProjection`
- Нормализация пэйлоадов и семантических ключей вынесена в отдельные функции
- Типизация в `strong.t.ts` расширена для поддержки явной модели гравити-энтанглмента
- Обновлены тесты для проверки независимости от HTML-обёрток и явных binding'ов](https://github.com/zavx0z/metafor/commit/4b7000222fca2af8f3cf1c5bf4e1849e81931e1f)

## Architectural Target

Use this exact target model:

- `bulk.gravity` is the source of entanglement structure;
- `mass` remains out of scope and must not participate;
- `weak` remains out of scope and must not be modified;
- regular HTML must not be part of the entanglement model;
- parsed `bulk.gravity` must be projected into an actor-only structure;
- that structure must preserve connectivity and gravity-side entanglement semantics strongly enough that `strong` is building blocks from gravity structure itself;
- runtime binding between gravity actors and runtime actors must remain explicit and robust;
- `boundary/fields` must remain downstream-only and must not regain entanglement ownership.

## Remaining Problems To Solve

### 1. Gravity projection is still traversed through generic template `el` nodes

Even though `el` nodes are no longer modeled as entanglement entities, they are still used as traversal carriers in `collectActorProjection(...)`.

That is acceptable as an implementation detail today, but the architecture is still not fully clean conceptually.

The next iteration must make the actor projection layer clearly represent:

- actor manifestation,
- actor scopes,
- actor hierarchy,
- actor connectivity,
- gravity entanglement payloads,

instead of still looking like a filtered traversal over a general template tree.

Do not just remove recursion through `el`.
Refine the projection model so that actor extraction is explicitly the primary concern.

### 2. Gravity payloads are improved, but still too projection-like

`GravityEntanglementPayload` is a major improvement, but it currently still behaves mostly like a normalized container for:

- source paths,
- field refs,
- semantic key,
- expr.

This is better than the previous heuristic state, but the model still needs to become more clearly “gravity entanglement structure” rather than “annotated field-ref grouping”.

Strengthen the payload model so it represents gravity-side entanglement more explicitly as a first-class upstream structure.

### 3. Strong still closes the decision through runtime field intersection

`buildStrongEntanglement()` is improved, but its final block formation still depends on finding runtime-resolved shared fields across all participating actors.

That is acceptable operationally, but the architecture should lean more clearly toward:

- gravity defines entanglement structure,
- runtime mapping resolves projection into actual fields,
- strong uses runtime field resolution as projection validation and narrowing,
- not as the main ontological source of entanglement membership.

Refine the implementation so entanglement membership is more clearly gravity-driven, while runtime field resolution is used for projection/materialization readiness.

### 4. Boundary still reconstructs canonical shared values from brane values

This is currently done through `representativeBraneIndex` and shared-value validation in `materializeEntanglement()`.

This is acceptable as downstream materialization, but the upstream projection can still become cleaner and more explicit so that boundary depends less on reconstructing semantics from raw brane values.

Do not move semantics down into boundary.
Keep boundary downstream-only, but make the upstream contract cleaner.

## Required Actions

### 1. Refine the actor-only gravity projection model

Rework the gravity flattening layer so that it is explicitly modeled as actor projection rather than generic AST traversal.

The output contract must clearly represent:

- actor scopes,
- actor nodes,
- actor-to-actor hierarchy,
- scope-to-actor relationships,
- projection links,
- gravity entanglement payload ownership.

The implementation may still recurse through the parsed structure internally, but the resulting architecture must no longer conceptually depend on generic HTML/tree traversal.

### 2. Strengthen the gravity entanglement payload contract

Refine `GravityEntanglementPayload` and adjacent graph structures so that they preserve gravity-side entanglement semantics more explicitly.

At minimum, the flattened model must preserve:

- payload ownership,
- payload lineage through scopes and actors,
- payload semantic grouping,
- payload participation in actor connectivity,
- enough information to distinguish entanglement-carrying gravity payloads from incidental field references.

The model must be strong enough that `strong` is consuming a real upstream entanglement structure, not merely enriched field metadata.

### 3. Separate entanglement membership from field materialization readiness

Refactor `buildStrongEntanglement()` so that it distinguishes between:

- membership of actors in an entanglement block,
- field projection readiness for boundary materialization.

Membership should be driven primarily by:

- gravity payload grouping,
- connectivity,
- scope/hierarchy relations,
- explicit runtime binding.

Shared field resolution should remain important, but it should be treated as projection narrowing, not the sole determinant of entanglement membership.

### 4. Harden runtime binding as an architectural contract

Keep explicit `GravityRuntimeBinding`, but make the actor/runtime mapping strategy more formally grounded.

The code should clearly support cases where:

- the gravity graph contains more actors than currently materialized runtime actors,
- only a subset of gravity actors are bound,
- runtime actor order differs from gravity projection order,
- field names differ and must be mapped explicitly.

Do not allow hidden positional assumptions to reappear.

### 5. Improve prepared entanglement projection clarity

Keep the richer boundary projection introduced in the latest commit, but refine it so that it is clearly the canonical downstream contract.

The preferred path should be through explicit prepared `fields`, not through fallback `fieldIndices`.

If compatibility fallback must remain temporarily, make the new explicit path clearly primary and ensure the rest of the pipeline uses it consistently.

### 6. Keep `boundary/fields` downstream-only

Do not move any entanglement ownership back into boundary.

`boundary/fields` must remain responsible only for:

- normalization,
- validation,
- local/shared mapping,
- materialization,
- heap/build,
- execution-ready data preparation.

It may validate shared-value consistency, but it must not regain responsibility for discovering why actors are entangled.

### 7. Tighten tests around the refined model

Expand tests so they prove the refined architecture, not just the current behavior.

At minimum cover:

- actor-only gravity projection remains invariant under irrelevant HTML wrappers;
- gravity payload semantics remain preserved in the flattened model;
- strong block membership is gravity/payload/connectivity driven;
- runtime actor binding is explicit and survives subset binding and order changes;
- prepared boundary projection prefers explicit prepared fields;
- boundary remains a pure materialization consumer;
- the full path remains executable from gravity AST to matrix-ready data.

### 8. Keep the full path working end-to-end

After refactor, the repository must still support this full path:

`parsed gravity AST -> actor-only gravity projection -> gravity entanglement payload graph -> strong entanglement blocks -> prepared boundary projection -> fields materialization -> matrix-ready execution input`

Do not leave the system in a partially refactored state.

## Constraints

- Do not involve `mass`.
- Do not modify `weak`.
- Do not reintroduce entanglement ownership into `boundary/fields`.
- Do not fall back to value-equality discovery as the primary entanglement model.
- Do not reduce the architecture back to field-name coincidence.
- Do not treat regular HTML layout as part of the entanglement model.
- Do not rewrite unrelated parts of the system.
- Do not abandon the improvements already introduced in the latest commit.
- Keep changes minimal in surface area but strong in architecture.

## Expected Result

After completion, the current refactor should no longer feel like an improved transitional bridge.

The repository should contain a clearer and more stable architecture where:

- gravity is the real source of entanglement structure;
- actor-only gravity projection is explicit and conceptually clean;
- gravity entanglement payloads are first-class upstream structures;
- strong block membership is driven by gravity structure plus explicit runtime binding;
- field resolution is treated as projection into runtime/boundary space, not as the sole source of entanglement truth;
- prepared boundary projection is explicit and rich enough for downstream materialization;
- boundary remains purely downstream;
- the full path from gravity AST to matrix-ready execution data remains working and testable.