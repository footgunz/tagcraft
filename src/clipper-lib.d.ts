declare module 'clipper-lib' {
  export interface IntPoint {
    X: number
    Y: number
  }
  export type Path = IntPoint[]
  export type Paths = Path[]

  export class Clipper {
    AddPaths(paths: Paths, polyType: number, closed: boolean): boolean
    Execute(clipType: number, solution: Paths, subjFillType?: number, clipFillType?: number): boolean
    static Orientation(path: Path): boolean
    static CleanPolygons(paths: Paths, distance?: number): Paths
    static Area(path: Path): number
  }
  export class ClipperOffset {
    constructor(miterLimit?: number, arcTolerance?: number)
    AddPaths(paths: Paths, joinType: number, endType: number): void
    Execute(solution: Paths, delta: number): void
  }
  export const ClipType: { ctIntersection: number; ctUnion: number; ctDifference: number; ctXor: number }
  export const PolyType: { ptSubject: number; ptClip: number }
  export const PolyFillType: { pftEvenOdd: number; pftNonZero: number; pftPositive: number; pftNegative: number }
  export const JoinType: { jtSquare: number; jtRound: number; jtMiter: number }
  export const EndType: { etClosedPolygon: number; etClosedLine: number; etOpenButt: number; etOpenSquare: number; etOpenRound: number }
  export const JS: {
    Lighten(paths: Paths, tolerance: number): Paths
  }

  const ClipperLib: {
    Clipper: typeof Clipper
    ClipperOffset: typeof ClipperOffset
    ClipType: typeof ClipType
    PolyType: typeof PolyType
    PolyFillType: typeof PolyFillType
    JoinType: typeof JoinType
    EndType: typeof EndType
    JS: typeof JS
  }
  export default ClipperLib
}
