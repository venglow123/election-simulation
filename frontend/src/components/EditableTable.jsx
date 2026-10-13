import { useId, useRef } from "react";
import { useGridNavigation } from "../hooks/useGridNavigation.js";
import { useRowReorder } from "../hooks/useRowReorder.js";
import RowDragPreview from "./RowDragPreview.jsx";
import ReorderHandle from "./ReorderHandle.jsx";
import ReorderFeedback from "./ReorderFeedback.jsx";

export default function EditableTable({
  columns,
  rows,
  getRowKey,
  renderDraftCell,
  onEnterLastRow,
  footer,
  onReorder,
  getRowLabel = getRowKey,
  className = "data-table grid-table",
}) {
  const tableRef = useRef(null);
  const instructionsId = useId();
  const { drag, error, announcement, handleProps } = useRowReorder(tableRef, {
    rows, getRowKey, getRowLabel, onReorder,
  });
  useGridNavigation(tableRef, { onEnterLastRow });

  return (
    <>
      <table className={className} ref={tableRef}>
        <thead>
          <tr>
            {onReorder && <th className="row-handle-cell"><span className="table-sr-only">Ordre</span></th>}
            {columns.map((column) => <th key={column.key}>{column.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={getRowKey(row)} className={drag?.index === rowIndex ? "row-drag-source" : undefined}>
              {onReorder && (
                <td className="row-handle-cell">
                  <ReorderHandle label={getRowLabel(row)} instructionsId={instructionsId} handleProps={handleProps(rowIndex)} />
                </td>
              )}
              {columns.map((column, columnIndex) => (
                <td key={column.key} className={column.cellClassName}>
                  {column.render(row, rowIndex, columnIndex)}
                </td>
              ))}
            </tr>
          ))}
          {renderDraftCell && (
            <tr className="new-row">
              {onReorder && <td className="row-handle-cell" />}
              {columns.map((column, columnIndex) => (
                <td key={column.key} className={column.cellClassName}>
                  {renderDraftCell(column, columnIndex)}
                </td>
              ))}
            </tr>
          )}
        </tbody>
        {footer && <tfoot>{footer}</tfoot>}
      </table>
      {onReorder && (
        <ReorderFeedback instructionsId={instructionsId} error={error} announcement={announcement} />
      )}
      {drag && <RowDragPreview drag={drag} />}
    </>
  );
}