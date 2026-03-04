export async function loadDSL(metaPath: string) {
  const path = metaPath + "/meta.json"
  try {
    const json = await fetch(path).then((r) => r.json())
    return json
  } catch (e) {
    console.error(e)
  }
}
