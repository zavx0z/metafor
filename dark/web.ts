import { openSharedDbIndexedDbBackend } from "../shared/db/browser.ts"
import { matter } from "./dark.ts"
import { Wimp } from "./strong/index.ts"
import { openSharedDbMaterializationWriter } from "../shared/db/core.ts"

const params = new URL(import.meta.url).searchParams
const rootSrc = params.get("src") as string
// const dev = params.get("dev") === "1"

const db = await openSharedDbIndexedDbBackend({ databaseName: "metafor-web" })
const writer = openSharedDbMaterializationWriter(db)

await matter(new Wimp({ src: rootSrc, parent: null }), undefined, { sharedDbWriter: writer })
