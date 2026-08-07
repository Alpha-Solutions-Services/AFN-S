"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";

type ConfirmOpts = {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
};

type UiContextValue = {
  confirm: (opts: ConfirmOpts) => Promise<boolean>;
};

const UiContext = createContext<UiContextValue | null>(null);

export function useUi() {
  const ctx = useContext(UiContext);
  if (!ctx) throw new Error("useUi must be used within UiProvider");
  return ctx;
}

export function useUiOptional() {
  return useContext(UiContext);
}

export function UiProvider({ children }: { children: ReactNode }) {
  const [confirmState, setConfirmState] = useState<
    (ConfirmOpts & { resolve: (v: boolean) => void }) | null
  >(null);

  const confirm = useCallback((opts: ConfirmOpts) => {
    return new Promise<boolean>((resolve) => {
      setConfirmState({ ...opts, resolve });
    });
  }, []);

  const value = useMemo(() => ({ confirm }), [confirm]);

  return (
    <UiContext.Provider value={value}>
      {children}

      {confirmState ? (
        <div
          className="fixed inset-0 z-[110] flex items-end justify-center bg-black/70 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-title"
        >
          <div className="w-full max-w-md rounded-lg border border-border bg-panel p-6 shadow-xl">
            <h2
              id="confirm-title"
              className="text-lg font-semibold text-text"
            >
              {confirmState.title}
            </h2>
            <p className="mt-2 text-sm text-muted">{confirmState.message}</p>
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  confirmState.resolve(false);
                  setConfirmState(null);
                }}
              >
                {confirmState.cancelLabel || "Cancel"}
              </button>
              <button
                type="button"
                className={cn(
                  "inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-medium transition-colors",
                  confirmState.danger
                    ? "border border-danger bg-danger text-bg hover:bg-danger/90"
                    : "btn-primary",
                )}
                onClick={() => {
                  confirmState.resolve(true);
                  setConfirmState(null);
                }}
              >
                {confirmState.confirmLabel || "Confirm"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </UiContext.Provider>
  );
}
