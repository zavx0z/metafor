# Разработка Hamiltonian

Hamiltonian работает постоянно на `http://127.0.0.1:4444/`. Для обновления
клиентской сборки server не останавливать и не перезапускать.

Skill запускает development contour через `bun run dev`. Этот режим
минифицирует browser artifacts, сохраняет `console.debug` и добавляет inline
source map. Временные diagnostics писать через `console.debug`; не помещать в
его аргументы обязательную рабочую логику. Первым аргументом передавать
постоянный scope владельца в квадратных скобках, вторым — короткое событие,
третьим — структурированные данные, например:

```ts
console.debug("[@release/service:update]", "новая сборка загружена", {
  cache,
  source,
  status,
})
```

`bun run build` собирает production artifacts: они также минифицированы, но
`console.debug` вместе с аргументами удалён, а source map отсутствует.

## Пакеты

* `@internal/*` — внутренняя функциональность Hamiltonian. Один package может
  содержать и server-, и browser-entrypoints; новую функциональность размещать
  в принадлежащем ей internal package.
* `@release/main` и `@release/service` — запускаемые Window- и Service
  Worker-входы release. Они определяют состав используемых `@internal/*`
  packages и меняются вместе с этим составом. RPC Service Worker является
  внутренней частью `@release/service`, а не отдельным browser package.
  `@internal/visual` при этом остаётся самостоятельным artifact с cache owner
  `internal`; source и готовая сборка `@release/main` импортируют его как
  `@internal/visual`, а import map разрешает specifier в `/@internal/visual`.
* `@release/server` — server-владелец чтения package manifests, сборки,
  версий, атомарной публикации release, namespace routes browser artifacts,
  control endpoint `/code` и server-реализации RPC.
  Browser-код из него не загружается.
* `@startup/main` и `@startup/service` — фиксированный startup. В обычной
  разработке не менять и через endpoint обновления не передавать.

Имя модуля брать только из поля `name` его `package.json`.
Сменяемый artifact также объявляет точную `version` и `artifact.cache`.
Последние доказанные версии перечислены в dependencies корневого Hamiltonian
package как `workspace:^<version>`.
Изменение source, состава или bytes package требует новой версии и нового
immutable artifact; прежний versioned artifact не заменять другими bytes.
Window composition packages собираются с внешними package dependencies и
сохраняют bare imports; transport URL, conditional browser adapter или имя
отдельной зависимости в source build adapter не добавлять.

## Получить пакет release

```http
GET /<package-name>
```

Endpoint возвращает собираемый клиентский artifact выбранного package. Он не
определяет весь состав package и не заменяет его server-entrypoints. Если
готового artifact ещё нет, он собирается автоматически.

Exact version использует тот же pathname:

```http
GET /<package-name>?version=<semver>
```

Service Worker сохраняет стабильный package URL в cache владельца namespace:
`@release/*` — `release`, `@internal/*` — `internal`, `@metafor/*` — `metafor`.
Имя отдельного package в правила кэширования не добавлять.
После обновления не должно оставаться Cache Storage вида
`<owner>:release:<transaction>`: они существуют только во время подготовки.
Active package хранится по точному versioned endpoint в каноническом cache
владельца.

Пример:

```text
GET http://127.0.0.1:4444/@release/service
GET http://127.0.0.1:4444/@internal/visual?version=0.1.2
```

Текущее доказанное состояние всех сменяемых packages возвращает отдельный
control endpoint без параметров:

```http
GET /code
```

## Опубликовать release

```http
POST /code
Content-Type: application/json

{"packages": [{"name": "<package-name>", "change": "patch"}]}
```

Для нескольких зависимых packages передать все имена в одном массиве:

```http
POST /code
Content-Type: application/json

{
  "packages": [
    {"name": "@release/main", "change": "patch"},
    {"name": "@release/service", "change": "minor"}
  ]
}
```

`change` принимает только `patch`, `minor` или `major`. Готовый номер версии не
передавать: host вычисляет его от последней доказанной версии. Передавать одной
группой все изменённые взаимозависимые `@release/*` и `@internal/*` packages.
Query parameters для `POST` не использовать. После успешного ответа browser
транзакционно обновит всю группу и перезагрузится сам.

Ответ имеет форму:

```text
{
  success: true,
  results: [{module, change, previousVersion, version, success, exitCode, stdout, stderr, outputs}],
  packages: [{name, version, endpoint, cache}]
}
```

* `200` и `success: true` — обновление принято;
* `400` — JSON или форма body неверны;
* `422` — хотя бы одна сборка не прошла; версии и доступные artifacts не
  изменились, использовать `stdout` и `stderr` из `results`;
* `404` — имя неизвестно или не разрешено для обновления;
* `415` — не указан `Content-Type: application/json`.

После `200` проверить, что страница снова загрузилась и работает с ожидаемым
изменением. Если Worker спал или пропустил RPC, он сверится через `GET /code`
после подключения и применит то же обновление. Hamiltonian не перезапускать и
страницу вручную не перезагружать.
