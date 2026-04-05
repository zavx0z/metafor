import { openSharedDbSqliteBackend } from "../pkg/db/index.ts"
import { matter } from "./pipeline.ts"
import { Wimp } from "./strong/index.ts"
import { openSharedDbMaterializationWriter } from "../pkg/db/core.ts"

const params = new URL(import.meta.url).searchParams
const rootSrc = params.get("src") as string
// const dev = params.get("dev") === "1"

const db = openSharedDbSqliteBackend({ filename: "metafor-server.sqlite" })
const writer = openSharedDbMaterializationWriter(db)

await matter(new Wimp({ src: rootSrc, parent: null }), undefined, { sharedDbWriter: writer })
