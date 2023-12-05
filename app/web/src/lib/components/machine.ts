import type { Box3, Object3D, Sphere, Vector3 } from "three";
import { Actor, createMachine, type ActorLogic, assign } from "xstate";
type AlignEventData = {
    container: Object3D
    width: number
    height: number
    depth: number
    boundingBox: Box3
    boundingSphere: Sphere
    center: Vector3
    verticalAlignment: number
    horizontalAlignment: number
    depthAlignment: number
}
type Events = { type: "EVENT" } | { type: "MEASURE"; params: AlignEventData };

type Params = {
    material?: {
        color?: string
        opacity?: number
        emissive?: number
    }
    position?: [number, number, number]
    rotation?: [number, number, number]
}
type Input = {
    parent?: {
        position: [number, number, number]
        scale: number
    },
    params: Params
    tor: Params & { radius: number; tube?: number }
}

type ContextParams = {
    material: {
        color: string
        opacity: number
        emissive: number
    }
    rotation: [number, number, number]
}
type Context = {
    parent?: {
        position: [number, number, number]
        scale: number
    },
    params: ContextParams
    tor: {
        material: {
            color: string
            opacity: number
            emissive: number
        }
        radius: number
        tube: number
    }
}

export const thingMachine = createMachine({
    initial: "created",
    context: ({ input: { params, tor, parent } }) => {
        const parentPosition = parent?.position || [0, 0, 0]
        return {
            parent: {
                position: parentPosition,
                scale: parent?.scale || 1,
            },
            tor: {
                material: {
                    color: tor.material?.color || "black",
                    opacity: tor.material?.opacity || .44,
                    emissive: tor.material?.emissive || 14
                },
                radius: tor.radius || 0,
                tube: tor.tube || 0
            },
            params: {
                position: params.position ? params.position : [0, - tor.radius, 0],
                rotation: params.rotation ? params.rotation : [0, 0, 0],
                material: {
                    color: "blue",
                    opacity: params.material?.opacity || .44,
                    emissive: params.material?.emissive || 14
                }
            },
        }
    },
    states: {
        created: {
            on: {
                "EVENT": { actions: [] },
                "MEASURE": {
                    actions: ["torPositionSet"]
                }
            }
        }
    },
    types: {} as { context: Context; events: Events; input: Input },
}, {
    actions: {
        torPositionSet: assign(({ context, event }) => {
            if (event.type === "MEASURE") {
                const data: AlignEventData = event.params
                //@ts-ignore
                context.params.position = [data.center.x, data.center.y, data.center.z]
                //@ts-ignore
                console.log(context.params.position, data)
            }
            return context
        })
    }
}
)

export type SimulatorActorType = Actor<ActorLogic<any, Events, Input, any>>
