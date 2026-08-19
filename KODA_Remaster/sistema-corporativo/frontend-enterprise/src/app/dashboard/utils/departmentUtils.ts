import { Document } from '../types';
import { Ticket } from '../../../components/TicketSystem';

// ==========================================
// TIPOS AUXILIARES
// ==========================================

export interface CombinedDataItem {
    id: string;
    type: 'Documento' | 'Ticket';
    ticketId?: number;
    estado: string;
    tiempo: string;
    fechaHora: string;
    importancia: 'Alta' | 'Media' | 'Baja';
    enviadoPor: string;
    recibidoPor: string;
    rawDate: Date;
}

export interface ImportanceDistribution {
    name: string;
    value: number;
    color: string;
}

export interface TemporalVolume {
    date: string;
    documentos: number;
    tickets: number;
}

export type SortField = 'type' | 'tiempo' | 'fechaHora' | 'importancia' | 'enviadoPor' | 'recibidoPor';
export type SortDirection = 'asc' | 'desc';

// ==========================================
// FUNCIONES DE FILTRADO
// ==========================================

/**
 * Filtra documentos y tickets por rango de fechas
 */
export function filterByDateRange(
    documents: Document[],
    tickets: Ticket[],
    startDate: Date | null,
    endDate: Date | null
): { documents: Document[]; tickets: Ticket[] } {
    if (!startDate && !endDate) {
        return { documents, tickets };
    }

    const filteredDocs = documents.filter(doc => {
        const docDate = parseDocumentDate(doc.uploadDate);
        if (!docDate) return false;
        if (startDate && docDate < startDate) return false;
        if (endDate && docDate > endDate) return false;
        return true;
    });

    const filteredTickets = tickets.filter(ticket => {
        const ticketDate = parseTicketDate(ticket.createdAt);
        if (!ticketDate) return false;
        if (startDate && ticketDate < startDate) return false;
        if (endDate && ticketDate > endDate) return false;
        return true;
    });

    return { documents: filteredDocs, tickets: filteredTickets };
}

/**
 * Filtra por departamento específico
 */
export function filterByDepartment(
    documents: Document[],
    tickets: Ticket[],
    department: string
): { documents: Document[]; tickets: Ticket[] } {
    const norm = (v: string) =>
        (v || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .trim();
    const target = norm(department);

    if (target === 'todas las gerencias' || target === 'all' || !target) {
        return { documents, tickets };
    }

    const filteredDocs = documents.filter((doc) => {
        const deptCandidates = [
            doc.department,
            doc.targetDepartment,
            doc.remitente_gerencia_nombre,
            doc.receptor_gerencia_nombre,
            doc.receptor_gerencia_nombre_usuario,
        ];
        return deptCandidates.some((candidate) => norm(String(candidate || '')) === target);
    });

    const filteredTickets = tickets.filter(
        (ticket) =>
            norm(ticket.area || '') === target ||
            norm(ticket.creatorDept || '') === target
    );

    return { documents: filteredDocs, tickets: filteredTickets };
}

// ==========================================
// FUNCIONES DE AGRUPACIÓN
// ==========================================

/**
 * Agrupa documentos y tickets por fecha para gráficos temporales
 */
export function groupByDate(
    documents: Document[],
    tickets: Ticket[]
): TemporalVolume[] {
    const dateMap = new Map<string, { documentos: number; tickets: number }>();

    // Procesar documentos
    documents.forEach(doc => {
        const date = doc.uploadDate;
        if (!dateMap.has(date)) {
            dateMap.set(date, { documentos: 0, tickets: 0 });
        }
        dateMap.get(date)!.documentos++;
    });

    // Procesar tickets
    tickets.forEach(ticket => {
        const date = ticket.createdAt;
        if (!dateMap.has(date)) {
            dateMap.set(date, { documentos: 0, tickets: 0 });
        }
        dateMap.get(date)!.tickets++;
    });

    // Convertir a array y ordenar por fecha
    const result: TemporalVolume[] = Array.from(dateMap.entries())
        .map(([date, counts]) => ({
            date,
            ...counts
        }))
        .sort((a, b) => {
            const dateA = parseDocumentDate(a.date);
            const dateB = parseDocumentDate(b.date);
            if (!dateA || !dateB) return 0;
            return dateA.getTime() - dateB.getTime();
        });

    return result;
}

/**
 * Calcula la distribución de importancia combinando documentos y tickets
 */
export function calculateImportanceDistribution(
    documents: Document[],
    tickets: Ticket[]
): ImportanceDistribution[] {
    let alta = 0;
    let media = 0;
    let baja = 0;

    // Procesar tickets
    tickets.forEach(ticket => {
        if (ticket.priority === 'ALTA') alta++;
        else if (ticket.priority === 'MEDIA') media++;
        else if (ticket.priority === 'BAJA') baja++;
    });

    // Procesar documentos (mapear estados actuales a importancia)
    documents.forEach(doc => {
        const currentStatus = getDocumentCurrentStatus(doc);
        if (currentStatus === 'vencido' || currentStatus === 'rechazado') alta++;
        else if (currentStatus === 'en-proceso' || currentStatus === 'pendiente' || currentStatus === 'recibido') media++;
        else if (currentStatus === 'finalizado' || currentStatus === 'aprobado' || currentStatus === 'omitido') baja++;
    });

    return [
        { name: 'Alta', value: alta, color: '#ef4444' },
        { name: 'Media', value: media, color: '#f59e0b' },
        { name: 'Baja', value: baja, color: '#10b981' }
    ].filter(item => item.value > 0);
}

// ==========================================
// FUNCIONES DE COMBINACIÓN Y NORMALIZACIÓN
// ==========================================

/**
 * Combina documentos y tickets en un formato unificado para la tabla
 */
export function combineDocumentsAndTickets(
    documents: Document[],
    tickets: Ticket[]
): CombinedDataItem[] {
    const combined: CombinedDataItem[] = [];

    // Procesar documentos
    documents.forEach(doc => {
        const rawDate = parseDocumentDate(doc.uploadDate);
        const currentStatus = getDocumentCurrentStatus(doc);
        combined.push({
            id: `doc-${doc.id}`,
            type: 'Documento',
            estado: statusLabel(currentStatus),
            tiempo: doc.uploadTime,
            fechaHora: `${doc.uploadDate} ${doc.uploadTime}`,
            importancia: mapDocumentToImportance(currentStatus),
            enviadoPor: doc.uploadedBy,
            recibidoPor: doc.receivedBy,
            rawDate: rawDate || new Date()
        });
    });

    // Procesar tickets
    tickets.forEach(ticket => {
        const rawDate = parseTicketDate(ticket.createdAt);
        combined.push({
            id: `ticket-${ticket.id}`,
            type: 'Ticket',
            ticketId: ticket.id,
            estado: String(ticket.status || 'ABIERTO'),
            tiempo: ticket.createdAt,
            fechaHora: ticket.createdAt,
            importancia: mapTicketToImportance(ticket.priority),
            enviadoPor: ticket.owner,
            recibidoPor: ticket.area,
            rawDate: rawDate || new Date()
        });
    });

    return combined;
}

/**
 * Ordena los datos de la tabla según el campo y dirección especificados
 */
export function sortTableData(
    data: CombinedDataItem[],
    field: SortField,
    direction: SortDirection
): CombinedDataItem[] {
    const sorted = [...data].sort((a, b) => {
        let aValue: any = a[field];
        let bValue: any = b[field];

        // Manejo especial para fechas
        if (field === 'fechaHora') {
            aValue = a.rawDate.getTime();
            bValue = b.rawDate.getTime();
        }

        // Manejo especial para importancia
        if (field === 'importancia') {
            const importanceOrder = { 'Alta': 3, 'Media': 2, 'Baja': 1 };
            aValue = importanceOrder[a.importancia];
            bValue = importanceOrder[b.importancia];
        }

        if (aValue < bValue) return direction === 'asc' ? -1 : 1;
        if (aValue > bValue) return direction === 'asc' ? 1 : -1;
        return 0;
    });

    return sorted;
}

// ==========================================
// FUNCIONES AUXILIARES
// ==========================================

/**
 * Parsea fecha de documento (formato DD/MM/YYYY)
 */
function parseDocumentDate(dateStr: string): Date | null {
    try {
        const [day, month, year] = dateStr.split('/').map(Number);
        return new Date(year, month - 1, day);
    } catch {
        return null;
    }
}

/**
 * Parsea fecha de ticket (formato DD/MM/YYYY)
 */
function parseTicketDate(dateStr: string): Date | null {
    try {
        const [day, month, year] = dateStr.split('/').map(Number);
        return new Date(year, month - 1, day);
    } catch {
        return null;
    }
}

/**
 * Mapea estado de documento a nivel de importancia
 */
function mapDocumentToImportance(status: string): 'Alta' | 'Media' | 'Baja' {
    if (status === 'vencido' || status === 'rechazado') return 'Alta';
    if (status === 'en-proceso' || status === 'pendiente' || status === 'recibido') return 'Media';
    return 'Baja';
}

/**
 * Mapea prioridad de ticket a nivel de importancia
 */
function mapTicketToImportance(priority: string): 'Alta' | 'Media' | 'Baja' {
    if (priority === 'ALTA') return 'Alta';
    if (priority === 'MEDIA') return 'Media';
    return 'Baja';
}

function statusLabel(status: string): string {
    switch (status) {
        case 'vencido':
            return 'VENCIDO';
        case 'finalizado':
            return 'FINALIZADO';
        case 'en-proceso':
            return 'EN PROCESO';
        case 'pendiente':
            return 'PENDIENTE';
        case 'recibido':
            return 'RECIBIDO';
        case 'aprobado':
            return 'APROBADO';
        case 'rechazado':
            return 'RECHAZADO';
        case 'omitido':
            return 'OMITIDO';
        default:
            return String(status || 'N/A').toUpperCase();
    }
}

function parseFlexibleDate(value?: string): Date | null {
    if (!value) return null;
    const raw = String(value).trim();
    const latin = raw.match(
        /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/
    );
    if (latin) {
        const [, dRaw, mRaw, y, hh = '00', mm = '00', ss = '00'] = latin;
        const d = dRaw.padStart(2, '0');
        const m = mRaw.padStart(2, '0');
        const parsed = new Date(`${y}-${m}-${d}T${hh.padStart(2, '0')}:${mm}:${ss}`);
        return Number.isNaN(parsed.getTime()) ? null : parsed;
    }
    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function normalizeDocStatus(status?: string): string {
    const raw = String(status || '')
        .toLowerCase()
        .trim()
        .replaceAll('_', '-')
        .replaceAll(' ', '-');
    if (raw === 'en-proceso') return 'en-proceso';
    if (raw === 'finalizado') return 'finalizado';
    if (raw === 'vencido') return 'vencido';
    if (raw === 'pendiente') return 'pendiente';
    if (raw === 'recibido') return 'recibido';
    if (raw === 'aprobado') return 'aprobado';
    if (raw === 'rechazado') return 'rechazado';
    if (raw === 'omitido') return 'omitido';
    return raw || 'en-proceso';
}

function getDocumentCurrentStatus(doc: Document): string {
    const normalized = normalizeDocStatus(doc.signatureStatus);
    if (normalized === 'finalizado') return normalized;
    if (normalized === 'vencido') return 'vencido';

    // Comparar fecha de caducidad con el día de HOY al inicio del día
    const deadline = parseFlexibleDate(doc.fecha_caducidad || undefined);
    if (deadline) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const deadlineDate = new Date(deadline);
        deadlineDate.setHours(0, 0, 0, 0);
        
        if (today.getTime() > deadlineDate.getTime()) return 'vencido';
    }
    
    return normalized;
}

/**
 * Obtiene los últimos N días como opciones para el filtro
 */
export function getLastNDays(n: number): { label: string; value: Date }[] {
    const days: { label: string; value: Date }[] = [];
    const today = new Date();

    for (let i = 0; i < n; i++) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        days.push({
            label: date.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }),
            value: date
        });
    }

    return days;
}

/**
 * Obtiene los últimos N meses como opciones para el filtro
 */
export function getLastNMonths(n: number): { label: string; value: { start: Date; end: Date } }[] {
    const months: { label: string; value: { start: Date; end: Date } }[] = [];
    const today = new Date();

    for (let i = 0; i < n; i++) {
        const date = new Date(today.getFullYear(), today.getMonth() - i, 1);
        const start = new Date(date.getFullYear(), date.getMonth(), 1);
        const end = new Date(date.getFullYear(), date.getMonth() + 1, 0);

        months.push({
            label: date.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' }),
            value: { start, end }
        });
    }

    return months;
}
