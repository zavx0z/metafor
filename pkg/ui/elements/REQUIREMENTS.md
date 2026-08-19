# Требования @ui/elements

`@ui/elements` владеет UI primitives, immediate-mode Flex и browser-like
Flex adapter. Этот документ задаёт обязательный layout law для всего UI
репозитория.

## Обязательный Flex-закон

1. Любая композиция двух и более дочерних UI slots строится только через
   `flexRow`, `flexColumn`, `flexRowCss` или `flexColumnCss`.
2. Прикладному UI запрещено заменять недостающую возможность Flex ручными
   cursor loops, вычислением column/row offsets, процентной арифметикой rects
   или fixture-specific координатами.
3. Если действующий Flex не выражает нужную композицию, сначала расширяется его
   общий API и pure layout implementation, затем добавляются unit tests и
   документация, и только после этого возможность используется component-ом.
4. Flex extension обязана оставаться deterministic pure math без renderer,
   domain и component vocabulary.
5. Низкоуровневые primitive drawing operations могут получать точные x/y/w/h
   после Flex callback. Ручные coordinates также допустимы для внешней scene
   geometry: positioned Nodes, exact Socket centers, Link routes, mesh vertices.
   Эти данные не являются UI child-layout.
6. Surface-to-display placement также планируется общим Flex/FlexCss helper,
   если одновременно размещается несколько UI surfaces.
7. Structural tests каждой новой UI-системы доказывают использование Flex на
   уровне page/region, component и вложенных controls.

## Выбор primitive

* `flexRow`/`flexColumn` — pixel-precise controls и заранее измеренные slots.
* `flexRowCss`/`flexColumnCss` — responsive regions, `%`, `fr`, `grow`, `auto`.
* Nested composition выражается nested Flex callbacks, а не вычислением offsets
  между соседними children.

Подробная форма browser-like API находится в [`docs/flex-css.md`](docs/flex-css.md).
