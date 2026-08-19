# `@internal/*`

`@internal/*` — namespace сменяемой внутренней функциональности Hamiltonian.
Каждый package владеет одной предметной функцией, а
[`@hamiltonian/release`](../release/README.md) включает согласованные packages
в исполняемый состав.

Общая карта владельцев находится в
[корневом README Hamiltonian](../README.md#распределение-ответственности).

## Закон package

Когда release требует internal-функцию:

1. release composition выбирает package по его функциональному имени и версии;
1. package manifest объявляет среды, в которых функция имеет воплощение;
1. release готовит и проверяет artifact каждой объявленной среды;
1. active release запускает artifact выбранного env;
1. готовое воплощение публикует package identity, env, version и результат
   своей предметной функции.

Package name задаёт функцию. Один и тот же package может исполнять её в любом
необходимом подмножестве сред:

| Env | Среда исполнения |
| --- | --- |
| `main` | Window main realm |
| `worker` | browser Dedicated Worker |
| `service` | browser Service Worker |
| `server` | основной Bun server process |
| `server-worker` | Worker, созданный Bun server |

Manifest перечисляет точное поддерживаемое подмножество. Loader выбирает один
из объявленных env entrypoints, поэтому фактический export однозначно задаёт
возможное placement функции. `server` и `server-worker` представляют разные
lifecycle даже при общей Bun-платформе.

## Identity и версия package

Все env одного package разделяют одно package name и одну package-wide SemVer.
Каждый env получает собственный artifact той же версии. Изменение одного env
создаёт новую версию всего package и полный набор artifacts всех объявленных
сред этой версии.

Source импортирует одно bare package name. Package condition выбирает env для
текущей сборки и исполнения. Manifest, public source и проверки задают точные
conditions, entrypoints и build contracts.

## Release membership и обновление

Версионные dependencies корневого Hamiltonian задают текущий browser release
membership. Release composition проверяет присутствие runtime dependencies и
совместимость их версий до подготовки кандидата.

При изменении internal package release:

1. выбирает новую package-wide version;
1. готовит все объявленные env artifacts этой версии;
1. проверяет integrity и dependency closure полного кандидата;
1. заменяет package в составе общего выпуска;
1. получает подтверждение нового env incarnation с выбранной version.

Действующий browser release выполняет этот lifecycle сейчас. Целевой server
release применяет тот же package-wide закон после появления `startup/server` и
полной server composition.

## Документация каждого package

Каждый `@internal/*` package имеет собственный `README.md` в корне package. Он
описывает:

* предметную функцию;
* поддерживаемые env и роль каждого воплощения;
* событие запуска, владельца решения и наблюдаемый результат;
* public-границу и соседних владельцев;
* реализованное сейчас и требуемый следующий результат.

Точные API и build operations принадлежат public source, manifest и
руководству разработки. Текущий пример package-документа —
[`@internal/visual`](visual/README.md).
