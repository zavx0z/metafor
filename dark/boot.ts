import { matter, matterMeta } from "./dark.ts"
import { Wimp } from "./strong/index.ts"
import { type GravitonMessage, GRAVITY_BROADCAST_CHANNEL } from "@shared/protocol"
import { openSharedDbMaterializationWriter, type SharedDbBackend } from "../shared/db/core.ts"
import {
  ELECTROMAGNETISM_BROADCAST_CHANNEL,
  GLUON_BROADCAST_CHANNEL,
  HIGGS_BROADCAST_CHANNEL,
} from "@shared/protocol"

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

const emitGravityPatch = (channel: BroadcastChannel, patches: GravitonMessage["patches"]): void => {
  if (patches.length === 0) return

  channel.postMessage({
    channel: "gravity",
    boson: "graviton",
    source: "dark",
    target: "boundary",
    patches,
  } satisfies GravitonMessage)
}

export const bootDarkDomain = async (openDb: OpenDarkDb, init: DarkDomainInit = {}): Promise<void> => {
  const runtime: DarkWorkerRuntime = {
    db: Promise.resolve(openDb()),
    gravity: new BroadcastChannel(GRAVITY_BROADCAST_CHANNEL),
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

  await matter(root, undefined, {
    sharedDbWriter: writer,
    gravityProtocol: {
      emitPatches(patches) {
        emitGravityPatch(runtime.gravity, patches)
      },
      emitAdd(wimpId) {
        emitGravityPatch(runtime.gravity, [{ op: "add", path: `/wimp/${wimpId}` }])
      },
      emitRemove(wimpId) {
        emitGravityPatch(runtime.gravity, [{ op: "remove", path: `/wimp/${wimpId}` }])
      },
      emitBarrier(value = null) {
        emitGravityPatch(runtime.gravity, [{ op: "test", path: "", value }])
      },
      close() {},
    },
  })
}
