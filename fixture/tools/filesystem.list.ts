import {opendir} from "node:fs/promises"
import {
  FILESYSTEM_FIXTURE_MAX_ENTRIES,
  resolveFilesystemFixturePath,
  type FilesystemFixtureActionParams,
} from "./filesystem.ts"

export default async function filesystemList({value, mass}: FilesystemFixtureActionParams): Promise<{ok: true}> {
  const directory = await opendir(await resolveFilesystemFixturePath(value, mass))
  const entries: Array<{name: string; kind: "file" | "directory" | "symlink" | "other"}> = []
  for await (const entry of directory) {
    if (entries.length === FILESYSTEM_FIXTURE_MAX_ENTRIES) {
      throw new RangeError(`filesystem.list exceeds ${FILESYSTEM_FIXTURE_MAX_ENTRIES} entry fixture limit`)
    }
    entries.push({
      name: entry.name,
      kind: entry.isFile()
        ? "file"
        : entry.isDirectory()
          ? "directory"
          : entry.isSymbolicLink()
            ? "symlink"
            : "other",
    })
  }
  mass.result = {
    entries: entries.sort((left, right) => left.name < right.name ? -1 : left.name > right.name ? 1 : 0),
  }
  return {ok: true}
}
