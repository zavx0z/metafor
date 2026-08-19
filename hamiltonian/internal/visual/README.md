# `@internal/visual`

`@internal/visual` — package визуальной функции Hamiltonian внутри общего
namespace [`@internal/*`](../../docs/INTERNAL.md). Имя `visual` определяет
функцию, а не Window или другую среду исполнения: один package сохраняет эту
identity во всех поддерживаемых env.

Package является самостоятельной сменяемой единицей
[`@hamiltonian/release`](../../release/README.md), а не частью startup или
встроенными bytes другого package.

## Поддерживаемые среды

| Env | Реализованное состояние |
| --- | --- |
| `main` | Полная стандартная визуальная среда Window |
| `server` | Только точный environment marker; server visual runtime отсутствует |

Другие env сейчас не объявлены. Они могут появиться позднее, если visual
функции понадобится соответствующее исполнение, без создания нового имени
package. Такое расширение меняет package-wide version и выпускает полный набор
объявленных env artifacts по [общему internal law](../../docs/INTERNAL.md#identity-и-версия-package).

## Visual в env `main`

Реализованный `main`:

* создаёт один `UiRuntime` на принадлежащем странице canvas;
* владеет lifecycle общих `Space`, `ViewPoint` и `HUD`;
* создаёт стандартный пол и один пустой именованный `UIDisplay`;
* сохраняет обычные orbit, pan и zoom;
* предоставляет переход между обзором пространства и выбранным display;
* согласует размер runtime и display с фактическим размером canvas.

Встроенный surface-display отключён. Package не наполняет `UIDisplay`
предметной сценой и не создаёт второй visual runtime: содержимое подключают
последующие функциональные packages.

HTML, canvas и font resources принадлежат общей статической оболочке
Hamiltonian. `@internal/visual:main` использует их, но не становится их
transport owner.

## Жизненный цикл

Release импортирует `@internal/visual` по одному bare package name, а выбранная
condition разрешает поддерживаемый env. В `main` создание runtime завершается
до публикации готового environment export. При смене версии visual заменяется
как отдельный artifact в составе общего release; управляемая Window получает
его в новом page execution.

Env `server` сейчас подтверждает только выбранную среду импорта. Он не создаёт
UiRuntime, не переносит Window API в Bun и не является доказательством будущего
server visual lifecycle.

## Границы

Package не импортирует рабочий прототип, его причинный monitor,
[`@hamiltonian/visual`](../../visual/README.md), Bulk или предметные node-system
surfaces. Он также не владеет loader, release composition, обновлением кода или
Hamiltonian signaling.

Точные exports, зависимости и build entrypoints находятся в
[`package.json`](package.json) и public source. Запуск и проверка clean-room
среды описаны в
[руководстве разработки](../../../.agents/skills/metafor-dev/references/development.md).
