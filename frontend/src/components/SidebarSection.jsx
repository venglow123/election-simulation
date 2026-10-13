import ReorderableList from "./ReorderableList.jsx";

export default function SidebarSection({
  title,
  actions,
  items,
  getItemKey,
  renderItem,
  emptyMessage,
  listClassName,
  emptyClassName,
  onReorder,
  getItemLabel,
  itemClassName,
  handleClassName,
  scopeKey,
}) {
  return (
    <>
      <div className="sidebar-section-header">
        <h2 className="sidebar-section-title">{title}</h2>
        <div className="sidebar-section-actions">{actions}</div>
      </div>
      <ReorderableList
        as="nav"
        className={listClassName}
        items={items}
        getItemKey={getItemKey}
        getItemLabel={getItemLabel}
        itemClassName={itemClassName}
        handleClassName={handleClassName}
        scopeKey={scopeKey}
        onReorder={onReorder}
        renderItem={renderItem}
        emptyMessage={emptyMessage}
        emptyClassName={emptyClassName}
      />
    </>
  );
}