'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAppStore } from '@/store/app-store';
import { LandingPage } from '@/components/landing-page';
import { AuthView } from '@/components/auth-view';
import { PricingView } from '@/components/pricing-view';
import { CheckoutView } from '@/components/checkout-view';
import { SizeChartsView } from '@/components/size-charts-view';

export default function Home() {
  const router = useRouter();
  const { view } = useAppStore();

  useEffect(() => {
    if (view === 'editor') {
      router.push('/studio');
    }
  }, [view, router]);

  switch (view) {
    case 'auth':
      return <AuthView />;
    case 'pricing':
      return <PricingView />;
    case 'checkout':
      return <CheckoutView />;
    case 'size-charts':
      return <SizeChartsView />;
    case 'editor':
      return (
        <div className="min-h-screen bg-[#121214] text-white flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-[#D90416] border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-gray-400">Перехід до AI Print Studio…</p>
          </div>
        </div>
      );
    case 'landing':
    default:
      return <LandingPage />;
  }
}
