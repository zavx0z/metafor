# NODES-015 — Сделать policy частью сценария playground

## Коротко

Один сценарий dev-only SVG playground является полным исполняемым preset:
topology, viewport, expected direction и точная fixed/adaptive policy. Вторая
независимая policy-комбинация недоступна; интерфейс показывает policy сценария
как read-only значение и описание.

## История и evidence

* NODES-010 создала independent public fixed/adaptive entrypoints и private
  playground registry.
* NODES-013 добавила fixed compound, adaptive flat и adaptive compound families
  в RIGHT/DOWN.
* Текущий UI независимо выбирает `fixtureSelect` и `policySelect`, хотя scenario
  label уже содержит «Фиксированная» или «Адаптивная».
* Live proof 19 августа 2026 года показал две формально успешные, но смыслово
  противоречивые комбинации:
  - fixed baseline + adaptive policy: `dynamicPortCount=0`, выбирать нечего;
  - adaptive compound + fixed policy: adaptive allowed sides не участвуют,
    diagnostics имеют `kind=fixed`.
* Владелец признал противоречие и поручил сделать один правильный contract.

## Решение владельца

1. Fixture владеет typed `policyId: fixed | adaptive`.
2. Отдельный `<select>` policy удаляется.
3. UI показывает `Политика сценария` как read-only output и описание из private
   registry.
4. Run/reset/compare всегда получают policy из выбранного fixture.
5. Все fixtures одной family обязаны иметь одну policy; comparison fail-fast
   отклоняет внутренне противоречивую family.
6. Сравнение policies не маскируется старым switch. Если оно понадобится,
   станет отдельным явным действием и отдельной matrix.

## Границы

* Не менять fixed/adaptive solver, inputs/results, routing, SVG и geometry.
* Не объединять public policy entrypoints и не удалять private registry.
* Не добавлять cross-policy comparison.
* Не менять Hamiltonian, Card, Worker, Surface или WebGPU.

## Критерии готовности

1. `PlaygroundFixture` требует typed `policyId`; fixed и обе adaptive families
   закреплены за точными policies.
2. DOM содержит один scenario select и не содержит policy select.
3. Read-only policy label/description обновляются атомарно со scenario.
4. Run и RIGHT/DOWN comparison используют только fixture policy.
5. Regression запрещает mixed-policy family и прежние конфликтные комбинации.
6. Все result/SVG hashes остаются неизменными.
7. `bun test pkg/nodes`, playground typecheck, browser console и
   `git diff --check` проходят.
8. Открытый через `ai-macos` playground оставлен на русском fixed preset для
   проверки владельцем.

## Состояние

`IN_PROGRESS`, исполнитель `/root`.
