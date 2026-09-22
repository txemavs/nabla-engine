/** Mix original generated foliage with the five user-supplied Videotiro cutouts. */
export function treeSprite(index: number) {
  const generated = index % 3 === 0
  return {
    url: generated ? '/sprites/tree.png' : `/sprites/tree-${(index % 5) + 1}.png`,
    upright: true,
    crossed: true,
    saturation: generated ? 1 : 0.35,
    groundShadow: true,
  }
}
