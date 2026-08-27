# `@internal/visual`

`@internal/visual` (далее — visual) — сменяемый internal-пакет, который
предоставляет готовую визуальную среду Cosmos.

Visual объявляет свои платформенные части по
[закону внутренних пакетов](../README.md#внутренний-пакет-и-его-возможность), а
его точная версия входит в
[полный состав release](../../release/README.md#что-называется-выпуском).

<a id="визуальная-среда-main"></a>

## Как появляется визуальная среда

Когда release запускает browser-часть visual:

1. visual получает предоставленную приложением область отображения;
1. visual получает общий default font по URL, который один раз объявляет HTML
   composition root;
1. создаёт semantic documents основной поверхности и навигации через
   `@zavx0z/dom` (далее — DOM);
1. `@zavx0z/renderer-browser` (далее — browser renderer) создаёт один Canvas,
   Engine renderer, Space и ViewPoint для всех visual documents;
1. помещает основную поверхность в world-space plane, а навигацию — в
   camera-locked overlay того же кадра;
1. согласует display с доступной областью Window;
1. сообщает о готовности визуального environment.

Наблюдаемый результат — пользователь получает готовую поверхность Cosmos, в
которой может появляться принадлежащее другим владельцам содержимое.

Стандартные DOM identity, tree mutation, attributes, `title` и события
принадлежат [semantic DOM](https://github.com/zavx0z/renderer/blob/main/ARCHITECTURE.md#semantic-dom),
а CSS/layout/hit projection и WebGPU realization — соответствующим владельцам
[document rendering pipeline](https://github.com/zavx0z/renderer/blob/main/ARCHITECTURE.md).
Visual выбирает только Cosmos-композицию, положение поверхностей и переход
между пространственным и приближённым обзором. Он не создаёт второй semantic
tree, ручную геометрию controls или параллельный animation loop.

## Граница ответственности

Visual владеет созданием визуальной среды и её отображением. Смысл
наблюдаемых сущностей, причинные переходы и canonical состояние принадлежат
соответствующим Quantum-доменам и загруженным metafor-пакетам.

Binary default font принадлежит Engine. Visual не хранит его копию и не
передаёт font path отдельным surfaces или UI packages; release server только
публикует выбранный composition URL и сохраняет его в runtime offline cache.

Точные side effects, public exports и ошибки запуска принадлежат внутрикодовой
TSDoc visual entrypoints.
