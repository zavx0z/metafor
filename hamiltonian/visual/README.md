# `@hamiltonian/visual`

`@hamiltonian/visual` проецирует причинные observations Hamiltonian в
универсальную node system и владеет её Hamiltonian-specific presentation.
Источник observations и доказанная среда описаны в
[документе прототипа](../docs/PROTOTYPE.md#причинный-монитор).

## Закон visual-проекции

Когда lifecycle owner публикует current declaration или message observation:

1. Hamiltonian visual registry проверяет contour identity, incarnation,
   revision, owner chains и transport endpoints;
1. projection строит current node-system document;
1. `@nodes/layout` вычисляет geometry для exact document и viewport;
1. `@nodes/ui` материализует cards, ports, edges и transform;
1. Hamiltonian presentation применяет selection, transport colors и transient
   traffic;
1. наблюдатель получает сцену, совпадающую с current declarations и causal
   frontier.

## Распределение ответственности

| Владелец | Ответственность |
| --- | --- |
| Lifecycle sources прототипа | Наблюдение runtime и публикация declarations/messages |
| `@hamiltonian/visual` | Registry semantics, Hamiltonian projection, colors, selection и traffic presentation |
| [`nodes`](../../pkg/nodes/README.md) | Универсальная node-system model и geometry boundary |
| [`@nodes/layout`](../../pkg/nodes/layout/requirements/COMMON.md) | Pure layout geometry |
| [`@nodes/ui`](../../pkg/nodes/ui/REQUIREMENTS.md) | Cards, ports, canvas transform и renderer surface |
| `@nodes/hud` | Необязательная HUD-интеграция generic node system |
| Bulk | Производная visual-проекция конкретного наблюдателя Вселенной |

## Декларации контуров

Каждый независимо авторитетный наблюдаемый contour публикует одну current
declaration: logical contour identity, incarnation, exact root, монотонную
revision/frontier и ownership-closed набор entities и transport.

При declaration новой incarnation registry атомарно заменяет predecessor этого
logical contour. Другие current contours продолжают существовать независимо.
Для той же incarnation registry принимает только большую revision и
неотступающий causal frontier. Stale incarnation, равная revision и
немонотонный frontier получают отказ до materialization.

Каждая некорневая entity ссылается на exact owner, а owner chain завершается в
root declaration. Retained transport содержит current owner и оба exact
endpoints. Cross-contour transport приходит отдельной boundary-записью между
current incarnations.

Current declaration авторитетно задаёт structural membership до следующей
принятой declaration того же contour. Live observation обновляет факты уже
объявленного subject. Structural add/remove проходит через следующую
declaration и одной replacement-operation обновляет зависимые transport.

При отсутствующем root/owner, ownership cycle или stale endpoint registry
отклоняет declaration и сохраняет последний валидный current document.

## Материализация и presentation

Retained document содержит текущую структуру. Terminal transport остаётся
видимым со своим состоянием, пока живы endpoints. Завершение owner удаляет его
ownership-поддерево и принадлежащие transport. Presentation-only container
группирует доказанные nodes и сохраняет runtime owners/endpoints исходного
document.

Structural change или новый viewport создаёт новый layout request. Telemetry
change при прежнем geometry key обновляет presentation поверх готовой geometry.
Layouter принимает результат только для совпавших document и viewport.

Каждое наблюдённое сообщение создаёт одну transient particle на current active
edge в фактическом направлении. До первого готового route presentation хранит
последнее ещё актуальное observation edge. Пока частицы живы, renderer
запрашивает animation frames; после их завершения сцена возвращается к
render-on-demand.

Hamiltonian palette назначает цвет transport family. Direction задаёт стороны
socket, а lifecycle state — отдельный visual признак. `@nodes/ui` получает
opaque connection type и применяет generic fallback для новых families.

## Текущее состояние package

Public subpaths package сейчас предоставляют browser layout-worker adapter,
HUD composition и presentation helpers. Root source рабочего прототипа
предоставляет lifecycle ingress, основной adapter и orchestration.

Следующий package-boundary result переносит оставшиеся Hamiltonian-specific
visual adapters под package owner, сохраняя lifecycle observation и control у
владельцев рабочего прототипа. Точные exports задают
[`package.json`](package.json) и public source.

Запуск, visual acceptance и diagnostics описывает
[руководство разработки](../../.agents/skills/metafor-dev/references/development.md).
