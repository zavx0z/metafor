# NODES-008 — Не оставлять пустой маршрутный резерв внутри compound

## Коротко

Compound должен быть увеличен только под действительно занятые дорожки рёбер.
Если маршруты проходят сбоку, снизу после последнего child остаётся ровно один
шаг между сокетами, а не продублированный боковой резерв.

## Наблюдение владельца

В portrait Hamiltonian у карточки `Service Worker` внутри `Chrome` снова
появилась большая пустота снизу и по бокам. При owner review landscape также
показал двойной вертикальный шаг между route и compound boundary. Исходные
снимки и точные live-меры описаны в
[`project/artifacts/NODES-008/`](../artifacts/NODES-008/README.md).

## Подтверждённые факты

1. Действующий `socket pitch` равен `28 px`.
2. В live DOWN geometry `Chrome` имеет rect `196,112,800,2534`, а последний
   child `Service Worker` — `336,2150,520,356`: нижний gap равен `140 px`, или
   пяти pitch.
3. Боковые gaps по `140 px` содержат фактические vertical route lanes, включая
   `x=280` и `x=308`; они не являются целиком пустыми.
4. В нижних дополнительных `112 px` route segments отсутствуют.
5. Portrait placement вычисляет `sideReserve` из reverse-flow relations,
   расширяет им ширину, но одновременно безусловно добавляет тот же резерв к
   высоте. Router в наблюдаемом результате использует боковые, а не нижние
   lanes.
6. Коммиты после закрытия NODES-007 меняли lifecycle presentation и цвета, но
   не `@nodes/layout`; это ранее скрытый общий compaction defect.

## Действующий закон

[`pkg/nodes/layout/requirements/COMMON.md`](../../pkg/nodes/layout/requirements/COMMON.md)
уже требует один pitch от последнего child до внутренней границы compound и
разрешает дополнительное место только под фактически занятый corridor.
`padding` и `clearance` не складываются в скрытую двойную пустоту.

## Подзадачи

### NODES-008.1 — Восстановить вертикальный ритм между рядами внутри compound

Статус: выполнена и визуально подтверждена владельцем; родительская задача
остаётся `IN_PROGRESS`.

Три новых owner-снимка относятся к уже действующему закону, а не вводят новое
требование. `COMMON.md` требует один socket pitch между edge и ближайшей
посторонней нодой, между соседними нодами без проходящего edge и на
горизонтальных, и на вертикальных участках. `DOWN.md` сохраняет тот же закон на
каждом уровне hierarchy.

Точный сохранённый Worker input с SHA-256
`13a8659cf9184fea43212e6bcd505cfea4c132ffd9c573384d13d6d412647922`
воспроизводит три нарушения внутри `server-contour` при `clearance=28`:

* от нижнего края server-row `y=336` до общего horizontal trunk `y=420` —
  `84 px`, затем от trunk до `worker-probe` `y=448` — правильные `28 px`;
* от нижнего края `worker-probe` `y=666` до `main-probe` `y=750` — `84 px`,
  хотя route segment в промежутке отсутствует;
* от нижнего края `main-probe` `y=968` до `Peer process` `y=1024` — `56 px`,
  хотя route segment в промежутке отсутствует.

Причина установлена до реализации: текущий post-routing проход удаляет только
полосу, пустую по всей ширине graph. Координаты другой ветви на той же высоте
блокируют глобальное удаление, даже когда полоса локально пуста внутри одного
parent. Действующая regression проверяет нижний, боковой и top-level ритм, но
не проверяет последовательность `row → occupied tracks → row` внутри каждого
compound.

Focused regression сначала воспроизвёл четыре нарушения `56/84/84/56 px` на
двухстраничном fixture. Локальный post-routing compaction теперь рассматривает
ряды внутри каждого parent от глубоких compounds к внешним, сдвигает только
нижние sibling-поддеревья шагами по `clearance`, заново строит все маршруты и
принимает только вариант, прошедший placement и route validators.

После исправления focused regression и полный `bun test pkg/nodes` проходят
`86/86`; typecheck `@nodes/layout`, `nodes` и root — PASS. Exact live input
`15/22/13` возвращает `0` межрядных нарушений и сохраняет bounds
`1400.3 × 2394`. Frozen RIGHT сохранил прежние geometry SHA и bounds, а DOWN
дал одинаковую geometry для x3 repeats и трёх устойчивых перестановок.
Владелец подтвердил, что показанные на трёх снимках разрывы устранены.
Final benchmark остаётся обязательным только перед переводом всей NODES-008 в
`REVIEW`.

### NODES-008.2 — Подтянуть нижнюю границу parent после локального уплотнения

Статус: выполнена, проверена offline/live и зафиксирована отдельным commit
`600ccf35d`.

Новый owner-снимок относится к уже действующему общему закону: от последнего
child или собственного content до внутренней границы compound остаётся один
socket pitch, а дополнительная высота разрешена только фактически занятому
нижнему routing corridor.

Тот же exact Worker input `15/22/13` с SHA-256
`13a8659cf9184fea43212e6bcd505cfea4c132ffd9c573384d13d6d412647922`
после NODES-008.1 даёт единственное нарушение нижнего ритма:

* `server-contour`: последний direct child заканчивается на `y=1338`, нижняя
  граница находится на `y=1506`, horizontal route tracks между ними
  отсутствуют; пустой gap равен `168 px` вместо `28 px`.

Причина установлена до реализации. Локальный межрядный compaction сдвигает
нижние sibling-поддеревья, но сохраняет прежнюю высоту parent. Следующий
глобальный strip-pass может убрать остаток только при пустой полосе через весь
graph; геометрия соседней top-level ветви на тех же Y блокирует такое удаление.
Имеющийся regression проверяет нижний шаг только выбранного Browser compound,
а не каждого parent после локального сдвига.

Общий focused regression сначала воспроизвёл единственное нарушение
`server-contour = 168 px`. Новый `DOWN` pass рассматривает parents от глубоких
к внешним, оставляет нижнюю границу на один `clearance` после последнего
собственного content, child или route point и не двигает ноды, порты и
sections. Кандидат принимается только после полных placement и route validators.

После исправления exact Worker input `15/22/13` возвращает `0` нарушений;
`server-contour` заканчивается на `y=1366`, то есть ровно `28 px` после child
bottom `1338`. Полный пакет проходит `86/86`; layout/nodes/root typechecks —
PASS. Frozen RIGHT/DOWN сохранили geometry SHA, bounds, x3 repeats и три
перестановки byte-identical NODES-008.1. В обеих уже открытых Hamiltonian
вкладках результат подтверждён без reload и без restart runtime.

### NODES-008.3 — Убрать пустой боковой pitch у compound с портами

Статус: подзадача выполнена и визуально принята владельцем 12 августа 2026.

Два owner-crop относятся к действующему общему закону: между child envelope,
фактически занятыми vertical tracks и внутренней side boundary каждый соседний
промежуток равен одному socket pitch. Exact Worker input `15/22/13` с SHA-256
`13a8659cf9184fea43212e6bcd505cfea4c132ffd9c573384d13d6d412647922`
даёт ровно два нарушения parent-level side rhythm при `clearance=28`:

* первый page compound: слева `boundary 196 → track 224 → child 252` даёт
  правильные `28/28`, а справа `child 552.7 → boundary 608.7` оставляет пустые
  `56 px` без vertical track;
* второй page compound: слева `boundary 196 → child 252` оставляет пустые
  `56 px`, а справа `child 634.05 → track 662.05 → boundary 690.05` даёт
  правильные `28/28`.

Причина установлена до реализации. `compactCompoundSideReserves` и
`findUnusedCompoundSideReserves` намеренно пропускают compound с semantic
ports, потому что изменение его side boundary перемещает exact port centers,
а текущий проход не перестраивает routes. Поэтому общий `sideReserve`, нужный
одному ряду, остаётся пустым на противоположной стороне всего portful parent.

Generic regression воспроизвёл один съёмный pitch `28 px`. Финальный bounded
`DOWN` pass сжимает только пустую сторону portful compound, обновляет exact
boundary ports и terminal sections, после чего принимает candidate только
после полных placement/route validators. На exact Worker input список
parent-level нарушений стал пустым. Имена Hamiltonian и fixture-specific
offsets в алгоритм не входят.

Offline proof: `86/86` tests; layout/nodes/root typechecks и `diff-check` —
PASS. Frozen RIGHT остался byte-identical с SHA-256 `2188e801…`; новый DOWN
детерминирован на x3 repeats и трёх stable permutations, SHA-256 `9870e1a9…`,
bounds `782.45 × 3570`.

Две уже открытые Hamiltonian-вкладки подхватили новую геометрию без reload и
без restart runtime. Владелец визуально принял результат; полные live-кадры
сохранены в артефактах NODES-008.

## Границы

* Меняются только универсальные placement/compaction и visibility coordinates
  `@nodes/layout`, их проверки и evidence.
* Exact ports, semantic edges, routing clearance, EAST/WEST gateways,
  containment, RIGHT/DOWN selection и bounded search не ослабляются.
* Боковой corridor не сжимается, если в нём действительно находятся routes.
* Не добавляются Hamiltonian IDs, ручные coordinates или fixture-specific
  offsets.
* Runtime не запускается и не перезапускается; live proof использует уже
  открытую вкладку после offline gate.

## Критерии готовности

1. Regressions воспроизводят portrait compound с reverse-flow side lanes и
   пустым нижним резервом, а также landscape внутренний и внешний двойной
   вертикальный clearance.
2. После исправления нижний gap равен одному pitch, если под children нет
   route segment; занятые боковые corridors сохраняют полный clearance.
3. Если legal route действительно требует нижний corridor, соответствующий
   placement остаётся доступен и проходит validator.
4. RIGHT/DOWN, x3 repeats и устойчивые перестановки дают одинаковую geometry;
   exact endpoints, orthogonality, containment и clearance проходят.
5. Существующие frozen proofs, `bun test pkg/nodes`, package/root typecheck и
   `git diff --check` проходят.
6. Перед `REVIEW` сохранён final benchmark на прежнем frozen RIGHT/DOWN input и
   сопоставлен с последним совместимым замером.
7. В открытых portrait/landscape contours нижняя пустота исчезла без сжатия
   занятых lanes и без перезапуска runtime.

## Артефакты

[`project/artifacts/NODES-008/`](../artifacts/NODES-008/README.md)

## Готовый результат для REVIEW

Все критерии задачи выполнены. Общий socket pitch `28 px` действует по обеим
осям между children, фактически занятыми route tracks и compound boundary;
пустой reserve удаляется, занятый corridor сохраняется. Portful compound
сжимается вместе с exact boundary ports и terminal sections, после чего
кандидат повторно проходит полные placement и route validators. RIGHT/DOWN,
x3 repeats и три stable permutations детерминированы; владелец принял live
результат в обеих уже открытых вкладках без reload и restart runtime.

Final benchmark на прежнем frozen input и том же Mac/Bun `1.3.14`:

| Режим | Предыдущий совместимый | Final | Изменение |
| --- | ---: | ---: | ---: |
| RIGHT | 195.90 ms | 163.42 ms | −16.6% |
| DOWN | 581.17 ms | 1036.62 ms | +78.4% |

Input SHA-256 не изменились; RIGHT geometry SHA сохранился `2188e801…`, DOWN
целевая geometry имеет SHA `9870e1a9…`. Порог performance-отказа контрактом
не задан; возможная отдельная оптимизация не меняет hard/visual acceptance
этой задачи.

## Closing handoff

Этот handoff отозван owner review 12 августа 2026 года: после его записи
обнаружен ещё один общий spacing defect, описанный в NODES-008.4 ниже. Задача
возвращена в `IN_PROGRESS`; result `4eb4b03d…` остаётся промежуточным
checkpoint, а не основанием для закрытия.

Result commit: `4eb4b03d147ae776331f92d7ba96fbbbf192fcaa`.

Граница результата — только pure `@nodes/layout`: placement candidates,
compound compaction, visibility routing и их regressions. Public numeric
protocol, Worker transport, `nodes` adapter, `@nodes/ui`, Hamiltonian runtime и
renderer не менялись.

Постоянные владельцы:

* общие hard laws, socket-pitch clearance и лексикографическая цель —
  `pkg/nodes/layout/requirements/COMMON.md`;
* landscape-specific routing/compaction —
  `pkg/nodes/layout/requirements/RIGHT.md`;
* portrait-specific placement/compaction —
  `pkg/nodes/layout/requirements/DOWN.md`;
* пользовательское устройство выбранного гибридного алгоритма и benchmark
  process — `pkg/nodes/layout/README.md`.

Актуализированный долговечный вывод: пустой compound reserve не сохраняется;
каждая фактически соседняя boundary, occupied lane и child разделена одним
socket pitch. Exact-port bundling разрешено только для одинакового semantic
port; разные порты сохраняют полный clearance. Portful boundary может
сжиматься только вместе с exact port centers и terminal sections, а результат
принимается после полных placement/route validators. Старое утверждение, что
portful compound не сжимается, удалено из постоянной документации.

Evidence для независимой проверки: `86/86` package tests; layout/nodes/root
typechecks и `git diff --check` — PASS; frozen `verification.json` подтверждает
RIGHT/DOWN x3 repeats и три permutations; final `benchmark-current.json`
содержит все samples/hashes/provenance; два принятых live PNG подтверждают
открытые вкладки без reload/restart. Владелец явно принял финальный визуальный
результат 12 августа 2026 года.

### NODES-008.4 — Не удваивать единичный межслойный corridor

Статус: исправлено offline и в текущем live `DOWN`; ожидается повторное
визуальное подтверждение владельца перед result benchmark и `REVIEW`.

Owner landscape-снимок показал один общий IPC trunk между Hamiltonian и тремя
target cards. По общему закону corridor с одной линией между двумя
препятствиями занимает два socket pitch: один от source-card до trunk и один
от trunk до target-card.

Exact frozen witness при `clearance=28` подтвердил нарушение в `RIGHT`: source
EAST `x=1780.1`, shared IPC trunk `x=1836.1`, target WEST `x=1892.1`.
Дополнительная сверка полного corridor показала отдельный WebPush track между
source и IPC trunk. Значит corridor содержит две фактические lanes и должен
занимать `28 + 28 + 28 = 84`, а не текущие `112`; лишний один pitch остаётся
между IPC trunk и target cards. Три IPC semantic edges используют один shared
exact-source trunk, WebPush с другим source port использует отдельный track.

Последующие owner portrait-снимки доказали, что тот же закон нарушался и в
`DOWN`: после глобальной strip compaction более поздние локальные изменения
рядов и compound bounds могли снова оставить два шага между границей, дорожкой
и первым рядом. Поэтому частное `RIGHT`-исправление было недостаточным.

Итоговое исправление применяет общий post-route проход в обоих направлениях.
Он измеряет только фактически занятые вертикальные tracks в высоте конкретного
ряда, сдвигает в `DOWN` этот ряд, а в `RIGHT` — всю устойчиво выровненную
колонку первого topology-layer. После каждого сдвига весь graph заново
маршрутизируется и проходит placement/route validation; затем повторно
сжимаются portless/portful compound bounds и верхнеуровневые strip. Ни manual
lane, ни fixture ID, ни direction-specific spacing constant не добавлены.

Focused proof: `18/18` layout/router tests, `115` assertions и package
typecheck — PASS. Общий regression для RIGHT/DOWN проверяет каждый ряд как
последовательность `boundary → occupied tracks → child` и каждый межслойный
corridor; все интервалы равны `28` при тестовом socket pitch `28`. Frozen proof
для 14 nodes / 20 ports / 12 edges: x3 repeats и три stable permutations дают
один SHA на направление — RIGHT `a44c90fd…`, DOWN `50ee91bc…`.

Текущий live auto-update первой вкладки: `DOWN`, 15 nodes / 13 edges, bounds
`1398.25×2478`; независимое чтение `data-hamiltonian-layout-rects/routes`
вернуло `rowSideViolations=[]` и `layerViolations=[]`. Вторая вкладка не
активировалась, не перезагружалась и не изменялась.

Checkpoint NODES-008.4 сохранён отдельным коммитом
`b0fee1ee0b726d1d1ad3497f9788224d15bd4ddf`; это не result commit всей
NODES-008 и benchmark для него не снимался.

### NODES-008.5 — Не удваивать правый боковой corridor в DOWN

Статус: `IN_PROGRESS`.

Owner portrait-снимок `13.42.51` от 12 августа 2026 года показал зеркальное
нарушение общего закона spacing: после EAST-порта compound ближайшая занятая
vertical lane находится справа через лишний пустой pitch. Визуально тот же
дефект повторяется у двух page compounds в одном `DOWN` layout.

Исходный machine-readable live witness подтвердил дефект в обеих строках при
`clearance=28`: `childRight=524.7`, ближайший vertical track `x=580.7`, и
`childRight=634.05`, ближайший vertical track `x=690.05`. Оба расстояния равны
`56 px`, то есть содержат лишний единичный pitch.

Разрешён только симметричный общий post-route шаг, работающий по геометрии и
actual occupied tracks без fixture IDs, manual lanes или ослабления clearance.
Каждый принятый сдвиг обязан заново валидировать весь graph. Вторая вкладка,
runtime и viewport в этой подзадаче не изменяются.

Acceptance: для `RIGHT` и `DOWN` последовательность
`child/compound boundary → occupied tracks → parent boundary` не содержит
интервала больше одного `clearance`, если его не требует реальная отдельная
lane; exact sockets, containment, orthogonality, edge/node и edge/edge
clearance остаются зелёными. Финальный benchmark выполняется один раз только
после готовности всей NODES-008 к `REVIEW`.

## Отклонённые результаты

Ниже сохранена только причинная история отвергнутых checkpoint этой карточки.

Partial result commit `38c258b64a5a4624d57ccc94fe39fb753dcb671a`
был отклонён owner review: он исправлял только portrait. Итоговый result commit
`3097bb2c2e190831f647e6e74b4ba070421d1b55` исправляет также landscape и
был возвращён из owner review: боковой `DOWN` reserve всё ещё оставлял пустой
шаг между compound boundary и первой фактически занятой vertical lane.

* Portrait generator сначала создаёт компактный вариант без копирования
  бокового reserve вниз. Нижний reserve сохранён как ограниченный fallback для
  графов, которым он нужен для legal route.
* Regression до исправления получал `84 px` при пустом нижнем corridor; после
  исправления получает ровно `28 px`. Если corridor занят горизонтальным
  segment, тест требует сохранения полного резерва.
* В `RIGHT` exact-port bundle резервирует один общий track; отдельный
  side-track вариант сохранён как fallback. Route-aware hard-check отбрасывает
  candidate, если после routing нижний reserve фактически пуст.
* Visibility-grid `RIGHT` получил exact `±clearance` axes у прозрачных
  ancestor boundaries. Regression подтверждает `28 px` и внутри compound,
  и снаружи до ближайшего horizontal route.
* Предыдущие frozen proof, live evidence и benchmark относятся только к
  отклонённому результату и не являются доказательством текущего checkpoint.

## Дополнение owner review

На landscape `1920 × 1088` две reverse-flow связи из одного exact source-port
уже использовали один общий generated trunk, но placement считал их двумя
независимыми нижними tracks. Между trunk и внутренней границей, а также между
compound и ближайшим внешним horizontal route оставалось по `56 px`. Оба
расстояния теперь равны одному pitch `28 px`; separate-track fallback и полный
validator сохранены.

## Предыдущий checkpoint после повторного owner rejection

Этот раздел заменён принятым результатом NODES-008.3 выше.

* Воспроизведён точный дефект: `DOWN` Browser boundary `x=196`, занятые
  vertical lanes `x=280/308`, первый child `x=336`; первый gap был `84 px`,
  то есть содержал пустые `56 px` сверх одного pitch.
* После routing portless compound сжимается только до фактически занятых
  vertical lanes и children. Сохранённые sections затем проходят полный
  route validator на новых границах; невалидный candidate не возвращается.
  Compound с собственными semantic ports этим проходом не перемещается.
* Текущие обе открытые вкладки без перезапуска runtime имеют `15/13`, Worker
  `ready`, pending `0` и одинаковый ритм Browser
  `224 → 252 → 280 → 308 → 336`: четыре промежутка по `28 px`.
* Frozen RIGHT/DOWN: `14` нод, `20` портов, `12` рёбер; x3 repeats и три
  стабильные перестановки идентичны. RIGHT сохранён: `2365.25 × 1658`, SHA
  `2188e801…`. DOWN сохраняет общие bounds `1146.45 × 4242`, но portless
  compound boundaries сжаты; geometry SHA изменился на `35941e99…`.
* Проверки текущего checkpoint: `bun test pkg/nodes` — `86/86`; typecheck
  `@nodes/layout`, `nodes` и root — PASS; `git diff --check` — PASS.
* Benchmark на совместимом frozen input: RIGHT median `195.90 ms`, DOWN
  `581.17 ms`. Относительно отклонённого результата `180.60/479.27 ms` это
  `+8.5%/+21.3%`; отдельный performance follow-up решается владельцем после
  визуальной приёмки.
