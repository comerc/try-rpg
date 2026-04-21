declare module 'easystarjs' {
  namespace EasyStar {
    class js {
      setGrid(grid: number[][]): void;
      setAcceptableTiles(tiles: number[]): void;
      enableDiagonals(): void;
      disableDiagonals(): void;
      disableCornerCutting(): void;
      enableCornerCutting(): void;
      setIterationsPerCalculation(n: number): void;
      findPath(
        startX: number,
        startY: number,
        endX: number,
        endY: number,
        callback: (path: { x: number; y: number }[] | null) => void,
      ): void;
      calculate(): void;
    }
  }
  export default EasyStar;
}
