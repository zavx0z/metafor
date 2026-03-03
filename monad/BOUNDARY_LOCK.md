# 🌀 Boundary Lock Lifecycle в MetaFor

Этот документ фиксирует **актуальное поведение TAKT-цикла** для `MONAD ↔ BOUNDARY`, включая:

- рождение монады (`oldState: undefined`)
- runtime-переходы (`oldState !== undefined`)
- автоматические и явные разблокировки (`lock`)

---

## 1) Фундамент

FSM в MetaFor работает как пакетный ритм:

1. `BOUNDARY` вычисляет переходы для всех бран параллельно.
2. При изменении состояния `BOUNDARY` ставит `lock=1`.
3. `MONAD` анализирует переход:
   - если намерения нет → снимает `lock`
   - если намерение есть → оставляет `lock`
4. `WEAK FORCE` исполняет процесс и вызывает `releaseLock()`.

---

## 2) TAKT-поток (актуальная версия)

## TAKT 0 — Рождение

`createMonad()` создаёт монаду без установленного состояния.

На первом `updateBoundary()` формируется event рождения:

- `oldState: undefined`
- `newState: <первое состояние superposition>`

Это **не ошибка**, а нормальный lifecycle event.

---

## TAKT 1 — Вычисление в Boundary

GPU шейдер:

- читает текущее состояние и bytecode-правила,
- вычисляет `next_state`,
- обновляет `states[idx] = next_state`,
- если `next_state != current_state`, выставляет:
  - `dirty_flag = 1`
  - `lock = 1`

`lock` находится в заголовке блока браны (`heap[block_ptr + 2]`).

---

## TAKT 2 — Интерпретация в Monad

`MONAD` получает пакет изменений и разбирает их как события:

- **birth-event**: `oldState === undefined`
- **runtime-event**: `oldState !== undefined`

Далее для `newState` проверяется `intention`:

- `intention == null/undefined` → `MONAD` снимает `lock`
- `intention != null` → `lock` остаётся до завершения процесса

---

## TAKT 3 — Исполнение в Weak Force

Для событий с намерением:

- исполняется `process.action()`,
- обновляются поля/эффекты,
- после завершения вызывается `releaseLock(monadIds?)`.

---

## TAKT 4 — Следующая эволюция

Следующий GPU-такт:

- разблокированные браны снова участвуют в переходах,
- заблокированные пропускаются.

---

## 3) Таблица lock-ответственности

| Уровень | Ставит lock | Снимает lock |
|---|---|---|
| `BOUNDARY` | Автоматически при фактическом переходе | Никогда |
| `MONAD` | Никогда | Автоматически, если у `newState` нет intention |
| `WEAK FORCE` | Никогда | После исполнения процесса через `releaseLock()` |

---

## 4) Семантика событий `onStateChange`

Подписчик получает **массив изменений за такт**.

Рекомендуемое разделение:

- Birth events: `oldState === undefined`
- Runtime transitions: `oldState !== undefined`

Если бизнес-логика должна реагировать только на рабочие переходы:

```ts
const runtime = changes.filter(c => c.oldState !== undefined)
```

---

## 5) Важные практические правила

1. Не трактуйте `oldState: undefined` как сбой — это событие рождения.
2. Не смешивайте birth/runtime в доменных обработчиках без явной фильтрации.
3. Для состояний с intention держите lock до `releaseLock()`.
4. Для состояний без intention lock снимается автоматически на стороне `MONAD`.
5. Обновления состояния обрабатываются пакетно, в ритме TAKT.

---

## 6) Короткий пример жизненного цикла

```ts
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
  for (const c of changes) {
    if (c.oldState === undefined) {
      console.log("[BIRTH]", c.monadId, "->", c.newState)
    } else {
      console.log("[RUN]", c.monadId, c.oldState, "->", c.newState, c.intention)
    }
  }
})

await updateBoundary() // birth-event
await updateMonads([{ id, fields: { hp: 80 } }]) // runtime transition IDLE -> PATROL (lock=1)
await releaseLock([id]) // после исполнения процесса
```

---

## 7) Итог

`lock` в MetaFor — это не «запрет», а механизм ритма:

- `BOUNDARY` фиксирует факт изменения,
- `MONAD` проверяет наличие воли к действию,
- `WEAK FORCE` завершает цикл действием и освобождением.

Это обеспечивает детерминированную эволюцию без потери семантики и без гонок между этапами.