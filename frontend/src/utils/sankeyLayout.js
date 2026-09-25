export const SANKEY_HEIGHT = 480;
export const SANKEY_MARGIN_TOP = 20;
export const SANKEY_MIN_MARGIN_SIDE = 160;
export const SANKEY_LABEL_FONT_SIZE = 12;
export const SANKEY_LABEL_CHAR_WIDTH = 7.2;
export const SANKEY_NODE_WIDTH = 16;
export const SANKEY_GAP = 8;
export const SANKEY_MIN_FLOW_WIDTH = 180;

export function labelWithValue(node) {
  return `${node.label} (${Math.round(node.value)})`;
}

function labelWidth(node) {
  return labelWithValue(node).length * SANKEY_LABEL_CHAR_WIDTH;
}

function layoutColumn(nodes, scale) {
  let y = SANKEY_MARGIN_TOP;
  return nodes.map((node) => {
    const height = Math.max(node.value * scale, 1);
    const positioned = { ...node, y0: y, y1: y + height, h: height };
    y += height + SANKEY_GAP;
    return positioned;
  });
}

export function buildSankeyLayout(data, width = 900) {
  if (!data?.nodesLeft?.length) return null;

  const plotHeight = SANKEY_HEIGHT - SANKEY_MARGIN_TOP * 2;
  const total = data.nodesLeft.reduce((sum, node) => sum + node.value, 0) || 1;
  const usableHeight = plotHeight - SANKEY_GAP * (data.nodesLeft.length - 1);
  const scale = usableHeight / total;
  const left = layoutColumn(data.nodesLeft, scale);
  const right = layoutColumn(data.nodesRight, scale);
  const leftMargin = Math.max(SANKEY_MIN_MARGIN_SIDE, ...data.nodesLeft.map(labelWidth));
  const rightMargin = Math.max(SANKEY_MIN_MARGIN_SIDE, ...data.nodesRight.map(labelWidth));
  const diagramWidth = Math.max(
    width,
    leftMargin + rightMargin + SANKEY_NODE_WIDTH * 2 + SANKEY_MIN_FLOW_WIDTH
  );
  const leftX = leftMargin;
  const rightX = diagramWidth - rightMargin - SANKEY_NODE_WIDTH;
  const middleX = (leftX + SANKEY_NODE_WIDTH + rightX) / 2;
  const leftById = Object.fromEntries(left.map((node) => [node.id, node]));
  const leftCursor = Object.fromEntries(left.map((node) => [node.id, node.y0]));
  const rightCursor = Object.fromEntries(right.map((node) => [node.id, node.y0]));
  const ribbons = (data.links || []).map((link, index) => {
    const height = Math.max(link.value * scale, 0.5);
    const sourceY = leftCursor[link.source] + height / 2;
    const targetY = rightCursor[link.target] + height / 2;
    leftCursor[link.source] += height;
    rightCursor[link.target] += height;
    return {
      key: index,
      sourceY,
      targetY,
      x1: leftX + SANKEY_NODE_WIDTH,
      x2: rightX,
      middleX,
      color: leftById[link.source]?.color || "#999999",
      strokeWidth: height,
    };
  });

  return { left, right, ribbons, diagramWidth, leftX, rightX };
}
