
export interface OrgCategory {
    category: string;
    icon: string;
    items: string[];
    expanded?: boolean;
}

export interface Document {
    id: number;
    idDoc: string;
    name: string;
    type: 'pdf' | 'word' | 'excel' | 'powerpoint';
    category: string;
    size: string;
    uploadedBy: string;
    remitente_id?: number | string;
    remitente_gerencia_id?: number;
    remitente_gerencia_nombre?: string;
    receivedBy: string;
    receptor_id?: number | string;
    receptor_gerencia_id_usuario?: number;
    receptor_gerencia_nombre_usuario?: string;
    uploadDate: string;
    uploadTime: string;
    signatureStatus: 'pendiente' | 'aprobado' | 'rechazado' | 'omitido' | 'en-proceso' | 'recibido';
    department: string;
    targetDepartment: string;
    receptor_gerencia_id?: number;
    receptor_gerencia_nombre?: string;
    correlativo?: string;
    fileUrl?: string;
    archivos?: string[]; // Nueva lista de múltiples adjuntos
    prioridad?: string;
    contenido?: string; // Nuevo: cuerpo del mensaje
    leido?: boolean;    // Nuevo: estado de lectura
    respuesta_contenido?: string;
    respuesta_usuario_id?: string;
    respuesta_usuario_nombre?: string;
    respuesta_fecha?: string;
    respuesta_url_archivo?: string;
    respuesta_archivos?: string[];
    fecha_caducidad?: string;
}

// Re-export Ticket type if needed or define common shared types here
export type { Ticket } from '../../components/TicketSystem';
