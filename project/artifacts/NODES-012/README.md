# NODES-012 — визуальное evidence

* `owner-before.png` — screenshot владельца: leaders проходят поверх leaf-ноды,
  parent compounds затемняют дочерние карточки.
* `fixed-right-after.png` — тот же nested fixed RIGHT после исправления обоих
  SVG painting-order defects.
* `fixed-matrix-after.png` — fixed RIGHT/DOWN: parent-first node order и leaders
  под leaf-ноды.
* `adaptive-matrix-after.png` — adaptive RIGHT/DOWN: общий порядок слоёв без
  regression плоской adaptive fixture.

Browser evidence получено через точный `ai-macos` CDP target
`116F2A03988C2FA4FD5515BDAE7A83F5`. Console capture после adaptive matrix:
0 entries.
