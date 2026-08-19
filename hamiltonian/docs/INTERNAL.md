# `@internal/*`

`@internal/*` — namespace сменяемой внутренней функциональности Hamiltonian.
Его packages выполняют конкретные функции после startup и входят в состав,
которым управляет [`@hamiltonian/release`](../release/README.md).

Этот namespace не является одним package или registry реализаций. Каждый
`@internal/*` package остаётся самостоятельным владельцем своей предметной
функции, версии, поддерживаемых сред и public-границы.

## Имя задаёт функцию

Package называется по выполняемой функции, а не по месту исполнения. Поэтому
один package может иметь entrypoints для нескольких сред, не меняя имени:

| Env | Среда исполнения |
| --- | --- |
| `main` | Window main realm |
| `worker` | browser Dedicated Worker |
| `service` | browser Service Worker |
| `server` | основной Bun server process |
| `server-worker` | Worker, созданный Bun server |

Package объявляет любую необходимую ему подмножину этих сред. Отсутствующий env
означает, что функция в нём не поддерживается; loader и build не подставляют
entrypoint другой среды. `server` и `server-worker` остаются разными средами,
даже если обе исполняются Bun.

## Identity и версия package

Все env одного package сохраняют одно package name и одну package-wide SemVer.
Каждый объявленный env имеет собственный artifact, но не отдельную identity или
версию package. Изменение одного env создаёт новую версию всего package и
полный набор artifacts всех объявленных им сред этой версии.

Source импортирует одно bare package name. Среда выбирается package condition,
а не суффиксом имени или transport URL. Точные conditions, entrypoints и build
contracts задаются manifest, public source и проверками.

## Release membership и обновление

`@internal/*` становится исполняемой частью Hamiltonian только после явного
включения в release composition. Версионные dependencies корневого Hamiltonian
задают текущий browser release membership; runtime dependencies каждого
участника должны находиться в том же составе и быть совместимыми по версии.

Release обновляет изменённый internal package как одну versioned единицу:
готовит и проверяет необходимые env artifacts, проверяет dependency closure и
только затем заменяет действующий состав. Namespace определяет класс
владельца, но не добавляет отдельные update rules для каждого имени package.

Это описывает действующий browser release contract. Полностью сменяемая server
composition остаётся целью и не считается реализованной только потому, что
internal package уже объявляет env `server`.

## Граница namespace

* `@hamiltonian/*` владеет механизмами самого оркестратора: устойчивым startup,
  release composition, доставкой и заменой.
* `@internal/*` владеет сменяемыми служебными функциями Hamiltonian, которые
  запускаются этим механизмом.
* [`@metafor/*`](METAFOR.md) предназначен для загружаемой функциональности
  MetaFor, а не для внутренних функций оркестратора.

Internal package не становится Hamiltonian целиком и не получает authority
Dark, Boundary или другого домена только из-за namespace или среды исполнения.

## Документация каждого package

Каждый `@internal/*` package обязан иметь собственный `README.md` в корне
package. Он описывает:

* одну предметную функцию package;
* фактически поддерживаемые env и различия их роли;
* lifecycle функции после release startup;
* public-границу и соседних владельцев;
* отдельно реализованное сейчас и целевое состояние.

README package не повторяет этот namespace law, команды сборки и точные API.
Текущий пример — [`@internal/visual`](../internal/visual/README.md).

