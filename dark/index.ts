/**
 * `@dark` — публичный API скрытого graph/domain слоя MetaFor.
 *
 * Домен `Dark` — скрытый субстрат структуры, памяти, иерархии, истории и эволюции модели.
 * Не является runtime-оркестратором и не дублирует `boundary/` или `bulk/`.
 *
 * **Ответственность `Dark`:**
 * - store of graph structure — хранение структуры графа
 * - schema loading и dark-side holding `DSL/AST` — загрузка схем
 * - path formation, path API, address API — формирование путей и адресов
 * - graph lookup API и linked flat representation — поиск и плоское представление
 * - hidden hierarchy и graph flattening — скрытая иерархия и уплощение
 * - projection contracts из `Dark` в `Boundary` и `Bulk` — контракты проекции
 *
 * **Рабочий контур:**
 * ```text
 * DSL -> AST -> Dark
 * Dark -> Boundary
 * Dark -> Bulk
 * Boundary -> Electromagnetism -> Bulk
 * ```
 *
 * @see {@link https://github.com/zavx0z/metafor/blob/main/docs/ONTOLOGY.md | ONTOLOGY.md} — онтология доменов
 * @see {@link https://github.com/zavx0z/metafor/blob/main/docs/ARCHITECTURE.md | ARCHITECTURE.md} — архитектурная проекция
 * @see {@link https://github.com/zavx0z/metafor/blob/main/docs/TOPOLOGY.md | TOPOLOGY.md} — формализация topology
 * @see {@link https://github.com/zavx0z/metafor/blob/main/dark/README.md | dark/README.md} — ответственность `Dark`
 */

export { matter, resetDark, restoreDark, snapshotDark, setMeta, getMeta } from "./dark"
export { dark$ } from "./store"
export type { Address } from "./dark.t"
export type { DarkStore, DarkStoreSnapshot } from "./store.t"
