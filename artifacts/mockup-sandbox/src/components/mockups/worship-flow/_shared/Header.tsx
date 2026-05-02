import React from 'react';
import { Bell, Search } from 'lucide-react';

export function Header({ title = "Dashboard" }: { title?: string }) {
  return (
    <header className="h-16 flex items-center justify-between px-8 border-b" style={{ backgroundColor: 'var(--worship-white)', borderColor: 'var(--worship-border)' }}>
      <h2 className="text-xl font-medium" style={{ color: 'var(--worship-navy)', fontFamily: 'var(--font-serif)' }}>
        {title}
      </h2>
      
      <div className="flex items-center gap-6">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--worship-muted-slate)' }} />
          <input 
            type="text" 
            placeholder="Search services, songs..." 
            className="pl-9 pr-4 py-1.5 rounded-full text-sm outline-none w-64 transition-all focus:w-72"
            style={{ 
              backgroundColor: 'var(--worship-cream)', 
              color: 'var(--worship-charcoal)',
              border: '1px solid var(--worship-border)'
            }}
          />
        </div>
        <button className="relative">
          <Bell className="w-5 h-5" style={{ color: 'var(--worship-slate)' }} />
          <span className="absolute 1 top-0 right-0 w-2 h-2 rounded-full" style={{ backgroundColor: 'var(--worship-error)' }}></span>
        </button>
      </div>
    </header>
  );
}
