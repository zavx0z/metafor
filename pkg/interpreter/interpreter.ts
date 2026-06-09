#!/usr/bin/env bun

import {runInterpreter} from "./src/interpreter.ts"
import {startupTargetsFromArgs} from "./src/module-cli.ts"

const startupTargets = startupTargetsFromArgs(Bun.argv.slice(2))

await runInterpreter(undefined, {
  ...(startupTargets.modules.length === 0 ? {} : {startupModules: startupTargets.modules}),
  ...(startupTargets.sqliteDatabases.length === 0 ? {} : {startupSqliteDatabases: startupTargets.sqliteDatabases}),
})
