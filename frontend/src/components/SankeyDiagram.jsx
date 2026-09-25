import { useEffect, useMemo, useRef, useState } from "react";
import {
  SANKEY_HEIGHT,
  SANKEY_LABEL_FONT_SIZE,
  SANKEY_NODE_WIDTH,
  buildSankeyLayout,
  labelWithValue,
} from "../utils/sankeyLayout.js";

export default function SankeyDiagram({ data }) {
  const containerRef = useRef(null);
  const [width, setWidth] = useState(900);

  useEffect(() => {
    function measure() {
      if (containerRef.current) setWidth(Math.max(containerRef.current.clientWidth, 600));
    }
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  const computed = useMemo(() => {
    return buildSankeyLayout(data, width);
  }, [data, width]);

  if (!computed) {
    return (
      <div ref={containerRef}>
        <p className="empty">Pas assez de données pour afficher le diagramme.</p>
      </div>
    );
  }

  const { leftX, rightX } = computed;

  return (
    <div ref={containerRef}>
      <svg viewBox={`0 0 ${computed.diagramWidth} ${SANKEY_HEIGHT}`} width="100%" height={SANKEY_HEIGHT}>
        {computed.ribbons.map((r) => (
          <path
            key={r.key}
            d={`M ${r.x1} ${r.sourceY} C ${r.middleX} ${r.sourceY} ${r.middleX} ${r.targetY} ${r.x2} ${r.targetY}`}
            stroke={r.color}
            strokeWidth={r.strokeWidth}
            fill="none"
            strokeOpacity={0.45}
          />
        ))}
        {computed.left.map((n) => (
          <g key={n.id}>
            <rect x={leftX} y={n.y0} width={SANKEY_NODE_WIDTH} height={n.h} fill={n.color || "#555555"} />
            <text
              x={leftX - 8}
              y={(n.y0 + n.y1) / 2}
              fontSize={SANKEY_LABEL_FONT_SIZE}
              dominantBaseline="middle"
              textAnchor="end"
            >
              {labelWithValue(n)}
            </text>
          </g>
        ))}
        {computed.right.map((n) => (
          <g key={n.id}>
            <rect x={rightX} y={n.y0} width={SANKEY_NODE_WIDTH} height={n.h} fill={n.color || "#555555"} />
            <text
              x={rightX + SANKEY_NODE_WIDTH + 8}
              y={(n.y0 + n.y1) / 2}
              fontSize={SANKEY_LABEL_FONT_SIZE}
              dominantBaseline="middle"
              textAnchor="start"
            >
              {labelWithValue(n)}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}
