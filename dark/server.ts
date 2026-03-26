import { bootDarkDomain } from "./boot.ts"
import { openSharedDbSqliteBackend } from "../shared/db/index.ts"

await bootDarkDomain(() =>
  openSharedDbSqliteBackend({
    filename: "metafor-server.sqlite",
  }),
)
