import { bootEnergyDomain } from "./boot.ts"
import { openDbIndexedDbBackend } from "store/db/browser"

bootEnergyDomain(() =>
  openDbIndexedDbBackend({
    databaseName: "metafor-web",
  }),
)
