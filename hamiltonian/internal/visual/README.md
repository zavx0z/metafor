# `@internal/visual`

`@internal/visual` — package визуальной функции Hamiltonian внутри общего
namespace [`@internal/*`](../../docs/INTERNAL.md). Одно функциональное имя
объединяет все поддерживаемые env-воплощения package.

## Закон visual function

Когда release запускает `@internal/visual` в выбранной среде:

1. release composition выбирает package-wide version и env artifact;
1. release delivery проверяет artifact, а active release импортирует выбранный
   env entrypoint;
1. entrypoint создаёт либо объявляет env-specific public result;
1. incarnation публикует package identity, env, version и готовность result.

[`@hamiltonian/release`](../../release/README.md) заменяет visual как отдельную
versioned единицу общего выпуска.

## Поддерживаемые среды

| Env | Текущий результат |
| --- | --- |
| `main` | Готовая стандартная визуальная среда Window и export `runtime` |
| `server` | Подтверждённый env selection и export `environment: "server"` |

Следующий env добавляется под тем же package name, когда для него принят
предметный visual result и критерий готовности. Изменение выпускает новую
package-wide version и полный набор объявленных env artifacts по
[общему internal law](../../docs/INTERNAL.md#identity-и-версия-package).

## Visual в env `main`

При запуске `main` package:

1. получает принадлежащий странице canvas и создаёт один `UiRuntime`;
1. создаёт общие `Space`, `ViewPoint`, `HUD`, пол и один именованный
   `UIDisplay`;
1. устанавливает обзорную camera state, orbit/pan/zoom и display navigation;
1. синхронизирует runtime и display с текущим размером canvas;
1. экспортирует готовый runtime для последующих функциональных packages.

Стандартный `UIDisplay` начинает пустым. Последующие packages наполняют его
предметной сценой и используют тот же visual runtime.

## Распределение ответственности

| Владелец | Ответственность |
| --- | --- |
| `@internal/visual` | Visual function и env-specific public result |
| Static shell Hamiltonian | HTML, canvas и font resources |
| `@hamiltonian/release` | Version selection, delivery и замена package |
| Последующие functional packages | Предметное содержимое `UIDisplay` |
| [`@hamiltonian/visual`](../../visual/README.md) | Причинная node-system presentation рабочего прототипа |
| Bulk | Производная visual-проекция конкретного наблюдателя Вселенной |

## Текущее состояние env `server`

`server` entrypoint сейчас подтверждает выбранный env через точный environment
marker. Если server-среде потребуется visual runtime, следующий принимаемый
результат сначала определит его предметную функцию, lifecycle и readiness, а
затем расширит этот же package.

Точные exports, зависимости и build entrypoints задают
[`package.json`](package.json), public source и
[руководство разработки](../../../.agents/skills/metafor-dev/references/development.md).
