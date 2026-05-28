#!/usr/bin/env bun

import {runInterpreter} from "./src/interpreter.ts"
import {startupModulesFromArgs} from "./src/module-cli.ts"

const startupModules = startupModulesFromArgs(Bun.argv.slice(2))

await runInterpreter(undefined, startupModules.length === 0 ? {} : {startupModules})
