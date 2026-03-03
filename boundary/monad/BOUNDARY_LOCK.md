# 🌀 Boundary-Блокировка + TAKT-Синхронизация

Этот документ описывает архитектуру цикла эволюции суперпозиций с автоматической блокировкой на уровне WGSL и пакетной обработкой (TAKT).

---

## 📐 Архитектура Цикла

```
┌─────────────────────────────────────────────────────────────────┐
│  0. BOUNDARY — Вычисление Переходов + Авто-Блокировка           │
│     └─ GPU шейдер вычисляет next_state                          │
│     └─ states[idx] = next_state                                 │
│     └─ dirtyFlags[idx] = 1                                      │
│     └─ heap[block_ptr + 2] = 1  ← LOCK автоматически            │
└─────────────────────────────────────────────────────────────────┘
                          ↓ изменение зафиксировано
┌─────────────────────────────────────────────────────────────────┐
│  1. MONAD — Сбор Изменений (TAKT)                               │
│     └─ onStateChange() получает пакет изменений                 │
│     └─ Читает: какие браны изменили состояние                   │
│     └─ Проверяет: есть ли process для нового состояния          │
└─────────────────────────────────────────────────────────────────┘
                          ↓ проверка намерения
┌─────────────────────────────────────────────────────────────────┐
│  2. MONAD — Фильтрация + Трансляция (TAKT)                      │
│     └─ Если process есть → оставляет LOCK → транслирует намерение│
│     └─ Если process нет → снимает LOCK → пропускает             │
│     └─ Всё пакетно для всех бран сразу                         │
└─────────────────────────────────────────────────────────────────┘
                          ↓ намерение подтверждено
┌─────────────────────────────────────────────────────────────────┐
│  3. WEAK FORCE — Исполнение Процессов (TAKT)                    │
│     └─ process.action() для всех акторов с намерением           │
│     └─ update() → изменение fields                              │
│     └─ По завершении → MONAD снимает LOCK через releaseLock()   │
└─────────────────────────────────────────────────────────────────┘
                          ↓ процессы завершены
┌─────────────────────────────────────────────────────────────────┐
│  4. BOUNDARY — Снова Вычисление (TAKT)                          │
│     └─ Разблокированные браны → вычисляют переходы              │
│     └─ Заблокированные браны → пропускают вычисление            │
│     └─ Цикл замыкается                                          │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🧭 Распределение Ответственности

| Уровень | Ответственность | Блокировка |
|---------|----------------|------------|
| **BOUNDARY** | Вычисление переходов + **авто-блокировка при изменении** | Ставит LOCK автоматически |
| **MONAD** | Проверка намерения + **снятие LOCK если нет процесса** | Снимает LOCK условно |
| **WEAK FORCE** | Исполнение процессов | LOCK держится пока процесс не завершится |

---

## ⚡ TAKT-Синхронизация

```
TAKT 1:
┌─────────────────────────────────────────────────────────────────┐
│ BOUNDARY: все браны вычисляют → dirtyFlags + LOCK               │
└─────────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────────┐
│ MONAD: пакетная проверка намерений → фильтр → трансляция       │
└─────────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────────┐
│ WEAK: пакетное исполнение процессов → update()                  │
└─────────────────────────────────────────────────────────────────┘
                          ↓
TAKT 2: (повтор)
```

**Ключевой принцип:** Все браны обрабатываются **одновременно в рамках одного TAKT**, не последовательно.

---

## 📝 WGSL Реализация

Файл: `boundary/matrix/evolution.wgsl`

```wgsl
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
  let idx = id.x;
  if (idx >= u.braneCount) {
    return;
  }

  let block_ptr = brane_descriptors[idx * 2u];

  // Проверка флага блокировки (3-е слово заголовка)
  let lock = heap_safe(block_ptr + 2u);
  if (lock == 1u) {
    return;  // Пропустить переходы, состояние не менять
  }

  let current_state = states[idx];
  var next_state = current_state;

  // ... вычисление переходов FSM ...

  // In-place обновление состояния
  states[idx] = next_state;

  // Атомарная установка флага изменения + авто-блокировка
  if (next_state != current_state) {
    atomicStore(&dirty_flags[idx], 1u);
    // Авто-блокировка: Закон фиксирует изменение состояния
    heap[block_ptr + 2u] = 1u;
  }
}
```

---

## 🔷 MONAD API

### `createMonad(config)`

**Важно:** Монада рождается в неопределённом состоянии.

```typescript
const id = createMonad({
  fields: { hp: { type: "number" } },
  params: { hp: 100 },
  superposition: {
    IDLE: { PATROL: { hp: { gt: 50 } } },
    PATROL: null,
  },
  intentions: {
    PATROL: "patrolProcess",
  },
})
```

### `updateBoundary(): Promise<BraneStateChange[]>`

Автоматически снимает блокировку с бран, у которых **нет намерения** после перехода.

При первой инициализации возвращает изменения с `oldState: undefined`:

```typescript
const changes = await updateBoundary()
// changes = [{
//   monadId: "...",
//   oldState: undefined,  // ← первая инициализация
//   newState: "IDLE",
//   intention: null
// }]
```

### `releaseLock(monadIds?)`

Снимает блокировку с указанных монад после завершения процессов.

```typescript
// После завершения WEAK FORCE процессов
await releaseLock(['uuid1', 'uuid2'])

// Разблокировать все
await releaseLock()
```

### `onStateChange(callback)`

Получает пакет изменений со всеми намерениями.

```typescript
onStateChange((changes) => {
  for (const { monadId, oldState, newState, intention, params } of changes) {
    if (oldState === undefined) {
      // Первая инициализация монады
      console.log(`[INIT] ${monadId} → ${newState}`)
    } else if (intention) {
      // Есть намерение → LOCK остаётся → ждём releaseLock()
      console.log(`${monadId}: ${oldState} → ${newState}, intention: ${intention}`)
    } else {
      // Нет намерения → LOCK снят автоматически
      console.log(`${monadId}: ${oldState} → ${newState} (no intention)`)
    }
  }
})
```

---

## 🕯️ Философское Обоснование

```
BOUNDARY — это Закон.
Закон автоматически блокирует изменение после перехода.
Не спрашивает разрешения — просто фиксирует факт.

MONAD — это Замысел.
Замысел проверяет: "Есть ли намерение действовать в этом состоянии?"
Если нет → снимает блокировку → позволяет течь дальше.
Если есть → держит блокировку → исполняет процесс.

WEAK FORCE — это Действие.
Действие происходит только если Замысел подтвердил намерение.
После действия → блокировка снимается → Закон снова вычисляет.

TAKT — это Ритм Бытия.
Все изменения синхронизированы.
Нет хаоса последовательных обновлений.
Всё происходит в такт.
```

---

## 🧪 Примеры Использования

### Пример 1: Первая инициализация (oldState === undefined)

```typescript
const id = createMonad({
  fields: { hp: { type: "number" } },
  params: { hp: 100 },
  superposition: {
    IDLE: { PATROL: { hp: { gt: 50 } } },
    PATROL: null,
  },
})

onStateChange((changes) => {
  // changes[0].oldState === undefined
  // changes[0].newState === "IDLE"
  console.log(`[INIT] ${changes[0].monadId} → ${changes[0].newState}`)
})

await updateBoundary()
// oldState: undefined → newState: "IDLE"
```

### Пример 2: Состояние без намерения (автоматическая разблокировка)

```typescript
const id = createMonad({
  fields: { hp: { type: "number" } },
  params: { hp: 100 },
  superposition: {
    IDLE: { DEAD: { hp: { lte: 0 } } },
    DEAD: null, // Терминальное состояние без намерения
  },
})

onStateChange((changes) => {
  // changes[0].intention === null
  // Блокировка снята автоматически
})

await updateBoundary()
await updateMonads([{ id, fields: { hp: 0 } }])
// DEAD → LOCK=1 → MONAD видит null intention → LOCK=0
```

### Пример 3: Состояние с намерением (ручная разблокировка)

```typescript
const id = createMonad({
  fields: { hp: { type: "number" } },
  params: { hp: 100 },
  superposition: {
    IDLE: { PATROL: { hp: { gt: 50 } } },
    PATROL: null,
  },
  intentions: {
    PATROL: "patrolProcess",
  },
})

onStateChange((changes) => {
  // changes[0].intention === "patrolProcess"
  // Блокировка остаётся до releaseLock()
})

await updateBoundary()
await updateMonads([{ id, fields: { hp: 80 } }])
// PATROL → LOCK=1 → MONAD видит намерение → LOCK остаётся

// WEAK FORCE исполняет patrolProcess...
await releaseLock([id]) // ← явная разблокировка после процесса
```

### Пример 4: TAKT-пакетная обработка

```typescript
const id1 = createMonad({ /* ... с намерением ... */ })
const id2 = createMonad({ /* ... без намерения ... */ })
const id3 = createMonad({ /* ... с намерением ... */ })

await updateBoundary()

// TAKT 1: Пакетное обновление всех монад
await updateMonads([
  { id: id1, fields: { hp: 80 } },      // → LOCK=1 (намерение)
  { id: id2, fields: { mana: 0 } },     // → LOCK=1→0 (нет намерения)
  { id: id3, fields: { energy: 40 } },  // → LOCK=1 (намерение)
])

// WEAK FORCE: исполняет процессы для id1 и id3
await releaseLock([id1, id3])

// TAKT 2: Готов к следующим переходам
```

---

## 📋 Чек-лист Интеграции

При интеграции нового цикла:

* [ ] WGSL ставит `LOCK=1` при изменении состояния
* [ ] `updateBoundary()` автоматически снимает LOCK для состояний без намерения
* [ ] `onStateChange()` получает намерения для всех изменений
* [ ] WEAK FORCE вызывает `releaseLock()` после завершения процессов
* [ ] Тесты покрывают оба сценария (с намерением и без)
* [ ] Первая инициализация обрабатывает `oldState === undefined`

---

## 📚 Связанные Документы

* [`QWEN.md`](../../QWEN.md) — Стандарты документации
* [`boundary/monad/monad.ts`](./monad/monad.ts) — Реализация MONAD
* [`boundary/matrix/evolution.wgsl`](./matrix/evolution.wgsl) — WGSL шейдер
