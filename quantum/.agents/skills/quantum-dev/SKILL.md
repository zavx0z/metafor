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
использовать `$metafor-dev`. Состав пакетов определяется корневым
`package.json#workspaces`; контракты и примеры размещаются у владельцев.

## Сквозная сущность

Если одна смысловая сущность `<entity>` имеет независимое представление в
нескольких Quantum-доменах, использовать структуру:

```text
quantum/<domain>/<entity>/     domain-owned implementation
quantum/tests/<entity>/        cross-domain verification
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
- не импортирует `quantum/tests`;
- не экспортируется из domain package без настоящего public entrypoint.

Группировать файлы по смысловой ответственности, а не по случайному совпадению
имени `Graph`. Renderer graph, dependency index и Oracle Graph не становятся
одной сквозной сущностью автоматически.

## Интеграция на уровне Quantum

`quantum/tests/<entity>` может явными относительными путями импортировать
реальные domain implementations и fixtures. Такие импорты принадлежат только
integration tests и не создают production dependencies.

Принятое поведение проверяется обычными тестами рядом с владельцем или в
`quantum/tests/<entity>`. Примеры опираются на публичные API владельцев.

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
4. Убедиться, что production entrypoints не достигают `quantum/tests`.
5. Перечитать diff и выполнить `git diff --check`.
