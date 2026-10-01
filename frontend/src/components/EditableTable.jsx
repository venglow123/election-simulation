import { useRef } from "react";
import { useGridNavigation } from "../hooks/useGridNavigation.js";

export default function EditableTable({
  columns,
  rows,
  getRowKey,
  renderDraftCell,
  onEnterLastRow,
  footer,
  className = "data-table grid-table",
}) {
  const tableRef = useRef(null);
  useGridNavigation(tableRef, { onEnterLastRow });

  return (
    <table className={className} ref={tableRef}>
      <thead>
        <tr>{columns.map((column) => <th key={column.key}>{column.label}</th>)}</tr>
      </thead>
      <tbody>
        {rows.map((row, rowIndex) => (
          <tr key={getRowKey(row)}>
            {columns.map((column, columnIndex) => (
              <td key={column.key} className={column.cellClassName}>
                {column.render(row, rowIndex, columnIndex)}
              </td>
            ))}
          </tr>
        ))}
        {renderDraftCell && (
          <tr className="new-row">
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
  );
}