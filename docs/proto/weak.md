
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

Обычный рантайм-поток Force уже не использует `/field/...`: `gluon`, `higgs` и
`photon` адресуются через actor ID или WIMP SRC и внутренние `fieldId` внутри
`value.fields`.

Текущий v0 процессного протокола использует один общий
`BroadcastChannel("force")` и actor-addressed частицы:

```text
Matrix -> photon
Energy -> z test
Matrix -> z copy
Energy -> timeout
Energy -> w+
Matrix -> apply result / unlock / next weak step
```

Matrix не публикует `z process-task`. `photon` является публичным сигналом
входа actor в state. Если state process-bound, Matrix ставит lock, сохраняет
frozen snapshot fields на момент входа и только затем испускает `photon`.

Energy слушает `photon` и отправляет запрос:

```ts
{ part: "z", op: "test", path: 17, value: { energy: "energy-local" } }
```

Matrix выбирает первый валидный Energy и отвечает:

```ts
{ part: "z", op: "copy", path: 17, from: "energy-local", value: { fields: { "2": 11 } } }
```

`z copy` означает, что исполнитель выбран, а `value.fields` несёт frozen fields
snapshot. `from` у `z copy` — Energy id. `rejected` в v0 не используется:
повторные `z test` после выбора исполнителя игнорируются.

Energy v0 не выполняет DSL process action. Он ждёт timeout и возвращает:

```ts
{ part: "w+", op: "replace", path: 17, value: { fields: {} } }
```

`w-` имеет ту же actor-addressed форму и может нести `error`:

```ts
{ part: "w-", op: "replace", path: 17, value: { error: "failed", fields: {} } }
```

Новый Weak process contract не использует top-level `processId`, `token`,
`wimpId`, `executorId` или `/field/...`. Реальное DSL process action execution,
process descriptor, `wrapperSrc`, dynamic import, env resolver и success/error
handlers остаются следующим этапом.

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
- испускание `photon` при смене состояния,
- выбор первого Energy через `z test` / `z copy`,
- приём `w+`/`w-`, применение result write-set и снятие lock.

### Energy

Energy здесь означает distributed process executor. Текущий пакет `energy/`
сейчас является локальным Force pipeline без реального исполнения DSL action:

- слушает photons Matrix,
- отправляет `z test` через локальный `BroadcastChannel("force")`,
- принимает `z copy` только со своим Energy id в `from`,
- в v0 ждёт timeout вместо исполнения process action,
- возвращает actor result через `w+`.

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
