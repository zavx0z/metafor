# Energy

`energy` зарезервирован для распределённого исполнителя процессов MetaFor.

Этот пакет не является прежним runtime-state слоем: этот слой уже называется
`Matrix`. Energy не читает `Boundary`/SQLite и не держит Matrix store.

Текущий этап создаёт Force pipeline с самостоятельным запуском `energy/server.ts`:

- Boundary формирует самодостаточный process catalog и доставляет его Energy
  через адресованный Force `create`;
- catalog содержит actor/wimp mapping и process descriptors по `wimp + state`;
- `energy/energy.ts` создаёт `Force("energy")` и получает обычные `{parts}` через
  тот же WebSocket transport, что и остальные домены;
- `photon/replace` от Matrix игнорируется как обычный state;
- `photon/test` от Matrix означает process-bound state;
- Energy ищет descriptor в catalog, проверяет env и отвечает через `z test` с
  `value.energy` только при совпадении;
- Matrix выбирает первого валидного Energy и отдаёт frozen snapshot через
  `z copy` с `from = Energy id`;
- `z copy.value` содержит только `fields`, без `process`;
- Energy принимает только `z copy`, где `from` совпадает с его `ENERGY_ID`;
- Energy исполняет cached process descriptor через `wrapperSrc` или dynamic
  import action и публикует actor-addressed `w+` / `w-`;
- action success запускает success handler, если он есть; action throw запускает
  error handler, если он есть;
- handlers собирают W write-set через `update(...)`, но в `value.fields`
  попадают только keys, объявленные в `success.writeFields` /
  `error.writeFields`;
- `energy/server.ts` поднимает только домен Energy и health endpoint на `4005`;
  bridge protocol и прямого доступа к Boundary нет.

Каноническое завершение процесса для Matrix — это Force `w+` или `w-` с
`path = actor ID` и `value.fields[fieldId]`. Если success/error handler
отсутствует или не вызывает `update(...)`, Energy сохраняет прежнее поведение:
`w+` / `w-` уходят с пустым `fields`. Если handler бросает исключение, Energy
публикует actor-addressed `w-` и не пробрасывает ошибку наружу.
Старый Weak result path через top-level `wimpId` / `processId` и `/field/...`
удалён из Matrix и не является runtime protocol.

Energy владеет in-memory runtime mass store. `mass` не сериализуется в
`Boundary`, не хранится в `Matrix` и не переносится через Force. Default mass
scope на этом этапе — actor+wimp: `${wimp}\0${actorId}`; lifetime равен lifetime
Energy protocol, а `close()` очищает default store.

Action invocation contract един для `wrapperSrc` и imported action:

```ts
await fn({field, value, mass, self})
```

`value` собирается из frozen `z copy.value.fields` по `readFields` и keyed by
field key, не by fieldId. `self` содержит `{atom, meta, path}` для actor.

`energy/index.ts` остаётся тонким публичным входом для типов и парсера
`readEnergyEnv`, без runtime-side-effect.

`ENERGY_ID` задаёт id исполнителя; если env нет, используется стабильный
`energy-local`.
