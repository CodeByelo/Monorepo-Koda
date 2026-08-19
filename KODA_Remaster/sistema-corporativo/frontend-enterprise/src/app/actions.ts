'use server';

// Legacy actions stubbed to remove Neon dependencies.
// TODO: Migrate to Python API if needed.

export type LoginState = {
    message?: string;
    errors?: {
        username?: string;
        password?: string;
    };
    success?: boolean;
};

export async function manejarLogin(prevState: LoginState, formData: FormData): Promise<LoginState> {
    console.log("Legacy login action called. Please use the Python API.");
    return { message: 'Función de login migrada al backend Python.' };
}

export async function registrarUsuario(formData: FormData) {
    console.log("Legacy register action called.");
    return { error: 'Registro migrado al backend Python.' };
}