# `@boundary/monad`

Минимальный FSM-координатор в архитектуре MetaFor.

`MONAD` не вычисляет переходы сам.  
Он:

1. хранит семантику (`"IDLE"`, `"PATROL"`, имена полей),
2. передаёт механику в `BOUNDARY` (GPU/bytecode),
3. эмитит события жизненного цикла и runtime-переходов,
4. управляет ритмом блокировок через намерения.

---

## Ключевая модель: `updateBoundary()` как commit + birth-signal

`updateBoundary()` в текущей модели:

- **пересобирает/синхронизирует boundary** под актуальный набор монад,
- **не выполняет runtime-шаг переходов** (не делает эволюцию FSM),
- **но эмитит birth-events** для новых монад.

Birth-event нужен, чтобы:

- оповестить систему о появлении новой монады,
- запустить процесс первого состояния (если есть `intention`),
- отделить фазу создания от runtime-эволюции.

Формат birth-event:

- `oldState: undefined`
- `newState: <первое состояние superposition>`

---

## Такт событий (`onStateChange`)

`onStateChange(callback)` получает **пакет изменений**.

Есть два типа событий:

1. **Birth-event** (инициализация монады)
   - `oldState === undefined`
2. **Runtime transition** (рабочий переход)
   - `oldState !== undefined`

Гарантия текущей модели:

- `updateBoundary()` → только birth-events (если есть новые монады),
- `updateMonads()` → только runtime transitions.

---

## Блокировки (Lock) и намерения

### Кто ставит lock

`BOUNDARY` автоматически ставит lock при реальном изменении состояния.

### Кто снимает lock

- `MONAD` снимает lock автоматически, если у нового состояния **нет намерения**.
- `Weak Force` (или orchestration-слой) снимает lock после исполнения процесса через `releaseLock()`.

### Birth и lock

Для birth-событий без `intention` lock снимается сразу в commit-фазе `updateBoundary()`, без runtime-step.

---

## API

## `createMonad(config): string`

Создаёт монаду и возвращает `monadId`.

Поля:

- `fields`: схема полей,
- `params`: значения полей,
- `superposition`: граф переходов,
- `intentions?`: карта `state -> processKey`.

---

## `updateBoundary(): Promise<BraneStateChange[]>`

Синхронизирует boundary и эмитит birth-events.

Поведение:

- пересобирает boundary под текущий набор монад,
- обновляет внутренние маппинги `monadId <-> braneIndex`,
- фиксирует начальное состояние новых монад,
- эмитит только birth-events (`oldState: undefined`),
- runtime-переходы в этом вызове не вычисляет.

Возвращает массив birth-изменений (или `[]`, если новых монад нет).

---

## `updateMonads(updates): Promise<BraneStateChange[]>`

Обновляет поля и запускает runtime-эволюцию FSM.

Формат:

- `{ id, fields?, lock? }`

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

- `monadId`
- `oldState`
- `newState`
- `intention`
- `params`

---

## `releaseLock(monadIds?): Promise<void>`

Явно снимает lock:

- для перечисленных `monadIds`,
- или для всех, если аргумент не передан.

Используйте после завершения процесса действия.

---

## `registerProcesses(processes): void`

Регистрирует схемы процессов (из DSL/runtime registry).

---

## `getProcessSchema(processKey)`

Возвращает схему процесса по ключу намерения.

---

## `deleteMonad(id): void`

Удаляет монаду из MONAD-слоя.

---

## Пример: birth-signal + runtime

```ts
import {
  createMonad,
  updateBoundary,
  updateMonads,
  onStateChange,
  releaseLock,
} from "@boundary/monad"

const id = createMonad({
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
      console.log(`[BIRTH] ${c.monadId}: ${c.newState}, intention=${c.intention}`)
    } else {
      console.log(`[RUN] ${c.monadId}: ${c.oldState} -> ${c.newState}, intention=${c.intention}`)
    }
  }
})

// Commit + birth signaling (без runtime-step)
await updateBoundary()

// Runtime-такт
await updateMonads([{ id, fields: { hp: 80 } }])

// После завершения процесса
await releaseLock([id])
```

---

## Практические рекомендации

1. После `createMonad()` / `deleteMonad()` вызывайте `updateBoundary()`.
2. Используйте birth-events из `updateBoundary()` для инициализационной оркестрации.
3. Реагируйте на runtime-логику через `updateMonads()` + `onStateChange`.
4. Для состояний с намерением удерживайте lock до завершения процесса и вызывайте `releaseLock()`.
5. Разделяйте обработку birth и runtime в доменных обработчиках явно.
