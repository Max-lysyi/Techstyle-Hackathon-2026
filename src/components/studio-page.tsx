'use client';

import { useAppStore } from '@/store/app-store';
import { LandingPage } from '@/components/landing-page';
import { AuthView } from '@/components/auth-view';
import { SizeChartsView } from '@/components/size-charts-view';
import { EditorView } from '@/components/editor-view';

export default function StudioPage() {
  const { view } = useAppStore();

  switch (view) {
    case 'auth':
      return <AuthView />;
    case 'size-charts':
      return <SizeChartsView />;
    case 'editor':
      return <EditorView />;
    case 'landing':
    default:
      return <LandingPage />;
  }
}
