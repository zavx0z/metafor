# NODES-017 — Артефакты

## blender-4.5.5-reference.png

* Источник: owner-provided screenshot локального Blender 4.5.5 LTS и
  изолированного `/tmp/blender-node-reference.blend`.
* Дата: 2026-08-19.
* Ожидание: реальный Node Editor с Frame, Node controls, Socket и Links.
* Фактическое наблюдение: screenshot показывает настоящий desktop reference;
  он принят как visual baseline с явными исключениями для project font и
  ортогональных Links.
* Контрольная сумма: SHA-256
  `a493e1c03591800bb05644963369fca49669aa27f98e67a9971fd91735f2531d`.

## rejected-playground.png

* Источник: точный canvas PNG отклонённого владельцем playground NODES-016.
* Дата: 2026-08-19.
* Фактическое наблюдение: Frame отсутствует; container притворяется Node;
  Socket labels/controls конфликтуют, visual density и hierarchy несогласованы.
* Контрольная сумма: SHA-256
  `0fa6af2a527d5c721fea14fb17c5e8b82d50cb635e2c95b9c744169dc179ad38`.

## blender-research.md

* Источник: официальные Blender 4.5 source/API/rendered Manual и локальный
  bounded offline Manual snapshot; точные revisions указаны внутри.
* Назначение: evidence и defect/contract matrix для реализации NODES-017.

## frame-checkpoint.png

* Источник: exact WebGPU canvas после NODES-017.2.
* Ожидание: отдельный Frame без Node header/body; Frame background под Links и
  пять обычных Node поверх.
* Фактическое наблюдение: Frame отделён от Node component и paint order верен.
  Старые дефекты Parameter rows остаются и принадлежат NODES-017.3.
* Контрольная сумма: SHA-256
  `acf2d478ebf52a0c81d9793def59ac9bbe2143f2d931768b2c9a2a92410023c2`.

## two-sided-parameter-checkpoint.png

* Источник: exact WebGPU canvas после NODES-017.3.
* Ожидание: Matrix Parameter рисуется один раз, а разные Socket стоят слева и
  справа на одной Flex row; catalog содержит 8 source shapes.
* Фактическое наблюдение: один Matrix control имеет два exact endpoint на одной
  высоте; Field не дублируется. Visual density остаётся отдельным незавершённым
  срезом.
* Контрольная сумма: SHA-256
  `41752d246d0dc56176d6ee9376bb095a1564bd29ca6c1a8a86a4e6df8caabe7f`.

## visual-rhythm-checkpoint.png

* Источник: exact WebGPU canvas после NODES-017.4.
* Ожидание: dot grid, category headers, compact controls, connected-state rows,
  nested Frame, collapsed Node и отсутствие label/control overlaps.
* Фактическое наблюдение: перечисленные states видимы; linked Parameters
  показывают label без default control; nested Frame и collapsed Node отдельны;
  exact endpoints сохранены. Link selection и mobile не входят в этот proof.
* Контрольная сумма: SHA-256
  `fd2791cf9850dd18fcf8c0089b280094fc25d0628cd99a5eb9de2893dbecf31f`.

## link-selection-checkpoint.png

* Источник: exact WebGPU canvas NODES-017.5; DOM selection
  `kind=link`, `id=matrix-shader`.
* Ожидание: выбранный ортогональный Link рисуется последним и отличается от
  ordinary Links, сохраняя exact route/endpoints.
* Фактическое наблюдение: полный right-loop маршрут визуально утолщён и остаётся
  под Node; Frame hit area не блокирует Link selection.
* Контрольная сумма: SHA-256
  `4c380f703b0f290680bfaf2a47a35834da76f1e246146c4e0412ff6ee972726e`.

## mobile-portrait-emulation.png

* Источник: exact canvas Chrome mobile emulation `390×844`, фактический DPR 2.
* Ожидание: только NodeEditor, full-scene overview, без horizontal overflow и
  unreadable control collisions.
* Фактическое наблюдение: `inner/scroll=390×844`, вся scene и nested Frame
  видимы; overview LOD оставляет headers, Socket и Links.
* Контрольная сумма: SHA-256
  `a718e01f2e22d390cb8b408628f6e574b79854995a4eb70370b7d05814f795c0`.

## mobile-landscape-emulation.png

* Источник: exact canvas Chrome mobile emulation `844×390`, DPR 2.
* Ожидание: height breakpoint оставляет только NodeEditor и не включает desktop
  catalog matrix.
* Фактическое наблюдение: `inner/scroll=844×390`, full scene помещается и
  остается читаемой в landscape.
* Контрольная сумма: SHA-256
  `4fa99340d6a13a441222421a426e3b9dd084542486d364a9740e4e2d79c2bff9`.

## final-captures/

* Источник: corrected `$node-system-dev` viewport matrix на long-lived PTY
  server PID 64921 и exact target `1E982…`.
* Состав: `node-system-desktop.png`, `node-system-portrait.png`,
  `node-system-landscape.png`, `node-system-live-comparison.png`.
* Фактическое наблюдение: DOM ready, horizontal overflow отсутствует, console
  0 во всех viewports; native metrics `1920×1088 @2` восстановлены.
* `node-system-live-comparison.png`: desktop Flex split с крупным cropped
  Blender reference и live MetaFor editor; SHA-256
  `c4055509a2ed4d3db51cf31700b9d2c9f5579f181cb0f5d9ac1211cdf519b2a6`.

## visual-comparison.md

* Назначение: per-area Blender/MetaFor matrix с отдельными `match`, project
  divergence, project extension и открытыми gates.
