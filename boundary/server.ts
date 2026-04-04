import { bootBoundaryDomain } from "./boot.ts"
import { openSharedDbSqliteBackend } from "../pkg/db/index.ts"

bootBoundaryDomain(() =>
  openSharedDbSqliteBackend({
    filename: "metafor-server.sqlite",
  }),
)
