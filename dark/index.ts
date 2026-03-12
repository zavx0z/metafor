/**
 * `dark/` — минимальная явная проекция домена скрытой структурной непрерывности.
 *
 * Здесь не должно появляться:
 * - boundary canonicalization и deduplication
 * - boundary runtime transition
 * - bulk runtime execution
 *
 * Здесь должны закрепляться:
 * - schema continuity
 * - fixed states модели
 * - structured changes
 * - lineage и projection contracts
 *
 * Силовые пакеты `dark/*` существуют как структурный каркас домена,
 * но пока не содержат функциональной реализации.
 *
 * @packageDocumentation
 */

export {}
