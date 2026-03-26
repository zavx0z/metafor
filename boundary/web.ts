import { bootBoundaryDomain } from "./boot.ts"
import { openSharedDbIndexedDbBackend } from "../shared/db/browser.ts"

bootBoundaryDomain(() =>
  openSharedDbIndexedDbBackend({
    databaseName: "metafor-web",
  }),
)
