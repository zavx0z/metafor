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
 *
 * ORM-класс `Matter` — в этом файле; tree-структура `MatterParticlePlan`
 * рекурсивна, поэтому `all()` использует bulk-loader (исключение).
 */

import type { SQL } from "bun"
import type { MatterParticlePlan } from "@dark/types/dark"
import { getMatterParticles } from "./matter.G.ts"
import { hasMatter } from "./meta.G.ts"

/** Django-style manager для matter-particle-plans одной меты. */
export class Matter {
  constructor(
    private readonly sql: SQL,
    private readonly src: string,
  ) {}

  /** Все root-level particle plans (вложенные — через `.children` каждого plan-а). */
  async all(): Promise<MatterParticlePlan[]> {
    if (!(await hasMatter(this.sql, this.src))) return []
    return getMatterParticles(this.sql, this.src)
  }

  async count(): Promise<number> {
    if (!(await hasMatter(this.sql, this.src))) return 0
    return (await getMatterParticles(this.sql, this.src)).length
  }

  async exists(): Promise<boolean> {
    return hasMatter(this.sql, this.src)
  }
}
