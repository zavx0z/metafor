import { bootDarkDomain } from "./boot.ts"
import { openSharedDbIndexedDbBackend } from "../shared/db/browser.ts"

bootDarkDomain(() =>
  openSharedDbIndexedDbBackend({
    databaseName: "metafor-web",
  }),
)
