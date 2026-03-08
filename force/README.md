# `@metafor/force`

Минимальный FSM-координатор в архитектуре MetaFor.

`FORCE` не вычисляет переходы сам.
Он:

1. хранит семантику (`"IDLE"`, `"PATROL"`, имена полей),
2. передаёт механику в `BOUNDARY` (GPU/bytecode),
3. эмитит события жизненного цикла и runtime-переходов,
4. управляет ритмом блокировок через намерения.

---

## Ключевая модель: `updateBoundary()` как commit + birth-signal

`updateBoundary()` в текущей модели:

- **пересобирает/синхронизирует boundary** под актуальный набор акторов,
- **не выполняет runtime-шаг переходов** (не делает эволюцию FSM),
- **но эмитит birth-events** для новых акторов.

Birth-event нужен, чтобы:

- оповестить систему о появлении нового актора,
- запустить процесс первого состояния (если есть `intention`),
- отделить фазу создания от runtime-эволюции.

Формат birth-event:

- `oldState: undefined`
- `newState: <первое состояние superposition>`

---

## Такт событий (`onStateChange`)

`onStateChange(callback)` получает **пакет изменений**.

Есть два типа событий:

1. **Birth-event** (инициализация актора)
   - `oldState === undefined`
2. **Runtime transition** (рабочий переход)
   - `oldState !== undefined`

Гарантия текущей модели:

- `updateBoundary()` → только birth-events (если есть новые акторы),
- `updateActors()` → только runtime transitions.

---

## Блокировки (Lock) и намерения

### Кто ставит lock

`BOUNDARY` автоматически ставит lock при реальном изменении состояния.

### Кто снимает lock

- `FORCE` снимает lock автоматически, если у нового состояния **нет намерения**.
- `Weak Force` (или orchestration-слой) снимает lock после исполнения процесса через `releaseLock()`.

### Birth и lock

Для birth-событий без `intention` lock снимается сразу в commit-фазе `updateBoundary()`, без runtime-step.

---

## API

## `createActor(config): string`

Создаёт актора и возвращает `actorId`.

Поля:

- `fields`: схема полей,
- `values`: значения полей,
- `superposition`: граф переходов,
- `intentions?`: карта `state -> processKey`.

---

## `updateBoundary(): Promise<BraneStateChange[]>`

Синхронизирует boundary и эмитит birth-events.

Поведение:

- пересобирает boundary под текущий набор акторов,
- обновляет внутренние маппинги `actorId <-> braneIndex`,
- фиксирует начальное состояние новых акторов,
- эмитит только birth-events (`oldState: undefined`),
- runtime-переходы в этом вызове не вычисляет.

Возвращает массив birth-изменений (или `[]`, если новых акторов нет).

---

## `updateActors(updates): Promise<BraneStateChange[]>`

Обновляет поля и запускает runtime-эволюцию FSM.

Формат:

- `{ uuid, fields?, lock? }`

`lock`:

- `true` — принудительно заблокировать,
- `false` — принудительно разблокировать,
- `undefined` — не менять lock напрямую.

Также:

- если после runtime-перехода нет `intention`, lock снимается автоматически.

---

## `onStateChange(callback): void`

Подписка на пакет изменений.

`callback(changes)` получает массив `BraneStateChange`:

- `actorId`
- `oldState`
- `newState`
- `intention`
- `values`

---

## `releaseLock(actorIds?): Promise<void>`

Явно снимает lock:

- для перечисленных `actorIds`,
- или для всех, если аргумент не передан.

Используйте после завершения процесса действия.

---

## `registerProcesses(processes): void`

Регистрирует схемы процессов (из DSL/runtime registry).

---

## `getProcessSchema(processKey)`

Возвращает схему процесса по ключу намерения.

---

## `deleteActor(id): void`

Удаляет актора из FORCE-слоя.

---

## Пример: birth-signal + runtime

```ts
import {
  createActor,
  updateBoundary,
  updateActors,
  onStateChange,
  releaseLock,
} from "@metafor/force"

const id = createActor({
  fields: { hp: { type: "number" } },
  values: { hp: 30 },
  superposition: {
    IDLE: { PATROL: { hp: { gt: 50 } } },
    PATROL: null,
  },
  intentions: {
    IDLE: "spawnProcess",      // процесс на первом состоянии
    PATROL: "patrolProcess",
  },
})

onStateChange((changes) => {
  for (const c of changes) {
    if (c.oldState === undefined) {
      console.log(`[BIRTH] ${c.actorId}: ${c.newState}, intention=${c.intention}`)
    } else {
      console.log(`[RUN] ${c.actorId}: ${c.oldState} -> ${c.newState}, intention=${c.intention}`)
    }
  }
})

// Commit + birth signaling (без runtime-step)
await updateBoundary()

// Runtime-такт
await updateActors([{ uuid: id, fields: { hp: 80 } }])

// После завершения процесса
await releaseLock([id])
```

---

## Практические рекомендации

1. После `createActor()` / `deleteActor()` вызывайте `updateBoundary()`.
2. Используйте birth-events из `updateBoundary()` для инициализационной оркестрации.
3. Реагируйте на runtime-логику через `updateActors()` + `onStateChange`.
4. Для состояний с намерением удерживайте lock до завершения процесса и вызывайте `releaseLock()`.
5. Разделяйте обработку birth и runtime в доменных обработчиках явно.
