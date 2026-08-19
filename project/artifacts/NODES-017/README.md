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
