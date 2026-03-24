# Boundary

`Boundary` — домен границы, который держит канонический store и собственный оркестратор.

## Слои

- `boundary/gravity` раскладывает входную структуру в плоскую адресуемую форму.
- `boundary/strong` собирает канонический store, дедупликацию и материализацию связности.
- `boundary/weak` вычисляет переход состояния поверх канонического store.

## Внутренняя проекция сил

- `boundary/gravity` держит доменный оркестратор силы и подпакеты `condition`, `validate`, `numeric`.
- `boundary/strong` держит доменный оркестратор силы и подпакеты `stored`, `string-table`, `entangled`, `normalize`.
- `boundary/weak` держит доменный оркестратор силы и подпакеты `runtime`, `program`, `encode`.

## Инварианты

- [store.ts](/Users/zavx0z/zavx0z/metafor/boundary/store.ts) — единственный источник истины домена.
- Слабый слой не владеет доменным store и не становится второй истиной.
- CPU и GPU остаются backend-адаптерами внутри `Boundary × Weak`.
- Межслойные производные формы не подменяют каноническую boundary-форму.

## Публичный вход

```ts
import {
  write,
  update,
  unlock,
  writeRuntimeFromSharedDb,
  addRuntimeWimpFromSharedDb,
  removeRuntimeWimp,
  rebuildRuntime,
} from "@boundary"
```

`write()` записывает каноническую структуру, `update()` вычисляет следующий переход, `unlock()` снимает блокировку.
Для `shared/db`-пути `add/remove` мутируют внутренний loaded fragment, а один `rebuildRuntime()` пересобирает derived runtime транзакционно.
