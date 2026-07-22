# Energy

Energy исполняет Process и владеет его живыми runtime-сущностями. Matrix решает,
когда Process должен начаться; Energy не хранит State и не вычисляет переходы.

## Закон декларации Energy

Meta объявляет только постоянный TypeScript-тип Energy:

```typescript
.energy<{
  socket: WebSocket
  stream: MediaStream
}>()
```

Вызов не принимает объект, не создаёт значения и не попадает в MetaDSL/WIMP.
Поэтому в декларации нет фиктивных `null`, конструкторов и side effects. Если
живые сущности не нужны, используется `.energy()` с пустым типом `{}`.

Реальный объект Energy существует только в Energy runtime. Action создаёт или
заменяет его сущности, а destroy освобождает. Функция или фабрика не может быть
значением верхнего уровня Energy; такое объявление обязано отклоняться
TypeScript:

```typescript
// ошибка типа
.energy<{connect: () => WebSocket}>()
```

## Что обязаны доказывать тесты

- generic сохраняет точные типы сущностей в action, destroy и Matter;
- Mass и Energy не смешиваются;
- runtime-объект нельзя передать аргументом `.energy(...)`;
- функция верхнего уровня отклоняется;
- вызов не добавляет Energy value в MetaDSL;
- пустая `.energy()` оставляет Energy типом `{}`.

Публичный контракт находится в `types/metafor/schema.ts`, runtime-цепочка — в
`metafor.ts`, проверки — в `metafor.spec.ts` и
`tests/types/processes.typing.spec.ts`.
