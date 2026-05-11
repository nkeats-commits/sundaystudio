import React, { useEffect, useRef } from 'react';
import {
  LayoutDashboard,
  ListVideo,
  BookOpen,
  Music,
  Mic,
  Users,
  Sprout,
  FolderOpen,
  Settings,
  Building,
  Flame,
  ScrollText,
  Library as LibraryIcon,
  Archive,
  Layers,
  Plug,
  CreditCard,
  X,
  Loader2,
} from 'lucide-react';
import { Link, useLocation } from 'wouter';
import { useUser } from '@clerk/react';
import { Shield } from 'lucide-react';
import { useIsOwner } from '../../hooks/useIsOwner';
import { useAnyPendingGenerationJobs } from '../../contexts/GenerationJobStore';
import { generatorPagePath } from '../../hooks/useJobGenerate';

function BackgroundGenerationIndicator() {
  const pendingJobs = useAnyPendingGenerationJobs();
  const [, setLocation] = useLocation();

  if (pendingJobs.length === 0) return null;

  const first = pendingJobs[0]!;
  const pagePath = generatorPagePath(first.startPath);
  const label = first.label;

  return (
    <button
      type="button"
      onClick={() => setLocation(pagePath)}
      className="mx-3 mb-2 flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-left transition-colors hover:bg-white/10 border border-white/15 bg-white/5"
      title={`Click to return to ${label.replace('…', '')}`}
    >
      <Loader2 className="w-4 h-4 shrink-0 animate-spin text-[var(--worship-gold)]" />
      <span className="truncate text-slate-300">{label}</span>
    </button>
  );
}

export function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [location] = useLocation();
  const { user } = useUser();
  const { isOwner } = useIsOwner();

  const prevLocationRef = useRef(location);
  useEffect(() => {
    if (location !== prevLocationRef.current) {
      prevLocationRef.current = location;
      onClose();
    }
  }, [location, onClose]);

  const sermonItems = [
    { icon: ScrollText, label: 'Sermon Builder', href: '/sermons/new' },
    { icon: Archive, label: 'Sermon Archive', href: '/sermons' },
    { icon: Layers, label: 'Sermon Series', href: '/sermons/series' },
    { icon: LibraryIcon, label: 'Sermon Resources', href: '/resources' },
  ];

  const navItems = [
    { icon: LayoutDashboard, label: 'Dashboard', href: '/dashboard' },
    { icon: ListVideo, label: 'Service Builder', href: '/service-builder' },
    { icon: BookOpen, label: 'Liturgy Generator', href: '/generators/liturgy' },
    { icon: Music, label: 'Song Assistant', href: '/generators/songs' },
    { icon: Mic, label: 'Speaking Moments', href: '/generators/speaking-moment' },
    { icon: Users, label: 'Team Devotionals', href: '/generators/devotional' },
    { icon: Sprout, label: 'Soul Care', href: '/generators/soul-care' },
    { icon: LibraryIcon, label: 'Library', href: '/library' },
    { icon: FolderOpen, label: 'Saved Services', href: '/services' },
  ];

  const bottomItems = [
    { icon: Building, label: 'Your Profile', href: '/church' },
    { icon: Plug, label: 'Integrations', href: '/settings/integrations' },
    { icon: CreditCard, label: 'Billing', href: '/billing' },
    { icon: Settings, label: 'Settings', href: '/settings' },
    ...(isOwner
      ? [{ icon: Shield, label: 'Admin', href: '/admin' }]
      : []),
  ];

  const firstName = user?.firstName || '';
  const lastName = user?.lastName || '';
  const email = user?.primaryEmailAddress?.emailAddress || '';
  const initials = (firstName?.[0] || '') + (lastName?.[0] || '') || email?.[0]?.toUpperCase() || 'U';
  const fullName = firstName || lastName ? `${firstName} ${lastName}`.trim() : email;

  const navContent = (
    <>
      <div className="flex-1 overflow-y-auto py-4 flex flex-col gap-1 px-3">
        {navItems.map((item, i) => {
          const active = location === item.href;
          return (
            <Link
              key={i}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                active
                  ? 'bg-white/10 text-white'
                  : 'text-slate-300 hover:bg-white/5 hover:text-white'
              }`}
            >
              <item.icon className={`w-5 h-5 ${active ? 'text-[var(--worship-gold)]' : 'text-slate-400'}`} />
              {item.label}
            </Link>
          );
        })}

        <div className="my-4 mx-3 h-px bg-white/10" />
        <div className="px-3 mb-1 text-[10px] uppercase tracking-widest text-slate-500 font-semibold">Sermon Prep</div>
        {sermonItems.map((item, i) => {
          const active =
            location === item.href ||
            (item.href === '/sermons' &&
              location.startsWith('/sermons/') &&
              location !== '/sermons/new' &&
              !location.startsWith('/sermons/series')) ||
            (item.href === '/sermons/new' && location === '/sermons/new') ||
            (item.href === '/sermons/series' && location.startsWith('/sermons/series'));
          return (
            <Link
              key={`s-${i}`}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                active
                  ? 'bg-white/10 text-white'
                  : 'text-slate-300 hover:bg-white/5 hover:text-white'
              }`}
            >
              <item.icon className={`w-5 h-5 ${active ? 'text-[var(--worship-gold)]' : 'text-slate-400'}`} />
              {item.label}
            </Link>
          );
        })}

        <div className="my-4 mx-3 h-px bg-white/10" />

        {bottomItems.map((item, i) => {
          const active = location === item.href || location.startsWith(item.href + '/');
          return (
            <Link
              key={i}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                active
                  ? 'bg-white/10 text-white'
                  : 'text-slate-300 hover:bg-white/5 hover:text-white'
              }`}
            >
              <item.icon className={`w-5 h-5 ${active ? 'text-[var(--worship-gold)]' : 'text-slate-400'}`} />
              {item.label}
            </Link>
          );
        })}
      </div>

      <BackgroundGenerationIndicator />

      <div className="p-4 border-t border-white/10">
        <div className="flex items-center gap-3 px-2 overflow-hidden">
          <div className="shrink-0 w-8 h-8 rounded-full bg-[var(--worship-gold)] flex items-center justify-center text-[var(--worship-navy)] font-bold text-sm">
            {initials}
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-sm font-medium text-white truncate">{fullName}</span>
            <span className="text-xs text-slate-400 truncate">{email}</span>
          </div>
        </div>
      </div>
    </>
  );

  return (
    <>
      {/* Desktop sidebar — sticky left column, always visible */}
      <div
        className="hidden md:flex md:w-56 lg:w-64 shrink-0 flex-col h-screen sticky top-0"
        style={{ backgroundColor: 'var(--worship-navy)', color: 'white' }}
      >
        <div className="p-6 flex items-center gap-3">
          <Flame className="w-6 h-6" style={{ color: 'var(--worship-gold)' }} />
          <span className="text-xl font-semibold tracking-tight" style={{ color: 'var(--worship-gold)', fontFamily: 'var(--font-serif)' }}>
            Sunday Studio
          </span>
        </div>
        {navContent}
      </div>

      {/* Mobile sidebar — fixed overlay drawer */}
      <div
        className={`md:hidden fixed inset-y-0 left-0 z-50 flex flex-col w-72 transition-transform duration-300 ease-in-out ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
        style={{ backgroundColor: 'var(--worship-navy)', color: 'white' }}
        aria-hidden={!open}
      >
        <div className="p-5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Flame className="w-6 h-6" style={{ color: 'var(--worship-gold)' }} />
            <span className="text-xl font-semibold tracking-tight" style={{ color: 'var(--worship-gold)', fontFamily: 'var(--font-serif)' }}>
              Sunday Studio
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
            aria-label="Close menu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        {navContent}
      </div>
    </>
  );
}
