# NODES-007 — Сохранять одинаковую раскладку после перезагрузки

## Коротко

Если после перезагрузки изменились только внутренние runtime IDs, ноды и рёбра
должны остаться на тех же местах. Изменение размера и reload одного viewport не
могут давать две разные схемы одной и той же topology.

## Зачем

В открытой Hamiltonian-вкладке portrait resize сохранил длинную одноколоночную
схему, а обычный reload при том же viewport построил компактную двухколоночную.
Число нод, рёбер, направление и размеры viewport совпали; изменились UUID одной
page и её Dedicated Worker. Пользователь не должен видеть геометрический скачок
из-за служебного имени того же структурного места.

## Связь с дорожной картой

Это дефект границы Hamiltonian → `nodes` layout adapter, найденный через
визуальную доводку Hamiltonian. Чистое ядро `@nodes/layout` остаётся владельцем
координат, но не должно получать сменяемый runtime UUID как identity
неизменившегося visual slot. UI, Worker transport и renderer не являются
владельцами исправления.

## Подтверждённые факты

1. До reload живой graph имел `DOWN`, `15` нод, `13` рёбер, viewport
   `722 × 1088`, bounds `1192 × 4544`.
2. После обычного reload тот же viewport, направление и cardinality дали bounds
   `1846.25 × 2786`.
3. Reload заменил UUID page и связанного Dedicated Worker, но не изменил их
   структурную роль и intrinsic geometry.
4. NODES-002 уже устраняла тот же класс зависимости от случайного порядка
   lifecycle rows: первый result commit оказался недостаточен в `RIGHT`, после
   чего `9fd85f053` ввёл канонический вход и проверку обеих ориентаций.
5. Текущие permutation tests сохраняли сами ID и поэтому не проверяли смену
   domain incarnation при сохранении visual slot.
6. Попытка сделать pure layout инвариантным к произвольному переименованию всех
   semantic IDs нарушила существующие hard fixtures: semantic ID является
   законным стабильным tie-break ядра. Значит, исправление принадлежит adapter
   boundary, а не маршрутизатору.
7. Owner live-check после первого исправления нашёл независимую причину
   одноколоночного resize: scheduling key содержал только `RIGHT`/`DOWN`.
   Промежуточный узкий portrait viewport успевал commit, а последующие resize
   той же ориентации выполняли только auto-fit без нового placement.

## Решение владельца

Одинаковая структурная topology при одинаковых размерах и viewport обязана
иметь одинаковую нормализованную geometry независимо от новых opaque runtime
UUID после reload. Domain `id` сохраняется для модели и действий; producer
передаёт отдельную стабильную layout identity того же visual slot.

## Границы

* Не передавать в минимальный layout protocol Hamiltonian roles, titles, facts,
  lifecycle timestamps или предыдущие coordinates.
* Не сохранять скрытый layout state между вызовами и не добавлять incremental
  placement как обход чистого ядра.
* Не делать pure layout инвариантным к произвольному переименованию semantic
  IDs и не менять его stable-ID tie-break.
* Не рассчитывать layout на каждый pixel resize: один bounded debounce обязан
  принять только финальный exact viewport и отменить устаревший Worker result.
* Не менять exact ports, semantic edges, clearance, containment, responsive
  `RIGHT`/`DOWN` или ограниченный search budget.
* Не добавлять fixture-specific ID, coordinates или route priorities.
* Runtime не запускать и не перезапускать; live proof использует уже открытую
  вкладку `:4400` после offline proof.

## Критерии готовности

1. Regression меняет domain node/edge incarnation IDs, сохраняя стабильные
   layout slots, и воспроизводит lifecycle reload.
2. После исправления исходный и reincarnated document дают одинаковые bounds,
   rectangles, port centers и routes после сопоставления layout IDs в `RIGHT`
   и `DOWN`; materialized result сохраняет новые domain IDs.
3. Повторы, reversed input arrays и reincarnated document совпадают; все hard
   validators и exact endpoints проходят.
4. NODES-002 row-order regression и frozen layout proofs остаются зелёными.
5. Focused tests, package/root typecheck и `git diff --check` проходят.
6. Перед `REVIEW` сохранён final benchmark на прежнем frozen `RIGHT`/`DOWN`
   input и сопоставлен с совместимым NODES-006 benchmark.
7. В точной открытой вкладке одинаковый viewport после resize и reload даёт
   одинаковую нормализованную geometry; runtime не перезапускается.
8. Переход `landscape → portrait` без reload после остановки resize даёт тот же
   compact multi-column class, что и cold layout финального portrait viewport;
   промежуточный узкий размер не может commit после финального.

## Проверка результата

```bash
bun test pkg/nodes
bun run --cwd pkg/nodes/layout typecheck
bun run --cwd pkg/nodes typecheck
bun run typecheck
```

Фактический результат:

* `bun test pkg/nodes` — `81/81`;
* focused Hamiltonian build/lifecycle/responsive tests — `29/29`;
* package layout, package nodes и root typecheck — PASS;
* два settled reload одного target: page incarnation различается, normalized
  geometry SHA-256 одинаков — `3adbe651…`;
* final benchmark: `RIGHT 195.81 ms`, `DOWN 424.73 ms`; geometry hashes и pure
  layout source byte-identical NODES-006 baseline, медианы ниже на `9.5%` и
  `10.2%` соответственно.

Статус: `REVIEW`. Оба подтверждённых источника устранены: runtime UUID отделён
от layout identity, exact viewport включён в scheduling key, resize bounded до
финального размера. Финальная открытая вкладка без перезапуска runtime:
`722 × 1088 @2`, Worker `ready`, pending `0`, `15/13`, bounds
`1846.25 × 2814`.

## Артефакты

[`project/artifacts/NODES-007/`](../artifacts/NODES-007/README.md)
