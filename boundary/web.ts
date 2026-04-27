import { bootBoundaryDomain } from "./boot.ts"
import { openDbIndexedDbBackend } from "store/db/browser"

bootBoundaryDomain(() =>
  openDbIndexedDbBackend({
    databaseName: "metafor-web",
  }),
)
