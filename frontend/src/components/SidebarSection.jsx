import { Fragment } from "react";

export default function SidebarSection({
  title,
  actions,
  items,
  getItemKey,
  renderItem,
  emptyMessage,
  listClassName,
  emptyClassName,
}) {
  return (
    <>
      <div className="sidebar-section-header">
        <h2 className="sidebar-section-title">{title}</h2>
        <div className="sidebar-section-actions">{actions}</div>
      </div>
      <nav className={listClassName}>
        {items.length === 0 && <p className={emptyClassName}>{emptyMessage}</p>}
        {items.map((item) => (
          <Fragment key={getItemKey(item)}>{renderItem(item)}</Fragment>
        ))}
      </nav>
    </>
  );
}