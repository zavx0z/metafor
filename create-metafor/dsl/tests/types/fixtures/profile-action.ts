import type {MassHandle} from "@metafor/types/metafor/mass"

export interface ProfileMass {
  profile: MassHandle
  attempts: MassHandle
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
    profileId: input.command,
    attempts: 1,
  }
}
