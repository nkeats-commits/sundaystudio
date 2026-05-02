import { AppLayout } from '../components/layout/AppLayout';
import { Home } from 'lucide-react';
import { Link } from 'wouter';

export default function NotFound() {
  return (
    <AppLayout title="Not Found">
      <div className="flex flex-col items-center justify-center py-32 text-center">
        <h1 className="text-6xl font-serif text-[var(--worship-navy)] mb-6 text-opacity-20">404</h1>
        <h2 className="text-2xl font-serif text-[var(--worship-navy)] mb-4">This page wandered off</h2>
        <p className="text-[var(--worship-slate)] max-w-md mb-8">
          Like a lost sheep, the page you're looking for cannot be found. Let's get you back home.
        </p>
        <Link href="/dashboard" className="worship-btn-primary px-6 py-3 rounded-xl font-medium flex items-center gap-2">
          <Home className="w-4 h-4" /> Return to Dashboard
        </Link>
      </div>
    </AppLayout>
  );
}
