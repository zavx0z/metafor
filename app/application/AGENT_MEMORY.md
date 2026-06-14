# Память Application

## Текущая граница доменов

Главная архитектурная фиксация: `Dark` и `Boundary` могут работать совместно.
`Dark` имеет доступ к `Boundary`, потому что именно через него материализуется
каноническая boundary-база.

`Energy` и `Bulk` не имеют доступа к `Boundary` как к БД/ORM. Они являются
рантайм-слоями: получают данные в реальном времени через Force/WebSocket,
ведут свою рантайм-форму и не перечитывают SQLite.

Следствие: particle, который уходит в `Energy` или `Bulk`, должен нести
достаточно рантайм-данных сам по себе. Нельзя слать туда только `uuid` с
ожиданием, что рантайм полезет в `Boundary` за полной строкой.

## WebSocket Boundary

WebSocket остаётся транспортом Force-сообщений. Это не синхронизация базы.

Для `Dark`/`Boundary` допустим путь:

```text
Dark -> Boundary ORM/SQLite -> Boundary entropy -> WebSocket
WebSocket -> Boundary absorb
```

Для `Energy`/`Bulk` путь другой:

```text
WebSocket -> рантайм force.absorb -> состояние рантайма
рантайм force.entropy -> WebSocket
```

Там нет `Boundary_PATH`, `Boundary.open()`, очистки SQLite-sidecar или обратной
записи в БД.

## Force-Частицы

Правила:

- Не вводить второй стандарт вида `/actor/...` только для БД.
- Все сообщения остаются доменными частицами.
- `graviton`, `photon`, `gluon`, `higgs`, `w`, `-z`, `+z` — это `part`, а не путь и не уровень БД.
- `topology` как внешний path не использовать; разворачивать в `fuzzy` / `axion` / `macho`.
- Для рантайм-получателей (`Energy`, `Bulk`) не использовать чтение БД как часть протокола.

Стартовый `zavx0z/git` пока остаётся хардкодом в `dark.server.ts`: Dark
материализует его в `Boundary` и после этого отдаёт Force-поток наружу.
