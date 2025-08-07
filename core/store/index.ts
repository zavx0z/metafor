import type { MetaRecord } from "./index.t.ts"

export class MetaClass implements MetaRecord {
  declare id: number
  declare meta: string
  declare fingerprint: string
  declare timestamp: string
}