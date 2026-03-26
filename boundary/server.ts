import { bootBoundaryDomain } from "./boot.ts"
import { openSharedDbSqliteBackend } from "../shared/db/index.ts"

bootBoundaryDomain(() =>
  openSharedDbSqliteBackend({
    filename: "metafor-server.sqlite",
  }),
)
