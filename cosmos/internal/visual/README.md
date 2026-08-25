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
1. `UiRuntime` лениво получает общий default font по URL, который один раз
   объявляет HTML composition root; custom font полностью обходит этот request;
1. создаёт общее визуальное пространство Cosmos;
1. подготавливает основной display и навигацию;
1. согласует display с доступной областью Window;
1. сообщает о готовности визуального environment.

Наблюдаемый результат — пользователь получает готовую поверхность Cosmos, в
которой может появляться принадлежащее другим владельцам содержимое.

Когда visual размещает несколько UI либо display regions, authoritative child
slots и retained transform/clip chain принадлежат
[контракту `@layout/core` (далее — Layout)](https://github.com/zavx0z/layout/blob/main/packages/core/requirements.md#semantic-child-slots),
а их semantic composition —
[закону UI-композиции](https://github.com/zavx0z/ui/blob/main/ARCHITECTURE.md#ui-composition-law).
Layout остаётся единственным владельцем этой механики. visual является
consumer одного `UiRuntime` и consumer-owned retained parents;
function-based UI components не создают собственный runtime, parent или scene
graph.

## Граница ответственности

Visual владеет созданием визуальной среды и её отображением. Смысл
наблюдаемых сущностей, причинные переходы и canonical состояние принадлежат
соответствующим Quantum-доменам и загруженным metafor-пакетам.

Binary default font принадлежит Engine. Visual не хранит его копию и не
передаёт font path отдельным surfaces или UI packages; release server только
публикует выбранный composition URL и сохраняет его в runtime offline cache.

Точные side effects, public exports и ошибки запуска принадлежат внутрикодовой
TSDoc visual entrypoints.
