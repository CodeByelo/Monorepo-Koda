import { useState, useEffect } from 'react';

/**
 * Hook para auto-guardar y recuperar borradores de formularios en localStorage.
 * 
 * @param key Clave única en localStorage para este formulario.
 * @param initialValue Valor inicial por defecto si no hay borrador guardado.
 * @returns Un arreglo con [state, setState, clearDraft]
 */
export function useDraft<T>(key: string, initialValue: T): [T, (val: T | ((prev: T) => T)) => void, () => void] {
  const [state, setState] = useState<T>(() => {
    try {
      const saved = localStorage.getItem(`draft:${key}`);
      if (saved !== null) {
        return JSON.parse(saved) as T;
      }
    } catch (e) {
      console.warn(`Error al leer el borrador "${key}" de localStorage:`, e);
    }
    return initialValue;
  });

  useEffect(() => {
    try {
      localStorage.setItem(`draft:${key}`, JSON.stringify(state));
    } catch (e) {
      console.warn(`Error al guardar el borrador "${key}" en localStorage:`, e);
    }
  }, [key, state]);

  const clearDraft = () => {
    try {
      localStorage.removeItem(`draft:${key}`);
    } catch (e) {
      console.warn(`Error al eliminar el borrador "${key}" de localStorage:`, e);
    }
  };

  return [state, setState, clearDraft];
}
