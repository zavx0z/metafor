# @metafor/elements flexCss — browser-like immediate layout

`flexCss` — небольшой browser-like adapter поверх immediate-mode `flex.ts`.
Цель — давать прикладному коду (журналы, шаблонизаторы, presentation-режимы,
editor overlay'и) предсказуемую раскладку в терминах, привычных по CSS:
**px, %, fr/grow, padding, gap, align, justify**.

## Что это и что это НЕ

| Слой | Файл | Что умеет |
| --- | --- | --- |
| Low-level primitive | `ui/elements/flex.ts` (`flexRow`, `flexColumn`) | px main-axis + `"grow"` поровну, px cross-axis |
| Browser-like adapter | `ui/elements/flexCss.ts` (`flexRowCss`, `flexColumnCss`) | px, `%`, `fr` (с весами), `grow`/`auto`, padding, gap, align, justify |

Это **не полный CSS Flexbox**: нет intrinsic layout, `flex-shrink`,
wrapping, baseline, `min-content`/`max-content`. Нам нужен компактный,
предсказуемый subset для WebGPU UI.

| API | number | percent | fr (с весами) | use case |
| --- | ---: | ---: | ---: | --- |
| `flexRow` / `flexColumn` | px | — | только `"grow"` (поровну) | low-level pixel-precise widgets |
| `flexRowCss` / `flexColumnCss` | px | да | да | templates, magazines, editor, overlay |

`flex.ts` остаётся самостоятельным primitive — его никто не ломает.
Используйте его там, где раскладка делается «по пикселям» (тулбары,
бейджи, чипы). Для шаблонов, журнальных полос и runtime-композиций
берите `flexCss`.

## UiSize

```ts
type UiSize =
  | number
  | "grow"
  | "auto"
  | `${number}%`
  | `${number}fr`
  | { px: number }
  | { percent: number }
  | { ratio: number }
  | { fr: number }
```

| Запись | Значение |
| --- | --- |
| `120` | 120 logical px |
| `{ px: 120 }` | 120 logical px |
| `"42%"` | 42% от parent axis (inner после padding) |
| `{ percent: 42 }` | то же |
| `{ ratio: 0.42 }` | то же (0..1 как доля) |
| `"1fr"` | одна доля остатка |
| `"2fr"` | две доли остатка |
| `{ fr: 1 }` | то же |
| `"grow"` | alias для `"1fr"` |
| `"auto"` | пока alias для `"grow"`; intrinsic auto-size не реализован |

**Важно:** `number` остаётся **logical px**, как и в низкоуровневом `flex.ts`.
Не интерпретируем `0.42` как «42%». Чтобы попросить процент — пишите явно
`"42%"` или `{ percent: 42 }` / `{ ratio: 0.42 }`.

## API

```ts
flexRowCss({
  x, y, w, h,
  paddingX?, paddingY?, paddingLeft?, paddingRight?, paddingTop?, paddingBottom?,
  gap?,
  alignItems?, justifyContent?,
  items: [{ width: UiSize, height?: UiSize, alignSelf?, draw }, ...]
})

flexColumnCss({
  // те же поля, но main-axis = height
  items: [{ height: UiSize, width?: UiSize, alignSelf?, draw }, ...]
})
```

Cross-axis (`height` у row, `width` у column) опционален; по умолчанию
**stretch** к inner box. `null | undefined | false` в items автоматически
фильтруются — удобно для условных слотов.

## Алгоритм

Для каждого main-axis размера определяется класс: `px`, `percent` или `fr`.

1. Inner box = `(x + padL, y + padT)`, ширина `w - padL - padR`, высота
   `h - padT - padB`.
2. `px` остаётся как есть; `percent` считается **от inner axis**;
   `fr` пока даёт 0.
3. `totalGap = gap * (items.length - 1)` вычитается из inner axis.
4. `remaining = inner - sum(px) - sum(percent) - totalGap`.
5. Каждой `fr`-секции даётся `remaining * fr_i / sum(fr)`.
6. `justifyContent` срабатывает только если **нет `fr` items**
   (классическое поведение flexbox для `flex-grow: 0`).
7. Cross-axis: если значение не задано или это `fr/grow/auto` — stretch
   к inner cross. `percent` считается от inner cross, `px` — как есть.
   `alignSelf` имеет приоритет над `alignItems`.

## Примеры

### 1. Две колонки 42 / 58

```ts
flexRowCss({
  x: 0,
  y: 0,
  w: this.rectW,
  h: this.rectH,
  items: [
    { width: "42%", draw: (x, y, w, h) => this.drawRect(x, y, w, h, leftColor) },
    { width: "58%", draw: (x, y, w, h) => this.drawRect(x, y, w, h, rightColor) },
  ],
})
```

При `rectW = 1000` левая колонка — 420 px, правая — 580 px.

### 2. Fixed + fr

```ts
flexRowCss({
  x: 0,
  y: 0,
  w: this.rectW,
  h: 80,
  gap: 12,
  items: [
    { width: 180,   draw: drawLogo },
    { width: "1fr", draw: drawTitle },
    { width: 120,   draw: drawPageNumber },
  ],
})
```

При `rectW = 1000`: `remaining = 1000 - 180 - 120 - 2*12 = 676`, поэтому
title получает 676 px, а ширина gap не «съедает» проценты — они считаются
от inner width.

### 3. Журнальная страница

```ts
flexColumnCss({
  x: 0,
  y: 0,
  w: page.w,
  h: page.h,
  items: [
    { height: "12.3%", draw: drawHeaderSlots },
    { height: "80.1%", draw: drawBodyGrid },
    { height: "7.6%",  draw: drawFooterSlots },
  ],
})
```

Проценты складываются ровно в 100%, страница делится без зазоров.

### 4. Вложенная сетка (page 04)

```ts
flexColumnCss({
  x, y, w, h,
  items: [
    { height: "18.5%", draw: drawHero },
    {
      height: "74%",
      draw: (x, y, w, h) =>
        flexRowCss({
          x, y, w, h,
          gap: 0,
          items: [
            { width: "52%", draw: drawLeftColumn },
            { width: "48%", draw: drawRightColumn },
          ],
        }),
    },
  ],
})
```

### 5. Веса fr

```ts
flexRowCss({
  x: 0,
  y: 0,
  w: 1000,
  h: 200,
  items: [
    { width: 240,   draw: drawSidebar },
    { width: "1fr", draw: drawMain },
    { width: "2fr", draw: drawAside },
  ],
})
```

`remaining = 760`; main получает `760/3 ≈ 253.33`, aside — `2*760/3 ≈ 506.67`.

## Best practices

- Для pixel-precise widget'ов (тулбар, чипы, бейджи) используйте
  `flexRow` / `flexColumn`.
- Для шаблонов, журналов, editor-режимов и runtime overlay — `flexRowCss`
  / `flexColumnCss`.
- Предпочитайте явные `"42%"` / `{ percent: 42 }` over `0.42` — на уровне
  публичного UI API это однозначно.
- `fr` используйте, когда нужно распределить именно остаток после
  фиксированных секций.
- Не смешивайте «обрезанную» текстуру и full-texture layout: фон —
  это целая текстура страницы, а `flexCss` распределяет overlay-слоты
  поверх неё.
- Для журнала `/main` ничего не отрезайте: фон = full texture, overlay-слоты
  считаются через `flexCss` поверх.

## Связанные файлы

- `ui/elements/flex.ts` — низкоуровневый primitive
- `ui/elements/flexCss.ts` — этот adapter
- `ui/elements/flexCss.test.ts` — unit-тесты
