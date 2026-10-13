import type {MassHandle} from "@metafor/types/metafor/mass"

/** Stores ordinary native-service selection refs; never reads, imports or launches a profile. */
export default async function recordMacConfiguration(input: Readonly<{
  profileName: string | null
  saveId: string | null
  templatePath: string | null
  mass: Readonly<{configuration: MassHandle}>
  signal: AbortSignal
}>) {
  input.signal.throwIfAborted()
  if (input.saveId !== null && input.templatePath !== null) throw new Error("Select one immutable save or template")
  if (input.profileName === null && (input.saveId !== null || input.templatePath !== null)) throw new Error("Profile source requires its explicit name")
  await input.mass.configuration.write({version: 1, root: "intel-macos-chrome-studio", browser: "chrome-studio",
    profileName: input.profileName, saveId: input.saveId, templatePath: input.templatePath})
  input.signal.throwIfAborted()
  return {configured: true}
}
