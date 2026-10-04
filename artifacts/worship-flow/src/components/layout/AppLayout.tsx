import React, { useEffect, useState } from 'react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { setNativeBackDismissHandler } from '../../mobile/nativeRuntime';

export function AppLayout({ children, title = "Dashboard" }: { children: React.ReactNode, title?: string }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (!sidebarOpen) {
      setNativeBackDismissHandler(null);
      return;
    }
    setNativeBackDismissHandler(() => {
      setSidebarOpen(false);
      return true;
    });
    return () => setNativeBackDismissHandler(null);
  }, [sidebarOpen]);

  return (
    <div className="worship-app-shell flex worship-theme">
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex-1 flex flex-col min-w-0">
        <Header title={title} onMenuClick={() => setSidebarOpen(true)} />
        <main className="worship-app-main flex-1 p-4 md:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
