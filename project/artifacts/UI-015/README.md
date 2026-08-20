# UI-015 — Артефакты Blender-wide UI form

## elements-input-before.png

* Источник: `$ui-dev` exact background canvas, route `input/state/inactive`,
  target `E2087390E08913DD8CA4142D5D9E8C48`, pre-UI-015.2 source.
* Дата: 2026-08-20; loaded Elements PID `64668`.
* Факт: story args radius `28`, production preview `460×50`, full pill
  silhouette; console `0`, native `1920×1088 @2`.
* Контрольная сумма: SHA-256
  `aa7ac15f3b3746864271ec2e07ad9b4f06a85aaebed497e432db58cfdac405d3`.

## elements-input-after.png

* Источник: тот же `$ui-dev` target/route после UI-015.2 `e6f7669bf`.
* Дата: 2026-08-20; loaded Elements PID `66578`.
* Ожидание: equal-scale production input `146×22`, radius `3`, border `1`,
  font `11`, прежняя MetaFor palette; Workbench shell пока не меняется.
* Фактическое наблюдение: ожидание совпало; story args radius `3`, console `0`,
  non-black canvas `495019` bytes, native restored. Визуальная форма приблизилась
  к Blender scalar reference `146×23`; owner acceptance остаётся отдельной.
* Контрольная сумма: SHA-256
  `6445146ec6b852767e159d9a62aff25f2c274fe816222c567b9e7fe563f8ebd5`.
