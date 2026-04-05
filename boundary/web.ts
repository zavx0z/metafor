import { bootBoundaryDomain } from "./boot.ts"
import { openDbIndexedDbBackend } from "../pkg/db/browser.ts"

bootBoundaryDomain(() =>
  openDbIndexedDbBackend({
    databaseName: "metafor-web",
  }),
)
