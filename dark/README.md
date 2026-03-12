# Dark

`Dark` — явная репозиторная проекция домена graph/store/path/address MetaFor.

Этот каталог не является runtime-оркестратором.
Он не дублирует `boundary/` и `bulk/`.
Силовые пакеты `dark/gravity`, `dark/strong`, `dark/weak` и `dark/em` читаются как доменные ownership-слои, а не как функциональные зеркала downstream-доменов.

## Что закреплено за `Dark`

1. store of graph structure,
2. schema loading и dark-side holding `DSL/AST`,
3. path formation, path API, address API и primary addressing,
4. graph lookup API и linked flat representation,
5. hidden hierarchy и graph flattening с сохранением отношений,
6. projection contracts из `Dark` в `Boundary` и `Bulk`.

## Силовые пакеты `Dark`

1. `dark/gravity` — schema loading, graph geometry, path formation и primary addressing.
2. `dark/strong` — graph cohesion, relation retention и stable linked flat form.
3. `dark/weak` — structural transformation path и graph transition preparation.
4. `dark/em` — projection contracts и export подготовленного graph state.

В текущем срезе здесь уже есть рабочий `dark/store`, path/address lookup API,
bootstrap graph loading через `dark/gravity` и downstream projections для `Boundary` и `Bulk`.
Полный runtime для `Dark × Strong` и `Dark × Weak` ещё не выделен отдельно.

## Что не должно появляться в `Dark`

1. flattening и canonical geometry из `Boundary × Gravity`,
2. deduplication, string interning и канонический store из `Boundary × Strong`,
3. вычисление transition runtime-состояния из `Boundary × Weak`,
4. manifested actor topology из `Bulk × Gravity`,
5. process execution и загрузка action-модулей из `Bulk × Weak`.

## Как читать текущий репозиторий

1. `boundary/boundary.ts` остаётся доменным оркестратором канонической записи и перехода.
2. `boundary/strong/snapshot/*` остаётся boundary-снимком, достаточным для восстановления boundary-формы.
3. `dark/gravity` временно использует `meta.json` как bootstrap source, но владение этим входом уже закреплено за `Dark`.
4. `bulk/gravity/load.ts` читает dark-owned contract и больше не является первичным source loader.
5. `bulk/gravity/store/*` выражает уже проявленную hierarchy runtime-акторов, а не latent organization `Dark`.

## Первые целевые срезы

1. store of graph structure и linked flat representation,
2. path/address API и graph lookup API,
3. fixed states модели отдельно от boundary snapshot,
4. structured change / patch layer,
5. projection contracts `Dark -> Boundary` и `Dark -> Bulk`.
