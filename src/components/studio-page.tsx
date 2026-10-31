'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAppStore } from '@/store/app-store';
import { LandingPage } from '@/components/landing-page';
import { AuthView } from '@/components/auth-view';
import { PricingView } from '@/components/pricing-view';
import { CheckoutView } from '@/components/checkout-view';
import { SizeChartsView } from '@/components/size-charts-view';

export default function StudioPage() {
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
      return null;
    case 'landing':
    default:
      return <LandingPage />;
  }
}
