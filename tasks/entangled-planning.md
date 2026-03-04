# Задача: Планирование архитектуры Entangled (запутанность полей)

**Приоритет:** Критический  
**Зависимости:** ✅ Gravity Stores (order, graph, actor) завершены  
**Оценка:** 2-3 часа на анализ + план  
**Исполнитель:** Субагент (анализ + план)

---

## 📋 Контекст

В текущей архитектуре **запутанность полей** (entangled) вычисляется в `@boundary/fields/prepare.ts` автоматически при вызове `fieldsWrite()`.

**Проблема:** Gravity должен **управлять запутанностью** и передавать готовые данные в `updateBoundary()`.

---

## 🎯 Цель

Провести глубокий анализ текущей архитектуры и создать **подробный план** изменений для:

1. **@boundary/fields** — модификация `prepareData()`, `write()`
2. **monad** — модификация `updateBoundary()`, `createMonad()`
3. **force/gravity/store** — новый store `entangled.ts`
4. **space/client.ts** — интеграция нового потока данных

---

## 🔍 Области анализа

### 1. @boundary/fields

**Файлы для анализа:**

| Файл | Что изучить |
|------|-------------|
| `prepare.ts` | Как вычисляется entangled, формат данных |
| `entangled.ts` | `findEntangledGroups()`, `buildBraneMapping()` |
| `heap.ts` | Как entangled блоки размещаются в heap |
| `index.ts` | Сигнатура `write(data: Data)` |

**Вопросы:**

1. Какой **точный формат** `data.branes[]`?
2. Где в `Data` интерфейсе должны быть entangled данные?
3. Как `prepareData()` использует `entangledAnalysis`?
4. Можно ли передавать **готовый** `braneMapping` вместо вычисления?

---

### 2. monad

**Файлы для анализа:**

| Файл | Что изучить |
|------|-------------|
| `monad.ts` | `createMonad()`, `updateBoundary()` |
| `monad.t.ts` | Типы хранилищ (`_monadParams`, `_uuidToIndex`) |

**Вопросы:**

1. Где хранятся `values` монад до `updateBoundary()`?
2. Как `updateBoundary()` собирает `allBranes`?
3. Какие данные нужны для передачи entangled?
4. Как изменить сигнатуру `updateBoundary(entangled?)`?

---

### 3. force/gravity/store

**Новый модуль:**

```
force/gravity/store/
├── entangled.ts       # computeEntangled(), getEntangledData()
├── entangled.t.ts     # EntangledData тип
└── entangled.spec.ts  # тесты
```

**Вопросы:**

1. Когда вычислять entangled — до или после `createMonad()`?
2. Как сопоставить `ActorRecord` с `values` для `findEntangledGroups()`?
3. Нужно ли кэшировать entangled данные?
4. Как обрабатывать изменения (updateActor)?

---

### 4. space/client.ts

**Интеграция:**

```typescript
async function syncActors() {
  // 1. Получить акторов
  const actors = storeActor.getAllActors()
  
  // 2. Вычислить запутанность
  const entangled = storeEntangled.computeEntangled(actors)
  
  // 3. Создать монады
  for (const actor of actors) {
    createMonad({ uuid: actor.uuid, ... })
  }
  
  // 4. Передать запутанность
  await updateBoundary(entangled)  // ← новый параметр
}
```

**Вопросы:**

1. В какой момент вызывать `computeEntangled()`?
2. Нужно ли пересчитывать при каждом `syncActors()`?
3. Как обрабатывать удаление акторов (entangled группы)?

---

## 📊 Текущий поток данных

```
┌─────────────────────────────────────────────────────────┐
│ client.ts                                               │
│  syncActors()                                           │
│    ↓                                                    │
│    createMonad() → _monadParams.set(uuid, values)       │
│    ↓                                                    │
│    updateBoundary()                                     │
│      ↓                                                  │
│      allBranes = _monadParams.map(valuesToTuples)       │
│      ↓                                                  │
│      fieldsWrite({ fields, branes: allBranes })         │
└─────────────────────────────────────────────────────────┘
         ↓
┌─────────────────────────────────────────────────────────┐
│ @boundary/fields/prepare.ts                             │
│  prepareData(data: Data)                                │
│    ↓                                                    │
│    values = branes.map(b => b.values)                   │
│    ↓                                                    │
│    entangledAnalysis = findEntangledGroups(values)      │
│    ↓                                                    │
│    braneMapping = buildBraneMapping(...)                │
│    ↓                                                    │
│    heap = buildHeap(braneMapping)                       │
└─────────────────────────────────────────────────────────┘
```

---

## 🎯 Желаемый поток данных

```
┌─────────────────────────────────────────────────────────┐
│ client.ts                                               │
│  syncActors()                                           │
│    ↓                                                    │
│    actors = storeActor.getAllActors()                   │
│    ↓                                                    │
│    entangled = storeEntangled.computeEntangled(actors)  │
│    ↓                                                    │
│    createMonad() → _monadParams.set(uuid, values)       │
│    ↓                                                    │
│    updateBoundary(entangled)                            │
│      ↓                                                  │
│      allBranes = _monadParams.map(valuesToTuples)       │
│      ↓                                                  │
│      fieldsWrite({ fields, branes, entangled })         │
└─────────────────────────────────────────────────────────┘
         ↓
┌─────────────────────────────────────────────────────────┐
│ @boundary/fields/prepare.ts                             │
│  prepareData(data: Data)                                │
│    ↓                                                    │
│    entangledAnalysis = data.entangled.analysis ??       │
│                        findEntangledGroups(values)      │
│    ↓                                                    │
│    entangledBraneIds = data.entangled.entangledBraneIds │
│    ↓                                                    │
│    braneMapping = buildBraneMapping(                    │
│      values, entangledBraneIds, entangledAnalysis       │
│    )                                                    │
│    ↓                                                    │
│    heap = buildHeap(braneMapping)                       │
└─────────────────────────────────────────────────────────┘
```

---

## ✅ Deliverables

### 1. Отчёт по анализу

**Файл:** `tasks/entangled-analysis-report.md`

**Структура:**

```markdown
# Entangled Analysis Report

## 1. Текущая архитектура
- [ ] Описание `findEntangledGroups()`
- [ ] Описание `buildBraneMapping()`
- [ ] Формат `Data` интерфейса
- [ ] Формат `HeapInput`

## 2. Изменения @boundary/fields
- [ ] Новый интерфейс `Data` с `entangled?`
- [ ] Изменения `prepareData()`
- [ ] Изменения `write()`

## 3. Изменения monad
- [ ] Новая сигнатура `updateBoundary(entangled?)`
- [ ] Тип `Entangled` (что передавать)

## 4. Store Entangled
- [ ] API: `computeEntangled()`, `getEntangledData()`
- [ ] Формат `EntangledData`
- [ ] Зависимости от @boundary/fields

## 5. Интеграция client.ts
- [ ] Порядок вызовов
- [ ] Обработка изменений

## 6. Тесты
- [ ] Unit тесты для store/entangled
- [ ] Integration тесты для updateBoundary(entangled)
```

---

### 2. План реализации

**Файл:** `tasks/entangled-implementation-plan.md`

**Структура:**

```markdown
# Entangled Implementation Plan

## Этап 1: @boundary/fields
- [ ] Изменить `Data` интерфейс
- [ ] Изменить `prepareData()`
- [ ] Тесты

## Этап 2: monad
- [ ] Изменить `updateBoundary()`
- [ ] Экспортировать тип `Entangled`
- [ ] Тесты

## Этап 3: Store Entangled
- [ ] `entangled.t.ts` — типы
- [ ] `entangled.ts` — функции
- [ ] `entangled.spec.ts` — тесты

## Этап 4: Интеграция
- [ ] `client.ts` — новый поток
- [ ] Тесты на git-иерархии
```

---

## 🔗 Ссылки

- [@boundary/fields/entangled.ts](./boundary/fields/entangled.ts) — анализ запутанности
- [@boundary/fields/prepare.ts](./boundary/fields/prepare.ts) — подготовка данных
- [monad/monad.ts](./monad/monad.ts) — создание монад
- [tasks/gravity-stores.md](./tasks/gravity-stores.md) — выполненные store модули

---

## 📋 Критерии готовности

### Анализ
- [ ] Изучены все 4 области (fields, monad, gravity, client)
- [ ] Ответы на все вопросы в разделе "Вопросы"
- [ ] Отчёт `entangled-analysis-report.md` заполнен

### План
- [ ] План `entangled-implementation-plan.md` с этапами
- [ ] Каждый этап имеет чек-лист задач
- [ ] Определены зависимости между этапами
- [ ] Оценено время на каждый этап

### Тесты
- [ ] План тестов для каждого модуля
- [ ] Integration сценарии описаны

---

## 🕒 Оценка времени

| Задача | Время |
| ------ | ----- |
| Анализ @boundary/fields | 45 мин |
| Анализ monad | 30 мин |
| Проектирование Store Entangled | 30 мин |
| Написание отчёта | 30 мин |
| Написание плана | 30 мин |
| **Итого** | **~3 часа** |

---

## 🤖 Процесс работы с агентом

### 📋 Формат взаимодействия

Работа ведётся **итеративно** в режиме диалога. Агент выполняет анализ и план, **постоянно сверяясь** с пользователем.

### 🔄 Цикл работы

```
1. Пользователь передаёт задачу агенту
   ↓
2. Агент изучает контекст (файлы, ссылки, зависимости)
   ↓
3. Агент задаёт уточняющие вопросы (если нужно)
   ↓
4. Пользователь отвечает
   ↓
5. Агент выполняет часть работы
   ↓
6. Агент показывает результат
   ↓
7. Пользователь проверяет, даёт обратную связь
   ↓
8. Агент корректирует (если нужно)
   ↓
9. Переход к следующему шагу (п.2)
   ↓
10. Финальная проверка и завершение
```

---

### 📝 Примеры итераций

#### Итерация 1: Изучение контекста

**Агент:**
> Изучаю `@boundary/fields/entangled.ts`...
> Вижу `findEntangledGroups()` и `buildBraneMapping()`.
> 
> **Вопрос:** Правильно ли понимаю, что `entangledBraneIds` должен вычисляться в Gravity, а не в `prepareData()`?

**Пользователь:**
> Да, именно так. Gravity должен передавать готовый маппинг.

---

#### Итерация 2: Промежуточный результат

**Агент:**
> Написал черновик раздела "Изменения @boundary/fields":
> 
> ```typescript
> // Было:
> export interface Data {
>   fields: Field[]
>   branes: Brane[]
> }
> 
> // Стало:
> export interface Data {
>   fields: Field[]
>   branes: Brane[]
>   entangled?: {
>     entangledBraneIds: Map<string, number>
>     analysis: EntangledAnalysis
>   }
> }
> ```
> 
> **Проверь:** Подходит ли формат?

**Пользователь:**
> Да, но лучше назвать просто `entangled` без вложенности.

---

#### Итерация 3: Корректировка

**Агент:**
> Исправил:
> 
> ```typescript
> export interface Data {
>   fields: Field[]
>   branes: Brane[]
>   entangled?: EntangledData
> }
> 
> export interface EntangledData {
>   entangledBraneIds: Map<string, number>
>   analysis: EntangledAnalysis
> }
> ```
> 
> **Иду дальше:** Анализ monad...

---

### ✅ Правила работы

**Агент обязан:**

1. **Задавать вопросы** если что-то непонятно
2. **Показывать промежуточные результаты** перед продолжением
3. **Сверяться с планом** после каждой итерации
4. **Не продолжать** без подтверждения пользователя
5. **Фиксировать решения** в отчёте

**Пользователь:**

1. **Проверяет** промежуточные результаты
2. **Даёт обратную связь** (да/нет/исправить)
3. **Подтверждает** переход к следующему шагу

---

### 🚫 Антипаттерны

**❌ Неправильно:**

```
Агент: (молча выполняет всю работу за 1 шаг)
Агент: Вот готовый отчёт на 50 страниц.
```

**✅ Правильно:**

```
Агент: Изучаю раздел 1... Вот черновик. Проверь?
Пользователь: Да, ок.
Агент: Иду к разделу 2... Есть вопрос по формату.
Пользователь: (отвечает)
Агент: Понял, исправляю... Готово, идем дальше?
```

---

### 📊 Ожидаемые артефакты от агента

После работы агент должен предоставить:

| Артефакт | Формат | Когда |
| -------- | ------ | ----- |
| **Вопросы по контексту** | Список вопросов | Начало работы |
| **Черновик раздела 1** | Markdown фрагмент | После анализа @boundary/fields |
| **Черновик раздела 2** | Markdown фрагмент | После анализа monad |
| **Финальный отчёт** | `entangled-analysis-report.md` | Конец работы |
| **План реализации** | `entangled-implementation-plan.md` | Конец работы |

---

### 🎯 Критерии успешной работы

**Агент справился если:**

- [ ] Задал ≥3 уточняющих вопросов по контексту
- [ ] Показал ≥2 промежуточных результата на проверку
- [ ] Внёс ≥1 корректировку по обратной связи
- [ ] Предоставил оба файла (отчёт + план)
- [ ] Все вопросы из раздела "Вопросы" получили ответы

---

### 📞 Точки контакта

**Когда агент должен остановиться и спросить:**

1. **Перед изменением интерфейса** — "Правильно ли понимаю формат?"
2. **Перед написанием раздела** — "Вот план раздела, подходит?"
3. **После написания раздела** — "Проверь черновик, всё верно?"
4. **Перед финальной сборкой** — "Вот структура отчёта, продолжаю?"
5. **Если нашёл противоречие** — "Нашёл несоответствие в коде, как трактовать?"

---

## 🎯 Следующий шаг

**Передать задачу субагенту с инструкцией:**

> "Изучи задачу `entangled-planning.md`. Начни с анализа @boundary/fields.
> После изучения задай уточняющие вопросы.
> Показывай промежуточные результаты перед продолжением."
