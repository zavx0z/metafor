
# Weak

`weak.md` разворачивает силовое чтение `Weak`.
Общие различения силы, `Boson`, подтипа канала и `Impulse` заданы в [корневом Force](../FORCE.md).

## Сила и каналы

`Weak` отвечает за переход, прохождение, мутацию, трансформацию и медицию состояния.
Она не распределяет наблюдаемый сигнал, а проводит сущность через изменение.

У `Weak` два канала:

- `W boson` — активный переход,
- `Z boson` — нейтральная медиция перехода.

Оба являются подтипами `Boson` и принадлежат одной силе `Weak`.

## Различие между `W boson` и `Z boson`

`W boson` проводит активную смену состояния.
Он относится к самому акту перехода из одного состояния в другое.

`Z boson` удерживает нейтральную связку переходных состояний.
Он относится к внутреннему сопряжению, медиции и согласованию перехода.

Это различие не превращает `Weak` в распределённый сигнальный канал уровня `Photon`.
Оно только разводит активный проход и нейтральную переходную медицию внутри одной силы.

## Процессный Протокол

Обычный рантайм-поток Force не использует `/field/...`: `gluon`, `higgs` и
`photon` адресуются через actor ID или WIMP SRC и внутренние `fieldId` внутри
`value.fields`. Старый Weak result adapter для top-level `wimpId` / `processId`
и `/field/...` удалён.

Текущий v0 процессного протокола использует один общий
`BroadcastChannel("force")` и actor-addressed частицы:

```text
Matrix -> photon/replace or photon/test
Energy -> z test
Matrix -> z copy
Energy -> execute cached descriptor
Energy -> w+ / w-
Matrix -> apply result / unlock / next weak step
```

Matrix не публикует отдельную Z-задачу. `photon` является публичным сигналом
входа actor в state. Для обычного state Matrix испускает
`{ part: "photon", op: "replace", path: actorId, value: stateName }`. Если
state process-bound, Matrix ставит lock, сохраняет frozen snapshot fields на
момент входа и испускает
`{ part: "photon", op: "test", path: actorId, value: stateName }`.

Matrix runtime snapshot содержит только boolean marker процесса:
`weak.stateHasProcessByBraneIndex[braneIndex][stateIndex]`. Matrix не получает
process id, action source, wrapper, import specifier, env, read/write handlers
или process descriptor.

Energy стартует явно из Dark: Dark получает `boundary.energyRuntime()` и
передаёт catalog в `startEnergyProtocol({catalog})` до загрузки Matrix snapshot.
Catalog содержит `actors: Array<[actorId, wimp]>` и descriptors по
`wimp + state`. Energy слушает только `photon/test`, находит descriptor по
`actorId + stateName`, проверяет env и молчит, если descriptor отсутствует или
env не подходит.

Если descriptor найден, Energy отправляет запрос:

```ts
{ part: "z", op: "test", path: 17, value: { energy: "energy-local" } }
```

Matrix выбирает первый валидный Energy и отвечает:

```ts
{ part: "z", op: "copy", path: 17, from: "energy-local", value: { fields: { "2": 11 } } }
```

`z copy` означает, что исполнитель выбран, а `value.fields` несёт frozen fields
snapshot. `z copy` не несёт `process`. `from` у `z copy` — Energy id. Повторные
`z test` после выбора исполнителя игнорируются без отрицательной частицы.

После `z copy` Energy исполняет cached process descriptor, найденный на
`photon/test`, через `wrapperSrc` или dynamic import action. Action получает
единый params object:

```ts
{ field, value, mass, self }
```

`value` keyed by field key, а не by fieldId. `mass` берётся из in-memory Energy
mass store и не сериализуется в `Boundary`, не хранится в `Matrix` и не идёт по
Force. Если action успешно завершился и descriptor содержит success handler,
Energy выполняет handler и собирает write-set через `update(...)`. В `w+`
попадают только keys, объявленные в `success.writeFields`, как string field IDs:

```ts
{ part: "w+", op: "replace", path: 17, value: { fields: { "3": "done" } } }
```

Если success handler отсутствует или не вызвал `update(...)`, fields остаётся
`{}`. Если action бросил исключение и descriptor содержит error handler, Energy
передаёт handler объект `Error` и собирает write-set через `update(...)`. В
`w-` попадают только keys, объявленные в `error.writeFields`:

```ts
{ part: "w-", op: "replace", path: 17, value: { error: "failed", fields: { "4": "failed" } } }
```

Если error handler отсутствует или не вызвал `update(...)`, fields остаётся
`{}`. Если handler сам бросил исключение, Energy всё равно публикует
actor-addressed `w-` с ошибкой handler и пустым fields.

Timeout fallback сохраняется только для debug/v0 compatibility, если `z copy`
пришёл без pending descriptor.

Новый Weak process contract не использует top-level `processId`, `token`,
`wimpId`, `executorId` или `/field/...`.

## Чтение по доменам

### Dark

- активный сдвиг между латентными структурными версиями через `W boson`,
- скрытая связка переходных конфигураций через `Z boson`,
- историческая реконфигурация модели,
- эволюция структуры как линия изменений, а не как процесс исполнения.

### Boundary

- допустимый шаг перехода через `W boson`,
- согласование условий перехода через `Z boson`,
- вычисление переходной логики,
- фиксация канонически допустимого прохождения между состояниями.

### Matrix

- вычисление runtime-перехода состояния,
- вход actor/brane в process-bound state,
- lock при входе в process-bound state,
- сохранение frozen fields snapshot для Energy runtime,
- испускание `photon/replace` для обычного state и `photon/test` для process-state,
- выбор первого Energy через `z test` / `z copy`,
- приём `w+`/`w-`, применение result write-set и снятие lock.

### Energy

Energy здесь означает distributed process executor. Текущий пакет `energy/`
сейчас является локальным Force pipeline без реального исполнения DSL action:

- получает process catalog snapshot при старте,
- слушает только `photon/test` Matrix,
- отправляет `z test` через локальный `BroadcastChannel("force")`,
- принимает `z copy` только со своим Energy id в `from`,
- исполняет cached descriptor с in-memory mass,
- возвращает actor result через `w+` или `w-`.

### Bulk

- проявление перехода и process intent в наблюдаемой форме через `W boson`,
- внутреннее сопряжение переходных состояний через `Z boson`,
- проявление процесса без исполнения process action,
- жизненный цикл после изменения состояния.

## Силовые различия

- `Weak` не переносит наблюдаемое состояние по системе; это делает `Photon`.
- `Weak` не изменяет значения обычных `Field` как сила удержания; это делает `Gluon`.
- `Weak` не изменяет поля topology; это делает `Higgs boson`.
- `Weak` не удерживает скрытую геометрию и адресуемость; это делает `Graviton`.
- `W boson` и `Z boson` вместе завершают слабую симметрию силовых каналов MetaFor.
