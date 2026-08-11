# NODES-003 — Артефакты

Источник — детерминированный двухвкладочный contour из текущего незавершённого
среза `MF-424.3`. Exact numeric fixture
[`two-tab-layout-portrait.json`](two-tab-layout-portrait.json) имеет SHA-256
`27c0155999cec911e1479a3418f0b462c1d03a74f65da2fa36b19155b14be78d` и содержит
`14` нод, `20` портов и `12` semantic edges.

До исправления исходный bounded run на viewport `722 × 1088` возвращал:

```text
NO_LEGAL_LAYOUT: 32/46 placements provide no legal route graph
```

Незакоммиченный fallback-эксперимент воспроизводил:

```text
NO_LEGAL_LAYOUT: 30/46 placements provide no legal route graph;
first route failure: NO_LEGAL_ROUTE service-worker-controller:page:
fixed rectangles provide no corridor at clearance 28000
```

[`placements-diagnostic-before.json`](placements-diagnostic-before.json) и
[`placements-diagnostic.json`](placements-diagnostic.json) построены одним
[`diagnose-placements.ts`](diagnose-placements.ts). До исправления полный проход
давал `0/46` routable placements, SHA-256 отчёта
`d14645147a98f45ca2fac08e6e45203a632fe13f72490f0f2bfb0941c105e8e5`.
После исправления — `4/46`, SHA-256
`af0266006afb77d4d1a582bac03b2e37f793b88369101d30720e2fb2f1261b4e`;
следовательно, ограничение `32` кандидатов и fallback не являются причиной.

Причина: portrait compaction сначала получал правильную высоту занятого
межрядного corridor, а затем заменял её обычным `nodeSpacing`. Исправление не
ослабляет clearance и не меняет router: compaction повторно применяет размер
только реально пересекаемого corridor к соседним рядам.

[`verification.json`](verification.json) построен
[`verify-fixture.ts`](verify-fixture.ts). Для `RIGHT 1088×722` geometry hash —
`e44d8456ab393df43db3a0b6ea6619cedd6aaf91e28ef0c4868d7e10f600dd29`, для
`DOWN 722×1088` —
`0341cfbdf1e032e9d89951c9efecd85b8dabdb2ae468de16bb6f1add3d9f0eed`.
В обоих режимах совпадают три повтора и три стабильные перестановки массивов.

[`benchmark-current.json`](benchmark-current.json) построен
[`benchmark.ts`](benchmark.ts) на том же frozen input и Bun `1.3.14`. После двух
warmups выполнено по `10` samples:

| Режим | min, ms | median, ms | max, ms |
| --- | ---: | ---: | ---: |
| `RIGHT` | 150.59 | 179.80 | 222.92 |
| `DOWN` | 368.79 | 403.38 | 509.55 |

Это первый baseline именно для двухвкладочного input; historical
одно-вкладочные measurements нельзя использовать как прямое сравнение.

Runtime, browser, canvas и Worker transport для этой диагностики не нужны.
Симметричная lifecycle-сходимость вкладок остаётся отдельной проверкой
`MF-424.3`.
