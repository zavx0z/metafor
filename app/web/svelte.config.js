// import adapter from "@sveltejs/adapter-auto"
import adapter from "@sveltejs/adapter-static"
import { vitePreprocess } from "@sveltejs/kit/vite"
// import adapter from "svelte-adapter-bun"

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter({
      pages: "build",
      assets: "build",
    }),
    paths: {
      base: process.argv.includes("dev") ? "" : "/littlesun",
    },
    appDir: "internal",
  },
}

export default config
