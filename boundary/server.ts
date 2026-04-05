import { bootBoundaryDomain } from "./boot.ts"
import { openDbSqliteBackend } from "../pkg/db/index.ts"

bootBoundaryDomain(() =>
  openDbSqliteBackend({
    filename: "metafor-server.sqlite",
  }),
)
