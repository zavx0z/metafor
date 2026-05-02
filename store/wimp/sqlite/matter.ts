
import type { SQL } from "bun"
import type { MatterRelationParticle } from "./matter.t.ts"
import { getMatterParticles } from "./matter.G.ts"
import { hasMatter } from "./wimp.G.ts"
import { createMatter } from "./matter.C.ts"

export class Matter {
  constructor(
    private readonly sql: SQL,
    private readonly src: string,
  ) {}

  async create(particles: MatterRelationParticle[]): Promise<void> {
    await createMatter(this.sql, this.src, particles)
  }

  async all(): Promise<MatterRelationParticle[]> {
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
