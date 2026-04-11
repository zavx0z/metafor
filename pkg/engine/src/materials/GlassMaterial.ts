import { Material, type MaterialParameters } from "./Material";
import { Color } from "../math";

export interface GlassMaterialParameters extends MaterialParameters {
    tintColor?: Color;
    opacity?: number;
    matte?: number;
}

export class GlassMaterial extends Material {
    public override readonly isGlassMaterial = true as const;
    public tintColor: Color;
    public opacity: number;
    public matte: number;

    constructor(parameters: GlassMaterialParameters = {}) {
        super(parameters);
        this.tintColor = parameters.tintColor ?? new Color(0.1, 0.1, 0.1, 0.2);
        this.opacity = parameters.opacity ?? 0.2;
        this.matte = parameters.matte ?? this.tintColor.a;
    }
}
