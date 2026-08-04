# MF-302 — Артефакты

## live-authoring.ts

* Источник: локальный Monad RPC contour `http://127.0.0.1:4000`.
* Дата: 2026-08-04.
* Версия проекта: `8ec7992b1`.
* RPC source: `owner/codex`.
* Чувствительные сведения: отсутствуют.

## Итоговый пользовательский путь

* `meta.create` создал полный независимый peer `zavx0z/lada-test`. Повтор
  `mf302-create-lada-test` дважды вернул тот же digest
  `sha256:6f9e263b...5310`, outcome `already_created`, source revision
  `sha256:4b4ac579...0631`, ветку `main`, пустой HEAD и `staged: false`.
* Корректный `add` принят одной Matter cause на sequence `564`. На sequence
  `570` Boundary создал Atom `id=6`; Graph показал путь
  `zavx0z/lada -> zavx0z/lada-test` и включил child template.
* `move` принят одной Matter cause на sequence `575`. Boundary consequence
  `576` перенёс тот же Atom `id=6`; Graph показал путь
  `zavx0z/lada -> zavx0z/lada-chat -> zavx0z/lada-test`. Точный повтор вернул
  ту же acceptance `visual-cloud-20260731:575`, `already_published` и
  `materialization: applied`.
* `remove` принят одной Matter cause на sequence `583`. Точный повтор вернул ту
  же acceptance; Boundary удалил occurrence `id=6`, а после sequence `594`
  Atom, Graph path и template `lada-test` отсутствуют.

## Возврат исходного состояния

* `zavx0z/lada/meta.ts`:
  `718536ff8de36cc82030c593a9b8800b52067e3039158216733cb67ea3b5fff5`.
* `zavx0z/lada-chat/meta.ts`:
  `e212020680fc6c69b214ee05703c88af9e76c345c3dfc3de993f91204c986455`.
* `zavx0z/lada-test/meta.ts` остался неизменным:
  `4b4ac579fc397b88d013945c3e3b867065cd9650c6a7743e2d3f73e277b70631`.
* Candidate, rollback и source lock artifacts отсутствуют. Peer `lada-test`
  не удалён, не staged и не закоммичен.

## Persistence и повтор

Отдельный operation journal не создан. Matter acceptance хранится только в
существующих строках Force history вместе с RPC source, operationId, digest и
source revisions. Итоговый аудит нашёл по одной строке для `419`, repair `557`,
корректного add `564`, move `575` и remove `583`; повторов operationId нет.
Checkpoint control после sequence `594` вернул пустой список незакрытых
deliveries.

Create не создаёт фиктивную Particle: точный существующий target является
source-only доказательством `already_created`.

## Обнаруженные и исправленные разрывы

* Bulk больше не применяет структурный Inflaton как готовый relational
  Graviton.
* Startup восстанавливает незакрытую delivery точной Particle из immutable
  Force history только в домены без applied receipt, без новой acceptance.
* Source projector применяет accepted Matter patch напрямую. Родительский
  live world и parent source повторно не читаются; для нового reachable child
  загружается только его декларационное поддерево.
* `remove` несёт canonical child `src`, поэтому recovery не выводит его из
  текущего мира.
* Декларационный loader исполняет актуальные байты `meta.ts` как новый
  Blob-модуль. Bun module cache больше не скрывает опубликованный source от
  `readGraph`.
* Повтор завершённого `move` распознаёт уже существующий destination edge и не
  требует удалённый source edge.

## Неизменяемая ранняя история

Первая попытка add была устойчиво принята на sequence `419` старой версией
реализации. Во время диагностики прежний reconcile, который перечитывал
родителя и строил новый diff, породил ошибочные derived rows `420-556`.
Исправление состояния выполнено отдельным RPC repair на `557`; старая версия
projector также успела породить повторный teardown `558-563`. Эти строки не
скрывались и не переписывались. После исправлений чистый доказательный цикл
начинается с add `564`.

## Проверки

* Живой contour после полного перезапуска: все шесть health endpoints healthy,
  Force `running`, ingress `open`.
* Целевые проверки loader, Graph, Dark projection, Matter service, Bulk Store,
  checkpoint и lifecycle прошли.
* `bun run check`: `2142 pass`, `0 fail`, `85784 expect()`; typecheck и 42
  ожидаемых type-error proof также прошли.
