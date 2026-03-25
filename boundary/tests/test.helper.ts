import { openSharedDbSqliteBackend } from "@shared/db"
import { writeRuntimeFromSharedDb } from "../boundary"

export async function resetBoundaryForTest(): Promise<void> {
  const backend = openSharedDbSqliteBackend()

  try {
    await writeRuntimeFromSharedDb(backend)
  } finally {
    backend.close()
  }
}
