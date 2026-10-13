/** Owned regression descendant deliberately survives its ACP leader and ignores graceful termination. */
const marker = process.env.ORACLE_AGENT_FIXTURE_DESCENDANT_MARKER
if (!marker) throw new Error("Descendant fixture requires its private marker")
process.on("SIGTERM", () => {})
await Bun.write(marker, JSON.stringify({pid: process.pid, leader: process.ppid}))
setInterval(() => {}, 1000)
