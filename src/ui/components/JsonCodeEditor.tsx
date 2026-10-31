import React, { useEffect, useRef } from "react";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { json } from "@codemirror/lang-json";
import { bracketMatching, indentOnInput, syntaxHighlighting } from "@codemirror/language";
import { classHighlighter } from "@lezer/highlight";
import { Compartment, EditorState } from "@codemirror/state";
import {
  EditorView,
  highlightActiveLine,
  keymap,
  lineNumbers,
  placeholder,
} from "@codemirror/view";

/**
 * A small controlled CodeMirror 6 editor for JSON. Syntax highlighting + line
 * numbers + history; no autocomplete/lint (kept light). Reports raw text via
 * `onChange`; the parent owns parsing/validation.
 */
export function JsonCodeEditor({
  value,
  onChange,
  readOnly = false,
  placeholderText = "{ }",
}: {
  value: string;
  onChange: (text: string) => void;
  readOnly?: boolean;
  placeholderText?: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const editableComp = useRef(new Compartment());

  // Create the view once.
  useEffect(() => {
    if (!host.current) return;
    const editableExt = [EditorView.editable.of(!readOnly), EditorState.readOnly.of(readOnly)];
    const state = EditorState.create({
      doc: value,
      extensions: [
        lineNumbers(),
        history(),
        indentOnInput(),
        bracketMatching(),
        highlightActiveLine(),
        // Emit `tok-*` classes and color them from theme tokens (styles.css), so
        // the editor follows the dashboard's light/dark theme like every surface.
        syntaxHighlighting(classHighlighter),
        json(),
        placeholder(placeholderText),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        editableComp.current.of(editableExt),
        EditorView.updateListener.of((u) => {
          if (u.docChanged) onChangeRef.current(u.state.doc.toString());
        }),
        EditorView.theme({
          "&": { fontSize: "12px", backgroundColor: "transparent" },
          "&.cm-focused": { outline: "none" },
          ".cm-content": {
            fontFamily:
              "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace",
          },
          ".cm-gutters": {
            backgroundColor: "transparent",
            border: "none",
            color: "var(--muted-foreground)",
          },
          ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--foreground)" },
          ".cm-activeLine, .cm-activeLineGutter": {
            backgroundColor: "color-mix(in oklab, var(--muted) 60%, transparent)",
          },
          "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection": {
            backgroundColor: "color-mix(in oklab, var(--accent) 25%, transparent)",
          },
          ".cm-placeholder": { color: "var(--muted-foreground)" },
        }),
      ],
    });
    const v = new EditorView({ state, parent: host.current });
    view.current = v;
    return () => {
      v.destroy();
      view.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reconcile external value → editor (e.g. operator switch, reset).
  useEffect(() => {
    const v = view.current;
    if (v && value !== v.state.doc.toString()) {
      v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: value } });
    }
  }, [value]);

  // Reconcile readOnly.
  useEffect(() => {
    view.current?.dispatch({
      effects: editableComp.current.reconfigure([
        EditorView.editable.of(!readOnly),
        EditorState.readOnly.of(readOnly),
      ]),
    });
  }, [readOnly]);

  return (
    <div
      ref={host}
      className="w-full overflow-hidden rounded-md border border-input bg-background py-1 text-left"
    />
  );
}
