import { bootDarkDomain } from "./boot.ts"
import { openSharedDbSqliteBackend } from "../shared/db/index.ts"

bootDarkDomain(() =>
  openSharedDbSqliteBackend({
    filename: "metafor-server.sqlite",
  }),
)
