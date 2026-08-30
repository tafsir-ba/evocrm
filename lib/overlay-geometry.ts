export type LayoutBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export function boxesOverlap(a: LayoutBox, b: LayoutBox, epsilon = 0.5): boolean {
  return (
    a.x < b.x + b.width - epsilon &&
    a.x + a.width > b.x + epsilon &&
    a.y < b.y + b.height - epsilon &&
    a.y + a.height > b.y + epsilon
  );
}
