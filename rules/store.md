# Правило Store

Это правило определяет, что такое store, где он должен быть объявлен, кто имеет право его мутировать и как store должен соотноситься с pipeline, чистыми модулями и внутренними подслоями пакета.

## Назначение

Store — это канонический объект состояния пакета или домена.

Store нужен только для одного:
быть единственным source of truth своего уровня.

Store не является:
- фабрикой
- классом
- движком
- orchestrator-модулем
- местом для бизнес-логики
- местом для side effects

## Когда применять

Применяй это правило, когда:
- создаёшь новый пакет или домен
- вводишь новый store
- решаешь, где должно жить состояние
- решаешь, где допустимы мутации
- выносишь чистую логику из store
- добавляешь внутренний подслой со своим промежуточным состоянием

## Основной принцип

Store хранит.
Helpers вычисляют.
Модуль пакета мутирует.

## Где должен быть объявлен store

Store должен быть объявлен в модуле `store.ts` своего пакета.

Примеры:
- `boundary/store.ts` → `boundary$`
- `dark/store.ts` → `dark$`
- `dark/gravity/store.ts` → `gravity$`

Store не должен объявляться в:
- `index.ts`
- `load.ts`
- `pipeline.ts`
- `factory.ts`
- модуле пакета с orchestration
- helper-модуле

## В каком виде должен быть store

Store должен быть:
- singleton-объектом
- типизированным
- созданным сразу с дефолтным состоянием
- объектом, а не классом
- объектом, а не фабрикой

Правильная форма:

```ts
export const package$: PackageStore = {
  ...defaultState,

  reset() { ... },
  restore(state) { ... },
  snapshot() { ... },
  get(...) { ... },
  set(...) { ... },
}
```

Неправильная форма:

```ts
export class PackageStore { ... }

export function createPackageStore() { ... }
```

## Что должно быть в store

В store должны быть только две категории вещей:

### 1. Канонические данные

То, что является source of truth на уровне пакета.

Например:
- `meta`
- `atom`
- `fields`
- `states`
- `children`
- `reservations`
- `nextSeq`

### 2. Узкий store API

Только методы уровня хранения состояния.

Допустимо:
- `reset()`
- `restore()`
- `snapshot()`
- `get()`
- `set()`
- узкие read/write helpers, если они относятся именно к хранению состояния

Store API отвечает на вопрос:
как прочитать или записать текущее состояние?

## Чего в store быть не должно

В store не должно быть:
- orchestration
- pipeline steps
- parsing
- AST assembly
- tree assembly
- reservation algorithms
- path algorithms
- lexicographic key math
- load/fetch
- side effects
- cross-package coordination
- предметной логики пакета

Если функция отвечает на вопрос:
как вычислить?

ей не место в store.

Если функция отвечает на вопрос:
как прочитать или обновить store state?

она может быть store API.

## Где должны находиться мутации

Все мутации store должны происходить только через pipeline соответствующего пакета.

Store не должен мутироваться произвольно из разных файлов.

### Главное правило мутаций

Все мутации store должны происходить только в главном модуле пакета, названном по имени пакета.

Примеры:
- для `dark` — в `dark/dark.ts`
- для `gravity` — в `dark/gravity/gravity.ts`
- для другого пакета — в модуле, названном по имени пакета

Мутации не должны жить в:
- `store.ts`
- `load.ts`
- `index.ts`
- `key.ts`
- `path.ts`
- `tree.ts`
- `reservation.ts`
- `materialize.ts`
- любых других pure helper-модулях

## Кто имеет право мутировать store

Только orchestrator соответствующего уровня.

### Основной store пакета

Финальный store пакета мутирует только главный модуль пакета.

Пример:
- `dark$` должен мутировать `dark.ts`

### Store внутреннего подслоя

Служебный store подслоя мутирует только главный модуль этого подслоя.

Пример:
- `gravity$` должен мутировать `gravity.ts`

### Pure helper-модули

Pure helper-модули не должны напрямую мутировать singleton-store.

Они:
- принимают вход через аргументы
- возвращают вычисленный результат
- не делают side effects
- не пишут в store напрямую

## Где должны быть объявлены мутации

Мутации должны быть явно объявлены в главном модуле пакета.

Именно там должны жить:
- `reset()`
- `restore()`
- `set(...)`
- последовательность стадий pipeline
- orchestration
- lifecycle-мутации состояния

Это нужно для того, чтобы:
- было ясно, где состояние реально меняется
- мутации не размазывались по helper-модулям
- pipeline был единственным маршрутом изменения состояния

## Что такое основной store

Основной store — это store, который хранит финальное каноническое состояние пакета или домена.

Признаки основного store:
- хранит итоговое состояние своего уровня
- является source of truth пакета
- мутируется только главным модулем пакета
- не подменяется store'ом подслоя

Примеры:
- `boundary$`
- `dark$`

## Что такое промежуточный store

Промежуточный store — это store внутреннего подслоя, который нужен для удержания собственного устойчивого промежуточного состояния.

Он может быть:
- постоянным
- singleton
- живущим всё время worker-runtime

Но его роль служебная.

Он нужен, когда подслой удерживает собственную геометрию, индексы или другие данные, без которых нельзя собрать финальный store верхнего уровня.

Примеры данных промежуточного store:
- children view
- order keys
- reservations
- seq
- служебные индексы
- промежуточная tree geometry

Пример:
- `gravity$`

### Важное правило

Промежуточный store может существовать постоянно, но он:
- не подменяет основной store домена
- не становится публичной идентичностью домена
- не хранит финальное состояние чужого уровня

## Изоляция store пакетов

**Правило:** пакеты не импортируют store домена или других пакетов напрямую через относительные пути (`../`).

```typescript
// ✅ ПРАВИЛЬНО — пакет работает со своим store
// @dark/gravity/gravity.ts
import { gravity$ } from "./store.ts"  // локальный DarkGravityStore

// ❌ НЕПРАВИЛЬНО — пакет импортирует store домена
// @dark/gravity/gravity.ts
import { dark$ } from "../store.ts"

// ❌ НЕПРАВИЛЬНО — пакет импортирует store соседнего пакета
// @dark/gravity/gravity.ts
import { strong$ } from "../strong/store.ts"
```

**Решение:** функции пакетов принимают store как параметры из доменного pipeline.

```typescript
// ✅ ПРАВИЛЬНО — store параметрами из pipeline
export function ingestFragment(
  dark$,             // доменный store
  gravity$,          // store пакета
  strong$,           // store пакета
  meta: string,
  fragment: LocalTopologyFragment,
  options: GlobalTopologyIngestOptions = {},
)

// ❌ НЕПРАВИЛЬНО — импорт из домена
import { dark$ } from "../store.ts"
```

**Принцип:** store пакета изолирован. Домен импортирует store пакетов через `@{domain}/{package}` для orchestration, но пакеты не импортируют store домена напрямую.

## Как store должен соотноситься с pipeline

Pipeline — это единственный допустимый путь изменения состояния.

Общая схема:

```text
load
→ pure helpers
→ package orchestrator
→ mutation of store
```

Если внутри пакета есть подслой:

```text
load
→ pure helpers of subdomain
→ subdomain orchestrator
→ mutation of subdomain store
→ domain orchestrator
→ mutation of final domain store
```

### Следствие

Store сам по себе не управляет pipeline.
Store не определяет orchestration.
Store не запускает стадии.
Store только хранит состояние, которое pipeline собирает и изменяет.

## Как раскладывать пакет

Для любого пакета правильная раскладка такая:

### `store.t.ts`

Только типы состояния store.

### `store.ts`

Только singleton-object store и его store API.

### Pure helper-модули

Только чистая логика, разложенная по категориям ответственности.

Например:
- `key.ts`
- `path.ts`
- `tree.ts`
- `reservation.ts`
- `materialize.ts`
- `snapshot.ts`
- `normalize.ts`
- `parse.ts`

### Главный модуль пакета

Только orchestration и мутации store.

Пример:
- `dark.ts`
- `gravity.ts`

### Loader

Только загрузка одной сущности или одного источника.

Пример:
- `load.ts` как single-schema loader без orchestration всего домена

## Как должен выглядеть loader относительно store

Loader не должен:
- мутировать финальный store домена
- становиться orchestrator-модулем
- брать на себя domain loop
- подменять главный модуль пакета

Loader должен:
- загрузить одну сущность
- распарсить один источник
- вернуть один результат загрузки

Все дальнейшие мутации выполняет orchestrator соответствующего пакета.

## Когда допустим reset

`reset()` — это часть store API.

Но вызывать `reset()` должен только orchestrator соответствующего пакета или lifecycle-слой runtime.

`reset()` не должен:
- вызываться из pure helper-модулей
- быть скрыт внутри алгоритмов
- происходить как побочный эффект вычислительной функции

Если reset относится к lifecycle worker-domain, лучше размещать его в явном bootstrap/teardown-пути, а не прятать глубоко в helper-логике.

## Что запрещено

Запрещено:
- делать store классом
- делать store фабрикой
- класть бизнес-логику в store
- класть side effects в pure helper-модули
- мутировать singleton-store из helper-модулей
- делать orchestration в `load.ts`
- делать orchestration в `store.ts`
- использовать generic `pipeline.ts` как главный грязный вход пакета
- подменять основной store store'ом подслоя
- размазывать мутации по случайным модулям

## Что разрешено

Разрешено:
- singleton-object store
- typed store
- default state
- narrow store API
- отдельный промежуточный store подслоя
- pure helper-модули
- orchestration в модуле, названном по пакету
- мутации только через package orchestrator

## Нормативная формулировка

Store пакета должен быть типизированным singleton-объектом, объявленным в `store.ts` этого пакета и содержащим только каноническое состояние данного уровня и узкий store API.

Store не должен содержать orchestration, side effects, алгоритмы сборки или другую предметную логику.

Все мутации store должны происходить только через pipeline соответствующего пакета и только в главном модуле пакета, названном по имени пакета.

Чистые вычисления должны быть вынесены в отдельные модули по категориям ответственности и не должны напрямую мутировать singleton-store.

Если пакет содержит внутренний подслой со своим устойчивым промежуточным состоянием, такой подслой может иметь собственный store, но этот store остаётся служебным и не подменяет основной store домена.

## Шаблон для нового пакета

```ts
// package/store.t.ts
export interface PackageData {
  ...
}

export interface PackageStore extends PackageData {
  reset(): void
  restore(state: PackageData): void
  snapshot(): PackageData
  get(...): ...
  set(...): ...
}
```

```ts
// package/store.ts
import type { PackageStore } from "./store.t.js"

export const package$: PackageStore = {
  ...defaultState,

  reset() { ... },
  restore(state) { ... },
  snapshot() { ... },
  get(...) { ... },
  set(...) { ... },
}
```

```ts
// package/package.ts
import { package$ } from "./store"
import { stepA } from "./a"
import { stepB } from "./b"

export function runPackageStage(...) {
  // orchestration
  // only here mutations of package$
}
```

## Критерии проверки

Проверь store по следующим вопросам:

1. Store объявлен в `store.ts` своего пакета?
2. Он singleton-object, а не класс и не фабрика?
3. У него есть дефолтное состояние?
4. Он хранит только state своего уровня?
5. Внутри только store API, а не алгоритмы?
6. Есть ли главный модуль пакета, который единственный мутирует этот store?
7. Все pure helpers вынесены отдельно?
8. Нет ли мутаций store из helper-модулей?
9. Не подменяет ли этот store store другого уровня?

Если на все вопросы ответ положительный, store сформирован правильно.
