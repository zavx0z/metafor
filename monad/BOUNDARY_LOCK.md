# 🌀 Boundary Lock Lifecycle в MetaFor

Этот документ фиксирует актуальную модель `MONAD ↔ BOUNDARY`, где:

- `updateBoundary()` эмитит **birth-events** для новых монад,
- `updateBoundary()` **не выполняет runtime-шаг переходов**,
- runtime-переходы происходят только в `updateMonads()`.

---

## 1) Базовый инвариант

`updateBoundary()` — это commit-фаза синхронизации графа монад с Boundary:

- пересобирает/инициализирует boundary под текущий набор монад,
- обновляет внутренние соответствия `monadId <-> braneIndex`,
- фиксирует начальные состояния новых монад,
- эмитит только birth-события (`oldState: undefined`),
- не вычисляет runtime-переходы в этом вызове.

Это позволяет:

1. получить явный сигнал создания новой монады,
2. запустить процесс первого состояния (если есть intention),
3. избежать двойного runtime-перехода в одном такте инициализации.

---

## 2) TAKT-модель (актуальная)

### TAKT 0 — Commit + Birth signaling (`updateBoundary`)

- MONAD подготавливает все браны и суперпозиции.
- BOUNDARY инициализируется без runtime-step.
- Для новых монад MONAD выставляет первое состояние суперпозиции.
- Эмитится birth-event:
  - `oldState: undefined`
  - `newState: <first state>`
- Runtime-переходы в этом такте не считаются.

### TAKT 1+ — Runtime evolution (`updateMonads`)

- Обновляются поля одной или нескольких монад.
- Выполняется один шаг эволюции FSM.
- При реальном изменении состояния:
  - формируется runtime-event,
  - BOUNDARY ставит `lock = 1`.

---

## 3) Lock lifecycle: кто ставит и кто снимает

| Слой | Ставит lock | Снимает lock |
|---|---|---|
| `BOUNDARY` | Автоматически при реальном runtime-переходе | Никогда |
| `MONAD` | Никогда | Автоматически, если у `newState` нет `intention` |
| `WEAK FORCE` / orchestration | Никогда | Явно через `releaseLock()` после завершения процесса |

---

## 4) Birth-events и lock

Birth-event в `updateBoundary()`:

- нужен как событие жизненного цикла (создание/инициализация),
- может нести `intention` первого состояния,
- не означает, что уже был runtime-переход.

Правило для lock в birth-фазе:

- если у первого состояния **нет** `intention`, lock снимается сразу;
- если `intention` есть, lock может быть удержан до завершения инициализационного процесса согласно orchestration-политике.

---

## 5) Семантика `onStateChange`

`onStateChange` получает пакет изменений, который может содержать:

1. **Birth events**
   - `oldState === undefined`
2. **Runtime transitions**
   - `oldState !== undefined`

Рекомендуется явно разделять их в обработчиках:

```/dev/null/example.ts#L1-11
onStateChange((changes) => {
  const births = changes.filter((c) => c.oldState === undefined)
  const runtime = changes.filter((c) => c.oldState !== undefined)

  // инициализационная оркестрация
  for (const c of births) handleBirth(c)

  // рабочая логика переходов
  for (const c of runtime) handleRuntime(c)
})
```

---

## 6) Практический поток

```/dev/null/lifecycle.ts#L1-32
const id = createMonad({
  fields: { hp: { type: "number" } },
  values: { hp: 30 },
  superposition: {
    IDLE: { PATROL: { hp: { gt: 50 } } },
    PATROL: null,
  },
  intentions: {
    IDLE: "spawnProcess",
    PATROL: "patrolProcess",
  },
})

onStateChange((changes) => {
  for (const c of changes) {
    if (c.oldState === undefined) {
      console.log("[BIRTH]", c.monadId, "->", c.newState, c.intention)
    } else {
      console.log("[RUN]", c.monadId, c.oldState, "->", c.newState, c.intention)
    }
  }
})

// Commit boundary + birth signals (без runtime-step)
await updateBoundary()

// Runtime step
await updateMonads([{ id, fields: { hp: 80 } }])

// После завершения процесса
await releaseLock([id])
```

---

## 7) Правила для команды

1. После `createMonad()` / `deleteMonad()` вызывайте `updateBoundary()`.
2. Не трактуйте birth-event как runtime-переход.
3. Для стартовых процессов используйте birth-events (`oldState: undefined`).
4. Для рабочей доменной логики используйте runtime-events (`oldState !== undefined`).
5. Управляйте завершением lock через `releaseLock()` после выполнения процессов.

---

## 8) Итог

В актуальной архитектуре:

- `updateBoundary()` отвечает за **commit структуры и birth-сигнализацию**,
- `updateMonads()` отвечает за **runtime-эволюцию FSM**,
- lock lifecycle остаётся детерминированным и предсказуемым,
- запуск процесса первого состояния делается корректно через birth-events.