import { Material, type MaterialParameters } from "./Material";
import { Color } from "../math";

export interface GlassMaterialParameters extends MaterialParameters {
    tintColor?: Color;
}

export class GlassMaterial extends Material {
    public override readonly isGlassMaterial = true as const;
    public tintColor: Color;

    constructor(parameters: GlassMaterialParameters = {}) {
        super(parameters);
        this.tintColor = parameters.tintColor ?? new Color(0.1, 0.1, 0.1, 0.2);
    }
}
