import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type AppView = 'landing' | 'auth' | 'size-charts' | 'editor' | 'pricing' | 'checkout';
export type AuthTab = 'login' | 'register';

export interface User {
  name: string;
  email: string;
  company: string;
}

export interface PlanDetails {
  id: 'basic' | 'pro' | 'enterprise';
  name: string;
  price: number;
  period: 'monthly' | 'annually';
  billingText: string;
  badge?: string;
  features: string[];
}

export interface AppState {
  view: AppView;
  authTab: AuthTab;
  user: User | null;
  isLoggedIn: boolean;
  selectedPlan: PlanDetails | null;
  activeSubscription: string | null;

  // navigation & actions
  navigateTo: (view: AppView, tab?: AuthTab) => void;
  setSelectedPlan: (plan: PlanDetails | null) => void;
  setActiveSubscription: (planId: string) => void;
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
      selectedPlan: null,
      activeSubscription: null,

      navigateTo: (view, tab) =>
        set((s) => ({
          view,
          authTab: tab ?? s.authTab,
        })),

      setSelectedPlan: (plan) =>
        set({
          selectedPlan: plan,
        }),

      setActiveSubscription: (planId) =>
        set({
          activeSubscription: planId,
        }),

      login: (user) =>
        set({
          isLoggedIn: true,
          user,
          view: 'pricing', // Redirect to pricing view as requested
        }),

      logout: () =>
        set({
          isLoggedIn: false,
          user: null,
          view: 'landing',
          selectedPlan: null,
          activeSubscription: null,
        }),
    }),
    {
      name: 'maxsport-app-state',
      partialize: (state) => ({
        user: state.user,
        isLoggedIn: state.isLoggedIn,
        activeSubscription: state.activeSubscription,
      }),
    }
  )
);
