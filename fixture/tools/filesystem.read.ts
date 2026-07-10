import {open} from "node:fs/promises"
import {
  FILESYSTEM_FIXTURE_MAX_BYTES,
  resolveFilesystemFixturePath,
  type FilesystemFixtureActionParams,
} from "./filesystem.ts"

export default async function filesystemRead({value, mass}: FilesystemFixtureActionParams): Promise<{ok: true}> {
  const file = await open(await resolveFilesystemFixturePath(value, mass), "r")
  try {
    const metadata = await file.stat()
    if (!metadata.isFile()) throw new TypeError("filesystem.read target must be a file")
    if (metadata.size > FILESYSTEM_FIXTURE_MAX_BYTES) {
      throw new RangeError(`filesystem.read exceeds ${FILESYSTEM_FIXTURE_MAX_BYTES} byte fixture limit`)
    }

    const content = Buffer.alloc(metadata.size)
    let offset = 0
    while (offset < content.length) {
      const {bytesRead} = await file.read(content, offset, content.length - offset, offset)
      if (bytesRead === 0) break
      offset += bytesRead
    }
    mass.result = {dataBase64: content.subarray(0, offset).toString("base64")}
  } finally {
    await file.close()
  }
  return {ok: true}
}
