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
console.debug("[@import/service:update]", "новая сборка загружена", {
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
* `@import/main` и `@import/service` — состав загружаемых модулей. Менять только
  при изменении этого состава.
* `@startup/main` и `@startup/service` — фиксированный startup. В обычной
  разработке не менять и через endpoint обновления не передавать.

Имя модуля брать только из поля `name` его `package.json`.
Сменяемый artifact также объявляет точную `version` и `artifact.cache`.
Последние доказанные версии перечислены в dependencies корневого Hamiltonian
package как `workspace:^<version>`.

## Получить модуль

```http
GET /code?module=<package-name>
```

Endpoint возвращает собираемый клиентский artifact выбранного package. Он не
определяет весь состав package и не заменяет его server-entrypoints. Если
готового artifact ещё нет, он собирается автоматически.

Пример:

```text
GET http://127.0.0.1:4444/code?module=@internal/rpc
```

Текущее доказанное состояние всех сменяемых packages возвращает тот же
endpoint без параметров:

```http
GET /code
```

## Обновить модули

```http
POST /code
Content-Type: application/json

{"packages": [{"name": "<package-name>", "change": "patch"}]}
```

Для нескольких зависимых модулей передать все имена в одном массиве:

```http
POST /code
Content-Type: application/json

{
  "packages": [
    {"name": "@import/main", "change": "patch"},
    {"name": "@internal/rpc", "change": "minor"}
  ]
}
```

`change` принимает только `patch`, `minor` или `major`. Готовый номер версии не
передавать: host вычисляет его от последней доказанной версии. Передавать одной
группой все изменённые взаимозависимые `@import/*` и `@internal/*` packages.
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
