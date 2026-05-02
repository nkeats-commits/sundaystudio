import React from 'react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import './../_group.css';

export function AppLayout({ children, title = "Dashboard" }: { children: React.ReactNode, title?: string }) {
  return (
    <div className="flex min-h-screen worship-theme">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <Header title={title} />
        <main className="flex-1 overflow-y-auto p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
