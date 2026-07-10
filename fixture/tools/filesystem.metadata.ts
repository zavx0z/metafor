import {stat} from "node:fs/promises"
import {resolveFilesystemFixturePath, type FilesystemFixtureActionParams} from "./filesystem.ts"

export default async function filesystemMetadata({value, mass}: FilesystemFixtureActionParams): Promise<{ok: true}> {
  const metadata = await stat(await resolveFilesystemFixturePath(value, mass))
  mass.result = {
    size: metadata.size,
    type: metadata.isFile()
      ? "file"
      : metadata.isDirectory()
        ? "directory"
        : "other",
    mtime: metadata.mtime.toISOString(),
  }
  return {ok: true}
}
