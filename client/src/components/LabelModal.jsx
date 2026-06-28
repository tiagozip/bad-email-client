import { Button, Dialog, DialogRoot, Input, Select } from "@cloudflare/kumo";
import { Check, Plus, Trash, X } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { api } from "../api.js";
import { notifyError } from "../toast.js";

const PALETTE = ["#bf3264", "#e0789f", "#8b7fd6", "#5aa9e6", "#5fcf80", "#e6b450"];
const FIELD_LABELS = { from: "From", to: "To", subject: "Subject", body: "Body" };
const OP_LABELS = { contains: "contains", is: "is", startsWith: "starts with" };

function emptyCondition() {
  return { field: "from", op: "contains", value: "" };
}

export function LabelModal({ open, label, onClose, onSaved }) {
  const editing = !!label;
  const [name, setName] = useState("");
  const [color, setColor] = useState(PALETTE[2]);
  const [match, setMatch] = useState("all");
  const [conditions, setConditions] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setError("");
    setBusy(false);
    if (label) {
      setName(label.name || "");
      setColor(label.color || PALETTE[2]);
      setMatch(label.rule?.match === "any" ? "any" : "all");
      setConditions(
        (label.rule?.conditions || []).map((c) => ({
          field: c.field,
          op: c.op,
          value: c.value,
        })),
      );
    } else {
      setName("");
      setColor(PALETTE[2]);
      setMatch("all");
      setConditions([]);
    }
  }, [open, label]);

  function setCondition(i, patch) {
    setConditions((p) => p.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  }

  async function save() {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Name is required.");
      return;
    }
    const clean = conditions
      .map((c) => ({ field: c.field, op: c.op, value: c.value.trim() }))
      .filter((c) => c.value);
    const rule = clean.length ? { match, conditions: clean } : null;
    setBusy(true);
    setError("");
    try {
      if (editing) await api.updateLabel(label.id, { name: trimmed, color, rule });
      else await api.createLabel(trimmed, color, rule);
      onSaved?.();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!editing) return;
    setBusy(true);
    try {
      await api.deleteLabel(label.id);
      onSaved?.();
      onClose();
    } catch (err) {
      notifyError(err);
      setBusy(false);
    }
  }

  return (
    <DialogRoot open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog className="em-label-dialog" style={{ width: 520, maxWidth: "94vw" }}>
        <div className="em-label-head">
          <Dialog.Title className="em-label-title">{editing ? "Edit label" : "New label"}</Dialog.Title>
          <Button
            size="sm"
            variant="ghost"
            shape="square"
            aria-label="Close"
            icon={X}
            onClick={onClose}
          />
        </div>

        <div className="em-label-body">
          <div className="em-label-field">
            <span className="em-label-fieldlabel">Name</span>
            <Input
              autoFocus
              placeholder="Label name"
              aria-label="Label name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setError("");
              }}
            />
          </div>

          <div className="em-label-field">
            <span className="em-label-fieldlabel">Color</span>
            <div className="em-swatch-grid">
              {PALETTE.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`em-swatch${color === c ? " is-selected" : ""}`}
                  style={{ background: c }}
                  aria-label={`Color ${c}`}
                  onClick={() => setColor(c)}
                >
                  {color === c && <Check size={14} weight="bold" color="#fff" />}
                </button>
              ))}
            </div>
          </div>

          <div className="em-label-field">
            <div className="em-rule-head">
              <span className="em-label-fieldlabel">Auto-apply when</span>
              <div className="em-rule-match">
                <button
                  type="button"
                  className={`em-rule-toggle${match === "all" ? " is-active" : ""}`}
                  onClick={() => setMatch("all")}
                >
                  All
                </button>
                <button
                  type="button"
                  className={`em-rule-toggle${match === "any" ? " is-active" : ""}`}
                  onClick={() => setMatch("any")}
                >
                  Any
                </button>
              </div>
            </div>

            {conditions.length === 0 ? (
              <div className="em-rule-empty">
                No conditions. This label stays a manual tag.
              </div>
            ) : (
              <div className="em-rule-list">
                {conditions.map((c, i) => (
                  <div key={i} className="em-rule-row">
                    <Select
                      aria-label="Field"
                      size="sm"
                      value={c.field}
                      onValueChange={(v) => setCondition(i, { field: v })}
                    >
                      {Object.entries(FIELD_LABELS).map(([k, v]) => (
                        <Select.Option key={k} value={k}>
                          {v}
                        </Select.Option>
                      ))}
                    </Select>
                    <Select
                      aria-label="Operator"
                      size="sm"
                      value={c.op}
                      onValueChange={(v) => setCondition(i, { op: v })}
                    >
                      {Object.entries(OP_LABELS).map(([k, v]) => (
                        <Select.Option key={k} value={k}>
                          {v}
                        </Select.Option>
                      ))}
                    </Select>
                    <Input
                      size="sm"
                      placeholder="value"
                      aria-label="Value"
                      value={c.value}
                      onChange={(e) => setCondition(i, { value: e.target.value })}
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      shape="square"
                      aria-label="Remove condition"
                      icon={Trash}
                      onClick={() => setConditions((p) => p.filter((_, idx) => idx !== i))}
                    />
                  </div>
                ))}
              </div>
            )}

            {conditions.length < 10 && (
              <Button
                size="sm"
                variant="outline"
                icon={Plus}
                onClick={() => setConditions((p) => [...p, emptyCondition()])}
              >
                Add condition
              </Button>
            )}
          </div>

          {error && <div className="em-form-error">{error}</div>}
        </div>

        <div className="em-label-foot">
          {editing && (
            <Button className="em-label-delete" variant="ghost" icon={Trash} loading={busy} onClick={remove}>
              Delete
            </Button>
          )}
          <div className="em-label-foot-right">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" loading={busy} onClick={save}>
              {editing ? "Save" : "Create"}
            </Button>
          </div>
        </div>
      </Dialog>
    </DialogRoot>
  );
}
