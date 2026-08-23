import type {ProfileEnergy, ProfileMass} from "./profile-action.ts"

export async function releaseProfile(input: {
  mass: ProfileMass
  energy: ProfileEnergy
  proof?: unknown
}): Promise<void> {
  input.energy.socket.close()
  input.energy.channel.close()
  await input.mass.profile.write(null)
}
