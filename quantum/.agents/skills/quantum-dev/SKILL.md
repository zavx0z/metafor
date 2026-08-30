---
name: quantum-dev
description: Develop, organize, document, test, and experiment with semantic entities represented by independent projections in multiple Quantum domains. Use when work spans Dark, Boundary, Matrix, Energy, or Bulk, such as Graph, while runtime ownership must remain domain-local.
---

# Quantum development

Quantum состоит из слабосвязанных доменных проекций. Перед изменением открыть
[карту документов MetaFor](../../../../docs/README.md), затем прочитать
документы-владельцы, public types, код и проверки каждого затронутого домена.

Для public TSDoc и существующих owner documents соблюдать общие
[правила документации MetaFor](../../../../.agents/skills/metafor-dev/references/documentation.md).
Для live product contour или browser-проверки Hamiltonian дополнительно
использовать `$metafor-dev`. MetaFor устанавливает только external declarations:
Graph laboratory принадлежит `@metafor/types`, а Bulk HUD — package `bulk`.
Один global Storybook server владеет lifecycle, origin, Workbench, package
revisions и browser evidence; этот skill не содержит его process scripts или
ports.

Package boundaries проверяются через внешний tool без package-local build:

```text
$storybook check /path/to/metafor
$storybook open @metafor/types graph/node-tree/projection/live
$storybook open bulk bulk/hud/default
```

Проверка создаёт только tool-owned immutable revisions и не является
разрешением на Pages, deployment или workflow.

## Сквозная сущность

Если одна смысловая сущность `<entity>` имеет независимое представление в
нескольких Quantum-доменах, использовать структуру:

```text
quantum/<domain>/<entity>/     domain-owned implementation
quantum/tests/<entity>/        cross-domain verification
<owner>/.storybook/            owner declaration and dev-only projection
```

Создавать доменную директорию только там, где домен действительно представляет
или разрешает сущность. Не добавлять пустую директорию-заглушку.

Не создавать центральный runtime package, Store, facade, barrel или process
только ради коротких импортов. Общие public types и protocols остаются у
нейтральных владельцев и документируют неочевидные законы через TSDoc.

## Доменная проекция

Каждая `quantum/<domain>/<entity>/` принадлежит своему домену:

- содержит только доменную projection, transformation, adapter и локальные
  helpers сущности;
- не читает Store и private implementation соседнего домена;
- взаимодействует через принятые Force, RPC и public contracts;
- не импортирует `quantum/tests` или owner `.storybook` directories;
- не экспортируется из domain package без настоящего public entrypoint.

Группировать файлы по смысловой ответственности, а не по случайному совпадению
имени `Graph`. Renderer graph, dependency index и Oracle Graph не становятся
одной сквозной сущностью автоматически.

## Интеграция на уровне Quantum

`quantum/tests/<entity>` может явными относительными путями импортировать
реальные domain implementations и fixtures. Такие импорты принадлежат только
integration tests и не создают production dependencies.

Owner `.storybook` projection может импортировать public domain projections и
изолированные fixtures для сравнения, invalid-state experiments и исследования
формата. Она не реализует ещё одну копию сущности и не превращает candidate
format в контракт. Принятое поведение должно иметь test вне Storybook.

Предметы лаборатории разделяются по настоящему package owner:

```text
types/.storybook/             @metafor/types Graph projection
quantum/bulk/.storybook/      bulk HUD projection
.storybook/manifest.json      optional project composition
```

Declarations и catalogs являются versioned JSON data. Runtime adapters
реализуют plain structural `storybook-runtime/3`, импортируют только production
owners и не импортируют Storybook даже type-only. Shared external frontend
создаёт один Workbench и semantic Document в каждой package tab; owner runtime
атомарно передаёт `story-presentation/1` с presentation subtree, точным
`ComponentRoot`, source и выбранными values. Component CSS читается из этого
root, а global author resources объявляются package manifest specifiers.
Все обращённые к человеку строки пишутся по-русски; точные API names, JSON keys,
routes, import specifiers и код сохраняют исходное написание.

Не добавлять compatibility re-exports, import aliases или central facade вокруг
относительных integration imports.

## Public types и TSDoc

Public types и functions документируют ownership, identity, lifecycle,
serialization, ordering, side effects и fail-closed outcomes, когда эти законы
не видны из signature. Public contract module получает module-level
`@packageDocumentation`. Не создавать параллельный prose-document с копией тех
же законов.

## Проверка

1. Запустить локальные тесты каждой изменённой domain entity directory.
2. Запустить `bun test quantum/tests/<entity>`.
3. Для executable TypeScript запустить `bun run typecheck`.
4. Собрать или запросить browser entry Storybook, чтобы компилировался реальный
   browser graph; source-only unit test недостаточен.
5. Убедиться, что production entrypoints не достигают `quantum/tests` и owner
   `.storybook` directories.
6. Перечитать diff и выполнить `git diff --check`.
