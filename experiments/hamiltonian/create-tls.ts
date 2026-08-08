import {chmodSync, mkdirSync} from "node:fs"
import {networkInterfaces} from "node:os"
import {fileURLToPath} from "node:url"

const experimentRoot = fileURLToPath(new URL(".", import.meta.url))
const tlsRoot = `${experimentRoot}/.tls`
const openssl = Bun.which("openssl")
if (!openssl) throw new Error("openssl is required to create the test certificates")

const requestedIps = Bun.argv
  .slice(2)
  .filter((argument) => argument.startsWith("--ip="))
  .map((argument) => argument.slice("--ip=".length))
  .filter(Boolean)

const detectedIps = Object.values(networkInterfaces()).flatMap((entries) =>
  (entries ?? [])
    .filter((entry) => entry.family === "IPv4" && !entry.internal)
    .map((entry) => entry.address)
)
const ips = [...new Set(["127.0.0.1", ...requestedIps, ...detectedIps])]
const names = ["localhost"]
const subjectAltName = [
  ...names.map((name) => `DNS:${name}`),
  ...ips.map((address) => `IP:${address}`),
].join(",")

const paths = {
  caKey: `${tlsRoot}/ca-key.pem`,
  caCert: `${tlsRoot}/ca-cert.pem`,
  androidCa: `${tlsRoot}/hamiltonian-ca.cer`,
  serverKey: `${tlsRoot}/server-key.pem`,
  serverCsr: `${tlsRoot}/server.csr`,
  serverCert: `${tlsRoot}/server-cert.pem`,
}

for (const path of Object.values(paths)) {
  if (await Bun.file(path).exists()) {
    throw new Error(`Refusing to overwrite existing TLS material: ${path}`)
  }
}

mkdirSync(tlsRoot, {recursive: true, mode: 0o700})

async function run(...args: string[]): Promise<void> {
  const process = Bun.spawn([openssl!, ...args], {stdout: "pipe", stderr: "pipe"})
  const [exitCode, stdout, stderr] = await Promise.all([
    process.exited,
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
  ])
  if (exitCode === 0) return
  throw new Error(`${openssl} ${args[0]} failed (${exitCode})\n${stdout}${stderr}`)
}

await run(
  "genpkey", "-algorithm", "EC", "-pkeyopt", "ec_paramgen_curve:P-256",
  "-out", paths.caKey,
)
await run(
  "req", "-x509", "-new", "-sha256", "-days", "30",
  "-key", paths.caKey,
  "-out", paths.caCert,
  "-subj", "/CN=Hamiltonian MF-412 Test CA",
  "-addext", "basicConstraints=critical,CA:TRUE",
  "-addext", "keyUsage=critical,keyCertSign,cRLSign",
)
await run(
  "genpkey", "-algorithm", "EC", "-pkeyopt", "ec_paramgen_curve:P-256",
  "-out", paths.serverKey,
)
await run(
  "req", "-new", "-sha256",
  "-key", paths.serverKey,
  "-out", paths.serverCsr,
  "-subj", "/CN=localhost",
  "-addext", `subjectAltName=${subjectAltName}`,
  "-addext", "basicConstraints=critical,CA:FALSE",
  "-addext", "keyUsage=critical,digitalSignature",
  "-addext", "extendedKeyUsage=serverAuth",
)
await run(
  "x509", "-req", "-sha256", "-days", "30",
  "-in", paths.serverCsr,
  "-CA", paths.caCert,
  "-CAkey", paths.caKey,
  "-CAcreateserial",
  "-copy_extensions", "copy",
  "-out", paths.serverCert,
)
await run(
  "x509", "-in", paths.caCert, "-outform", "DER", "-out", paths.androidCa,
)

chmodSync(paths.caKey, 0o600)
chmodSync(paths.serverKey, 0o600)

console.log(`Created 30-day MF-412 test certificates in ${tlsRoot}`)
console.log(`Server SAN: ${subjectAltName}`)
console.log(`Android CA: ${paths.androidCa}`)
console.log("The CA is experimental. Remove it from Android trusted credentials after the test.")
