# UI-010 — Артефакты

## components-field-number.png

* Источник: `$ui-dev` renderer-activity desktop capture `field/number/input`,
  target `D0775AE44CFF0E299A0C28EECB3872D2`.
* Дата: 2026-08-20.
* Версия проекта: UI-011.3 `b1a113491`, NumberInput `99f80c0e2`.
* Ожидание: production `Field → NumberInput`, TypeScript/copy и controls видны;
  route ready, console `0`, native metrics восстановлены.
* Фактическое наблюдение: ожидание совпало; capture non-black.
* Чувствительные сведения: отсутствуют.
* Контрольная сумма: SHA-256
  `212ddf69bdbe67bb7215740e3560a75cb178ed741777bf8af8105207b13d73fe`.

## components-field-color.png

* Источник: `$ui-dev` ready desktop capture `field/color/input`, тот же target.
* Дата: 2026-08-20.
* Версия проекта: UI-011.3 `b1a113491`, ColorInput `c935de436`.
* Ожидание: production `Field → ColorInput`, swatch/RGBA и TypeScript/copy
  видны; route ready, console `0`.
* Фактическое наблюдение: первый `starting` кадр отклонён; сохранён ready
  non-black capture.
* Чувствительные сведения: отсутствуют.
* Контрольная сумма: SHA-256
  `ed1610346a91630c1df48a0e822db09f7f1eb977b5c783b2b4ce0b3de842361d`.

## components-field-vector.png

* Источник: `$ui-dev` renderer-activity desktop capture `field/vector/default`,
  тот же target.
* Дата: 2026-08-20.
* Версия проекта: UI-011.3 `b1a113491`, VectorInput `b926baf00`.
* Ожидание: production `Field → VectorInput`, XYZ и TypeScript/copy видны;
  route ready, console `0`, native metrics восстановлены.
* Фактическое наблюдение: ожидание совпало; capture non-black.
* Чувствительные сведения: отсутствуют.
* Контрольная сумма: SHA-256
  `e7ddf87392c982d683c952f2b685ca5263ae524155f66b0054db0a4603d2b838`.
