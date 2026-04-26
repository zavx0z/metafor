import type { DarkMetaParticleModel } from "@store/meta/sqlite";
import type Database from "bun:sqlite";
import type { MetaforStore } from ".";
import type { MetaStoreOrm } from "./meta/meta.t";
import type { MetaDSL } from "../metafor.t";

export interface OpenServerStoreOptions {
    filename?: string;
    metaFilename?: string;
    actorFilename?: string;
    viewFilename?: string;
}

export interface ServerMetaStoreOrm extends MetaStoreOrm {
    readonly database: Database
    create(src: string, meta: MetaDSL): void
    model(src: string): DarkMetaParticleModel
}

export interface ServerMetaforStore extends MetaforStore {
    meta: ServerMetaStoreOrm
}

