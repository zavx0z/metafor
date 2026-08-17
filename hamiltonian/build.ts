import {buildPackage, packageOwners} from "@hamiltonian/release"

const manifest = await Bun.file(new URL("./package.json", import.meta.url)).json() as {
  dependencies?: Record<string, unknown>
}
const packages = Object.keys(manifest.dependencies ?? {}).filter((name) =>
  name === "@hamiltonian/startup"
  || name === "@hamiltonian/release"
  || name.startsWith("@internal/"))

const results = (await Promise.all(packages.map(async (name) => {
  const owners = await packageOwners(name)
  return await Promise.all(owners.map(({env}) => buildPackage(name, {env})))
}))).flat()

for (const result of results) {
  if (result.stdout) process.stdout.write(result.stdout)
  if (result.stderr) process.stderr.write(result.stderr)
}

if (results.some(({success}) => !success)) process.exitCode = 1
