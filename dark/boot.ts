import { matter } from "./dark.ts"
import { Wimp } from "./strong/index.ts"
import { openSharedDbMaterializationWriter, type SharedDbBackend } from "../shared/db/core.ts"

export type OpenDarkDb = () => Promise<SharedDbBackend> | SharedDbBackend
export interface DarkDomainInit {
  dev?: boolean
  rootSrc?: string
}

export const bootDarkDomain = async (openDb: OpenDarkDb, init: DarkDomainInit = {}): Promise<void> => {
  if (init.rootSrc === undefined) return
  const db = await openDb()
  if (init.dev === true) {
    await db.reset()
  } else {
    const wimpIds = await db.listWimpIds()
    if (wimpIds.length > 0) return
  }

  const writer = openSharedDbMaterializationWriter(db)
  const root = new Wimp({ src: init.rootSrc, parent: null })

  await matter(root, undefined, { sharedDbWriter: writer })
}
