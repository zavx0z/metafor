import {expect, test} from "bun:test"
import {layoutAgentOffice, type OfficeBounds} from "../office-layout"

const humanoid: OfficeBounds = {min: {x: -240, y: -160, z: -40}, max: {x: 240, y: 160, z: 1760}}
const roomBounds: OfficeBounds = {min: {x: -4500, y: -3500, z: 100}, max: {x: 4500, y: 3500, z: 2700}}
const displays = [{id: "chat", width: 900, height: 600}, {id: "sensor", width: 1200, height: 800}]
const agents = (count: number) => Array.from({length: count}, (_, index) => ({id: `agent-${String(index).padStart(2, "0")}`, displays}))

function inside(subject: OfficeBounds, room: OfficeBounds) {
  for (const axis of ["x", "y", "z"] as const) {
    expect(subject.min[axis]).toBeGreaterThanOrEqual(room.min[axis] - 1e-8)
    expect(subject.max[axis]).toBeLessThanOrEqual(room.max[axis] + 1e-8)
  }
}
function overlap(a: OfficeBounds, b: OfficeBounds) {
  return (["x", "y", "z"] as const).every(axis => Math.min(a.max[axis], b.max[axis]) - Math.max(a.min[axis], b.min[axis]) > 1e-8)
}

test("explicit office box сохраняется при изменении N и devices; общий scale не увеличивается", () => {
  let previous = Infinity
  for (const count of [1, 2, 3, 7, 20]) {
    const result = layoutAgentOffice({roomBounds, humanoid, agents: agents(count)})
    expect(result.bounds).toEqual(roomBounds)
    expect(result.scale).toBeLessThanOrEqual(previous)
    expect(result.scale).toBeGreaterThan(0)
    previous = result.scale
  }
  const small = layoutAgentOffice({roomBounds, humanoid, agents: [{id: "one", displays: displays.slice(0, 1)}]})
  const large = layoutAgentOffice({roomBounds, humanoid, agents: [{id: "one", displays: [{id: "large", width: 9000, height: 4000}]}]})
  expect(large.bounds).toEqual(small.bounds)
  expect(large.scale).toBeLessThan(small.scale)
})

test.each([1, 2, 3, 7, 20])("%s Agent и устройства помещаются вдоль стен с clearance и без пересечения workplaces", count => {
  const input = {roomBounds, humanoid, agents: agents(count)}
  const before = structuredClone(input)
  const result = layoutAgentOffice(input)
  expect(result.kind).toBe("prism")
  expect(result.scale).toBeLessThanOrEqual(1)
  expect(input).toEqual(before)
  const used = new Set(result.agents.map(agent => agent.wall))
  if (count >= 7) expect(used.size).toBe(4)
  for (const agent of result.agents) {
    expect(agent.scale).toBe(result.scale)
    inside(agent.bounds, result.bounds)
    inside(agent.workplaceBounds, result.bounds)
    for (const display of agent.displays) {
      inside(display.bounds, agent.workplaceBounds)
      expect(display.scale).toBe(result.scale)
      expect(display.width / display.sourceSize.width).toBeCloseTo(result.scale)
      expect(display.height / display.sourceSize.height).toBeCloseTo(result.scale)
    }
  }
  for (let a = 0; a < result.agents.length; a++) for (let b = a + 1; b < result.agents.length; b++) {
    expect(overlap(result.agents[a]!.workplaceBounds, result.agents[b]!.workplaceBounds)).toBe(false)
  }
  for (const edge of result.edges) {
    if (edge.route.kind !== "cubic") throw new Error("Expected cubic office ownership edge")
    for (const point of edge.route.points) inside({min: point, max: point}, result.bounds)
  }
  expect(JSON.stringify(result)).not.toMatch(/null|Infinity|NaN/u)
  expect(layoutAgentOffice({...input, agents: input.agents.toReversed()})).toEqual(result)
})

test("пустой офис конечен и неизменен; размеры, дубли и невозможный clearance отвергаются", () => {
  const empty = layoutAgentOffice({roomBounds, agents: [], humanoid})
  expect(empty.agents).toEqual([])
  expect(empty.edges).toEqual([])
  expect(empty.bounds).toEqual(roomBounds)
  expect(() => layoutAgentOffice({roomBounds, agents: [{id: "one", displays: [{id: "bad", width: Infinity, height: 200}]}], humanoid})).toThrow()
  expect(() => layoutAgentOffice({roomBounds, agents: [{id: "one", displays: []}, {id: "one", displays: []}], humanoid})).toThrow("identity")
  expect(() => layoutAgentOffice({roomBounds, agents: [], humanoid: {min: humanoid.min, max: humanoid.min}})).toThrow()
  expect(() => layoutAgentOffice({roomBounds, agents: agents(2), humanoid, wallInset: 4000})).toThrow("clearances")
})

test("разные natural widths сохраняются; свободная длина распределяется как space-evenly сверх общего gap", () => {
  const result = layoutAgentOffice({roomBounds, humanoid, agents: [600, 2200, 900, 1200, 500, 1800, 700].map((width, index) => ({
    id: `agent-${index}`, displays: [{id: "screen", width, height: 600}],
  }))})
  expect(result.scale).toBe(1)
  let checked = false
  for (const wall of ["north", "south", "east", "west"] as const) {
    const members = result.agents.filter(agent => agent.wall === wall)
    const axis = wall === "north" || wall === "south" ? "x" : "y"
    for (const agent of members) {
      expect(agent.workplaceBounds.max[axis] - agent.workplaceBounds.min[axis]).toBeCloseTo(agent.displays[0]!.sourceSize.width * result.scale)
    }
    if (members.length < 2) continue
    checked = true
    for (let index = 1; index < members.length; index++) {
      const previous = members[index - 1]!, current = members[index]!
      expect(current.workplaceBounds.min[axis] - previous.workplaceBounds.max[axis]).toBeCloseTo(result.walls[wall].betweenGap)
    }
    expect(result.walls[wall].betweenGap - result.sharedGap).toBeCloseTo(result.walls[wall].outerGap)
  }
  expect(checked).toBe(true)
})

test("N7 не сжимается без overflow; N20 заполняет стены без quarter-room guard", () => {
  const seven = layoutAgentOffice({roomBounds, humanoid, agents: agents(7)})
  expect(seven.scale).toBe(1)
  const twenty = layoutAgentOffice({roomBounds, humanoid, agents: agents(20)})
  expect(twenty.scale).toBeGreaterThan(.55)
  for (const wall of ["north", "south", "east", "west"] as const) {
    expect(twenty.walls[wall].occupiedWidth / twenty.walls[wall].available).toBeGreaterThan(.8)
  }
  const one = layoutAgentOffice({roomBounds, humanoid, agents: agents(1)})
  expect(one.walls.north.guardStart).toBe(0)
  expect(one.walls.north.guardEnd).toBe(0)
})

test("неиспользуемая боковая стена в shallow room сообщает нулевую доступную длину вместо отрицательной", () => {
  const result = layoutAgentOffice({roomBounds: {min: {x: -4500, y: -20, z: 0}, max: {x: 4500, y: 20, z: 2700}}, humanoid, agents: agents(1)})
  expect(result.walls.east.count).toBe(0)
  expect(result.walls.west.count).toBe(0)
  expect(result.walls.east.available).toBe(0)
  expect(result.walls.west.available).toBe(0)
  for (const wall of Object.values(result.walls)) expect(wall.available).toBeGreaterThanOrEqual(0)
})

test("надголовная группа целиком вписывается при разных вариантах и N в узкую комнату, не пересекает соседей и смотрит в центр", () => {
  const beta: OfficeBounds = {min: {x: -280, y: -190, z: 50}, max: {x: 280, y: 190, z: 1950}}
  for (const room of [roomBounds, {min: {x: 100, y: -130, z: 200}, max: {x: 580, y: 130, z: 2400}}]) {
    let previousScale = Infinity
    for (const count of [1, 4, 24, 64]) {
      const input = {roomBounds: room, humanoid, overheadDisplayId: "chat", agents: agents(count).map((agent, index) => ({
        ...agent, humanoid: index % 2 ? beta : humanoid,
      }))}
      const before = structuredClone(input)
      const result = layoutAgentOffice(input)
      expect(input).toEqual(before)
      expect(result.scale).toBeLessThanOrEqual(previousScale)
      previousScale = result.scale
      for (const agent of result.agents) {
        inside(agent.bounds, agent.workplaceBounds)
        inside(agent.workplaceBounds, room)
        const chat = agent.displays.find(display => display.id === "chat")!
        expect(chat.billboard).toBe(true)
        expect(chat.scale).toBe(agent.scale)
        expect(chat.position.x).toBeCloseTo(agent.head.x, 8)
        expect(chat.position.y).toBeCloseTo(agent.head.y, 8)
        expect(chat.bounds.min.z).toBeGreaterThan(agent.bounds.max.z)
        const diameter = Math.hypot(chat.sourceSize.width, chat.sourceSize.height, chat.sourceSize.depth) * result.scale
        for (const axis of ["x", "y", "z"] as const) expect(chat.bounds.max[axis] - chat.bounds.min[axis]).toBeCloseTo(diameter, 8)
        for (const display of agent.displays) inside(display.bounds, agent.workplaceBounds)
        const center = {x: (room.min.x + room.max.x) / 2 - agent.head.x, y: (room.min.y + room.max.y) / 2 - agent.head.y}
        const distance = Math.hypot(center.x, center.y)
        if (distance > 1e-8) expect((-Math.sin(agent.rotationZ) * center.x + Math.cos(agent.rotationZ) * center.y) / distance).toBeCloseTo(1, 12)
      }
      for (let a = 0; a < result.agents.length; a++) for (let b = a + 1; b < result.agents.length; b++) {
        expect(overlap(result.agents[a]!.workplaceBounds, result.agents[b]!.workplaceBounds)).toBe(false)
      }
      expect(JSON.stringify(result)).not.toMatch(/null|Infinity|NaN/u)
    }
  }
})
