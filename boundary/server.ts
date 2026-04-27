import { bootBoundaryDomain } from "./boot.ts"
import { openDbSqliteBackend } from "store/db"

bootBoundaryDomain(() =>
  openDbSqliteBackend({
    filename: "metafor-server.sqlite",
  }),
)
