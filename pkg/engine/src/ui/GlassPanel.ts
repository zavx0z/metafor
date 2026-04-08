import { Object3D } from "../core/Object3D";
import { Mesh } from "../core/Mesh";
import { PlaneGeometry } from "../geometries/PlaneGeometry";
import { GlassMaterial } from "../materials/GlassMaterial";
import { LayoutProps } from "../layout/LayoutTypes";
import { Color } from "../math/Color";

export class GlassPanel extends Object3D {
    public layout: LayoutProps;
    private mesh: Mesh;

    constructor(layoutProps: LayoutProps) {
        super();
        this.name = 'GlassPanel';
        this.layout = layoutProps;

        const geometry = new PlaneGeometry({ width: 1, height: 1 });
        const material = new GlassMaterial();
        this.mesh = new Mesh(geometry, material);
        this.add(this.mesh);
    }
}