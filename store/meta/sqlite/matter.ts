/**
 * Сущность `matter_binding` + `matter_particle` (+ wimp/fuzzy/axion/macho)
 * в DSL-relational схеме.
 *
 * Якорный файл сущности — под ним группируются:
 * - `matter.sql` — DDL (6 таблиц: matter_binding, matter_binding_dep,
 *   matter_particle, matter_particle_wimp, matter_particle_fuzzy,
 *   matter_particle_axion, matter_particle_macho)
 * - `matter.t.ts` — типы (BindingValue, ParticleKind, EdgeSlot, BindingRow,
 *   ParticleRow, WimpParticleRow, FuzzyParticleRow, AxionParticleRow,
 *   MachoParticleRow, FieldUuidByKey)
 * - `matter.C.ts` — `createMatter(db, meta, src, fieldUuids)` (двухпроходная запись)
 * - `matter.G.ts` — `getMatterParticles(db, src)`
 */

export {}
