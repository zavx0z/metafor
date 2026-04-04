import { openSharedDbIndexedDbBackend } from "../pkg/db/browser.ts"
import { matter } from "./dark.ts"
import { Wimp } from "./strong/index.ts"
import { openSharedDbMaterializationWriter } from "../pkg/db/core.ts"

const db = await openSharedDbIndexedDbBackend({ databaseName: "metafor-web" })
const writer = openSharedDbMaterializationWriter(db)

await matter(new Wimp({ src: "zavx0z/git", parent: null }), undefined, { sharedDbWriter: writer })
