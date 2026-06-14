import { bootEnergyDomain } from "./boot.ts"
import { openDbIndexedDbBackend } from "@metafor/boundary/db/browser"

bootEnergyDomain(() =>
  openDbIndexedDbBackend({
    databaseName: "metafor-web",
  }),
)
