# **⚛️ Генератор Atom Meta-пакетов**

## Все правила

Канонический свод правил Create MetaFor находится в
[`rules/metafor.md`](rules/metafor.md). Он владеет законами авторинга
`meta.ts` и смысловым контрактом клиентских RPC-проекций; README остаётся
навигацией и не создаёт второй контракт.

## Быстрый старт

```bash
mkdir -p cluster/zavx0z

# Корневой Atom-репозиторий внутри Galaxy-владельца zavx0z
bun create metafor capsule --dir cluster/zavx0z

# Внутренний Atom Meta-пакет внутри репозитория capsule
bun create metafor profile --dir cluster/zavx0z/capsule
```

## Два контекста создания

`create-metafor` определяет роль создаваемого пакета по `--dir`:

- `cluster/<owner>` — Galaxy-владелец. Генератор создаёт новый корневой
  Atom-репозиторий `cluster/<owner>/<name>`, кладёт `meta.ts` непосредственно в
  его корень, выполняет `git init` и создаёт initial commit;
- `cluster/<owner>/<repository>` — существующий Git-репозиторий корневого Atom.
  Генератор создаёт внутренний Atom `repository/<name>` без вложенного Git,
  отдельного commit и `bun install`.

Дополнительных директорий `galaxy/`, `atom/` или `metas/` нет. Внутренние
Meta-пакеты являются непосредственными соседями в корне репозитория, даже если
порождаемые ими Atom находятся на разных уровнях Matter.

Сгенерированная Meta является source declaration, а не runtime snapshot. Dark
индексирует её parent-child связи и передаёт каждую добавленную, удалённую или
изменённую declaration entity отдельным `ForceMessage` с одной `Particle`.
Повторное чтение не пересылает неизменённые сущности и не выполняет reset.

## Опции

| Option              | Description                                     | Default             |
| ------------------- | ----------------------------------------------- | ------------------- |
| `-n, --name <name>` | Имя корневого или внутреннего Atom              | positional argument |
| `-d, --desc <desc>` | Описание Meta                                   | `"MetaFor {name}"`  |
| `--dir <dir>`       | Galaxy-владелец или корневой Atom-репозиторий   | `.`                 |
| `-l, --lang <lang>` | Язык вывода (`ru` или `en`)                     | автодетект          |

## Примеры

```bash
# Создать корневой Atom-репозиторий
bun create metafor capsule --dir cluster/zavx0z

# Создать внутренние Meta-пакеты Atom
bun create metafor profile --dir cluster/zavx0z/capsule
bun create metafor container -d "Контейнер рабочего стола" --dir cluster/zavx0z/capsule

# Принудительно использовать английский язык
bun create metafor session --dir cluster/zavx0z/capsule -l en
```

## Структура

```text
cluster/                          # Cluster; в WIMP src не входит
└── zavx0z/                       # Galaxy: GitHub-владелец
    └── capsule/                  # корневой Atom и Git-репозиторий
        ├── .git/
        ├── meta.ts               # корневой Meta-пакет
        ├── package.json          # @zavx0z/capsule; workspace root
        ├── src/metafor.d.ts
        ├── profile/              # внутренний Atom Meta-пакет
        │   ├── meta.ts
        │   ├── package.json      # @zavx0z/capsule-profile
        │   └── src/metafor.d.ts
        └── session/              # соседний внутренний Atom Meta-пакет
            └── meta.ts
```

Dark адресует Meta без физического префикса `cluster/`:

```text
zavx0z/capsule
zavx0z/capsule/profile
```

WIMP `src` и npm-имя — разные адресные пространства. npm принимает только
`@scope/package`, поэтому внутренний `src` `zavx0z/capsule/profile` получает
плоское npm-имя `@zavx0z/capsule-profile`; имя
`@zavx0z/capsule/profile` для отдельного npm-пакета невалидно.

## Требования

- физический корень `cluster/`;
- существующий каталог Galaxy-владельца для корневого Atom;
- существующий Git-репозиторий для внутреннего Atom;
- Git для создания корневого Atom-репозитория;
- Node.js >= 18 или Bun >= 1.0.0.

## Лицензия

MIT

---
