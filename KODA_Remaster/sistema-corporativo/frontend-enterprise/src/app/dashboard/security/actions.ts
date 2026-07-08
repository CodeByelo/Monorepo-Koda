import {
    createSecurityLog,
    deleteUserAccount,
    getAllUsers,
    getSecurityLogs,
    getUserSecurityLogs,
    updateUserAccountStatus,
    resetUserPassword,
    unlockUser,
    updateUserProfile,
    updateUserRole,
} from "../../../lib/api";

export async function getSecurityLogsData() {
    return getSecurityLogs();
}

export async function getUsersList() {
    const response = await getAllUsers(100, 0);
    return response?.data || [];
}

export async function getUserDetails(userId: string) {
    const response = await getAllUsers(100, 0);
    const users = response?.data || [];
    return users.find((u: any) => String(u.id) === String(userId)) || null;
}

export async function getUserLogs(userId: string) {
    return getUserSecurityLogs(userId);
}

export async function logTicketActivity(data: any) {
    return createSecurityLog({
        evento: data?.evento || "TICKET",
        detalles: data?.detalles || "",
        estado: data?.estado || "info",
        page: "/dashboard?tab=tickets",
    });
}

export async function logDocumentActivity(data: any) {
    return createSecurityLog({
        evento: data?.evento || "DOCUMENTO",
        detalles: data?.detalles || "",
        estado: data?.estado || "info",
        page: "/dashboard?tab=documentos",
    });
}

export async function deleteUser(userId: string) {
    try {
        await deleteUserAccount(userId);
        return { success: true };
    } catch (error: any) {
        return { success: false, error: error?.message || "No se pudo eliminar la cuenta" };
    }
}

export async function updateUserStatus(userId: string, newStatus: string) {
    try {
        if (newStatus === "BLOQUEADO") {
            return { success: false, error: "El bloqueo solo ocurre por intentos fallidos de login." };
        }
        if (newStatus === "ACTIVO") {
            await unlockUser(userId);
        }
        return { success: true };
    } catch (error: any) {
        return { success: false, error: error?.message || "No se pudo actualizar estado" };
    }
}

export async function setUserStatus(userId: string, newStatus: "ACTIVO" | "INACTIVO" | "BLOQUEADO") {
    try {
        await updateUserAccountStatus(userId, newStatus);
        return { success: true };
    } catch (error: any) {
        return { success: false, error: error?.message || "No se pudo actualizar estado" };
    }
}

export async function changeUserRole(userId: string, roleLabel: string, masterPassword?: string) {
    const roleMap: Record<string, number> = {
        CEO: 1,
        Administrador: 2,
        Administrativo: 2,
        Gerente: 5,
        Usuario: 3,
        Desarrollador: 4,
    };
    const roleId = roleMap[roleLabel];
    if (!roleId) {
        return { success: false, error: "Rol no valido" };
    }
    try {
        const user = await updateUserRole(userId, roleId, masterPassword);
        return { success: true, user };
    } catch (error: any) {
        return { success: false, error: error?.message || "No se pudo actualizar rol" };
    }
}

export async function editUserProfileAction(
    userId: string,
    payload: {
        usuario_corp: string;
        nombre: string;
        apellido: string;
        email: string;
    },
) {
    try {
        const user = await updateUserProfile(userId, payload);
        return { success: true, user };
    } catch (error: any) {
        return { success: false, error: error?.message || "No se pudo actualizar perfil" };
    }
}

export async function unlockUserAccount(userId: string) {
    try {
        await unlockUser(userId);
        return { success: true };
    } catch (error: any) {
        return { success: false, error: error?.message || "No se pudo desbloquear" };
    }
}

export async function resetUserPasswordAction(userId: string, newPassword: string) {
    try {
        await resetUserPassword(userId, newPassword);
        return { success: true };
    } catch (error: any) {
        return { success: false, error: error?.message || "No se pudo resetear clave" };
    }
}
