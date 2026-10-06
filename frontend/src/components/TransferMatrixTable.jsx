import { useState } from "react";
import Candidate, { Abstention } from "./Candidate.jsx";
import CandidateAutocomplete from "./CandidateAutocomplete.jsx";
import EditableTable from "./EditableTable.jsx";

const ABSTENTION_ROW_ID = "abstention";

function remainingPct(row) {
  const a = parseFloat(String(row.pct_to_a).replace(",", ".")) || 0;
  const b = parseFloat(String(row.pct_to_b).replace(",", ".")) || 0;
  return 100 - a - b;
}

export default function TransferMatrixTable({
  title,
  hint,
  rows,
  keyField,
  keyLabel,
  keyPlaceholder,
  options,
  finalistA,
  finalistB,
  abstention,
  onFieldChange,
  onCreate,
  onDelete,
}) {
  const [draft, setDraft] = useState({ key: "", pct_to_a: "", pct_to_b: "" });
  const tableRows = abstention ? [{ id: ABSTENTION_ROW_ID, ...abstention }, ...rows] : rows;

  function withCandidate(name, content, editable = true) {
    return keyField === "name" ? <Candidate name={name} editable={editable}>{content}</Candidate> : content;
  }

  function submitDraft(selectedKey) {
    const key = (typeof selectedKey === "string" ? selectedKey : draft.key).trim();
    if (!key) return;
    onCreate({ key, pct_to_a: draft.pct_to_a || 0, pct_to_b: draft.pct_to_b || 0 })
      .then(() => setDraft({ key: "", pct_to_a: "", pct_to_b: "" }))
      .catch(() => {});
  }

  function renderPctInput(row, field) {
    const isAbstention = row.id === ABSTENTION_ROW_ID;
    return (
      <input
        type="text"
        inputMode="decimal"
        className="grid-input"
        aria-label={`${field === "pct_to_a" ? finalistA : finalistB} – ${isAbstention ? "abstentionnistes" : row[keyField]}`}
        value={row[field]}
        onChange={(event) => (isAbstention
          ? abstention.onChange(field, event.target.value)
          : onFieldChange(row.id, field, event.target.value))}
      />
    );
  }

  const columns = [
    {
      key: "key",
      label: keyLabel,
      render: (row) => (row.id === ABSTENTION_ROW_ID ? (
        <Abstention><span className="candidate-name-cell">Abstentionnistes 1er tour</span></Abstention>
      ) : withCandidate(row[keyField], (
        <CandidateAutocomplete
          value={row[keyField]}
          options={options}
          ariaLabel={keyLabel}
          onChange={(value) => onFieldChange(row.id, keyField, value)}
        />
      ))),
    },
    { key: "pct_to_a", label: `% vers ${finalistA || "finaliste A"}`, render: (row) => renderPctInput(row, "pct_to_a") },
    { key: "pct_to_b", label: `% vers ${finalistB || "finaliste B"}`, render: (row) => renderPctInput(row, "pct_to_b") },
    {
      key: "abstention",
      label: "% Abstention (auto)",
      render: (row) => {
        const pct = remainingPct(row);
        return <span className={`abstention-auto ${pct < 0 ? "cell-negative" : ""}`}>{pct.toFixed(2)}%</span>;
      },
    },
    {
      key: "actions",
      label: "",
      render: (row) => (row.id === ABSTENTION_ROW_ID ? null : (
        <button
          type="button"
          className="danger row-delete"
          title="Supprimer"
          onClick={() => {
            if (confirm(`Supprimer la ligne « ${row[keyField]} » ?`)) onDelete(row.id);
          }}
        >
          ✕
        </button>
      )),
    },
  ];

  return (
    <div className="panel">
      <h2>{title}</h2>
      {hint && <p className="hint">{hint}</p>}
      <EditableTable
        columns={columns}
        rows={tableRows}
        getRowKey={(row) => row.id}
        renderDraftCell={(column) => {
          if (column.key === "key") return withCandidate(draft.key, (
            <CandidateAutocomplete
              value={draft.key}
              options={options}
              ariaLabel={`Ajouter : ${keyLabel.toLowerCase()}`}
              placeholder={keyPlaceholder}
              onChange={(key) => setDraft((current) => ({ ...current, key }))}
              onEnterCommit={submitDraft}
            />
          ), false);
          if (column.key === "pct_to_a" || column.key === "pct_to_b") return (
            <input
              type="text"
              inputMode="decimal"
              className="grid-input"
              placeholder="0"
              value={draft[column.key]}
              onChange={(event) => setDraft((current) => ({ ...current, [column.key]: event.target.value }))}
            />
          );
          if (column.key === "actions") return <button type="button" onClick={submitDraft}>Ajouter</button>;
          return null;
        }}
        onEnterLastRow={submitDraft}
      />
    </div>
  );
}
