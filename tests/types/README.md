# Строгие type-тесты MetaFor DSL

Этот каталог содержит compile-time контракт DSL. `bun test` проверяет, что
декларации можно построить в runtime, но источником истины для негативных
случаев является `bun run typecheck`.

## Восстановленная история

Исторический process type-suite перемещался без появления независимых наборов:

```text
proc/test/actions.types.spec.ts
→ core/proc/test/actions.types.spec.ts
→ core/test/processes/actions.types.spec.ts
→ base/test/processes/actions.types.spec.ts
→ base/tests/processes/actions.types.spec.ts
→ actor/tests/processes/actions.types.spec.ts
→ atom/tests/processes/actions.types.spec.ts
```

Последняя семантически корректная версия находится в commit `32c27930`; suite
удалён в `08e414ad`. Из него восстановлены три уникальные гарантии:

- success `update` запрещает неизвестный Field;
- `data` сохраняет точный result action;
- error `update` запрещает неизвестный Field.

Из `context/test/update.spec.ts` восстановлен запрет `undefined` при
`exactOptionalPropertyTypes`. Из `1dceac8d:context/test/context.spec.ts`
восстановлены нестроковые аргументы enum. Runtime-only дубли, todo-only
`union.types.spec.ts` и `@ts-expect-error`, скрывавшие только отсутствующие
тестовые imports, в строгий контракт не переносились.

## Текущий контракт

- `tests/fields/typing.spec.ts` доказывает Fields, Values, Update,
  Superposition exactness и state-dependent narrowing.
- `processes.typing.spec.ts` доказывает раздельные Mass/Energy, Process params,
  action result, success/error, state binding и destroy.
- `fixtures/` содержит test-only внешние action/cleanup-модули; исполняемая
  логика не помещается в Meta declaration.

## Mutation proof

```bash
bun run typecheck:expect-errors
```

Verifier по одной удаляет каждую `@ts-expect-error` из всех
`*.typing.spec.ts`. Каждая мутация обязана породить реальную TypeScript-ошибку;
неиспользуемая или случайно переставшая работать директива ломает gate.
