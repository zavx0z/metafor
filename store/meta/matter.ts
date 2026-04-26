import type { SQL } from "bun"
import type { MatterParticlePlan } from "@dark/types/dark"
import { getMatterParticles, hasMatter } from "./sqlite"

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
