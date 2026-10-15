export function floatingListPosition(rect, { width, height, top = 0, left = 0, layoutHeight = height }) {
  const below = top + height - rect.bottom - 8;
  const above = rect.top - top - 8;
  const upwards = below < 160 && above > below;
  const listWidth = Math.min(Math.max(rect.width, 220), width - 16);
  return {
    position: "fixed",
    width: listWidth,
    left: Math.max(left + 8, Math.min(rect.left, left + width - listWidth - 8)),
    top: upwards ? "auto" : rect.bottom + 2,
    bottom: upwards ? layoutHeight - rect.top + 2 : "auto",
    maxHeight: Math.max(0, Math.min(240, upwards ? above : below)),
  };
}
