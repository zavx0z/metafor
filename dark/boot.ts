import { matter, matterMeta } from "./dark.ts"
import { Wimp } from "./strong/index.ts"
import { openSharedDbMaterializationWriter, type SharedDbBackend } from "../shared/db/core.ts"
import { ELECTROMAGNETISM_BROADCAST_CHANNEL, GLUON_BROADCAST_CHANNEL, HIGGS_BROADCAST_CHANNEL } from "@shared/protocol"
import { gravityCH } from "@dark/gravity/channel.ts"

export type OpenDarkDb = () => Promise<SharedDbBackend> | SharedDbBackend
export interface DarkDomainInit {
  dev?: boolean
  rootSrc?: string
}

type DarkWorkerRuntime = {
  db: Promise<SharedDbBackend>
  gravity: BroadcastChannel
  photon: BroadcastChannel
  gluon: BroadcastChannel
  higgs: BroadcastChannel
  matter: typeof matter
  matterMeta: typeof matterMeta
  rootSrc?: string
}

const darkWorker = globalThis as typeof globalThis & {
  __metaforDarkRuntime?: DarkWorkerRuntime
}

export const bootDarkDomain = async (openDb: OpenDarkDb, init: DarkDomainInit = {}): Promise<void> => {
  const runtime: DarkWorkerRuntime = {
    db: Promise.resolve(openDb()),
    gravity: gravityCH,
    photon: new BroadcastChannel(ELECTROMAGNETISM_BROADCAST_CHANNEL),
    gluon: new BroadcastChannel(GLUON_BROADCAST_CHANNEL),
    higgs: new BroadcastChannel(HIGGS_BROADCAST_CHANNEL),
    matter,
    matterMeta,
    ...(init.rootSrc !== undefined ? { rootSrc: init.rootSrc } : {}),
  }

  darkWorker.__metaforDarkRuntime = runtime

  if (init.rootSrc === undefined) return

  const db = await runtime.db
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
