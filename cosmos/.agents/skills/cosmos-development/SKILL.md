---
name: cosmos-development
description: Design, implement, or document Cosmos startup, release, internal/metafor package loading, environments, artifacts, publication, and browser/Bun adapters. Use for Cosmos-specific architecture, public contracts, package README, TSDoc, build/release mechanics, and tests; use metafor-dev additionally for shared documentation rules and live runtime/browser work.
---

# Cosmos development

Перед любой Cosmos-работой соблюдать общие
[правила документации MetaFor](../../../../.agents/skills/metafor-dev/references/documentation.md).
Этот skill добавляет только предметные правила Cosmos и не копирует общий
documentation workflow или runtime dispatcher `$metafor-dev`.

## Единицы Cosmos

Не смешивать соседние понятия:

* package — версионируемая единица состава выпуска;
* platform part — entrypoint одной версии package для одного environment;
* environment — платформенный context исполнения;
* release — полный согласованный состав точных package versions и их parts;
* capability — результат, предоставляемый package, а не единица состава;
* incarnation — одно запущенное исполнение сущности;
* role — способ участия peer, а не package capability.

Первое scoped package name в документе объявляет короткий alias. Namespace
`@internal/*` и `@metafor/*` обозначает множество packages.

## Владельцы жизненного цикла

* `startup` остаётся минимальным устойчивым входом, запускает выбранный release,
  переводит на него новые события и завершает предшественника.
* `release` владеет составом, получением, проверкой, подготовкой, publication,
  восстановлением и запросом handover полного выпуска.
* Internal packages предоставляют сменяемые инфраструктурные capabilities.
* Metafor packages предоставляют загружаемую предметную функциональность; её
  смысл не переходит к Cosmos.

Root Cosmos document хранит только общий закон и карту этих владельцев. Каждый
package README описывает только собственный смысл и lifecycle и контекстно
ссылается на root law. Технические package mechanics принадлежат public TSDoc и
development reference.

## Environments и platform adapters

Использовать точные environments из public contract:

* `main` — Window;
* `worker` — browser Worker;
* `service` — Service Worker;
* `server` — Bun process;
* `server-worker` — Bun Worker.

`server` и `server-worker` не являются синонимами. `Bun.spawn` запускает Bun
process для env `server`; Bun Worker создаётся через `Worker` и относится к
`server-worker`.

Когда browser и Bun выполняют одну ответственность разными технологиями,
сначала определить общий public semantic interface. Общий lifecycle описывать
через него, а `Function()`, `Bun.spawn`, Cache Storage, filesystem и другие
platform mechanics размещать в adapters по их настоящей ответственности.

Не объединять разные policies только из-за соседних данных. Browser cache,
Bun immutable publication, transport, composition и cleanup могут иметь разные
interfaces и владельцев.

## Release и artifacts

Одна package version охватывает весь public artifact graph всех объявленных
platform parts. Единственный author-facing источник графа — стандартный
`package.json#exports`: корневые conditions задают platform parts, public
subpaths — lazy code и static artifacts, а shared chunks выводятся из одной
сборки. Не добавлять resource manifest, registry либо второй state protocol.

Обычные зависимости связывать в artifacts Cosmos package; отдельной частью
release dependency остаётся только как самостоятельный release package. Не
добавлять Cosmos declarations или adapters в UI, Engine и других owners ради
сборки consumer package.

При нескольких code entrypoints одного environment собирать их одной операцией
со splitting и загружать dynamic branches network-lazy. Сохранять graph
предшественника до завершения runtime handover. Root intent, фактический browser
current, установка/удаление delta, namespace caches и одна восстанавливаемая
transaction остаются тем же release lifecycle.

Package-local compiler plugins допустимы только как способ сборки конкретного
environment и не объявляют artifacts или plugin-specific options в Cosmos
config. Перед изменением build contract читать точную
[процедуру public artifact graph и plugins](../../../../.agents/skills/metafor-dev/references/development.md#package-artifact-build).

Documentation-only Cosmos diff
[определяется общей классификацией изменения MetaFor](../../../../.agents/skills/metafor-dev/references/documentation.md#проверка-изменения)
и не изменяет package version, artifacts или live contour. TSDoc-only map drift
не является release: существующая map принадлежит последней executable version.

Release composition и выбор physical placement — разные решения. Release
содержит все выбранные package parts, а runtime выбирает допустимые
incarnations по доступным environments, devices и placement constraints, не
изменяя состав выпуска.

Browser code доставляется через `fetch`; WebSocket используется для control и
signaling, а не как канал code bytes. Server startup исполняет exact filesystem
artifact в отдельном process; только release process владеет сетевым listener.

## Проверка

Перед изменением сверить root/package owner docs, conditional exports, public
types/TSDoc, build/publication code, tests и существенную Git-историю. Не
выдавать принятую целевую архитектуру за реализованный API: owner law описывает
принятый результат, а TSDoc — только существующий public code.

Для live Cosmos lifecycle, browser state, caches, exact artifacts и Inspector
использовать `$metafor-dev`; команды и process rules здесь не дублировать.
