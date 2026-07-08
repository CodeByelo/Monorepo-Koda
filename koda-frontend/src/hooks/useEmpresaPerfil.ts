import { useState, useEffect } from 'react';
import { api } from '@/api/client';

export interface EmpresaPerfil {
  rif: string;
  razon_social: string;
  nombre_comercial: string;
  email: string;
  telefono: string;
  tipo_contribuyente: 'ESPECIAL' | 'ORDINARIO';
  regimen_iva: 'GENERAL' | 'SIMPLIFICADO';
}

export function useEmpresaPerfil() {
  const [perfil, setPerfil] = useState<EmpresaPerfil | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    
    const fetchPerfil = async () => {
      try {
        setIsLoading(true);
        const data = await api.get<EmpresaPerfil>('/entidades/empresa/perfil');
        if (mounted) {
          setPerfil(data);
          setError(null);
        }
      } catch (err: any) {
        if (mounted) {
          console.error("Error al cargar el perfil de la empresa:", err);
          setError(err.message || 'Error al cargar perfil');
        }
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    };

    fetchPerfil();
    return () => { mounted = false; };
  }, []);

  return { perfil, isLoading, error };
}
