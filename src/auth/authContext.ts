import { createContext } from 'react';
import type { User } from '@/api/types';

export type AuthState = {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<User>;
  acceptInvite: (token: string, name: string, password: string) => Promise<User>;
  logout: () => Promise<void>;
};

export const AuthContext = createContext<AuthState | null>(null);
