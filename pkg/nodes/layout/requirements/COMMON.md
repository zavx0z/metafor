# Общие алгоритмические требования

Этот документ владеет законами алгоритма `@nodes/layout`, общими для режимов
[`RIGHT`](RIGHT.md) и [`DOWN`](DOWN.md).

Позднее уточнение владельца заменяет противоречащую раннюю формулировку. Public
types задают точную форму протокола, код реализует перечисленные законы, а tests
и live-сценарии доказывают реализацию, но не являются владельцами смысла.

## Ответственность движка

1. Раскладкой владеет чистое TypeScript-ядро. Оно вычисляет координаты leaf-нод,
   compound-контейнеров, generated gateways, портов и всех участков semantic
   edges.
2. Ядро является синхронной pure function без I/O, случайности, часов и скрытого
   состояния. Один и тот же serializable input всегда даёт одну и ту же
   geometry.
3. ELK, Libavoid и другие внешние layout/routing engines не являются runtime-
   зависимостями. Ручные coordinates, lanes, supplied gateways/bends/anchors,
   fixture-specific offsets и transport-specific эвристики запрещены.
4. Алгоритм универсален для разных размеров, числа и вложенности нод. Название,
   ID, роль конкретной ноды или известная геометрия Hamiltonian не могут менять
   правило размещения.

## Минимальный протокол

1. Layout получает только фактический viewport, intrinsic размеры нод, полный
   containment tree, нижнюю границу собственного занятого content, offsets
   центров видимых parameter ports, semantic edges и числовые параметры
   spacing/clearance.
2. Любые данные сверх перечисленной числовой graph-модели не входят в layout
   protocol.
3. Внешние координаты выражены в логических пикселях. Внутри solver использует
   безопасную целочисленную fixed-point geometry, но это не часть public API.
4. Каждый `LayoutEdge` имеет один `sourcePortId` и один `targetPortId`.
   Hyperedges, node-level endpoints и fallback к произвольной границе карточки
   не входят в договор.
5. На выходе возвращаются только выбранное направление, bounds, окончательные
   node/compound rectangles, абсолютные центры исходных портов и одна
   ортогональная section каждого semantic edge.
6. Все входные коллекции нормализуются устойчивой сортировкой по semantic ID.
   Порядок элементов во входных массивах не является сигналом алгоритму.
7. Невалидная ссылка на ноду, parent, порт или endpoint отклоняется. Ошибка
   projection не маскируется созданием фиктивного endpoint.
8. Все алгоритмические типы, включая внутренние placement/routing types,
   находятся в `@nodes/layout/types`. Public export содержит только минимальный
   ELK-like protocol; внутренние solver-типы наружу не экспортируются.

## Семантика портов и рёбер

1. Каждый semantic edge остаётся одним domain edge от начала до конца и
   соединяет центры двух точных видимых parameter sockets.
2. Source-параметр всегда имеет направление `out` и сторону `EAST`, target —
   `in` и `WEST`. Закон одинаков для `RIGHT` и `DOWN`.
3. Section физически начинается и заканчивается в exact port centers; endpoint
   нельзя заменить точкой на node boundary.
4. Section упрощается только удалением повторяющихся и строго коллинеарных
   точек. Упрощение не меняет endpoint, gateway или сторону пересечения.

## Containment и препятствия

1. Любая промежуточная compound boundary пересекается только через generated
   `WEST`/`EAST` gateway. Пересечения через `NORTH`/`SOUTH` и через угол
   запрещены в обоих responsive-режимах.
2. Ребро между потомками одного owner целиком маршрутизируется внутри их lowest
   common ancestor. Boundary gateway создаётся только при реальном выходе из
   контейнера; внутреннее ребро нельзя выводить наружу или превращать в
   self-loop внешнего owner.
3. Маршрут не проходит через interior или boundary посторонней leaf-ноды,
   собственного занятого content-band compound или unrelated child.
4. Source ancestor chain покидается один раз и после выхода не посещается снова.
   Target ancestor chain входит один раз и после входа больше не покидается.
   Сквозной проход через ancestor запрещён.
5. Ancestor transparency разрешена только для законного прохода к generated
   `WEST`/`EAST` gateway. Она не разрешает вести edge через header, параметры
   или другой собственный content родителя.
6. Геометрия обязана сохранять containment, required clearance, spacing,
   ортогональность и отсутствие node/compound overlap.

## Единый ритм расстояний

1. Базовая единица размещения — фактическое расстояние между центрами соседних
   parameter sockets (`socket pitch`). Конкретное число не зашивается в layout:
   оно приходит числовым параметром во входном graph.
2. Один socket pitch используется:
   - от header или последнего собственного параметра compound до первого child;
   - от собственного content-band до child;
   - между соседними child, если промежуток не занят поперечным маршрутом;
   - от последнего child или собственного content до внутренней границы
     compound;
   - между соседними нодами без проходящего между ними edge;
   - между edge и ближайшей посторонней node или compound boundary;
   - между параллельными edge segments.
3. Правило действует одинаково для горизонтальных и вертикальных участков.
4. Corridor с одной линией между двумя препятствиями занимает два pitch — по
   одному от линии до каждого препятствия. Несколько линий расширяют только
   фактически занятый corridor, без дополнительной пустой полосы.
5. `padding` обозначает один фактический внутренний шаг. `clearance` не может
   скрыто складываться с ним и удваивать пустоту. Дополнительное место
   резервируется только под реально используемый routing corridor.
6. Каждый semantic edge сохраняет собственный ID и exact endpoints, но
   связанные edges, имеющие один exact source-port или один exact target-port,
   могут использовать один сгенерированный ортогональный trunk. Совпавший участок
   такого bundle не является crossing или нарушением edge-edge clearance:
   edges сливаются и расходятся только в явных generated junctions, а их
   индивидуальные terminal stubs остаются привязаны к точным sockets.
7. Общая нода без общего exact port не делает edges связанным bundle. Рёбра
   разных портов одной карточки сохраняют полный обязательный шаг. Остальные
   несвязанные edges также не получают права на overlap. Между их параллельными
   segments сохраняется полный pitch. Если общий trunk для связанного bundle
   невозможен без нарушения hard laws или не улучшает лексикографическую цель,
   edges также остаются на отдельных lanes с полным pitch.
8. Параллельные edges в общем corridor получают устойчивый порядок lanes.
   На повороте, split или merge этот порядок нельзя инвертировать, если
   существует transition без пересечения. Внутренняя lane остаётся внутренней,
   внешняя — внешней; generated bundle trunk не превращает два semantic edges
   в один domain edge.
9. Compaction не может удалить уже вычисленный занятый corridor между рядами
   или столбцами. Он вправе убрать только незанятую пустоту; минимальный размер
   corridor повторно выводится из фактически пересекающих его semantic edges и
   числа общих endpoints.

## Плотность и размещение

1. Большая неиспользуемая область внутри compound или всего display является
   acceptance defect, а не косметикой после маршрутизации.
2. Leaf-ноды сохраняют intrinsic размеры. Их нельзя искусственно растягивать до
   ширины контейнера ради заполнения пустоты.
3. Compound вычисляется bottom-up из собственного content-band, children и
   только фактически нужных routing corridors. Пустые строки, столбцы и двойные
   padding не резервируются заранее.
4. Ноды могут переходить в следующий ряд или столбец. Алгоритм не обязан держать
   весь уровень в одной длинной полосе, если перенос делает viewport плотнее.
5. Размер ряда или столбца выводится из реальных intrinsic размеров, включая
   наиболее широкую или высокую ноду в этой группе. Упаковка использует
   доступную ширину/высоту viewport и минимизирует пустоты без overlap.
6. Геометрический центр parent или слоя не является самостоятельной целью.
   Ноду можно сдвинуть к связанным соседям, если это уменьшает bends, длину или
   пустоту и не нарушает hard laws.
7. Прямая связь один-к-одному может выравнивать карточки по exact sockets.
   Fan-out одного source не выравнивает каждую target-карточку по разному
   offset её порта и не должен поднимать весь ряд из-за крайнего target.

## Маршрутизация и качество результата

1. Hard validity всегда имеет абсолютный приоритет. Нельзя сокращать внешний
   обход, bends или bounds ценой прохода через ноду, неверного gateway,
   clearance, containment или exact endpoint.
2. Если через несколько уровней hierarchy существует общий прямой коридор,
   edge использует его без hierarchy stairs. Независимая граница compound сама
   по себе не является причиной нового bend.
3. Если несколько связанных edges могут пройти по одному прямому trunk и
   разойтись только у своих terminal sockets, такой bundle предпочтительнее
   независимых U-петель. Кандидат принимается только после полного validator и
   по общему лексикографическому порядку качества.
4. После hard validity качество сравнивается лексикографически:
   1. total edge-edge crossings;
   2. max crossings одного edge;
   3. total turns;
   4. max turns одного edge;
   5. суммарный дефицит свободного выходного коридора source;
   6. total Manhattan length;
   7. max Manhattan length;
   8. max detour;
   9. detour каждого edge в устойчивом порядке semantic ID;
   10. orientation-specific placement quality: для `RIGHT` — устойчивый
       socket-aligned базовый placement, для `DOWN` — display empty ratio,
       compound empty ratio, fit scale и площадь bounds;
   11. clearance variance;
   12. стабильный semantic-ID key.
   Та же orientation-specific placement quality ограничивает число кандидатов,
   передаваемых дорогому router; hard-invalid candidate при этом не может быть
   принят из-за высокого soft score.
5. Нельзя оптимизировать только сумму: один edge с чрезмерным числом bends,
   crossings, длиной или detour остаётся дефектом даже при хорошем среднем
   результате.
6. Если фиксированные rectangles не оставляют legal corridor, router не двигает
   их молча. Он возвращает machine-readable `NO_LEGAL_ROUTE` witness с edge,
   endpoints, ancestor chains, candidate axes, reachable frontier, rejected
   transitions и blocking rectangles/segments.
7. Нулевое число crossings одного edge schedule завершает только первую
   координату soft objective, но не весь bounded global search. Router сравнивает
   все уже определённые стабильные schedules по полному лексикографическому
   порядку; первый найденный допустимый вариант не получает отдельного
   приоритета перед меньшими turns, Manhattan length или detour.

## Детерминизм и производительность

1. Повторные вызовы и устойчивые перестановки nodes, ports и edges дают битово
   одинаковую fixed-point geometry. Tie-break выполняется по semantic ID.
2. Алгоритм не зависит от скорости машины, времени кадра, состояния внешнего
   адаптера, предыдущей загрузки страницы или прежних coordinates.
3. Выбран производительный гибрид: layered median/barycenter ordering, bounded
   compaction по мотивам [Brandes–Köpf](https://boriskoepf.de/papers/gd01a.pdf)
   и sparse visibility A* из подхода
   [orthogonal connector routing](https://users.monash.edu/~mwybrow/papers/wybrow-gd-2009.pdf).
   Network-simplex используется только как ориентир layered-архитектуры,
   описанной [Gansner et al.](https://graphviz.org/documentation/TSE93.pdf).
4. Product path не выполняет неограниченный глобальный перебор. Candidate set
   ограничен, кэшируется и дедуплицируется; hard invalid candidates отбрасываются
   до soft scoring.
5. Утверждение «быстрее ELK» допустимо только после измерения одинаковых входов
   и условий. Независимость от ELK является архитектурным фактом, но сама по себе
   не доказывает преимущество по времени.
