import type {Store, MetaApi} from "../../store/index.ts"
import type {StoreParticle} from "../../store/server.ts"

export type Updater = Pick<Store, "update">
export type StoreFacade = Updater & {meta: Pick<MetaApi, "get">}

const encodeSegment = (s: string): string => s.replace(/~/g, "~0").replace(/\//g, "~1")

export const path = (...segs: Array<string | number>): string =>
  "/" + segs.map((s) => encodeSegment(String(s))).join("/")

export const emit = async (
  store: Updater,
  part: StoreParticle,
  p: string,
  value: unknown,
): Promise<void> => {
  await store.update({part, patch: [{op: "add", path: p, value}]})
}
