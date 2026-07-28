import {Atom} from "./Atom.ts"
import {Axion} from "./Axion.ts"
import {Field} from "./Field.ts"
import {Fields} from "./Fields.ts"
import {Finally} from "./Finally.ts"
import {Matter} from "./Matter.ts"
import {Process} from "./Process.ts"
import {Reaction} from "./Reaction.ts"
import {State} from "./State.ts"
import {States} from "./States.ts"
import {Transition} from "./Transition.ts"
import type {VisualComponent} from "./internal/component.ts"

export const Visual = Object.freeze([
  Atom,
  Matter,
  Field,
  Fields,
  State,
  States,
  Transition,
  Process,
  Reaction,
  Finally,
  Axion,
]) satisfies readonly VisualComponent[]

export const visualComponentForSlug = (
  slug: string,
): VisualComponent => Visual.find((component) => component.slug === slug) ?? Atom
