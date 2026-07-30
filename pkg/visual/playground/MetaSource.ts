import {
  ladaAuthSource,
  ladaChatSendSource,
  ladaChatSource,
  ladaModelSource,
  ladaSource,
} from "./MetaSource.raw.js"

export type MetaStateDslSource = Readonly<{
  dsl: string
  path: string
  src: string
}>

export const stateDslExcerpt = (source: string): string => {
  const start = source.indexOf(".superposition(")
  if (start < 0) return source.trim()
  const end = source.indexOf("\n  .mass(", start)
  return source.slice(start, end < 0 ? source.length : end).trim()
}

const sources: Readonly<Record<string, readonly [path: string, source: string]>> = {
  "zavx0z/lada": [
    "cluster/zavx0z/lada/meta.ts",
    ladaSource,
  ],
  "zavx0z/lada-auth": [
    "cluster/zavx0z/lada-auth/meta.ts",
    ladaAuthSource,
  ],
  "zavx0z/lada-chat": [
    "cluster/zavx0z/lada-chat/meta.ts",
    ladaChatSource,
  ],
  "zavx0z/lada-chat-send": [
    "cluster/zavx0z/lada-chat-send/meta.ts",
    ladaChatSendSource,
  ],
  "zavx0z/lada-model": [
    "cluster/zavx0z/lada-model/meta.ts",
    ladaModelSource,
  ],
}

export const metaStateDslSource = (src: string): MetaStateDslSource | null => {
  const source = sources[src]
  if (!source) return null
  return {
    src,
    path: source[0],
    dsl: stateDslExcerpt(source[1]),
  }
}
