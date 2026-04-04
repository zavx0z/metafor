import { bootBoundaryDomain } from "./boot.ts"
import { openSharedDbIndexedDbBackend } from "../pkg/db/browser.ts"

bootBoundaryDomain(() =>
  openSharedDbIndexedDbBackend({
    databaseName: "metafor-web",
  }),
)
