# Energy

`energy` зарезервирован для распределённого исполнителя процессов MetaFor.

Этот пакет не является прежним runtime-state слоем: этот слой уже называется
`Matrix`. Energy не читает SQLite напрямую и не держит Matrix store. При
холодном рождении она получает каноническую проекцию Boundary через Monad RPC.

Energy ведёт собственный инкрементальный store и запускается самостоятельно
через `energy/server.ts`:

- `EnergyMonad` сначала открывает `MonadChannel`, вызывает
  `boundary.initialProjection.read` и локально гидратит постоянный catalog
  Atom/Topology/Field/Variant/Process и continuation descriptors;
- только после полной гидратации `energy/server.ts` создаёт `Force("energy")`;
- после рождения Boundary доставляет каждое изменение Atom, Topology, Process
  или continuation обычным отдельным Graviton;
- store содержит atom/wimp mapping, process descriptors по `wimp + state` и
  parent-child/dependency индексы;
- `energy/energy.ts` подключается к уже подготовленному catalog и получает
  обычные `{parts}` через тот же WebSocket transport, что и остальные домены;
- `photon/replace` от Matrix игнорируется как обычный state;
- `photon/test` от Matrix означает process-bound state;
- Energy ищет descriptor в store, проверяет env и отвечает через `z test` с
  `value.energy` только при совпадении;
- Matrix выбирает первого валидного Energy и отдаёт frozen fields через
  `z copy` с `from = Energy id`;
- `z copy.value` содержит только `fields`, без `process`;
- Energy принимает только `z copy`, где `from` совпадает с его `ENERGY_ID`;
- Energy исполняет process descriptor из своего store через `wrapperSrc` или dynamic
  import action и публикует atom-addressed `w+` / `w-`;
- WIMP-wide Graviton немедленно отсоединяет старые executions затронутых Atom,
  перестраивает catalog/bindings и после этого abort-ит старые actions;
- action success запускает success handler, если он есть; action throw запускает
  error handler, если он есть;
- handlers собирают W write-set через `update(...)`, но в `value.fields`
  попадают только keys, объявленные в `success.writeFields` /
  `error.writeFields`;
- `energy/server.ts` поднимает домен Energy и health endpoint на `4005`;
  Boundary остаётся сервисом, доступным через transport-neutral `MonadRpcPeer`.

Через Force каждое atom/topology/field/variant/process изменение приходит отдельным
`ForceMessage` с одной `Particle`; `replace` содержит только delta адресованной
entity. Aggregate bootstrap и control frames в Particle protocol отсутствуют.
Полная начальная проекция проходит только через Monad и применяется к тому же
локальному catalog до открытия ForceChannel. После рождения нет RPC на claim и
нет повторного чтения Boundary: повторный Graviton upsert-ит ту же identity, а
изменение другой entity не очищает unrelated Mass/Energy. Пока Matrix не
подключена последней, общий Force остаётся в `starting` и не пропускает Particle
ни от агента, ни от доменного channel; поэтому между initial projection и
рождением Energy не нужен bootstrap replay/control frame.

Каноническое завершение процесса для Matrix — это Force `w+` или `w-` с
`path = atom ID` и `value.fields[fieldId]`. Если success/error handler
отсутствует или не вызывает `update(...)`, Energy сохраняет прежнее поведение:
`w+` / `w-` уходят с пустым `fields`. Если handler бросает исключение, Energy
публикует atom-addressed `w-` и не пробрасывает ошибку наружу.
Старый Weak result path через top-level `wimpId` / `processId` и `/field/...`
удалён из Matrix и не является runtime protocol.

Energy владеет двумя раздельными in-memory stores: изменяемой рабочей `mass` и
живых сущностей `energy`. Оба имеют scope atom+wimp:
`${wimp}\0${atomId}`. Они не хранятся в `Matrix` и не переносятся через Force.
`destroy` получает оба объекта; после его `before` Energy store освобождается
даже при ошибке handler. Mass store имеет отдельный lifetime и сохраняется до
`close()`, который очищает оба default store.

Action invocation contract един для `wrapperSrc` и imported action:

```ts
await fn({field, value, mass, energy, self, signal})
```

`field` собирается из canonical Field/Variant текущего WIMP. `value` собирается
из frozen `z copy.value.fields` по `readFields` и keyed by field key, не by
fieldId; стандартный wrapper, передающий весь `value`, объявляет читаемыми все
Fields. `self` содержит `{atom, meta, path}` для atom.
`mass` и `energy` всегда являются разными объектами.
`signal` — `AbortSignal` текущего execution. Action обязан остановить ожидания и
освободить свои внешние handles при abort.

## Перестройка во время Process

Energy не ждёт остановки старого action и не отправляет Matrix отдельный ack.
На Graviton затронутого WIMP она сначала удаляет старое execution из текущего
слота Atom, освобождает/перестраивает локальную Energy generation и bindings,
а затем синхронно вызывает `AbortController.abort()`. Следующий Photon может
запустить новое execution сразу: завершения старого action никто не ждёт.

Старое completion проверяет `processExecutionId` перед success/error handler и
перед каждым `w+`/`w-`; его `.finally()` удаляет map entry только при совпадении
identity. Поэтому старый Promise не может стереть новое execution.

Это cooperative stop. Произвольный action, игнорирующий `signal`, нельзя
физически прервать внутри общего JS isolate; его протокольный результат всё
равно подавляется. Hard-kill требует отдельной runtime-изоляции.

## Matter bindings

Этот раздел относится только к runtime `massBinding`/`energyBinding`. Field
binding не разрешается Energy: прямую связь ordinary Fields канонически хранит
Boundary, а Matrix получает её как prepared shared value projection.

Materialized child Atom может прийти с sibling-`continuation`:

```ts
{
  atom: { id, parentAtom, parentTopology, wimp, position },
  continuation: {
    massBinding: { data: "/mass/cache", expr: "{cache: _[0]}" },
    energyBinding: { data: "/energy/socket", expr: "{socket: _[0]}" },
  },
}
```

Это только сериализуемые Matter descriptors из Boundary/SQLite. Energy находит
ближайший owning parent Atom (в том числе под topology), разрешает bindings из
его локальных stores и вызывает `bind` раздельных child stores. Root aliases
`/mass` и `/energy` сохраняют exact object identity; projections сохраняют
ссылки выбранных значений. Успешно установленный binding не вычисляется на
каждом claim: Graviton, изменивший Matter continuation ребёнка или отношение
Atom/Topology к owning parent, немедленно переустанавливает проявленные aliases
и отсоединяет pending/running execution старой связи. Если dependency ещё
`undefined`, binding не считается установленным, Energy не отправляет claim и
повторяет разрешение на следующем trigger. Ни live Mass, ни живые
Energy-сущности через Force не передаются.

`energy/index.ts` остаётся тонким публичным входом для типов и парсера
`readEnergyEnv`, без runtime-side-effect.

`ENERGY_ID` задаёт id исполнителя; если env нет, используется стабильный
`energy-local`.
