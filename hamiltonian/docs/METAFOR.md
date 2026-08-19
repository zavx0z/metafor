# `@metafor/*` в Hamiltonian

`@metafor/*` — будущий namespace загружаемых функций самой MetaFor. Hamiltonian
доставляет и запускает эти функции для Вселенной, сохраняя их предметные
contracts у соответствующих доменных владельцев.

## Целевой lifecycle

Когда функции MetaFor потребуется управляемое воплощение:

1. её предметный владелец определяет функцию, public contract и допустимые
   среды;
1. Hamiltonian выбирает placement и требуемый выпуск;
1. release composition включает принятый package и совместимые dependencies;
1. release delivery проверяет выбранный artifact, а active release запускает
   env incarnation;
1. package публикует identity, version и предметный результат, по которому
   владелец принимает готовность.

## Распределение ответственности

| Владелец | Ответственность |
| --- | --- |
| `@hamiltonian/*` | Startup, release composition, delivery и update mechanics |
| [`@internal/*`](INTERNAL.md) | Сменяемые служебные функции Hamiltonian |
| `@metafor/*` | Загружаемые функции самой MetaFor |
| Domain owner | Предметный смысл, public contract и критерий готовности функции |

## Текущее состояние

Clean-room release сейчас содержит ноль функциональных `@metafor/*`
участников. Первый принимаемый результат должен определить предметного
владельца, env, lifecycle, public contract и release membership конкретного
package. После принятия package закрепит эти свойства в собственном `README.md`.
Явная versioned composition создаёт membership; существующие workspace
libraries сохраняют свои текущие роли до такого решения.
