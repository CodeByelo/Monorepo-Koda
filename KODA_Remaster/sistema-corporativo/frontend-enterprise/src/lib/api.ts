
// src/lib/api.ts
// Capa de API central para el frontend — conecta con el backend FastAPI en localhost:8000

const BASE_URL =
  typeof window !== "undefined"
    ? `${window.location.protocol}//${window.location.hostname}:8000`
    : (process.env.INTERNAL_API_URL ||
       process.env.NEXT_PUBLIC_API_URL ||
       "http://127.0.0.1:8000");

// ==========================================
// TIPOS EXPORTADOS
// ==========================================

export interface ApiDocument {
    id: number;
    name: string;
    category: string;
    file_path?: string;
    file_url?: string;
    status?: string;
    signatureStatus?: string;
    prioridad?: string;
    uploadDate?: string;
    targetDepartment?: string;
    receptor_gerencia_id?: number;
    receptor_gerencia_nombre?: string;
    receptor_gerencia_id_usuario?: number;
    receptor_gerencia_nombre_usuario?: string;
    emisor_gerencia_id?: number;
    emisor_gerencia_nombre?: string;
    emisor_usuario_id?: number;
    receptor_usuario_id?: number;
    read?: boolean;
    correlativo?: string;
    tipo?: string;
    descripcion?: string;
    created_at?: string;
    updated_at?: string;
    remitente_gerencia_id?: number;
    remitente_gerencia_nombre?: string;
    fecha_caducidad?: string;
    respuesta_contenido?: string;
    respuesta_usuario_id?: string;
    respuesta_usuario_nombre?: string;
    respuesta_fecha?: string;
    respuesta_url_archivo?: string;
    respuesta_archivos?: string[];
}

export interface ApiUser {
    id: string;
    username: string;
    usuario_corp?: string;
    email?: string;
    nombre?: string;
    apellido?: string;
    role?: string;
    rol_id?: number;
    gerencia_id?: number;
    gerencia_nombre?: string;
    gerencia_depto?: string;
    is_active?: boolean;
    estado?: boolean;
    failed_count?: number;
    is_locked?: boolean;
    permissions?: string[];
    permisos?: string[];
}

export interface ApiGerencia {
    id: number;
    nombre: string;
    descripcion?: string;
}

export interface ApiTicket {
    id: number;
    titulo: string;
    descripcion?: string;
    area?: string;
    prioridad?: string;
    estado?: string;
    solicitante_id?: string;
    tecnico_id?: string | null;
    observaciones?: string;
    fecha_creacion?: string;
    solicitante_nombre?: string;
    tecnico_nombre?: string | null;
    solicitante_gerencia?: string;
}

export interface ApiTicketHistoryEvent {
    id: number;
    ticket_id: number;
    actor_username?: string;
    action: string;
    old_status?: string;
    new_status?: string;
    observaciones?: string;
    details?: string;
    created_at: string;
    titulo?: string;
    estado?: string;
}

export interface AnnouncementData {
    badge: string;
    title: string;
    description: string;
    status: string;
    urgency: string;
    color?: string;
}

export interface SecurityLog {
    id: number;
    username: string;
    evento: string;
    detalles: string;
    estado: string;
    ip_address?: string;
    fecha_hora: string;
    user_id?: string;
    gerencia_id?: number;
}

// ==========================================
// HELPERS
// ==========================================

function getAuthHeaders(): HeadersInit {
    const token =
        typeof window !== "undefined" ? localStorage.getItem("sgd_token") : null;
    return {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
}

let isRefreshing = false;
let refreshSubscribers: ((token: string) => void)[] = [];

function onRefreshed(token: string) {
    refreshSubscribers.map((cb) => cb(token));
    refreshSubscribers = [];
}

function addRefreshSubscriber(cb: (token: string) => void) {
    refreshSubscribers.push(cb);
}

async function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    let res = await fetch(input, init);

    if (res.status === 401 && typeof window !== "undefined") {
        const refreshToken = localStorage.getItem("sgd_refresh_token");
        if (!refreshToken) {
            return res; // Cant refresh
        }

        if (isRefreshing) {
            return new Promise((resolve) => {
                addRefreshSubscriber((newToken) => {
                    const newInit = { ...init };
                    newInit.headers = {
                        ...newInit.headers,
                        Authorization: `Bearer ${newToken}`,
                    };
                    resolve(fetch(input, newInit));
                });
            });
        }

        isRefreshing = true;

        try {
            const refreshRes = await fetch("/api/auth/refresh", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ refresh_token: refreshToken })
            });

            if (refreshRes.ok) {
                const data = await refreshRes.json();
                localStorage.setItem("sgd_token", data.access_token);
                if (data.refresh_token) {
                    localStorage.setItem("sgd_refresh_token", data.refresh_token);
                }

                isRefreshing = false;
                onRefreshed(data.access_token);

                // Retry original request
                const newInit = { ...init };
                newInit.headers = {
                    ...newInit.headers,
                    Authorization: `Bearer ${data.access_token}`,
                };
                return await fetch(input, newInit);
            } else {
                isRefreshing = false;
                // Refresh failed, clear session
                localStorage.removeItem("sgd_token");
                localStorage.removeItem("sgd_refresh_token");
                localStorage.removeItem("sgd_user");
                window.location.href = "/login?reason=timeout";
            }
        } catch (error) {
            isRefreshing = false;
        }
    }

    return res;
}

async function handleResponse<T>(res: Response): Promise<T> {
    if (!res.ok) {
        const errorText = await res.text().catch(() => res.statusText);
        throw new Error(`Error ${res.status}: ${errorText}`);
    }
    return res.json() as Promise<T>;
}

function asRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return null;
    }
    return value as Record<string, unknown>;
}

function readArrayish(value: unknown): { found: boolean; items: unknown[] } {
    if (Array.isArray(value)) {
        return { found: true, items: value };
    }

    if (typeof value === "string") {
        const trimmed = value.trim();
        if (!trimmed) {
            return { found: true, items: [] };
        }

        try {
            const parsed = JSON.parse(trimmed);
            if (Array.isArray(parsed)) {
                return { found: true, items: parsed };
            }
        } catch {
            // Fall back to comma/newline separated values.
        }

        return {
            found: true,
            items: trimmed
                .split(/\r?\n|,/)
                .map((item) => item.trim())
                .filter(Boolean),
        };
    }

    return { found: false, items: [] };
}

function extractArray<T>(value: unknown, fallbackKeys: string[] = []): T[] {
    const direct = readArrayish(value);
    if (direct.found) {
        return direct.items as T[];
    }

    const record = asRecord(value);
    if (!record) {
        return [];
    }

    for (const key of fallbackKeys) {
        const nested = readArrayish(record[key]);
        if (nested.found) {
            return nested.items as T[];
        }
    }

    return [];
}

function normalizeStringList(value: unknown): string[] {
    return extractArray<unknown>(value)
        .map((item) => String(item ?? "").trim())
        .filter(Boolean);
}

export interface ManagementDetail {
  lider?: string;
  contacto?: string;
  objetivos?: string[];
  funciones?: string[];
}

function normalizeManagementDetailsRecord(value: unknown): Record<string, ManagementDetail> {
    const record = asRecord(value);
    if (!record) {
        return {};
    }

    return Object.fromEntries(
        Object.entries(record)
            .map(([key, entry]) => {
                const name = String(key ?? "").trim();
                const detailRecord = asRecord(entry);
                if (detailRecord && ("funciones" in detailRecord || "lider" in detailRecord || "contacto" in detailRecord || "objetivos" in detailRecord)) {
                    return [
                        name,
                        {
                            lider: typeof detailRecord["lider"] === "string" ? String(detailRecord["lider"]).trim() : "",
                            contacto: typeof detailRecord["contacto"] === "string" ? String(detailRecord["contacto"]).trim() : "",
                            objetivos: normalizeStringList(detailRecord["objetivos"]),
                            funciones: normalizeStringList(detailRecord["funciones"]),
                        }
                    ] as const;
                } else {
                    return [
                        name,
                        {
                            lider: "",
                            contacto: "",
                            objetivos: [],
                            funciones: normalizeStringList(entry),
                        }
                    ] as const;
                }
            })
            .filter(([key]) => Boolean(key)),
    );
}

function normalizeOrgStructureResponse(value: unknown): {
    org_structure: Array<{ category: string; icon: string; items: string[] }>;
    management_details?: Record<string, ManagementDetail>;
    source?: string;
} {
    const record = asRecord(value);
    const rawGroups = extractArray<unknown>(value, ["org_structure", "data"]);
    const orgStructure = rawGroups
        .map((group) => {
            const entry = asRecord(group);
            if (!entry) {
                return null;
            }

            const category = String(entry["category"] ?? "").trim();
            if (!category) {
                return null;
            }

            const icon = String(entry["icon"] ?? "Briefcase").trim() || "Briefcase";
            return {
                category,
                icon,
                items: normalizeStringList(entry["items"]),
            };
        })
        .filter(Boolean) as Array<{ category: string; icon: string; items: string[] }>;

    return {
        org_structure: orgStructure,
        management_details: normalizeManagementDetailsRecord(record?.["management_details"]),
        source: typeof record?.["source"] === "string" ? String(record["source"]) : undefined,
    };
}

// ==========================================
// DOCUMENTOS
// ==========================================

/**
 * Obtiene todos los documentos a los que el usuario tiene acceso.
 */
export async function getDocumentos(): Promise<ApiDocument[]> {
    const res = await apiFetch(`/api/documentos`, {
        headers: getAuthHeaders(),
        cache: "no-store",
    });
    const data = await handleResponse<unknown>(res);
    return extractArray<ApiDocument>(data, ["documentos", "items", "data"]);
}

/**
 * Sube un nuevo documento al servidor.
 * @param formData FormData con el archivo y metadatos
 */
export async function uploadDocumento(formData: FormData): Promise<ApiDocument> {
    const token =
        typeof window !== "undefined" ? localStorage.getItem("sgd_token") : null;

    const res = await apiFetch(`/api/documentos`, {
        method: "POST",
        headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            // NO incluir Content-Type: el browser lo pone automáticamente con boundary
        },
        body: formData,
    });
    return handleResponse<ApiDocument>(res);
}

/**
 * Actualiza el estado de un documento (aprobado, rechazado, en-proceso, etc.)
 */
export async function updateDocumentStatus(
    documentId: string | number,
    newStatus: string,
    comment?: string
): Promise<ApiDocument> {
    const res = await apiFetch(`/api/documentos/${documentId}/estado`, {
        method: "PUT",
        headers: getAuthHeaders(),
        body: JSON.stringify({ estado: newStatus, comentario: comment }),
    });
    return handleResponse<ApiDocument>(res);
}

export async function respondDocumento(
    documentId: string | number,
    contenido: string,
    archivos: File[] = [],
): Promise<{ status: string }> {
    const token =
        typeof window !== "undefined" ? localStorage.getItem("sgd_token") : null;
    const formData = new FormData();
    formData.append("contenido", contenido);
    archivos.forEach((file) => formData.append("archivos", file));
    const res = await apiFetch(`/api/documentos/${documentId}/respuesta`, {
        method: "POST",
        headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: formData,
    });
    return handleResponse<{ status: string }>(res);
}

export interface ApiDocumentoRespuesta {
    id: string;
    documento_id: string;
    user_id: string;
    contenido: string;
    created_at: string;
    usuario_nombre?: string;
    archivos?: string[];
}

export async function getDocumentoRespuestas(documentId: string | number): Promise<ApiDocumentoRespuesta[]> {
    const res = await apiFetch(`/api/documentos/${documentId}/respuestas`, {
        headers: getAuthHeaders(),
        cache: "no-store",
    });
    const data = await handleResponse<unknown>(res);
    return extractArray<ApiDocumentoRespuesta>(data, ["respuestas", "items", "data"]);
}

export interface ApiDocumentoEvento {
    id: number;
    documento_id: string;
    actor_username?: string;
    action: string;
    details?: string;
    created_at: string;
}

export async function getDocumentoEventos(documentId: string | number): Promise<ApiDocumentoEvento[]> {
    const res = await apiFetch(`/api/documentos/${documentId}/eventos`, {
        headers: getAuthHeaders(),
        cache: "no-store",
    });
    const data = await handleResponse<unknown>(res);
    return extractArray<ApiDocumentoEvento>(data, ["eventos", "items", "data"]);
}

/**
 * Marca un documento como leído por el receptor.
 */
export async function markAsRead(documentId: string | number): Promise<ApiDocument> {
    const res = await apiFetch(`/api/documentos/${documentId}/leido`, {
        method: "PATCH",
        headers: getAuthHeaders(),
    });
    return handleResponse<ApiDocument>(res);
}

export async function purgeControlSeguimiento(): Promise<{ status: string; deleted: number }> {
    const res = await apiFetch(`/api/documentos/prioridad/control`, {
        method: "DELETE",
        headers: getAuthHeaders(),
    });
    return handleResponse<{ status: string; deleted: number }>(res);
}

export async function deleteDocumento(documentId: string | number): Promise<{ status: string }> {
    const res = await apiFetch(`/api/documentos/${documentId}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
    });
    return handleResponse<{ status: string }>(res);
}

// ==========================================
// USUARIOS
// ==========================================

/**
 * Obtiene la lista de todos los usuarios del sistema.
 */
export async function getAllUsers(limit = 50, offset = 0): Promise<{ total_records: number; data: ApiUser[] }> {
    const res = await apiFetch(`/api/users?limit=${limit}&offset=${offset}`, {
        headers: getAuthHeaders(),
    });
    const data = await handleResponse<any>(res);
    return {
        total_records: data?.total_records ?? 0,
        data: extractArray<ApiUser>(data, ["users", "usuarios", "items", "data"]),
    };
}

// ==========================================
// GERENCIAS
// ==========================================

/**
 * Obtiene la lista de todas las gerencias/departamentos.
 */
export async function getGerencias(limit = 50, offset = 0): Promise<{ total_records: number; data: ApiGerencia[] }> {
    const res = await apiFetch(`/api/gerencias?limit=${limit}&offset=${offset}`, {
        headers: getAuthHeaders(),
    });
    const data = await handleResponse<any>(res);
    return {
        total_records: data?.total_records ?? 0,
        data: extractArray<ApiGerencia>(data, ["gerencias", "items", "data"]),
    };
}

// ==========================================
// ADMINISTRACIÓN DE USUARIOS
// ==========================================

/**
 * Actualiza el rol de un usuario por su ID.
 * @param userId ID del usuario
 * @param roleId ID del rol (1=CEO, 2=Administrador, 3=Usuario, 4=Desarrollador)
 */
export async function updateUserRole(
    userId: string | number,
    roleId: number,
    masterPassword?: string
): Promise<ApiUser> {
    const res = await apiFetch(`/api/users/${userId}/role`, {
        method: "PUT",
        headers: getAuthHeaders(),
        body: JSON.stringify({ rol_id: roleId, ...(masterPassword ? { master_password: masterPassword } : {}) }),
    });
    return handleResponse<ApiUser>(res);
}

export async function updateUserProfile(
    userId: string | number,
    payload: {
        usuario_corp: string;
        nombre: string;
        apellido: string;
        email: string;
    },
): Promise<ApiUser> {
    const res = await apiFetch(`/api/users/${userId}/profile`, {
        method: "PUT",
        headers: getAuthHeaders(),
        body: JSON.stringify(payload),
    });
    return handleResponse<ApiUser>(res);
}

export async function unlockUser(userId: string): Promise<{ status: string }> {
    const res = await apiFetch(`/api/users/${userId}/unlock`, {
        method: "PATCH",
        headers: getAuthHeaders(),
    });
    return handleResponse<{ status: string }>(res);
}

export async function updateUserAccountStatus(
    userId: string,
    status: "ACTIVO" | "INACTIVO" | "BLOQUEADO",
): Promise<{ status: string; user_id?: string; username?: string; new_status?: string }> {
    const res = await apiFetch(`/api/users/${userId}/status`, {
        method: "PATCH",
        headers: getAuthHeaders(),
        body: JSON.stringify({ status }),
    });
    return handleResponse<{ status: string; user_id?: string; username?: string; new_status?: string }>(res);
}

export async function updateUserPermissions(
    userId: string,
    permisos: string[],
): Promise<{ status: string }> {
    const res = await apiFetch(`/api/users/${userId}/permissions`, {
        method: "PATCH",
        headers: getAuthHeaders(),
        body: JSON.stringify({ permisos }),
    });
    return handleResponse<{ status: string }>(res);
}

export async function resetUserPassword(
    userId: string,
    newPassword: string,
): Promise<{ status: string }> {
    const res = await apiFetch(`/api/users/${userId}/reset-password`, {
        method: "PUT",
        headers: getAuthHeaders(),
        body: JSON.stringify({ new_password: newPassword }),
    });
    return handleResponse<{ status: string }>(res);
}

export async function deleteUserAccount(userId: string): Promise<{ status: string }> {
    const res = await apiFetch(`/api/users/${userId}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
    });
    return handleResponse<{ status: string }>(res);
}

export async function getAnnouncement(): Promise<AnnouncementData> {
    const res = await apiFetch(`/api/announcement`, {
        headers: getAuthHeaders(),
        cache: "no-store",
    });
    return handleResponse<AnnouncementData>(res);
}

export async function saveAnnouncement(data: AnnouncementData): Promise<{ status: string }> {
    const res = await apiFetch(`/api/announcement`, {
        method: "PUT",
        headers: getAuthHeaders(),
        body: JSON.stringify(data),
    });
    return handleResponse<{ status: string }>(res);
}

export async function getOrgStructure(): Promise<{ org_structure: any[]; management_details?: Record<string, ManagementDetail>; source?: string }> {
    const res = await apiFetch(`/api/org-structure`, {
        headers: getAuthHeaders(),
    });
    const data = await handleResponse<unknown>(res);
    return normalizeOrgStructureResponse(data);
}

export async function saveOrgStructure(org_structure: any[]): Promise<{ status: string }> {
    const res = await apiFetch(`/api/org-structure`, {
        method: "PUT",
        headers: getAuthHeaders(),
        body: JSON.stringify({ org_structure }),
    });
    return handleResponse<{ status: string }>(res);
}

export async function getOrgManagementDetails(): Promise<{ management_details: Record<string, ManagementDetail> }> {
    const res = await apiFetch(`/api/org-management-details`, {
        headers: getAuthHeaders(),
    });
    const data = await handleResponse<unknown>(res);
    const record = asRecord(data);
    return {
        management_details: normalizeManagementDetailsRecord(record?.["management_details"] ?? data),
    };
}

export async function saveOrgManagementDetails(
    management_details: Record<string, ManagementDetail>,
): Promise<{ status: string; management_details: Record<string, ManagementDetail> }> {
    const res = await apiFetch(`/api/org-management-details`, {
        method: "PUT",
        headers: getAuthHeaders(),
        body: JSON.stringify({ management_details }),
    });
    return handleResponse<{ status: string; management_details: Record<string, ManagementDetail> }>(res);
}

export async function getSecurityLogs(): Promise<SecurityLog[]> {
    const res = await apiFetch(`/api/security/logs`, {
        headers: getAuthHeaders(),
    });
    const data = await handleResponse<unknown>(res);
    return extractArray<SecurityLog>(data, ["logs", "items", "data"]);
}

export async function getUserSecurityLogs(userId: string): Promise<SecurityLog[]> {
    const res = await apiFetch(`/api/security/logs/user/${userId}`, {
        headers: getAuthHeaders(),
    });
    const data = await handleResponse<unknown>(res);
    return extractArray<SecurityLog>(data, ["logs", "items", "data"]);
}

export async function createSecurityLog(payload: {
    evento: string;
    detalles?: string;
    estado?: string;
    page?: string;
}): Promise<SecurityLog> {
    const res = await apiFetch(`/api/security/logs`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify(payload),
    });
    return handleResponse<SecurityLog>(res);
}

export async function purgeSecurityLogs(): Promise<{ status: string; message: string }> {
    const res = await apiFetch(`/api/security/logs`, {
        method: "DELETE",
        headers: getAuthHeaders(),
    });
    return handleResponse<{ status: string; message: string }>(res);
}

// ==========================================
// TICKETS
// ==========================================

export async function getTickets(): Promise<ApiTicket[]> {
    const res = await apiFetch(`/api/tickets`, {
        headers: getAuthHeaders(),
        cache: "no-store",
    });
    const data = await handleResponse<unknown>(res);
    return extractArray<ApiTicket>(data, ["tickets", "items", "data"]);
}

export async function createTicket(payload: {
    titulo: string;
    descripcion?: string;
    prioridad?: string;
    observaciones?: string;
}): Promise<ApiTicket> {
    const res = await apiFetch(`/api/tickets`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify(payload),
    });
    return handleResponse<ApiTicket>(res);
}

export async function updateTicket(
    ticketId: number,
    payload: {
        titulo?: string;
        descripcion?: string;
        prioridad?: string;
        observaciones?: string;
    },
): Promise<ApiTicket> {
    const res = await apiFetch(`/api/tickets/${ticketId}`, {
        method: "PUT",
        headers: getAuthHeaders(),
        body: JSON.stringify(payload),
    });
    return handleResponse<ApiTicket>(res);
}

export async function updateTicketStatus(
    ticketId: number,
    payload: { estado: string; observaciones?: string },
): Promise<ApiTicket> {
    const res = await apiFetch(`/api/tickets/${ticketId}/estado`, {
        method: "PATCH",
        headers: getAuthHeaders(),
        body: JSON.stringify(payload),
    });
    return handleResponse<ApiTicket>(res);
}

export async function deleteTicket(ticketId: number): Promise<{ status: string }> {
    const res = await apiFetch(`/api/tickets/${ticketId}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
    });
    return handleResponse<{ status: string }>(res);
}

export async function getTicketHistory(ticketId: number): Promise<ApiTicketHistoryEvent[]> {
    const res = await apiFetch(`/api/tickets/${ticketId}/history`, {
        headers: getAuthHeaders(),
        cache: "no-store",
    });
    const data = await handleResponse<unknown>(res);
    return extractArray<ApiTicketHistoryEvent>(data, ["history", "items", "data"]);
}

export async function searchTicketHistory(query: string): Promise<ApiTicketHistoryEvent[]> {
    const q = encodeURIComponent(query || "");
    const res = await apiFetch(`/api/tickets/history?q=${q}`, {
        headers: getAuthHeaders(),
        cache: "no-store",
    });
    const data = await handleResponse<unknown>(res);
    return extractArray<ApiTicketHistoryEvent>(data, ["history", "items", "data"]);
}

// ==========================================
// DIAGNÓSTICO / CONEXIÓN
// ==========================================

/**
 * Verifica la conectividad con el backend y la base de datos.
 * Retorna un objeto con { message: string } si la conexión es exitosa.
 */
export async function checkConnection(): Promise<{ message: string }> {
    const res = await apiFetch(`/api/health`, {
        headers: { "Content-Type": "application/json" },
    });
    return handleResponse<{ message: string }>(res);
}
// ==========================================
// AUTENTICACIÓN Y REGISTRO
// ==========================================

/**
 * Registra un nuevo usuario en el sistema.
 * @param userData Datos del usuario
 */
export async function register(userData: any): Promise<ApiUser> {
    const res = await apiFetch(`/api/auth/register`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify(userData),
    });
    return handleResponse<ApiUser>(res);
}

/**
 * Autentica un usuario y retorna el token de acceso.
 */
export async function login(username: string, password: string): Promise<{ access_token: string; user: ApiUser }> {
    const formData = new FormData();
    formData.append("username", username);
    formData.append("password", password);

    const res = await apiFetch(`/api/auth/login`, {
        method: "POST",
        body: formData,
    });
    return handleResponse<{ access_token: string; user: ApiUser }>(res);
}


// ==========================================
// HOJAS DE RUTA
// ==========================================

export interface ApiHojaDeRuta {
    id: string;
    asunto: string;
    fecha_limite: string;
    acciones: string[];
    coordinaciones: string[];
    remitente_id: string;
    remitente_nombre: string;
    destinatario_id?: string | null;
    destinatario_nombre?: string | null;
    estado?: string;
    completado_at?: string | null;
    observaciones_resolucion?: string | null;
    created_at: string;
}

export async function getHojasDeRuta(): Promise<ApiHojaDeRuta[]> {
    const res = await apiFetch(`/api/hojas-de-ruta`, { headers: getAuthHeaders() });
    return handleResponse<ApiHojaDeRuta[]>(res);
}

export async function createHojaDeRuta(payload: {
    asunto: string;
    fecha_limite: string;
    acciones: string[];
    coordinaciones: string[];
    destinatario_id?: string | null;
    destinatario_nombre?: string | null;
}): Promise<ApiHojaDeRuta> {
    const res = await apiFetch(`/api/hojas-de-ruta`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify(payload),
    });
    return handleResponse<ApiHojaDeRuta>(res);
}

export async function updateHojaDeRutaEstado(
    id: string,
    payload: { estado: string; observaciones_resolucion?: string | null }
): Promise<ApiHojaDeRuta> {
    const res = await apiFetch(`/api/hojas-de-ruta/${id}/estado`, {
        method: "PUT",
        headers: getAuthHeaders(),
        body: JSON.stringify(payload),
    });
    return handleResponse<ApiHojaDeRuta>(res);
}

export async function deleteHojaDeRuta(id: string): Promise<{ status: string }> {
    const res = await apiFetch(`/api/hojas-de-ruta/${id}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
    });
    return handleResponse<{ status: string }>(res);
}



// ==========================================
// DESARROLLADOR / TENANTS Y PLANES
// ==========================================

export async function getTenants(): Promise<any[]> {
    const res = await apiFetch(`/api/dev/tenants`, {
        headers: getAuthHeaders(),
        cache: "no-store",
    });
    return handleResponse<any[]>(res);
}

export async function getPlans(): Promise<any[]> {
    const res = await apiFetch(`/api/dev/plans`, {
        headers: getAuthHeaders(),
        cache: "no-store",
    });
    return handleResponse<any[]>(res);
}

export async function getRoles(): Promise<{ id: number; nombre_rol: string; default_permissions: string[] }[]> {
    const res = await apiFetch(`/api/roles`, {
        headers: getAuthHeaders(),
    });
    const data = await handleResponse<any>(res);
    return extractArray(data, ["roles"]);
}

export async function updateRolePermissions(roleId: number, permissions: string[]): Promise<any> {
    const res = await apiFetch(`/api/roles/${roleId}/permissions`, {
        method: 'PUT',
        headers: {
            ...getAuthHeaders(),
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ permissions }),
    });
    return handleResponse<any>(res);
}

export async function createTenant(payload: any): Promise<any> {
    const res = await apiFetch(`/api/dev/tenants`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify(payload),
    });
    return handleResponse<any>(res);
}

export async function updateTenant(tenantId: string, payload: any): Promise<any> {
    const res = await apiFetch(`/api/dev/tenants/${tenantId}`, {
        method: "PUT",
        headers: getAuthHeaders(),
        body: JSON.stringify(payload),
    });
    return handleResponse<any>(res);
}

