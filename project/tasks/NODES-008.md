# NODES-008 — Не оставлять пустой маршрутный резерв внутри compound

## Коротко

Compound должен быть увеличен только под действительно занятые дорожки рёбер.
Если маршруты проходят сбоку, снизу после последнего child остаётся ровно один
шаг между сокетами, а не продублированный боковой резерв.

## Наблюдение владельца

В portrait Hamiltonian у карточки `Service Worker` внутри `Chrome` снова
появилась большая пустота снизу и по бокам. Исходный снимок и точные live-меры
описаны в [`project/artifacts/NODES-008/`](../artifacts/NODES-008/README.md).

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

## Границы

* Меняются только универсальный portrait placement/compaction
  `@nodes/layout`, его проверки и evidence.
* Exact ports, semantic edges, routing clearance, EAST/WEST gateways,
  containment, RIGHT/DOWN selection и bounded search не ослабляются.
* Боковой corridor не сжимается, если в нём действительно находятся routes.
* Не добавляются Hamiltonian IDs, ручные coordinates или fixture-specific
  offsets.
* Runtime не запускается и не перезапускается; live proof использует уже
  открытую вкладку после offline gate.

## Критерии готовности

1. Regression воспроизводит portrait compound с reverse-flow side lanes и
   пустым нижним резервом.
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
7. В открытом portrait contour нижняя пустота исчезла без сжатия занятых
   боковых lanes и без перезапуска runtime.

## Артефакты

[`project/artifacts/NODES-008/`](../artifacts/NODES-008/README.md)

## Результат

Статус: `REVIEW`.

* Portrait generator сначала создаёт компактный вариант без копирования
  бокового reserve вниз. Нижний reserve сохранён как ограниченный fallback для
  графов, которым он нужен для legal route.
* Regression до исправления получал `84 px` при пустом нижнем corridor; после
  исправления получает ровно `28 px`. Если corridor занят горизонтальным
  segment, тест требует сохранения полного резерва.
* Frozen RIGHT/DOWN: `14` нод, `20` портов, `12` рёбер; x3 repeats и три
  стабильные перестановки идентичны. Geometry SHA не изменилась:
  RIGHT `b845bae5…`, DOWN `cd8cfd53…`.
* Проверки: `bun test pkg/nodes` — `86/86`; typecheck
  `@nodes/layout`, `nodes` и root — PASS; `git diff --check` — PASS.
* Live portrait без перезапуска runtime: `15/13`, bounds
  `1846.25 × 2674`; `Chrome` `196,112,800,2450`,
  `Service Worker` `336,2150,520,384`, bottom gap `28 px`.
* Final benchmark на совместимом frozen input: RIGHT median `210.78 ms`,
  DOWN `469.36 ms`. Относительно NODES-007 (`195.81/424.73 ms`) это
  `+7.6%`/`+10.5%`; inputs и geometry hashes совпадают, порог блокировки в
  package contract не задан.
