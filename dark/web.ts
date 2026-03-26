import { bootDarkDomain } from "./boot.ts"
import { openSharedDbIndexedDbBackend } from "../shared/db/browser.ts"

const params = new URL(import.meta.url).searchParams
const rootSrc = params.get("src") ?? undefined
const dev = params.get("dev") === "1"

await bootDarkDomain(() =>
  openSharedDbIndexedDbBackend({
    databaseName: "metafor-web",
  }),
  {
    ...(rootSrc === undefined ? {} : { rootSrc }),
    dev,
  },
)
