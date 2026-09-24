// Plot n on the master map, spiralling out from (0,0) so every new plot lands on the frontier
// right next to existing neighbours.
export function spiral(n) {
  if (n === 0) return { x: 0, y: 0 };
  const k = Math.ceil((Math.sqrt(n + 1) - 1) / 2);   // which ring
  const side = 2 * k;
  const start = (2 * k - 1) ** 2;                     // first index in this ring
  const off = n - start;
  const edge = Math.floor(off / side), pos = off % side;
  switch (edge) {
    case 0: return { x: k, y: -k + 1 + pos };          // right edge, going down
    case 1: return { x: k - 1 - pos, y: k };           // bottom edge, going left
    case 2: return { x: -k, y: k - 1 - pos };          // left edge, going up
    default: return { x: -k + 1 + pos, y: -k };        // top edge, going right
  }
}
