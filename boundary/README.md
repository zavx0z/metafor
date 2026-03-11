# Boundary

`Boundary` — домен границы, который держит канонический store и собственный оркестратор.

## Слои

- `boundary/gravity` раскладывает входную структуру в плоскую адресуемую форму.
- `boundary/strong` собирает канонический store, дедупликацию, материализацию связности и восстановление snapshot.
- `boundary/weak` вычисляет переход состояния поверх канонического store.
- `boundary/em` остаётся межграничной фасадной проекцией переноса boundary-снимков.

## Внутренняя проекция сил

- `boundary/gravity` держит доменный оркестратор силы и подпакеты `condition`, `validate`, `numeric`.
- `boundary/strong` держит доменный оркестратор силы и подпакеты `stored`, `string-table`, `entangled`, `snapshot`, `normalize`.
- `boundary/weak` держит доменный оркестратор силы и подпакеты `runtime`, `program`, `encode`.

## Инварианты

- [store.ts](/Users/zavx0z/zavx0z/metafor/boundary/store.ts) — единственный источник истины домена.
- Слабый слой не владеет доменным store и не становится второй истиной.
- CPU и GPU остаются backend-адаптерами внутри `Boundary × Weak`.
- Межслойные производные формы не подменяют каноническую boundary-форму.

## Публичный вход

```ts
import { write, update, unlock, reset } from "@boundary"
```

`write()` записывает каноническую структуру, `update()` вычисляет следующий переход, `unlock()` снимает блокировку, `reset()` очищает домен.

## Совместимость

- [strong/dump/README.md](/Users/zavx0z/zavx0z/metafor/boundary/strong/dump/README.md) описывает dump-проекцию снимка внутри `strong`.
