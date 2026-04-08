import { Material, MaterialParameters } from "./Material";
import { Color } from "../math/Color";

export interface GlassMaterialParameters extends MaterialParameters {
    tintColor?: Color;
}

export class GlassMaterial extends Material {
    public readonly isGlassMaterial: true = true;
    public tintColor: Color;

    constructor(parameters: GlassMaterialParameters = {}) {
        super(parameters);
        this.tintColor = parameters.tintColor ?? new Color(0.1, 0.1, 0.1, 0.2);
        this.transparent = true;
    }
}