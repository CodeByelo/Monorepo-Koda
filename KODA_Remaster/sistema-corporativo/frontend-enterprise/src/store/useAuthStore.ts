import { create } from 'zustand';

export interface User {
  id: string;
  username: string;
  role: string;
}

export interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  setAuth: (user: User, token: string) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set: (fn: (state: AuthState) => Partial<AuthState>) => void) => ({
  user: null,
  token: null,
  isAuthenticated: false,
  setAuth: (user: User, token: string) => set(() => ({ user, token, isAuthenticated: true })),
  logout: () => set(() => ({ user: null, token: null, isAuthenticated: false })),
}));
