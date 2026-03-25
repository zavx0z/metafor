import { openSharedDbSqliteBackend } from "@shared/db"
import { closeBoundaryProtocolChannels, writeRuntimeFromSharedDb } from "../boundary"

export async function resetBoundaryForTest(): Promise<void> {
  closeBoundaryProtocolChannels()
  const backend = openSharedDbSqliteBackend()

  try {
    await writeRuntimeFromSharedDb(backend)
  } finally {
    backend.close()
  }
}
