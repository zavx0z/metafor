export type EnergyMassContext = {
  energyId: string
  atomId: number
  wimp: string
  state: string
}

export type EnergyMassStore = {
  get(ctx: EnergyMassContext): Record<string, unknown>
  /** Bind this Atom identity to the exact object reference received through Matter. */
  bind(ctx: EnergyMassContext, mass: Record<string, unknown>): void
  clear?(): void
}
