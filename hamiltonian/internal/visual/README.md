# `@internal/visual`

`@internal/visual` — стандартная Window-среда clean-room Hamiltonian. Package
создаёт пустое общее визуальное пространство, в которое последующие
`internal` или `metafor` modules могут поместить собственное представление.

Он является самостоятельным artifact сменяемого
[`@hamiltonian/release`](../../release/README.md), а не частью startup или
встроенными bytes release main.

## Предметная ответственность

Реализованный env `main`:

* создаёт один `UiRuntime` на принадлежащем странице canvas;
* владеет lifecycle общих `Space`, `ViewPoint` и `HUD`;
* создаёт стандартный пол и один пустой именованный `UIDisplay`;
* сохраняет обычные orbit, pan и zoom;
* предоставляет переход между обзором пространства и выбранным display;
* согласует размер runtime и display с фактическим размером canvas.

Встроенный surface-display отключён. Package не наполняет `UIDisplay`
предметной сценой и не создаёт второй visual runtime: содержимое подключают
последующие функциональные modules.

## Жизненный цикл

`@hamiltonian/release:main` импортирует package по его каноническому имени после
browser startup. Создание runtime завершается до публикации готового
environment export. При смене версии package заменяется как отдельный artifact
в составе общего release и начинает новую Window incarnation вместе с
перезагрузкой управляемой страницы.

HTML, canvas и font resources принадлежат общей статической оболочке
Hamiltonian. Package использует их, но не становится их transport owner.

## Среды и границы

| Среда | Состояние |
| --- | --- |
| `main` | Реализована стандартная Window-среда |
| `server` | Реализован только точный environment marker; server visual runtime отсутствует |

Package не импортирует рабочий прототип, его причинный monitor,
[`@hamiltonian/visual`](../../visual/README.md), Bulk или предметные node-system
surfaces. Он также не владеет loader, release composition, обновлением кода или
Hamiltonian signaling.

Точные exports, зависимости и build entrypoints находятся в
[`package.json`](package.json) и public source. Запуск и проверка clean-room
среды описаны в
[руководстве разработки](../../../.agents/skills/metafor-dev/references/development.md).
