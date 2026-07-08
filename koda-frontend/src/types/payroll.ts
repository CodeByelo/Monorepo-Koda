export type ConceptType = 'asignacion' | 'deduccion';

export interface RHEmployee {
  id: string;
  profile_id?: string | null;
  cedula: string;
  nombres: string;
  cargo: string;
  fecha_ingreso: string;
  sueldo_base_mensual: string | number;
  tipo_cuenta_bancaria: string;
  numero_cuenta: string;
  status: string;
}

export interface RHConcept {
  id: number;
  tipo: ConceptType;
  nombre: string;
  afecta_salario_base: boolean;
}

export interface RHPayrollPeriod {
  id: number;
  nombre_periodo: string;
  fecha_inicio: string;
  fecha_fin: string;
  status: 'abierto' | 'procesado';
}

export interface RHPayrollDetail {
  id: number;
  employee_id: string;
  period_id: number;
  concept_id: number;
  monto: string | number;
  cantidad_horas_dias: string | number;
}

export interface PayrollDetailInput {
  employee_id: string;
  period_id: number;
  concept_id: number;
  monto: number;
  cantidad_horas_dias: number;
}

export interface PrePayrollEmployeeItem {
  employee_id: string;
  cedula: string;
  nombres: string;
  cargo: string;
  sueldo_base: string | number;
  asignaciones: string | number;
  deducciones: string | number;
  neto: string | number;
}

export interface PrePayrollResponse {
  period_id: number;
  nombre_periodo: string;
  dias_periodo: number;
  tipo_periodo: 'quincenal' | 'mensual';
  total_base: string | number;
  total_asignaciones: string | number;
  total_deducciones: string | number;
  total_neto: string | number;
  employees: PrePayrollEmployeeItem[];
}
