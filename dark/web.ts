import { openDbIndexedDbBackend } from "../pkg/db/browser.ts"
import { matter } from "./index.ts"
import { Wimp } from "./strong/index.ts"
import { openDbMaterializationWriter } from "../pkg/db/core.ts"

const db = await openDbIndexedDbBackend({ databaseName: "metafor-web" })
const writer = openDbMaterializationWriter(db)

await matter(new Wimp({ src: "zavx0z/git", parent: null }), undefined, { dbWriter: writer })
