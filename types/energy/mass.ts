export type EnergyMassContext = {
  energyId: string
  actorId: number
  wimp: string
  state: string
}

export type EnergyMassStore = {
  get(ctx: EnergyMassContext): Record<string, unknown>
  clear?(): void
}
