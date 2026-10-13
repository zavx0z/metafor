import type {MassHandle} from "@metafor/types/metafor/mass"

/** Canonical selection references only; profile import and native resource effects belong to their owners. */
export default async function recordWorkspaceConfiguration(input: Readonly<{
  profileName: string | null
  saveId: string | null
  templatePath: string | null
  mass: Readonly<{configuration: MassHandle}>
  signal: AbortSignal
}>) {
  input.signal.throwIfAborted()
  if (input.saveId !== null && !input.saveId.trim()) throw new Error("Capsule immutable save identity must be nonempty")
  if (input.templatePath !== null && !input.templatePath.split("/").every(part => part !== "." && part !== ".." && /^[a-zA-Z0-9._-]+$/u.test(part))) throw new Error("Invalid Capsule explicit template reference")
  if (input.profileName !== null && (!input.profileName.trim() || input.saveId === null && input.templatePath === null)) {
    throw new Error("Select an immutable save or explicit blank template for Capsule")
  }
  if (input.profileName === null && (input.saveId !== null || input.templatePath !== null)) throw new Error("Profile source requires its explicit name")
  await input.mass.configuration.write({version: 1, root: "workspace-capsule", browser: "capsule",
    profileName: input.profileName, saveId: input.saveId, templatePath: input.templatePath})
  input.signal.throwIfAborted()
  return {configured: true}
}
