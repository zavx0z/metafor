import { openDbSqliteBackend } from "../pkg/db/index.ts"
import { matter } from "./index.ts"
import { Wimp } from "./strong/index.ts"
import { openDbMaterializationWriter } from "../pkg/db/core.ts"

const params = new URL(import.meta.url).searchParams
const rootSrc = params.get("src") as string
// const dev = params.get("dev") === "1"

const db = openDbSqliteBackend({ filename: "metafor-server.sqlite" })
const writer = openDbMaterializationWriter(db)

await matter(new Wimp({ src: rootSrc, parent: null }), undefined, { dbWriter: writer })
