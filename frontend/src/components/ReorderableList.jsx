import { useId, useRef } from "react";
import { useRowReorder } from "../hooks/useRowReorder.js";
import ReorderHandle from "./ReorderHandle.jsx";
import ReorderFeedback from "./ReorderFeedback.jsx";
import RowDragPreview from "./RowDragPreview.jsx";

export default function ReorderableList({
  items, getItemKey, getItemLabel, onReorder, renderItem,
  className, itemClassName, handleClassName, scopeKey, as: Container = "ul",
  emptyMessage, emptyClassName,
}) {
  const containerRef = useRef(null);
  const instructionsId = useId();
  const { drag, error, announcement, handleProps } = useRowReorder(containerRef, {
    rows: items, getRowKey: getItemKey, getRowLabel: getItemLabel, onReorder,
    itemSelector: "[data-reorder-item]", scopeKey,
  });
  const Item = Container === "ul" ? "li" : "div";
  return (
    <>
      <Container ref={containerRef} className={className}>
        {items.length === 0 && (Container === "ul"
          ? <li className={emptyClassName}>{emptyMessage}</li>
          : <p className={emptyClassName}>{emptyMessage}</p>)}
        {items.map((item, index) => (
          <Item
            key={getItemKey(item)}
            data-reorder-item=""
            className={`${typeof itemClassName === "function" ? itemClassName(item) : itemClassName || ""} ${drag?.index === index ? "row-drag-source" : ""}`}
          >
            <ReorderHandle
              label={getItemLabel(item)}
              instructionsId={instructionsId}
              handleProps={handleProps(index)}
              className={handleClassName}
            />
            {renderItem(item)}
          </Item>
        ))}
      </Container>
      <ReorderFeedback instructionsId={instructionsId} error={error} announcement={announcement} />
      {drag && <RowDragPreview drag={drag} />}
    </>
  );
}
