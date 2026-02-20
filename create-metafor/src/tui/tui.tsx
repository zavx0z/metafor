#!/usr/bin/env node

import React from "react"
import { render } from "ink"
import Form from "./components/Form"

function main() {
  try {
    const { waitUntilExit } = render(
      <Form
        onSubmit={(name, desc, dir) => {
          console.log(`\nname: ${name}`)
          console.log(`desc: ${desc}`)
          console.log(`dir: ${dir}`)
          process.exit(0)
        }}
      />,
      { exitOnCtrlC: false }
    )

    waitUntilExit()
  } catch (error) {
    console.log("\n⚠️ TUI requires an interactive terminal\n")
    console.log("Use command-line arguments instead:\n")
    console.log("  bun create metafor <name> -d \"description\"\n")
    process.exit(1)
  }
}

main()
