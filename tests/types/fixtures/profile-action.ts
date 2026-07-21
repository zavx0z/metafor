export interface ProfileMass {
  profile: {id: string} | null
  attempts: number
}

export interface ProfileEnergy {
  channel: BroadcastChannel
  socket: WebSocket
}

export async function startProfile(input: {
  command: string
  mass: ProfileMass
  energy: ProfileEnergy
  field: {command: {type: "string"}}
  self: {atom: string; meta: string; path: string}
  proof?: unknown
}): Promise<{profileId: string; attempts: number}> {
  void input.energy.channel
  void input.energy.socket
  void input.field.command
  void input.self.atom
  return {
    profileId: input.mass.profile?.id ?? input.command,
    attempts: input.mass.attempts + 1,
  }
}
