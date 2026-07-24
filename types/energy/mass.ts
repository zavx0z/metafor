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
  /** Boundary projection grants the exact key files this Atom may open. */
  authorize?(ctx: EnergyMassContext, artifacts: readonly import("./catalog.ts").EnergyMassArtifact[]): void
  clear?(): void
}
