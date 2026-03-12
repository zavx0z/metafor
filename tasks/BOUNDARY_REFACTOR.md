# Boundary Refactor

Документ разворачивает [CURRENT_PLAN.md](/Users/zavx0z/zavx0z/metafor/tasks/CURRENT_PLAN.md) только для домена `Boundary`.
Он опирается на [docs/ARCHITECTURE.md](/Users/zavx0z/zavx0z/metafor/docs/ARCHITECTURE.md), [docs/ONTOLOGY.md](/Users/zavx0z/zavx0z/metafor/docs/ONTOLOGY.md) и правила из `rules/`.

## Цель

Привести `boundary` к целевой доменной проекции:

1. `Boundary` имеет собственный доменный оркестратор.
2. `boundary/store.ts` остаётся единственным источником истины домена.
3. Внутренняя структура домена читается через `Boundary × Gravity`, `Boundary × Strong`, `Boundary × Weak`, `Boundary × Electromagnetism`.
4. CPU и GPU остаются backend-адаптерами внутри `Boundary × Weak`, а не скрытыми центрами владения.
5. Переходные исторические имена перестают быть каноническими.
6. Исходный `boundary/fields` больше не существует; его функции распределяются по силам и категориям внутри сил.
7. Внутри каждой силы корневой `index.ts` остаётся оркестратором, а конкретные роли уходят во вложенные подпакеты.

## Не меняем в рамках этого плана

1. Не переносим ответственность `Boundary` в `Bulk`.
2. Не делаем `Bulk` загрузчиком `Boundary`.
3. Не делаем runtime-адаптеры источниками истины.
4. Не смешиваем доменный store с производными execution-структурами.

## Этап 1. Закрепить Boundary как домен

1. Оставить [boundary/boundary.ts](/Users/zavx0z/zavx0z/metafor/boundary/boundary.ts) доменным оркестратором, а не местом смешения подготовки, хранения и backend-исполнения.
2. Оставить [boundary/store.ts](/Users/zavx0z/zavx0z/metafor/boundary/store.ts) и [boundary/store.t.ts](/Users/zavx0z/zavx0z/metafor/boundary/store.t.ts) единственным доменным источником истины.
3. Убрать из доменного оркестратора прямую силовую подготовку там, где она должна жить в force-aligned модулях.
4. Зафиксировать, что `write/update/unlock/reset` относятся к доменному оркестратору, а не к backend-адаптерам.
5. Явно развести доменный store и локальный runtime-store слабого слоя, чтобы производные execution-структуры не читались как второй источник истины.

## Этап 2. Выделить Boundary × Gravity

1. Вынести из [boundary/boundary.ts](/Users/zavx0z/zavx0z/metafor/boundary/boundary.ts) flattening и раскладку входной структуры в отдельный слой `boundary/gravity/*`.
2. Удерживать в `boundary/gravity/*` только те части, которые реально относятся к геометрии, индексному пространству и форме пространства состояний.
3. Оставить в `Boundary × Gravity` только то, что задаёт раскладку Brane и Field в boundary-пространстве, индексные связи и адресуемость.
4. Не держать в `Gravity` канонизацию, дедупликацию и runtime-исполнение.

## Этап 3. Выделить Boundary × Strong

1. Перенести канонизацию, дедупликацию, интернирование строк и материализацию запутанности в слой `boundary/strong/*`.
2. Удерживать в `boundary/strong/*` канонизацию, дедупликацию, materialization связности, нормализацию и восстановление снимка.
3. Оставить сборку канонической store-формы в `Strong`, а не в доменном оркестраторе и не в backend-runtime.
4. Зафиксировать, что именно `Strong` удерживает компактную и согласованную boundary-форму.

## Этап 4. Выделить Boundary × Weak

1. Сделать `Boundary × Weak` каноническим именем и слоем вычисления перехода состояния.
2. Перенести backend-адаптеры CPU/GPU, устройство, константы и runtime-типы в `boundary/weak/*`.
3. Развести [boundary/store.ts](/Users/zavx0z/zavx0z/metafor/boundary/store.ts) и [boundary/weak/runtime/store.ts](/Users/zavx0z/zavx0z/metafor/boundary/weak/runtime/store.ts) так, чтобы у домена остался один источник истины, а runtime-структуры `Weak` были явно локальными и производными.
4. Убедиться, что `Weak` вычисляет переход, но не становится владельцем доменного store.
5. Удалить старую файловую проекцию слабого backend-слоя после переноса backend-адаптеров и тестов.

## Этап 5. Выделить Boundary × Electromagnetism

1. Описать и вынести перенос структурированного изменения, сериализацию и boundary-signaling в слой `boundary/em/*`.
2. Перенести dump-проекцию снимка внутрь [boundary/strong/dump/](/Users/zavx0z/zavx0z/metafor/boundary/strong/dump) как часть `Boundary × Strong`.
3. Не оставлять serialization/dump как отдельно стоящий несвязанный util-пакет, если он реально является межграничным контрактом.
4. Зафиксировать, что любой boundary-side transport и export состояния относится к `Electromagnetism`, а не к `Weak`.

## Этап 6. Выпрямить публичный API и файловую проекцию

1. Оставить [boundary/index.ts](/Users/zavx0z/zavx0z/metafor/boundary/index.ts) тонким публичным входом домена.
2. Убрать из описаний и экспортов исторические зонтичные имена, которые скрывают роль `Gravity/Strong/Weak/Electromagnetism`.
3. Синхронизировать [boundary/README.md](/Users/zavx0z/zavx0z/metafor/boundary/README.md) и [boundary/strong/dump/README.md](/Users/zavx0z/zavx0z/metafor/boundary/strong/dump/README.md) с новой внутренней проекцией сил только после переноса модулей.
4. Не оставлять в документации ситуацию, где архитектурная роль уже `Weak`, а файловая и API-поверхность всё ещё читается через исторический словарь.

## Этап 7. Довести тесты до новой проекции

1. Разделить тесты по доменной силовой проекции: подготовка `Gravity`, канонизация `Strong`, переход `Weak`, перенос `Electromagnetism`.
2. Перенести backend parity и CPU/GPU проверки в слой `Weak`.
3. Добавить интеграционный тест на полный boundary-путь: подготовка структуры -> запись в store -> вычисление перехода -> чтение изменения.
4. Добавить интеграционный тест на согласованность UUID/state/index между каноническим store и runtime-результатом.

## Критерий завершения

1. `Boundary` читается как домен со своим оркестратором и своим `store.ts`.
2. Внутри `boundary` роли `Gravity/Strong/Weak/Electromagnetism` различимы по папкам, подпакетам и ответственности.
3. CPU и GPU не владеют источником истины и не подменяют доменный слой.
4. Исторические имена больше не являются каноническими для архитектуры boundary.
5. Документация, тесты и публичный API читаются через целевой словарь Boundary-домена.
