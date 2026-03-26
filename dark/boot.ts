import { matter, matterMeta } from "./dark.ts"
import type { SharedDbBackend } from "../shared/db/core.ts"
import {
  ELECTROMAGNETISM_BROADCAST_CHANNEL,
  GLUON_BROADCAST_CHANNEL,
  GRAVITY_BROADCAST_CHANNEL,
  HIGGS_BROADCAST_CHANNEL,
} from "@shared/protocol"

export type OpenDarkDb = () => Promise<SharedDbBackend> | SharedDbBackend

type DarkWorkerRuntime = {
  db: Promise<SharedDbBackend>
  gravity: BroadcastChannel
  photon: BroadcastChannel
  gluon: BroadcastChannel
  higgs: BroadcastChannel
  matter: typeof matter
  matterMeta: typeof matterMeta
}

const darkWorker = globalThis as typeof globalThis & {
  __metaforDarkRuntime?: DarkWorkerRuntime
}

export const bootDarkDomain = (openDb: OpenDarkDb): void => {
  darkWorker.__metaforDarkRuntime = {
    db: Promise.resolve(openDb()),
    gravity: new BroadcastChannel(GRAVITY_BROADCAST_CHANNEL),
    photon: new BroadcastChannel(ELECTROMAGNETISM_BROADCAST_CHANNEL),
    gluon: new BroadcastChannel(GLUON_BROADCAST_CHANNEL),
    higgs: new BroadcastChannel(HIGGS_BROADCAST_CHANNEL),
    matter,
    matterMeta,
  }
}
