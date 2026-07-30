import {afterEach, describe, expect, test} from "bun:test"
import {mkdtemp, rm} from "node:fs/promises"
import {tmpdir} from "node:os"
import {join} from "node:path"
import {VISUAL_ANNOTATION_SCHEMA} from "./Annotation.ts"
import {createVisualAnnotationApi} from "./AnnotationApi.ts"

const directories: string[] = []

afterEach(async () => {
  await Promise.all(directories.splice(0).map(
    (directory) => rm(directory, {recursive: true, force: true}),
  ))
})

const draft = () => ({
  schema: VISUAL_ANNOTATION_SCHEMA,
  clientId: "client-1",
  capturedAt: "2026-07-28T20:00:00.000Z",
  pageUrl: "http://localhost:4014/#/state-graph",
  surface: {
    canvasId: "state-graph-card-0",
    kind: "state-graph-card",
    route: "#/state-graph",
    slug: "state-graph",
    title: "ожидание мира",
  },
  atom: {
    id: 2,
    label: "Лада",
    src: "zavx0z/lada",
    currentStateId: 4,
  },
  graph: {
    cardIndex: 0,
    rootStateId: 2,
    rootStateLabel: "ожидание мира",
    dslPath: "cluster/zavx0z/lada/meta.ts",
    paths: [
      "ожидание мира → подготовка приветствия → работа → осмысление сообщения",
      "ожидание мира → работа → осмысление сообщения",
    ],
    layout: {
      rootStateId: 2,
      nodes: [{
        id: "root/2/state/2",
        stateId: 2,
        label: "ожидание мира",
        step: 0,
        x: 0,
        y: 0,
        z: 0,
        radius: 3.2,
        color: [0.2, 0.8, 1],
        current: false,
        end: null,
      }],
      edges: [{
        id: "root/2/edge/0",
        transitionId: 1,
        fromNodeId: "root/2/state/2",
        toNodeId: "root/2/state/3",
        returning: false,
        conditionCount: 3,
        conditionFieldIds: [8, 9, 21],
      }],
      levels: [{step: 0, x: 0, nodeIds: ["root/2/state/2"]}],
    },
  },
  strokes: [{
    camera: {
      position: {x: 0, y: 0, z: 50},
      target: {x: 0, y: 0, z: 0},
      up: {x: 0, y: 1, z: 0},
      fov: 1,
      aspect: 1.7,
      near: 0.01,
      far: 10_000,
    },
    color: "#ffbf3f",
    width: 3.2,
    points: [{
      normalizedX: 0.25,
      normalizedY: 0.5,
      screenX: 160,
      screenY: 180,
      timeMs: 12,
    }],
  }],
  viewport: {
    camera: {
      position: {x: 0, y: 0, z: 50},
      target: {x: 0, y: 0, z: 0},
      up: {x: 0, y: 1, z: 0},
      fov: 1,
      aspect: 1.7,
      near: 0.01,
      far: 10_000,
    },
    cssWidth: 640,
    cssHeight: 360,
    pixelWidth: 1280,
    pixelHeight: 720,
    devicePixelRatio: 2,
  },
})

describe("Visual playground annotation REST API", () => {
  test("stores one completed annotation session and serves exact JSON and PNG", async () => {
    const directory = await mkdtemp(join(tmpdir(), "metafor-visual-annotation-"))
    directories.push(directory)
    const api = createVisualAnnotationApi(directory)
    const form = new FormData()
    form.set("metadata", JSON.stringify(draft()))
    form.set("image", new Blob([new Uint8Array([137, 80, 78, 71])], {
      type: "image/png",
    }), "annotation.png")

    const created = await api(new Request("http://localhost/api/annotations", {
      method: "POST",
      body: form,
    }))
    expect(created?.status).toBe(201)
    const record = await created!.json() as {
      graph: {layout: {edges: Array<{transitionId: number}>}}
      id: string
      pngUrl: string
      strokes: Array<{points: Array<{normalizedX: number}>}>
    }
    expect(record.graph.layout.edges[0]?.transitionId).toBe(1)
    expect(record.strokes[0]?.points[0]?.normalizedX).toBe(0.25)
    expect(record.pngUrl).toBe(`/api/annotations/${record.id}.png`)

    const latest = await api(new Request("http://localhost/api/annotations/latest"))
    expect(await latest?.json()).toMatchObject({id: record.id})
    const capture = await api(new Request("http://localhost/api/capture/latest"))
    expect(capture?.headers.get("content-type")).toBe("image/png")
    expect(new Uint8Array(await capture!.arrayBuffer())).toEqual(
      new Uint8Array([137, 80, 78, 71]),
    )
    const list = await api(new Request("http://localhost/api/annotations"))
    expect((await list?.json()) as unknown[]).toHaveLength(1)
  })

  test("rejects metadata without the annotation contract", async () => {
    const directory = await mkdtemp(join(tmpdir(), "metafor-visual-annotation-"))
    directories.push(directory)
    const api = createVisualAnnotationApi(directory)
    const form = new FormData()
    form.set("metadata", JSON.stringify({schema: "wrong"}))
    form.set("image", new Blob(["png"], {type: "image/png"}), "annotation.png")

    const response = await api(new Request("http://localhost/api/annotations", {
      method: "POST",
      body: form,
    }))
    expect(response?.status).toBe(400)
    expect(await response?.json()).toEqual({error: "invalid_annotation_contract"})
  })

  test("stores a page annotation without State Graph metadata", async () => {
    const directory = await mkdtemp(join(tmpdir(), "metafor-visual-annotation-"))
    directories.push(directory)
    const api = createVisualAnnotationApi(directory)
    const pageDraft = {
      ...draft(),
      pageUrl: "http://localhost:4014/#/edges",
      surface: {
        canvasId: "edges-canvas",
        kind: "playground-page",
        route: "#/edges",
        slug: "edges",
        title: "Edges · ограничители входа",
      },
      atom: null,
      graph: null,
      strokes: [{
        ...draft().strokes[0],
        camera: null,
      }],
      viewport: {
        ...draft().viewport,
        camera: null,
      },
    }
    const form = new FormData()
    form.set("metadata", JSON.stringify(pageDraft))
    form.set("image", new Blob(["png"], {type: "image/png"}), "annotation.png")

    const response = await api(new Request("http://localhost/api/annotations", {
      method: "POST",
      body: form,
    }))

    expect(response?.status).toBe(201)
    expect(await response?.json()).toMatchObject({
      atom: null,
      graph: null,
      surface: {
        kind: "playground-page",
        slug: "edges",
      },
    })
  })
})
