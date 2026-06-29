import React, { useState } from "react";
import type { FlagType } from "../types.ts";
import { Modal } from "../components/Modal.tsx";
import { Button, Input, Select } from "../components/Button.tsx";

interface Props {
  open: boolean;
  onClose: () => void;
  onCreate: (key: string, type: FlagType) => void;
}

export function CreateFlagModal({ open, onClose, onCreate }: Props) {
  const [key, setKey] = useState("");
  const [type, setType] = useState<FlagType>("boolean");
  const [error, setError] = useState("");

  const handleClose = () => {
    setKey("");
    setType("boolean");
    setError("");
    onClose();
  };

  const handleCreate = () => {
    if (!key.trim()) {
      setError("Key is required");
      return;
    }
    if (!/^[a-zA-Z0-9._-]+$/.test(key)) {
      setError("Only letters, digits, periods, underscores, and hyphens allowed");
      return;
    }
    onCreate(key.trim(), type);
    handleClose();
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="New flag"
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={handleClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleCreate}>
            Continue to editor
          </Button>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
        <p style={{ margin: 0, fontSize: "13px", color: "var(--color-muted)" }}>
          Choose a unique key and type. You'll configure variants, rules, and targeting in the
          editor.
        </p>
        <Input
          label="Key"
          value={key}
          placeholder="my.feature-flag_v2"
          error={error}
          onChange={(e) => {
            setKey(e.target.value);
            setError("");
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleCreate();
          }}
          style={{ fontFamily: "var(--font-mono)", fontSize: "13px" }}
          autoFocus
        />
        <Select label="Type" value={type} onChange={(e) => setType(e.target.value as FlagType)}>
          <option value="boolean">boolean — on / off</option>
          <option value="string">string — text variants</option>
          <option value="number">number — numeric variants</option>
          <option value="json">json — structured variants</option>
        </Select>
        <div
          style={{
            background: "var(--color-elevated)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-sm)",
            padding: "10px 12px",
          }}
        >
          <p
            style={{
              margin: "0 0 4px",
              fontSize: "11px",
              fontWeight: 600,
              color: "var(--color-faint)",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            Default variants
          </p>
          <p
            style={{
              margin: 0,
              fontSize: "12px",
              color: "var(--color-muted)",
              fontFamily: "var(--font-mono)",
            }}
          >
            {type === "boolean" && "on: true  /  off: false"}
            {type === "string" && 'control: "control"  /  treatment: "treatment"'}
            {type === "number" && "zero: 0  /  one: 1"}
            {type === "json" && "control: {}  /  treatment: {}"}
          </p>
        </div>
      </div>
    </Modal>
  );
}
