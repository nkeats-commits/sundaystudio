import React from 'react';
import { NavLink } from 'react-router-dom'; // Mock router if needed, or just standard links
import {
  LayoutDashboard,
  ListVideo,
  BookOpen,
  Music,
  Mic,
  Users,
  FolderOpen,
  Settings,
  Building,
  Flame
} from 'lucide-react';
import './../_group.css';

export function Sidebar() {
  const navItems = [
    { icon: LayoutDashboard, label: 'Dashboard', href: '#', active: true },
    { icon: ListVideo, label: 'Service Builder', href: '#' },
    { icon: BookOpen, label: 'Liturgy Generator', href: '#' },
    { icon: Music, label: 'Song Assistant', href: '#' },
    { icon: Mic, label: 'Speaking Moments', href: '#' },
    { icon: Users, label: 'Team Devotionals', href: '#' },
    { icon: FolderOpen, label: 'Saved Services', href: '#' },
  ];

  const bottomItems = [
    { icon: Building, label: 'Church Profile', href: '#' },
    { icon: Settings, label: 'Settings', href: '#' },
  ];

  return (
    <div className="w-64 shrink-0 flex flex-col h-screen sticky top-0" style={{ backgroundColor: 'var(--worship-navy)', color: 'white' }}>
      <div className="p-6 flex items-center gap-3">
        <Flame className="w-6 h-6" style={{ color: 'var(--worship-gold)' }} />
        <span className="text-xl font-semibold tracking-tight" style={{ color: 'var(--worship-gold)', fontFamily: 'var(--font-serif)' }}>
          WorshipFlow
        </span>
      </div>
      
      <div className="flex-1 overflow-y-auto py-4 flex flex-col gap-1 px-3">
        {navItems.map((item, i) => (
          <a
            key={i}
            href={item.href}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              item.active 
                ? 'bg-white/10 text-white' 
                : 'text-slate-300 hover:bg-white/5 hover:text-white'
            }`}
          >
            <item.icon className={`w-5 h-5 ${item.active ? 'text-[var(--worship-gold)]' : 'text-slate-400'}`} />
            {item.label}
          </a>
        ))}
        
        <div className="my-4 mx-3 h-px bg-white/10" />
        
        {bottomItems.map((item, i) => (
          <a
            key={i}
            href={item.href}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-300 hover:bg-white/5 hover:text-white transition-colors"
          >
            <item.icon className="w-5 h-5 text-slate-400" />
            {item.label}
          </a>
        ))}
      </div>
      
      <div className="p-4 border-t border-white/10">
        <div className="flex items-center gap-3 px-2">
          <div className="w-8 h-8 rounded-full bg-[var(--worship-gold)] flex items-center justify-center text-[var(--worship-navy)] font-bold text-sm">
            SP
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-medium text-white">Sarah Pastor</span>
            <span className="text-xs text-slate-400">sarah@gracechurch.org</span>
          </div>
        </div>
      </div>
    </div>
  );
}
