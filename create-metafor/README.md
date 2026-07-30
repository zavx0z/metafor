# **⚛️ Генератор Atom Meta-пакетов**

## Все правила

Канонический свод правил Create MetaFor находится в
[`rules/metafor.md`](rules/metafor.md). Он владеет законами авторинга
`meta.ts` и смысловым контрактом клиентских RPC-проекций; README остаётся
навигацией и не создаёт второй контракт.

## Быстрый старт

```bash
mkdir -p cluster/zavx0z

# Независимые peer Meta-репозитории внутри Galaxy-владельца zavx0z
bun create metafor capsule --dir cluster/zavx0z
bun create metafor capsule-profile --dir cluster/zavx0z
```

## Контракт создания

`create-metafor` создаёт каждую Meta как независимый peer Git-репозиторий:

- `--dir <parent>/<owner>` задаёт существующий родительский каталог, basename
  которого является owner (`cluster/<owner>` в canonical Cluster);
- `<name>` задаёт новый уникальный repository;
- target всегда равен `<parent>/<owner>/<repository>`;
- canonical `src` всегда равен `<owner>/<repository>`;
- каждый target получает полный актуальный template, `bun install` с lockfile,
  собственный Git и единственный `Initial commit`.

Root/internal branching, третий address segment и создание Meta внутри
существующего Meta-репозитория запрещены. Составные роли используют уникальные
hyphenated repository names. Композиция выполняется через Meta/Matter/Monad
references, а не вложенностью каталогов.

Сгенерированная Meta является source declaration, а не runtime snapshot. Dark
индексирует её parent-child связи и передаёт каждую добавленную, удалённую или
изменённую declaration entity отдельным `ForceMessage` с одной `Particle`.
Повторное чтение не пересылает неизменённые сущности и не выполняет reset.

## Опции

| Option              | Description                         | Default             |
| ------------------- | ----------------------------------- | ------------------- |
| `-n, --name <name>` | Имя peer Meta-репозитория           | positional argument |
| `-d, --desc <desc>` | Описание Meta                       | `"MetaFor {name}"`  |
| `--dir <dir>`       | Родительский каталог с basename owner | `.`                 |
| `-l, --lang <lang>` | Язык вывода (`ru` или `en`)         | автодетект          |

## Примеры

```bash
# Создать независимые peer Meta-репозитории
bun create metafor capsule --dir cluster/zavx0z
bun create metafor capsule-profile --dir cluster/zavx0z
bun create metafor capsule-container -d "Контейнер рабочего стола" --dir cluster/zavx0z

# Принудительно использовать английский язык
bun create metafor capsule-session --dir cluster/zavx0z -l en
```

## Структура

```text
cluster/                              # Cluster; в WIMP src не входит
└── zavx0z/                           # Galaxy: GitHub-владелец
    ├── capsule/                      # peer Meta-репозиторий
    │   ├── .git/
    │   ├── meta.ts                   # src: zavx0z/capsule
    │   ├── package.json              # @zavx0z/capsule
    │   └── src/metafor.d.ts
    └── capsule-profile/              # независимый peer Meta-репозиторий
        ├── .git/
        ├── meta.ts                   # src: zavx0z/capsule-profile
        ├── package.json              # @zavx0z/capsule-profile
        └── src/metafor.d.ts
```

Dark адресует Meta без физического префикса `cluster/`:

```text
zavx0z/capsule
zavx0z/capsule-profile
```

WIMP `src` и npm-имя — разные адресные пространства, но оба выводятся только из
owner и repository. Например, `zavx0z/capsule-profile` соответствует npm-имени
`@zavx0z/capsule-profile`.

## Требования

- существующий родительский каталог с валидным owner basename;
- уникальное имя нового peer repository;
- Bun для установки зависимостей и создания lockfile;
- Git для создания независимого Meta-репозитория;
- отсутствие Meta Git repository среди самого parent и его предков;
- Node.js >= 18 или Bun >= 1.0.0.

## Лицензия

MIT

---
