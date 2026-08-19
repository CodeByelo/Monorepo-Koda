'use client';

import React, { useEffect, useMemo, useState } from 'react';

type DialogKind = 'alert' | 'confirm' | 'prompt';

type AlertDialogRequest = {
  kind: 'alert';
  title?: string;
  message: string;
  resolve: () => void;
};

type ConfirmDialogRequest = {
  kind: 'confirm';
  title?: string;
  message: string;
  resolve: (value: boolean) => void;
};

type PromptDialogRequest = {
  kind: 'prompt';
  title?: string;
  message: string;
  defaultValue?: string;
  placeholder?: string;
  resolve: (value: string | null) => void;
};

type DialogRequest = AlertDialogRequest | ConfirmDialogRequest | PromptDialogRequest;

let enqueueDialog: ((request: DialogRequest) => void) | null = null;
let pendingQueue: DialogRequest[] = [];

function enqueueDialogRequest(request: DialogRequest) {
  if (enqueueDialog) {
    enqueueDialog(request);
    return;
  }
  pendingQueue.push(request);
}

export function uiAlert(message: string, title = 'Mensaje'): Promise<void> {
  return new Promise((resolve) => {
    enqueueDialogRequest({ kind: 'alert', title, message, resolve: () => resolve() });
  });
}

export function uiConfirm(message: string, title = 'Confirmar'): Promise<boolean> {
  return new Promise((resolve) => {
    enqueueDialogRequest({ kind: 'confirm', title, message, resolve });
  });
}

export function uiPrompt(
  message: string,
  defaultValue = '',
  title = 'Ingresar valor',
  placeholder = 'Escriba aqui...',
): Promise<string | null> {
  return new Promise((resolve) => {
    enqueueDialogRequest({ kind: 'prompt', title, message, defaultValue, placeholder, resolve });
  });
}

export function SystemDialogHost() {
  const [queue, setQueue] = useState<DialogRequest[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [darkMode, setDarkMode] = useState(true);
  const current = queue[0] || null;

  useEffect(() => {
    const isDark = document.documentElement.classList.contains('dark');
    setDarkMode(isDark);
    
    const observer = new MutationObserver(() => {
      setDarkMode(document.documentElement.classList.contains('dark'));
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    enqueueDialog = (request: DialogRequest) => {
      setQueue((prev) => [...prev, request]);
    };
    if (pendingQueue.length > 0) {
      setQueue((prev) => [...prev, ...pendingQueue]);
      pendingQueue = [];
    }
    return () => {
      enqueueDialog = null;
    };
  }, []);

  useEffect(() => {
    if (current?.kind === 'prompt') {
      setInputValue(current.defaultValue || '');
    } else {
      setInputValue('');
    }
  }, [current]);

  const close = (result?: boolean | string | null) => {
    if (!current) return;
    if (current.kind === 'alert') {
      current.resolve();
    } else if (current.kind === 'confirm') {
      current.resolve(Boolean(result));
    } else {
      current.resolve(typeof result === 'string' ? result : null);
    }
    setQueue((prev) => prev.slice(1));
  };

  const confirmLabel = useMemo(() => {
    if (!current) return 'Aceptar';
    if (current.kind === 'confirm') return 'Confirmar';
    if (current.kind === 'prompt') return 'Aplicar';
    return 'Aceptar';
  }, [current]);

  if (!current) return null;

  return (
    <div className={`fixed inset-0 z-[150] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 ${darkMode ? 'dark' : ''}`}>
      <div className={`w-full max-w-xl rounded-2xl border overflow-hidden shadow-[0_30px_80px_rgba(0,0,0,0.55)] transition-colors
        ${darkMode 
          ? 'border-[#0da67b]/20 bg-gradient-to-br from-[#042f36] via-[#051d10] to-zinc-950' 
          : 'border-[#00C294]/40 bg-gradient-to-br from-emerald-50 to-[#e6f9f4] shadow-xl shadow-[#00C294]/5'}`}>
        <div className={`px-6 py-5 border-b 
          ${darkMode 
            ? 'border-[#0da67b]/15 bg-gradient-to-r from-[#042f36] via-[#075159] to-[#0da67b]/80' 
            : 'border-[#00C294]/20 bg-gradient-to-r from-emerald-50 via-white to-white'}`}>
          <h3 className={`text-xl font-semibold ${darkMode ? 'text-zinc-100' : 'text-slate-900'}`}>{current.title || 'Mensaje'}</h3>
          <p className={`text-base mt-2 whitespace-pre-wrap ${darkMode ? 'text-zinc-300' : 'text-slate-600'}`}>{current.message}</p>
        </div>
        {current.kind === 'prompt' && (
          <div className="px-6 py-4">
            <input
              autoFocus
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') close(inputValue.trim());
                if (e.key === 'Escape') close(null);
              }}
              placeholder={current.placeholder || 'Escriba aqui...'}
              className={`w-full rounded-lg border px-3 py-2 outline-none transition-colors
                ${darkMode 
                  ? 'border-[#0da67b]/20 bg-zinc-950 text-zinc-100 focus:border-[#0da67b] focus:ring-2 focus:ring-[#0da67b]/30' 
                  : 'border-slate-300 bg-white text-slate-900 focus:border-[#00C294] focus:ring-2 focus:ring-[#00C294]/30'}`}
            />
          </div>
        )}
        <div className={`px-6 py-5 flex justify-end gap-3 ${darkMode ? '' : 'bg-emerald-100/50'}`}>
          {current.kind !== 'alert' && (
            <button
              type="button"
              onClick={() => close(current.kind === 'confirm' ? false : null)}
              className={`px-5 py-2.5 rounded-xl border font-medium transition-colors
                ${darkMode 
                  ? 'border-zinc-700 text-zinc-300 hover:bg-zinc-800' 
                  : 'border-slate-300 text-slate-700 hover:bg-slate-100'}`}
            >
              Cancelar
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              if (current.kind === 'confirm') close(true);
              else if (current.kind === 'prompt') close(inputValue.trim());
              else close(undefined);
            }}
            className={`px-5 py-2.5 rounded-xl text-white hover:brightness-110 transition-colors font-semibold
              ${darkMode 
                ? 'bg-[linear-gradient(120deg,#042f36_0%,#075159_55%,#0bbf8c_100%)]' 
                : 'bg-[#00C294] shadow-sm'}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
