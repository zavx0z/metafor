# `@hamiltonian/visual`

`@hamiltonian/visual` владеет Hamiltonian-specific проекцией причинных
наблюдений в универсальную node system и её presentation. Package не наблюдает
runtime сам и не определяет generic graph, layout или renderer laws.

Доказанный источник наблюдений и граница рабочего контура описаны в
[документе прототипа](../docs/PROTOTYPE.md#причинный-монитор). Универсальная модель и
geometry принадлежат [`nodes`](../../pkg/nodes/README.md), layout —
[`@nodes/layout`](../../pkg/nodes/layout/requirements/COMMON.md), а card/render
surface — [`@nodes/ui`](../../pkg/nodes/ui/REQUIREMENTS.md).

## Предметная ответственность

Package:

* принимает только уже наблюдённые lifecycle entities, transport и сообщения;
* строит Hamiltonian-specific node-system projection без выдуманных владельцев;
* сохраняет selection и готовую geometry при изменении только telemetry;
* сопоставляет transport family устойчивому цвету, не смешивая тип, направление
  и состояние связи;
* показывает transient message traffic только на существующем active edge;
* соединяет projection с пространственным `UIDisplay` и необязательным HUD.

Он не владеет startup, control, signaling, release update, domain runtime или
самими lifecycle sources. Package также не заменяет Bulk: это представление
рабочего Hamiltonian-прототипа, а не общая проекция Вселенной для наблюдателя.

## Декларации контуров

Каждый независимо авторитетный наблюдаемый контур публикует одну текущую
declaration: стабильную logical contour identity, incarnation, точный root,
монотонную revision/frontier и замкнутый набор принадлежащих root entities и
transport.

Новая incarnation того же logical contour атомарно заменяет прежнюю. Две
incarnation одного contour не материализуются как две части общей сцены.
Declaration другого contour может сосуществовать независимо. Для одной
incarnation принимается только возрастающая revision и не отступающий causal
frontier; stale, равная и частично смешанная replacement отклоняются до
presentation.

Каждая некорневая entity обязана иметь видимого exact owner, а owner chain —
завершаться объявленным root. Retained transport допустим только вместе с его
owner и обоими exact endpoints. Межконтурная связь добавляется отдельной
проверенной boundary-записью между current incarnations, а не импортируется
внутрь чужой ownership declaration.

Current declaration авторитетно задаёт structural membership до следующей
принятой declaration того же contour. Live observation может обновить факты
уже объявленного subject, но не обойти replacement-границу и добавить либо
удалить её structural member.

Отсутствующий root/owner, цикл ownership, stale incarnation, немонотонный
frontier или ссылка transport на чужую incarnation являются ошибкой. Проекция
не поднимает orphan на корень, не угадывает parent и не сохраняет часть старой
declaration рядом с преемником.

## Материализация и presentation

Retained node-system document содержит только текущую структуру. Завершение
owner удаляет принадлежащее ему поддерево и transport; закрытие одного transport
не объявляет endpoint завершённым. Presentation-only containers могут
группировать уже доказанные runtime nodes, но не становятся lifecycle entity,
owner или transport endpoint.

Структурное изменение или новый viewport требует layout. Изменение heartbeat,
версии или другого факта при прежнем geometry key обновляет presentation без
отмены уже выполняющегося layout. Следующий layout принимается только для того
document и viewport, для которых он был рассчитан.

Сообщение показывается короткоживущим движением только по уже
материализованному edge и в наблюдённом направлении. До готовности первого
route удерживается не история, а только последнее ещё актуальное observation
этого edge. В покое traffic presentation не требует постоянного animation
loop.

Цвет отвечает только за family transport. Направление определяет стороны
socket, а состояние `active`, `paused`, `closed` или `error` передаётся
отдельным признаком. Generic `@nodes/ui` получает opaque connection type и не
знает Hamiltonian palette.

## Public-граница и текущее состояние

Реализованные public subpaths package предоставляют browser layout-worker
adapter, HUD composition и presentation helpers. Точные exports находятся в
[`package.json`](package.json) и public source.

Ingress lifecycle declarations, основной adapter и часть orchestration пока
остаются в root source рабочего прототипа. Поэтому package уже является
документом-владельцем визуальной предметной области, но текущая файловая
граница реализации ещё не полностью совпадает с этой ответственностью. Это не
делает visual package владельцем lifecycle/control и не разрешает переносить в
него prototype runtime целиком.

Запуск, визуальная проверка и diagnostic действия принадлежат
[руководству разработки](../../.agents/skills/metafor-dev/references/development.md),
а не этому контракту.
