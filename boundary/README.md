# Boundary runtime

Канонические понятия MetaFor определяются в
[`zavx0z/concept`](https://github.com/zavx0z/concept). Этот файл описывает
только текущую Boundary implementation.

Доменный контракт Boundary находится в [`DOMAIN.md`](./DOMAIN.md), а ещё не
реализованные решения и проверки — в [`TODO.md`](./TODO.md).

В контракте отдельно описаны два масштаба изменения: обновление текущего WIMP с
перестройкой всех его Atom и приватный WIMP-клон с новым `src` для одного Atom.
Совместимый fan-out текущего WIMP реализован; live-reparent и приватный clone
остаются в TODO.

## Entry и storage

`boundary/server.ts`:

1. выбирает database path;
2. создаёт parent directory;
3. открывает SQLite через `boundary/sqlite.ts`;
4. поднимает REST adapter постоянного Boundary `MonadChannel`;
5. подключает к нему transport-neutral RPC peer с методом первоначального чтения;
6. подключает Particle transport `Force("boundary")`;
7. применяет входные messages через `boundary.materialize(message)`;
8. отправляет возвращённые messages после commit;
9. при shutdown закрывает Monad-канал, затем закрывает server
   и database через Force shutdown hook.

Приоритет пути:

1. первый позиционный аргумент;
2. `BOUNDARY_PATH`;
3. `.metafor/dev.sqlite` в корне репозитория.

Health response содержит фактически открытый absolute database path и состояние
регистрации `rpc`.

## Development и tests

Development server использует persistent file. Tests открывают собственные
`:memory:` databases и закрывают их в `afterEach`; они не читают и не
изменяют `.metafor/dev.sqlite`.

Явный запуск Boundary с отдельным файлом:

```bash
BOUNDARY_PATH=/absolute/path/boundary.sqlite bun run --filter boundary start
```

## Реализованные handlers

- `inflaton` от Dark по одной сущности изменяет нормализованные таблицы;
- обычные канонические consequences после commit продолжают идти как Particle;
- `boundary.initialState.read` через Force RPC возвращает нормализованные
  канонические строки для первоначального рождения Matrix;
- `boundary.initialProjection.read` через тот же RPC возвращает полный текущий
  канонический projection без `ts` и `by` для рождения постоянного Bulk Store;
- Boundary не собирает Matrix Store/Weak и не отправляет стартовый snapshot как
  `graviton/replace`;
- остальные messages проходят через `materialize()`.

Meta-файл в Boundary не попадает. Здесь нет внутренней сущности Meta, JSON-копии
декларации и slash-пути, кодирующего её дерево. WIMP хранится по своему `src`, а
его Fields, States, Processes, Matter и остальные декларационные сущности — в
отдельных реляционных таблицах по детерминированным локальным индексам.

## Field binding

Прямой ordinary scalar binding из Matter хранится не как вычисленное стартовое
значение. Parent и child `atom_value` ссылаются на один `value`, а таблица
`atom_field_source` сохраняет направленное отношение
`child Atom/Field → parent Atom/Field`. Запись любого участника обновляет общий
value record на месте и после commit выпускает atom-addressed Gluon для каждого
владельца с одним `ts`. Поэтому siblings, связанные с тем же parent Field,
видят ту же запись в том же параллельном time step.

`boundary.initialState.read` возвращает `valueId` вместе со значением. Matrix
строит prepared entanglement только по этой canonical identity и не связывает
случайно равные значения. Связь переживает закрытие и повторное открытие SQLite
без нового Graviton. Computed Field expression получает отдельный value; `enum`
и `array` остаются topology Fields и shared scalar value не образуют.

In-place замена `fieldsBinding` materialized Matter edge перестраивает
`atom_field_source` и `atom_value` в одной Boundary transaction. Следующий Atom
Graviton содержит новые value identities; Matrix обновляет локальную canonical
projection и заново готовит packed shared layout и Weak backend до следующего
такта.

## Matter replace

`inflaton/replace matter` обновляет существующий `matter_particle` на месте.
Его database `id` не меняется, поэтому ссылки неизменённых дочерних Matter не
разрываются и SQLite cascade не удаляет ветку. Меняется только строка самого
Matter, его subtype и bindings.

Пример: замена `Browser.energyBinding` оставляет прежними `Browser`,
`Screenshot`, `Control` и их связи. Каскадное удаление разрешено только для
явного `inflaton/remove`.

Matter Graviton является WIMP-wide rebuild marker для Matrix и Energy. Matrix
перестраивает все Atom этого WIMP с прежними Atom IDs и новой Process identity.
Energy немедленно отсоединяет старое execution, обновляет bindings и только
после этого отправляет старому action cooperative abort.

## Низкоуровневый API

```ts
import {open} from "boundary/sqlite"

const boundary = await open(filename)
try {
  await boundary.materialize(message)
} finally {
  await boundary.close()
}
```

Production domains не открывают эту database напрямую; test imports
используются для fixtures и assertions.
