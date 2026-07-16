export type EnergyMassContext = {
  energyId: string
  atomId: number
  wimp: string
  state: string
}

export type EnergyMassStore = {
  get(ctx: EnergyMassContext): Record<string, unknown>
  clear?(): void
}
