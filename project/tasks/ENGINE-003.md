# ENGINE-003 — Сквозной тест skinned mesh в Renderer

## Коротко

Когда работа со skinned mesh станет текущей, добавить Renderer-level regression
test, который проверяет полный путь матриц костей от `SkinnedMesh` до GPU upload
и dynamic offsets во время draw.

## Зачем

ENGINE-002 разделила обычные per-object uniform-данные и матрицы костей. Чистые
helper-тесты подтверждают раскладку и предел `128` костей, но не связывают в
одной проверке расчёт bone matrices, `queue.writeBuffer`, bind group offsets и
draw path Renderer.

Hamiltonian сейчас не содержит skinned mesh, поэтому этот путь нельзя честно
принять по его живой сцене. Проверку нужно выполнять вместе с будущей предметной
работой над skinned mesh, а не блокировать ею оптимизацию обычного рендера.

## Связь с текущей работой

Задача обнаружена при ревью завершённой оптимизации передачи данных рендера
ENGINE-002. Она не отменяет подтверждённое сокращение upload обычных объектов и
не является зависимостью этой оптимизации. Действующее разделение обычных и
скелетных mesh хранится в
[`Контракте движка`](../../pkg/engine/CONTRACT.md).

## Решение владельца

* Вынести Renderer-level проверку skinned mesh в отдельную будущую задачу.
* Вернуться к ней, когда начнётся работа со skinned mesh.

## Границы

* Не добавлять skinned mesh в Hamiltonian только ради теста.
* Не менять предел `128` костей без отдельного решения.
* Не подменять полный Renderer-path повторной проверкой чистых helper-функций.
* Не менять визуальный или animation contract в рамках одной тестовой задачи.

## Критерии готовности

* Один тест содержит обычные и разреженно расположенные skinned render items.
* Используются реальные skeleton bone matrices и bone inverses.
* Проверены destination/source offsets и диапазоны `queue.writeBuffer`.
* Проверены draw-time offsets обычного uniform-буфера и bone-буфера.
* Подтверждены обнуление незанятого хвоста и предел `128` костей.
* Ошибка согласования upload, bind offsets и draw path действительно ломает
  тест.

## Проверка результата

* Renderer-level regression test с контролируемым GPU device/queue либо
  небольшой настоящий WebGPU render test.
* `bun test pkg/engine`.
* `bun run typecheck`.
