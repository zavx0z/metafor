# Hamiltonian

Hamiltonian — распределённый оркестратор воплощений MetaFor. Он доставляет
проверенный код, выбирает место исполнения, запускает, знакомит, обновляет и
заново воплощает части Вселенной. Bun process, Service Worker, Window и другие
platform runtimes исполняют части этого общего закона в своей среде.

Имя `Hamiltonian` является проектным термином для целого закона рождения и
изменения воплощений.

## Общий закон

Когда участник появляется, возвращается или должен сменить код:

1. Hamiltonian устанавливает identity участника, его среду и фактически
   установленный выпуск;
1. Hamiltonian определяет допустимое место исполнения и требуемый проверенный
   выпуск;
1. выбранная delivery-часть Hamiltonian передаёт код, startup проверяет
   release, а active release запускает подходящее воплощение;
1. control-часть Hamiltonian знакомит готовые воплощения для непосредственной
   рабочей связи;
1. наблюдаемый результат фиксирует одну допущенную incarnation с точными
   identity, версией кода и восстановленными обязательными связями.

Identity участника, incarnation текущего исполнения, версия кода и сетевой
адрес являются отдельными свойствами. Право продолжать работу подтверждается
совпадением identity, требуемого выпуска и причинной связью с предыдущим
состоянием.

Все управляемые среды следуют одной последовательности:

```text
тонкая точка входа → startup → release → internal / metafor
```

Точка входа передаёт управление устойчивому startup. Startup находит,
проверяет и запускает release. Release определяет согласованный состав
сменяемой среды. Browser и server реализуют этот закон собственными способами
хранения, загрузки и перезапуска.

Browser path уже выполняет эту последовательность. Для server требуемый
результат имеет вид `server.ts → startup/server → release/server →
internal/metafor`: `server.ts` запускает устойчивый startup, а вся среда после
startup получает новое воплощение как один согласованный выпуск. Текущее
server-состояние и переход описаны у
[`@hamiltonian/startup`](startup/README.md) и
[`@hamiltonian/release`](release/README.md).

## Сетевой закон

Release delivery передаёт code bytes через `fetch` от разрешённого источника,
а startup проверяет bytes до исполнения. Control WSS переносит identity,
signaling и команды управления. После знакомства готовые воплощения переходят
к непосредственной рабочей связи; её transport и смысл задаёт contract
загруженной функции из [карты MetaFor](../docs/README.md#карта-документов).

В первой целевой реализации Bun-воплощение публикует один фиксированный внешний
listener для HTTP(S) startup/code delivery и WSS signaling/control. Доменные
воплощения открывают исходящие и временные peer transports по своим contracts.

Долговечная Hamiltonian identity, authority выпуска, подписи, discovery и
размещение нескольких identities образуют отдельный сетевой contract. Его
принимаемый результат должен назначить владельца решения и способ проверить
его независимо от конкретного listener или источника bytes.

## Распределение ответственности

| Владелец | Ответственность |
| --- | --- |
| Hamiltonian | Delivery, placement, знакомство, startup, update и повторное воплощение |
| [`@hamiltonian/startup`](startup/README.md) | Bootstrap, проверка release artifact, current runtime и handover |
| [`@hamiltonian/release`](release/README.md) | Composition, cache/update policy, control RPC и lifecycle сменяемого состава |
| [`@internal/*`](internal/README.md) | Сменяемые служебные функции Hamiltonian после release startup |
| `@metafor/*` | Загружаемые функции самой MetaFor |
| [Документы MetaFor](../docs/README.md#карта-документов) | Предметные contracts и критерии готовности загружаемых функций |

Hamiltonian использует принятый contract при placement и проверке готовности;
предметный закон сохраняется у владельца загруженной функции.

## Карта документации

Документы конкретных packages:

| Владелец | Что описывает |
| --- | --- |
| [`@internal/visual`](internal/visual/README.md) | Visual function Hamiltonian и её текущие `main`/`server` среды |
| [`@hamiltonian/visual`](visual/README.md) | Проекция и presentation причинного node-system монитора прототипа |

Документация работы с Hamiltonian:

| Владелец | Что описывает |
| --- | --- |
| [Разработка Hamiltonian](../.agents/skills/metafor-dev/references/development.md) | Запуск, публикация release, проверки и точные operational действия |

Public types и код задают точные API перечисленных packages.

## Декларация нодовой системы каждого контура

Закон current declarations и причинного монитора принадлежит
[`@hamiltonian/visual`](visual/README.md#декларации-контуров).

## Стандартная Window-среда clean-room loader

Жизненный цикл стандартной среды принадлежит
[`@internal/visual`](internal/visual/README.md). Разделение устойчивого startup и
сменяемого состава описывают [`@hamiltonian/startup`](startup/README.md) и
[`@hamiltonian/release`](release/README.md).

## Текущее состояние

Clean-room browser path реализует устойчивые `startup` entrypoints, сменяемый
`release` и отдельный `@internal/visual`. Browser release подготавливается,
проверяется и заменяется после startup как согласованный состав.

Server env сейчас публикует и доставляет browser releases. Следующий server
результат добавляет `startup/server` и новое воплощение всей рабочей среды после
него. Production domain owners продолжают действовать в своих текущих
contours; их подключение к clean-room Hamiltonian требует отдельного domain
acceptance по [канонической документации](../docs/README.md#карта-документов).
