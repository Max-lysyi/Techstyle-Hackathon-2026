import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type AppView = 'landing' | 'auth' | 'size-charts' | 'editor';
export type AuthTab = 'login' | 'register';

export interface User {
  name: string;
  email: string;
  company: string;
}

export interface AppState {
  view: AppView;
  authTab: AuthTab;
  user: User | null;
  isLoggedIn: boolean;
  // navigation
  navigateTo: (view: AppView, tab?: AuthTab) => void;
  login: (user: User) => void;
  logout: () => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      view: 'landing',
      authTab: 'login',
      user: null,
      isLoggedIn: false,

      navigateTo: (view, tab) =>
        set((s) => ({
          view,
          authTab: tab ?? s.authTab,
        })),

      login: (user) =>
        set({
          isLoggedIn: true,
          user,
          view: 'editor',
        }),

      logout: () =>
        set({
          isLoggedIn: false,
          user: null,
          view: 'landing',
        }),
    }),
    {
      name: 'maxsport-app-state',
      partialize: (state) => ({
        user: state.user,
        isLoggedIn: state.isLoggedIn,
      }),
    }
  )
);
