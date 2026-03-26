import { openSharedDbIndexedDbBackend } from "../shared/db/browser.ts"
import { matter } from "./dark.ts"
import { Wimp } from "./strong/index.ts"
import { openSharedDbMaterializationWriter } from "../shared/db/core.ts"

const db = await openSharedDbIndexedDbBackend({ databaseName: "metafor-web" })
const writer = openSharedDbMaterializationWriter(db)

await matter(new Wimp({ src: "github/zavx0z/git", parent: null }), undefined, { sharedDbWriter: writer })
