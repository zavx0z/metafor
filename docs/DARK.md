# Dark

Dark владеет замыслом и причинностью живой Вселенной. Внутри него Oracle
отвечает на вопросы о мире и принимает намерения его изменить. Ответ
Oracle может описать текущее, отклонить намерение или подтвердить его
приём, но сам по себе не является каноническим фактом. Force принимает
подготовленную Particle в причинный порядок, а Boundary фиксирует её каноническое
следствие. Dark не заменяет Boundary, Matrix, Energy или Bulk и не читает их
внутренние Store.

## Состав домена

Dark состоит из двух равноправных слоёв:

* Oracle предоставляет единую RPC-поверхность для чтений, service operations
  и намерений над декларациями, целостным Graph и причинным временем;
* Force принимает по одной Particle, устойчиво фиксирует порядок принятия и
  доставляет её обязательным доменам.

Структурное намерение сначала проверяется и нормализуется Oracle. Приём
намерения означает только создание причинного input. Изменение
живого мира выражается Inflaton и проходит через Force; прямой записи
декларации в Boundary нет. Точный закон приёма, history и маршрутизации
принадлежит [Force](FORCE.md).

## Декларации и Graph

Источник Meta имеет ровно два сегмента `<owner>/<repository>`. Dark загружает
такой Meta-пакет, проверяет его декларацию и строит декларационные Particles.
Композиция с другими Meta выполняется ссылками, а не третьим сегментом или
вложенным репозиторием.

`readGraph` возвращает одну согласованную read-only проекцию текущего мира.
Клиент не задаёт root: Dark получает coherent current projection у Boundary,
определяет единственный текущий root, загружает полные декларации и возвращает
root вместе с Graph. Этот обычный путь не хранит Graph между запросами.

`readGraphDelta` сначала закрывает admission новых Oracle mutations и завершает
уже допущенные. Затем Dark закрывает внешний Force ingress и удерживает
applied-through frontier. Внутри этой границы он собирает тот же полный Graph и
связывает его с root, frontier и digest. Новая mutation RPC не входит в provider
до освобождения всей границы. Первый запрос получает полный snapshot; следующий
получает ref-based delta, если названный base ещё находится в ограниченном
временном cache. После restart или вытеснения base Dark возвращает новый полный
exact snapshot для resync. Cache не является Store или history и не переживает
процесс. Пока sequence-zero baseline не доказан checkpoint-контуром, метод
возвращает `unknown`, а не приписывает текущему Graph недоказанную причинную
границу.

## Причинное время

Обычный режим принимает внешние agent Particles непрерывно. Pause сначала
закрывает только внешний ingress и фиксирует достигнутую причинную границу;
выход доменов продолжает приниматься до её завершения. Step пропускает ровно
одну явно переданную agent Particle при закрытом ingress и снова фиксирует
границу. Oracle mutation admission также остаётся закрытым от начала Pause до
Resume. Resume открывает внешний ingress только у здорового текущего Force.

Pause-stack является read-only журналом действительно достигнутых границ, а не
копией мира. Согласованное состояние Boundary и Mass сохраняется отдельным
immutable checkpoint по правилам [checkpoints](CHECKPOINTS.md).

## History и публичное наблюдение

Dark Force владеет полной append-only post-cut history принятых Particles.
Запись Particle предшествует маршрутизации; производный каталог не участвует в
приёме и может быть восстановлен из сегментов.

History является внутренним основанием Force и checkpoint. Dark Oracle
публикует read-only operation `dark.force.history.read`, которая возвращает
exact current frontier либо bounded acceptance-sequence range этой же history
через отдельные public types. Старых operations `dark.history.read` и
`dark.history.clear`, произвольного persistence read, удаления, rewrite и
автоматической очистки через service API нет.

Graph snapshot и delta связываются с history через `(cutId, sequence)`, но не
добавляются в строки Particle и не создают второй причинный журнал.

## Рождение и отказ

Dark рождается первым. Force открывает history, подготавливает заранее
созданные каналы всех обязательных доменов и становится `running` только после
их готовности. Затем Dark Oracle принимает локальные RPC-каналы и предоставляет
свои operations.

После устойчивого приёма Particle ошибка обязательной доставки или потеря
готового канала переводит Force в fail-stop. Новые Particles блокируются, а
первая причина отказа сохраняется. Автоматическое частичное восстановление
домена и горячая подмена каналов не являются частью контракта.

## Границы ответственности

* Boundary владеет каноническим текущим состоянием, точными Reaction relations,
  регистрацией executions и SQLite.
* Matrix выбирает State и Transition и владеет очередями Reaction target Atom.
* Energy исполняет Process и Reaction, владеет живыми ресурсами Process и
  файловой Mass.
* Bulk владеет observer Store, browser projection и Visual lifecycle.
* Dark переносит между ними причинные Particles и предоставляет service-level
  операции, но не читает и не изменяет их внутреннее состояние напрямую.

Dark открывает единственный слушающий server Вселенной. Boundary, Matrix,
Energy и Bulk подключают к нему исходящие Oracle и Force WebSocket и не имеют
собственных HTTP listeners. Bulk browser shell, initial и WebSocket доступны
через Dark; их Store и Visual semantics остаются в Bulk.

HTTP Oracle channels доступны только loopback-клиентам. Текущая доверительная
граница внешнего Force ingress описывается отдельно и не должна считаться
аутентифицированной только из-за наличия HTTP или WebSocket transport.
