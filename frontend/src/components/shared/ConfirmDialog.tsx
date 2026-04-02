"use client";

import { createContext, useContext, useState, useCallback, useRef } from "react";

interface ConfirmOptions {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn>(() => Promise.resolve(false));

export function useConfirm(): ConfirmFn {
  return useContext(ConfirmContext);
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<(ConfirmOptions & { visible: boolean }) | null>(null);
  const resolveRef = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback((options: ConfirmOptions): Promise<boolean> => {
    return new Promise((resolve) => {
      resolveRef.current = resolve;
      setState({ ...options, visible: true });
    });
  }, []);

  const handleClose = (result: boolean) => {
    setState(null);
    resolveRef.current?.(result);
    resolveRef.current = null;
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {state?.visible && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150"
            onClick={() => handleClose(false)}
          />
          {/* Dialog */}
          <div className="relative bg-surface border border-border rounded-2xl shadow-2xl shadow-black/50 w-full max-w-sm mx-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="p-5">
              {state.title && (
                <h3 className="text-white font-semibold text-base mb-1">{state.title}</h3>
              )}
              <p className="text-neutral-300 text-sm leading-relaxed">{state.message}</p>
            </div>
            <div className="flex gap-2 px-5 pb-5">
              <button
                onClick={() => handleClose(false)}
                className="flex-1 bg-white/[0.06] hover:bg-white/[0.1] text-neutral-300 hover:text-white font-medium py-2.5 rounded-lg text-sm transition-colors border border-border"
                autoFocus
              >
                {state.cancelText || "Cancelar"}
              </button>
              <button
                onClick={() => handleClose(true)}
                className={`flex-1 font-semibold py-2.5 rounded-lg text-sm transition-colors ${
                  state.danger
                    ? "bg-red-500/80 hover:bg-red-500 text-white"
                    : "bg-accent hover:bg-accent-hover text-black"
                }`}
              >
                {state.confirmText || "Confirmar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}
