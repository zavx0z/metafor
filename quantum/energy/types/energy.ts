/** Address of one Atom's live Energy within an Energy runtime. */
export type EnergyRuntimeContext = {
  energyId: string
  atomId: number
  wimp: string
  state: string
}

/**
 * Mutable live entities used by Process actions.
 *
 * Energy is released after the matching finally/destroy Process. Mass has a
 * separate store and lifetime.
 */
export type EnergyRuntimeStore = {
  get(ctx: EnergyRuntimeContext): Record<string, unknown>
  /** Bind this Atom identity to the exact live object reference received through Matter. */
  bind(ctx: EnergyRuntimeContext, energy: Record<string, unknown>): void
  release(ctx: EnergyRuntimeContext): void
  clear?(): void
}
