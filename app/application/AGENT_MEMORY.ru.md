# Память Application

## Стандарт синхронизации Store через WebSocket

Главная цель: один доменный формат particles, без отдельного DB-patch формата и без `inbound`-флагов.

Стор должен различать не формат сообщения, а направление:

- `observe(listener)` — внутреннее наблюдение всех событий для доменов.
- `entropy(listener)` — только локально рожденные изменения, которые нужно отправлять наружу.
- `emit(message)` — локально родить событие: идет в `observe` и `entropy`.
- `absorb(message)` — принять событие извне: обновить локальную БД/контекст и отправить только в `observe`, не в `entropy`.

WebSocket-мост должен быть простым:

```ts
store.entropy((event) => send(event.data))
socket.message = (_socket, data) => store.absorb(JSON.parse(String(data)))
```

Правила:

- Входящие patches не должны отправляться обратно на peer.
- Исходящие patches должны рождаться только из локальных изменений.
- Не вводить второй стандарт вида `/actor/...` только для БД.
- Все patches остаются доменными particles.
- `graviton`, `photon`, `gluon`, `higgs`, `w`, `-z`, `+z` — это `part`, а не путь и не уровень БД.
- Для записи удаленной БД particle должен нести достаточно данных, а не только UUID.
- `topology` как внешний path не использовать; сейчас разворачивать в `fuzzy` / `axion` / `macho`.

Текущий payload, который `absorb()` может применить к SQLite без запросов к peer:

- `part: "graviton", path: "wimp"` — `value` содержит meta snapshot: `wimp`, `fields`, `enumVariants`, `states`.
- `part: "graviton", path: "actor"` — `value` содержит полный actor snapshot: `actor`, `values`, `valueRecords`, `valueItems`, `state`.
- `part: "graviton", path: "fuzzy" | "axion" | "macho"` — `value` содержит topology snapshot: `uuid`, `parentActor`, `parentTopology`, `position`.
- Остальные `part` пока проходят через `observe()` как доменные сигналы, но не интерпретируются через DB-path.
