import { Database, constants } from "bun:sqlite"

const db = new Database("mydb.sqlite", {strict: true, })
db.run("PRAGMA journal_mode = WAL;")

// ... use the database ...

// Disable persistent WAL (needed on macOS)
db.fileControl(constants.SQLITE_FCNTL_PERSIST_WAL, 0)
// Checkpoint and truncate the WAL file
db.run("PRAGMA wal_checkpoint(TRUNCATE);")
db.close()
