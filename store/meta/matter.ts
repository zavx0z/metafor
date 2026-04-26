import type { Database } from "bun:sqlite"
import type { MatterParticlePlan } from "@dark/types/dark"
import { getMatterParticles, hasMatter } from "./sqlite"

/** Django-style manager для matter-particle-plans одной меты. */
export class Matter {
  constructor(
    private readonly db: Database,
    private readonly src: string,
  ) {}

  /** Все root-level particle plans (вложенные — через `.children` каждого plan-а). */
  all(): MatterParticlePlan[] {
    return hasMatter(this.db, this.src) ? getMatterParticles(this.db, this.src) : []
  }

  count(): number {
    return hasMatter(this.db, this.src) ? getMatterParticles(this.db, this.src).length : 0
  }

  exists(): boolean {
    return hasMatter(this.db, this.src)
  }
}
