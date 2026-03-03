# `@boundary/monad`

Минимальный FSM-координатор в архитектуре MetaFor.

`MONAD` не вычисляет переходы сам.  
Он:

1. хранит семантику (`"IDLE"`, `"PATROL"`, имена полей),
2. передаёт механику в `BOUNDARY` (GPU/bytecode),
3. фиксирует события переходов,
4. управляет ритмом блокировок через намерения.

---

## Ключевая модель: `undefined` как рождение

Новая монада создаётся **без текущего состояния**.

- `createMonad()` не устанавливает `state`
- первое состояние проявляется на `updateBoundary()`
- первый event имеет вид:

- `oldState: undefined`
- `newState: <первое состояние суперпозиции>`

Это **нормальный lifecycle**, а не ошибка.

---

## Такт событий (`onStateChange`)

`onStateChange(callback)` получает **пакет событий**.

События могут быть двух типов:

1. **Birth-event** (рождение):
   - `oldState === undefined`
2. **Runtime transition** (рабочий переход):
   - `oldState !== undefined`

Если вам нужна только runtime-логика — фильтруйте события:

- `changes.filter(c => c.oldState !== undefined)`

---

## Блокировки (Lock) и намерения

### Кто ставит lock

`BOUNDARY` автоматически ставит lock, когда состояние реально изменилось.

### Кто снимает lock

- `MONAD` снимает lock автоматически, если у нового состояния **нет намерения**
- `WEAK FORCE` (или ваш orchestration слой) снимает lock после исполнения процесса через `releaseLock()`

---

## API

## `createMonad(config): string`

Создаёт монаду и возвращает `monadId`.

Поля:

- `fields`: схема полей
- `params`: значения полей
- `superposition`: граф переходов
- `intentions?`: карта `state -> processKey`

---

## `updateBoundary(): Promise<BraneStateChange[]>`

Инициализирует/пересобирает boundary и выполняет первый такт вычисления.

Важно:

- генерирует birth-events (`oldState: undefined`)
- затем может добавить runtime-переход, если в том же такте был фактический переход по условиям
- автоматически разблокирует состояния без намерения

---

## `updateMonads(updates): Promise<BraneStateChange[]>`

Обновляет поля и запускает эволюцию.

Формат:

- `{ id, fields?, lock? }`

`lock`:

- `true` — принудительно заблокировать
- `false` — принудительно разблокировать
- `undefined` — не менять lock напрямую

Также:

- если после перехода нет намерения, lock снимается автоматически.

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

- для перечисленных `monadIds`
- или для всех, если аргумент не передан

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

## Пример: правильный lifecycle

```ts
import { createMonad, updateBoundary, updateMonads, onStateChange } from "@boundary/monad"

const id = createMonad({
  fields: { hp: { type: "number" } },
  params: { hp: 30 },
  superposition: {
    IDLE: { PATROL: { hp: { gt: 50 } } },
    PATROL: null,
  },
  intentions: {
    PATROL: "patrolProcess",
  },
})

onStateChange((changes) => {
  const runtime = changes.filter(c => c.oldState !== undefined)

  for (const c of changes) {
    if (c.oldState === undefined) {
      console.log(`[BIRTH] ${c.monadId}: ${c.newState}`)
    } else {
      console.log(`[RUN] ${c.monadId}: ${c.oldState} -> ${c.newState}, intention=${c.intention}`)
    }
  }

  // бизнес-реакции только на runtime
  for (const c of runtime) {
    // ...
  }
})

await updateBoundary() // birth-event
await updateMonads([{ id, fields: { hp: 80 } }]) // runtime transition IDLE -> PATROL
```

---

## Практические рекомендации

1. Всегда вызывайте `updateBoundary()` после создания набора монад.
2. Не трактуйте `oldState: undefined` как ошибку.
3. Разделяйте birth и runtime-события в обработчиках.
4. Если состояние имеет процесс-намерение — держите lock до завершения процесса и вызывайте `releaseLock()`.

---

## Тесты

```bash
bun test monad/tests
```
