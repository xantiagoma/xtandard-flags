import React, { createContext, useCallback, useContext, useEffect, useId, useReducer } from "react";

export type ToastKind = "success" | "error" | "info" | "warning";

export interface Toast {
  id: string;
  kind: ToastKind;
  message: string;
  detail?: string;
}

interface ToastState {
  toasts: Toast[];
}

type Action = { type: "add"; toast: Toast } | { type: "remove"; id: string };

function reducer(state: ToastState, action: Action): ToastState {
  switch (action.type) {
    case "add":
      return { toasts: [...state.toasts, action.toast] };
    case "remove":
      return { toasts: state.toasts.filter((t) => t.id !== action.id) };
    default:
      return state;
  }
}

interface ToastContextValue {
  add: (kind: ToastKind, message: string, detail?: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}

function ToastItem({ toast, onRemove }: { toast: Toast; onRemove: (id: string) => void }) {
  useEffect(() => {
    const t = setTimeout(() => onRemove(toast.id), 4500);
    return () => clearTimeout(t);
  }, [toast.id, onRemove]);

  const kindStyle: Record<ToastKind, string> = {
    success: "border-green-500/30 text-green-400",
    error: "border-red-500/30 text-red-400",
    warning: "border-amber-500/30 text-amber-400",
    info: "border-sky-500/30 text-sky-400",
  };

  const dot: Record<ToastKind, string> = {
    success: "bg-green-500",
    error: "bg-red-500",
    warning: "bg-amber-500",
    info: "bg-sky-500",
  };

  return (
    <div
      role="alert"
      style={{
        background: "var(--color-elevated)",
        border: "1px solid var(--color-border-strong)",
        borderRadius: "var(--radius-md)",
        padding: "12px 14px",
        display: "flex",
        alignItems: "flex-start",
        gap: "10px",
        minWidth: "280px",
        maxWidth: "380px",
        boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
        animation: "toastIn 160ms ease-out",
      }}
      className={kindStyle[toast.kind]}
    >
      <span
        style={{
          width: "8px",
          height: "8px",
          borderRadius: "50%",
          flexShrink: 0,
          marginTop: "5px",
        }}
        className={dot[toast.kind]}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <p
          style={{
            margin: 0,
            fontSize: "13px",
            fontWeight: 500,
            color: "var(--color-text)",
            lineHeight: "1.4",
          }}
        >
          {toast.message}
        </p>
        {toast.detail && (
          <p
            style={{
              margin: "3px 0 0",
              fontSize: "12px",
              color: "var(--color-muted)",
              lineHeight: "1.4",
            }}
          >
            {toast.detail}
          </p>
        )}
      </div>
      <button
        aria-label="Dismiss"
        onClick={() => onRemove(toast.id)}
        style={{
          background: "none",
          border: "none",
          cursor: "pointer",
          color: "var(--color-faint)",
          padding: "2px",
          lineHeight: 1,
          flexShrink: 0,
        }}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path
            d="M2 2l10 10M12 2L2 12"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      </button>

      <style>{`
        @keyframes toastIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, { toasts: [] });

  const add = useCallback((kind: ToastKind, message: string, detail?: string) => {
    const id = `${Date.now()}-${Math.random()}`;
    dispatch({ type: "add", toast: { id, kind, message, detail } });
  }, []);

  const remove = useCallback((id: string) => {
    dispatch({ type: "remove", id });
  }, []);

  return (
    <ToastContext.Provider value={{ add }}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="false"
        style={{
          position: "fixed",
          bottom: "24px",
          right: "24px",
          display: "flex",
          flexDirection: "column",
          gap: "8px",
          zIndex: 9999,
        }}
      >
        {state.toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onRemove={remove} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}
