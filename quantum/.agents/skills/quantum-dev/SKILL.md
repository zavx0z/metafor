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
использовать `$metafor-dev`. Lifecycle, automatic origin, static build и
browser evidence exact package `@quantum/storybook` принадлежат единому
глобальному `$storybook`; этот skill не содержит process scripts, ports или
generic Storybook rules.

Локальный static artifact собирается через единый skill и не меняет живой
process:

```text
$storybook build @quantum/storybook
```

Сборка принадлежит только локальной лаборатории и записывается в
`quantum/storybook/dist`. Она не создаёт Pages, deployment или workflow и не
является разрешением на их запуск.

## Сквозная сущность

Если одна смысловая сущность `<entity>` имеет независимое представление в
нескольких Quantum-доменах, использовать структуру:

```text
quantum/<domain>/<entity>/     domain-owned implementation
quantum/tests/<entity>/        cross-domain verification
quantum/storybook/<entity>/    dev-only laboratory
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
- не импортирует `quantum/tests` или `quantum/storybook`;
- не экспортируется из domain package без настоящего public entrypoint.

Группировать файлы по смысловой ответственности, а не по случайному совпадению
имени `Graph`. Renderer graph, dependency index и Oracle Graph не становятся
одной сквозной сущностью автоматически.

## Интеграция на уровне Quantum

`quantum/tests/<entity>` может явными относительными путями импортировать
реальные domain implementations и fixtures. Такие импорты принадлежат только
integration tests и не создают production dependencies.

`quantum/storybook/<entity>` может теми же относительными путями импортировать
проекции и изолированные fixtures для сравнения, invalid-state experiments и
исследования формата. Он не реализует ещё одну копию сущности и не превращает
candidate-формат в контракт. Принятое поведение должно иметь тест вне
Storybook.

Предмет лаборатории разделяется явно:

```text
quantum/storybook/
├── package.json         exact `@quantum/storybook` identity
├── app.ts               один typed Quantum Storybook application
├── server.ts            automatic-port package server
├── build.ts             local-only static delivery
└── <entity>/
    ├── page.ts          consumer-owned page descriptor
    ├── entry.ts         composition готового Workbench
    ├── stories.ts       единый typed catalog
    ├── preview.ts       consumer-owned preview Surface
    ├── fixtures/        воспроизводимые входы экспериментов
    ├── state/           только UI-состояние лаборатории
    └── stories/         lazy source/controls/render modules
```

Для typed app, server, static build, routes, stories и workbench напрямую
использовать точные public subpaths `@zavx0z/storybook/*`. Не импортировать
корневой package, не создавать facade и не копировать общую инфраструктуру в
Quantum. Все обращённые к человеку строки Storybook пишутся по-русски; точные
API names, JSON keys, routes, import specifiers и код сохраняют исходное
написание.

Consumer использует `defineStorybookStories`, `planStorybookShell`, готовые
navigation/dock/info surfaces и pathname router. Не создавать параллельные
HTML/CSS navigation, собственный story contract или второй lab workbench.

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
5. Убедиться, что production entrypoints не достигают `quantum/tests` и
   `quantum/storybook`.
6. Перечитать diff и выполнить `git diff --check`.
