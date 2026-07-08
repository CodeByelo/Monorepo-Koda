/**
 * PROYECTO ALFA 2026 - MATRIZ DE PERMISOS
 */

export const PERMISSIONS_MASTER = {
    // 1. Módulos de Navegación
    VIEW_DASHBOARD: 'VIEW_DASHBOARD',
    VIEW_PRIORITIES: 'VIEW_PRIORITIES',
    VIEW_TICKETS: 'VIEW_TICKETS',
    VIEW_DOCUMENTS: 'VIEW_DOCUMENTS',
    VIEW_SECURITY: 'VIEW_SECURITY',
    VIEW_STATS: 'VIEW_STATS',

    // 2. Acciones en Módulos
    // Control de Seguimiento
    PRIORITIES_VIEW_ALL: 'PRIORITIES_VIEW_ALL',
    PRIORITIES_EXPORT: 'PRIORITIES_EXPORT',

    // Gestor Documental
    DOCS_VIEW_ALL: 'DOCS_VIEW_ALL',
    DOCS_VIEW_DEPT: 'DOCS_VIEW_DEPT',
    DOCS_UPLOAD: 'DOCS_UPLOAD',
    DOCS_ACTION_RECEIVE: 'DOCS_ACTION_RECEIVE',
    DOCS_ACTION_APPROVE: 'DOCS_ACTION_APPROVE',
    DOCS_ACTION_REJECT: 'DOCS_ACTION_REJECT',

    // Sistema de Tickets
    TICKETS_CREATE: 'TICKETS_CREATE',
    TICKETS_EDIT: 'TICKETS_EDIT',
    TICKETS_DELETE: 'TICKETS_DELETE',
    TICKETS_VIEW_ALL: 'TICKETS_VIEW_ALL',
    TICKETS_VIEW_DEPT: 'TICKETS_VIEW_DEPT',
    TICKETS_MOVE_KANBAN: 'TICKETS_MOVE_KANBAN',
    TICKETS_RESOLVE: 'TICKETS_RESOLVE',


    // Módulo de Seguridad
    SECURITY_VIEW_LOGS: 'SECURITY_VIEW_LOGS',
    SECURITY_MANAGE_USERS: 'SECURITY_MANAGE_USERS',
    SECURITY_ANNOUNCEMENTS: 'SECURITY_ANNOUNCEMENTS',

    // 3. Restricciones de Datos
    ORG_VIEW_FULL: 'ORG_VIEW_FULL',
    ORG_VIEW_LIMITED: 'ORG_VIEW_LIMITED',

    // 4. Funciones de Sistema
    SYS_SWITCH_ROLE: 'SYS_SWITCH_ROLE',
    SYS_DEV_TOOLS: 'SYS_DEV_TOOLS',
};

export const PERMISSION_LABELS: Record<string, string> = {
    // Navegación
    VIEW_DASHBOARD: 'Ver Dashboard General',
    VIEW_PRIORITIES: 'Ver Control de Seguimiento',
    VIEW_TICKETS: 'Ver Sistema de Tickets',
    VIEW_DOCUMENTS: 'Ver Gestor Documental',
    VIEW_SECURITY: 'Ver Módulo de Seguridad',
    VIEW_STATS: 'Ver Gráficos y Estadísticas',

    // Acciones
    PRIORITIES_VIEW_ALL: 'Ver Todas las Prioridades',
    PRIORITIES_EXPORT: 'Exportar Datos de Prioridades',

    DOCS_VIEW_ALL: 'Ver Todos los Documentos (Global)',
    DOCS_VIEW_DEPT: 'Ver Documentos de su Departamento',
    DOCS_UPLOAD: 'Subir Nuevos Documentos',
    DOCS_ACTION_RECEIVE: 'Acción: Recibir Documentos',
    DOCS_ACTION_APPROVE: 'Acción: Aprobar Documentos',
    DOCS_ACTION_REJECT: 'Acción: Rechazar Documentos',

    TICKETS_CREATE: 'Crear Nuevos Tickets',
    TICKETS_EDIT: 'Editar Tickets Existentes',
    TICKETS_DELETE: 'Eliminar Tickets',
    TICKETS_VIEW_ALL: 'Ver Todos los Tickets (Global)',
    TICKETS_VIEW_DEPT: 'Ver Tickets de su Departamento',
    TICKETS_MOVE_KANBAN: 'Mover Tickets en el Kanban',
    TICKETS_RESOLVE: 'Resolver/Cerrar Tickets',

    PRINTERS_MANAGE: 'Gestionar Estado de Impresoras',

    SECURITY_VIEW_LOGS: 'Consultar Logs de Auditoría',
    SECURITY_MANAGE_USERS: 'Gestionar Usuarios y Roles',
    SECURITY_ANNOUNCEMENTS: 'Ver y actualizar la gestion de anuncios',

    // Estructura
    ORG_VIEW_FULL: 'Ver Estructura completa (Nacional)',
    ORG_VIEW_LIMITED: 'Ver Estructura limitada (Local)',

    // Sistema
    SYS_SWITCH_ROLE: 'Alternar Persona (Switch Role)',
    SYS_DEV_TOOLS: 'Herramientas de Desarrollador',
};

export type Permission = keyof typeof PERMISSIONS_MASTER;

// Perfiles por defecto (Heredados según requerimiento)
export const DEFAULT_SCOPES: Record<string, string[]> = {
    Usuario: [
        PERMISSIONS_MASTER.VIEW_DASHBOARD,
        PERMISSIONS_MASTER.VIEW_PRIORITIES,
        PERMISSIONS_MASTER.VIEW_TICKETS,
        PERMISSIONS_MASTER.VIEW_DOCUMENTS,
        PERMISSIONS_MASTER.DOCS_VIEW_DEPT,
        PERMISSIONS_MASTER.DOCS_UPLOAD,
        PERMISSIONS_MASTER.TICKETS_CREATE,
        PERMISSIONS_MASTER.TICKETS_VIEW_DEPT,
        PERMISSIONS_MASTER.ORG_VIEW_LIMITED
    ],
    Gerente: [
        PERMISSIONS_MASTER.VIEW_DASHBOARD,
        PERMISSIONS_MASTER.VIEW_PRIORITIES,
        PERMISSIONS_MASTER.VIEW_TICKETS,
        PERMISSIONS_MASTER.VIEW_DOCUMENTS,
        PERMISSIONS_MASTER.DOCS_VIEW_DEPT,
        PERMISSIONS_MASTER.DOCS_UPLOAD,
        PERMISSIONS_MASTER.TICKETS_CREATE,
        PERMISSIONS_MASTER.TICKETS_VIEW_DEPT,
        PERMISSIONS_MASTER.ORG_VIEW_LIMITED
    ],
    CEO: [
        PERMISSIONS_MASTER.VIEW_DASHBOARD,
        PERMISSIONS_MASTER.VIEW_PRIORITIES,
        PERMISSIONS_MASTER.VIEW_TICKETS,
        PERMISSIONS_MASTER.VIEW_DOCUMENTS,
        PERMISSIONS_MASTER.VIEW_STATS,
        PERMISSIONS_MASTER.PRIORITIES_VIEW_ALL,
        PERMISSIONS_MASTER.DOCS_VIEW_ALL,
        PERMISSIONS_MASTER.TICKETS_VIEW_ALL,
        PERMISSIONS_MASTER.ORG_VIEW_FULL
    ],
    Administrador: Object.values(PERMISSIONS_MASTER),
    Desarrollador: Object.values(PERMISSIONS_MASTER) // Acceso total
};
