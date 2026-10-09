import {createRelease} from "@metafor/tech-release"
import {builder} from "./release/server/services"
import {cosmosRoot} from "./release/server/shared/paths"

// CLI включает startup; работающий release server управляет только сменяемым составом.
const release = createRelease({
  root: cosmosRoot,
  builder,
  isMember: (name) => name === "@cosmos/startup"
    || name === "@cosmos/release"
    || name.startsWith("@internal/"),
})
await release.recoverPublication()
