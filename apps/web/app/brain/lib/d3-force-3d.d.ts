declare module 'd3-force-3d' {
  export interface SimulationNodeDatum {
    index?: number
    x?: number
    y?: number
    z?: number
    vx?: number
    vy?: number
    vz?: number
    fx?: number | null
    fy?: number | null
    fz?: number | null
  }

  export interface Force<Datum extends SimulationNodeDatum> {
    (alpha: number): void
    initialize?: (nodes: Datum[], random?: () => number) => void
  }

  export interface ForceCollide<Datum extends SimulationNodeDatum> extends Force<Datum> {
    radius(): (node: Datum, i: number, nodes: Datum[]) => number
    radius(radius: number | ((node: Datum, i: number, nodes: Datum[]) => number)): this
    strength(): number
    strength(strength: number): this
    iterations(): number
    iterations(iterations: number): this
  }

  export function forceCollide<Datum extends SimulationNodeDatum = SimulationNodeDatum>(
    radius?: number | ((node: Datum, i: number, nodes: Datum[]) => number),
  ): ForceCollide<Datum>
}
