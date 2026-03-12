# Dark

`Dark` — минимальная явная репозиторная проекция скрытой структурной непрерывности MetaFor.

Этот каталог не является runtime-оркестратором.
Он не дублирует `boundary/` и `bulk/`.
Силовые пакеты `dark/gravity`, `dark/strong`, `dark/weak` и `dark/em` существуют как каркас доменных ролей, а не как функциональные зеркала других доменов.

## Что закреплено за `Dark`

1. schema continuity и организация семейства схем,
2. model fixed states как скрытая непрерывность, а не как boundary-runtime snapshot,
3. structured changes и patch-like evolution,
4. historical continuity, version lineage и скрытый graph преемственности,
5. hidden hierarchy и latent organization,
6. projection contracts из скрытого слоя в `Boundary` и `Bulk`.

## Силовые пакеты `Dark`

1. `dark/gravity` — скрытая иерархия, schema graph и latent organization.
2. `dark/strong` — continuity, fixed states и structural consistency.
3. `dark/weak` — structured changes, patch-like evolution и переход между версиями модели.
4. `dark/em` — projection contracts и вынесение скрытого изменения в сигнальную форму.

Пока это только package-level каркас без runtime-функционала.

## Что не должно появляться в `Dark`

1. flattening и canonical geometry из `Boundary × Gravity`,
2. deduplication, string interning и канонический store из `Boundary × Strong`,
3. вычисление transition runtime-состояния из `Boundary × Weak`,
4. manifested actor topology из `Bulk × Gravity`,
5. process execution и загрузка action-модулей из `Bulk × Weak`.

## Как читать текущий репозиторий

1. `boundary/boundary.ts` остаётся доменным оркестратором канонической записи и перехода.
2. `boundary/strong/snapshot/*` остаётся boundary-снимком, достаточным для восстановления boundary-формы.
3. `bulk/gravity/load.ts` пока ещё грузит `meta.json` напрямую; это переходный shortcut, а не окончательное владение скрытой структурой.
4. `bulk/gravity/store/*` выражает уже проявленную hierarchy runtime-акторов, а не latent organization `Dark`.

## Первые целевые срезы

1. continuity contract между `DSL/AST` и доменными проекциями,
2. fixed states модели отдельно от boundary snapshot,
3. lineage / version graph,
4. structured change / patch layer,
5. projection contracts `Dark -> Boundary` и `Dark -> Bulk`.
