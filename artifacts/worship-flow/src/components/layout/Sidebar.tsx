import React, { useEffect, useRef, useState } from 'react';
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
  HelpCircle,
  X,
  Loader2,
  MessageCircle,
  ChevronDown,
} from 'lucide-react';
import { Link, useLocation } from 'wouter';
import { useUser } from '@clerk/react';
import { Shield } from 'lucide-react';
import { useIsOwner } from '../../hooks/useIsOwner';
import { useAnyPendingGenerationJobs } from '../../contexts/GenerationJobStore';
import { generatorPagePath } from '../../hooks/useJobGenerate';

type NavigationItem = {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  href: string;
  beta?: boolean;
};

type NavigationGroup = {
  id: string;
  label: string;
  items: NavigationItem[];
};

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
  const { isOwner, isLoading: isOwnerLoading } = useIsOwner();
  const [expandedMobileGroups, setExpandedMobileGroups] = useState<Set<string>>(
    () => new Set(),
  );

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
    { icon: BookOpen, label: 'Bible Tools', href: '/bible-tools', beta: true },
    { icon: LibraryIcon, label: 'Sermon Resources', href: '/resources' },
  ];

  const otherItems = [
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
    { icon: HelpCircle, label: 'Help Center', href: '/help' },
    { icon: Building, label: 'Your Profile', href: '/church' },
    { icon: Plug, label: 'Integrations', href: '/settings/integrations' },
    { icon: CreditCard, label: 'Billing', href: '/billing' },
    { icon: Settings, label: 'Settings', href: '/settings' },
    ...(isOwner && !isOwnerLoading
      ? [{ icon: Shield, label: 'Admin', href: '/admin' }]
      : []),
  ];

  const firstName = user?.firstName || '';
  const lastName = user?.lastName || '';
  const email = user?.primaryEmailAddress?.emailAddress || '';
  const initials = (firstName?.[0] || '') + (lastName?.[0] || '') || email?.[0]?.toUpperCase() || 'U';
  const fullName = firstName || lastName ? `${firstName} ${lastName}`.trim() : email;

  const navigationGroups: NavigationGroup[] = [
    { id: 'sermon-prep', label: 'SERMON PREP', items: sermonItems },
    { id: 'other-tools', label: 'OTHER TOOLS', items: otherItems },
    { id: 'settings', label: 'SETTINGS', items: bottomItems },
  ];

  const isItemActive = (item: NavigationItem, groupId?: string) => {
    if (item.href === '/dashboard') return location === item.href;

    if (groupId === 'sermon-prep') {
      return (
        location === item.href ||
        (item.href === '/sermons' &&
          location.startsWith('/sermons/') &&
          location !== '/sermons/new' &&
          !location.startsWith('/sermons/series')) ||
        (item.href === '/sermons/series' && location.startsWith('/sermons/series'))
      );
    }

    return location === item.href || location.startsWith(item.href + '/');
  };

  useEffect(() => {
    if (!open) return;
    const activeGroup = navigationGroups.find((group) =>
      group.items.some((item) => isItemActive(item, group.id)),
    );
    setExpandedMobileGroups(activeGroup ? new Set([activeGroup.id]) : new Set());
  }, [open, location]);

  const toggleMobileGroup = (groupId: string) => {
    setExpandedMobileGroups((current) => {
      const next = new Set(current);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

  const renderLink = (
    item: NavigationItem,
    key: string,
    groupId?: string,
    mobile = false,
  ) => {
    const active = isItemActive(item, groupId);
    const assistant = item.href === '/assistant';
    return (
      <Link
        key={key}
        href={item.href}
        data-testid={assistant ? 'nav-assistant' : undefined}
        className={`flex ${mobile ? 'min-h-11 ' : ''}items-center gap-3 px-3 py-2.5 rounded-lg text-sm ${
          assistant ? 'font-semibold' : 'font-medium'
        } transition-colors ${
          active
            ? 'bg-white/10 text-white'
            : assistant
              ? 'bg-white/5 text-[var(--worship-pale-gold)] hover:bg-white/[0.08] hover:text-white'
              : 'text-slate-300 hover:bg-white/5 hover:text-white'
        }`}
      >
        <item.icon
          className={`w-5 h-5 shrink-0 ${
            active
              ? 'text-[var(--worship-gold)]'
              : assistant
                ? 'text-[var(--worship-pale-gold)]'
                : 'text-slate-400'
          }`}
        />
        <span className="flex min-w-0 flex-1 items-center gap-2">
          <span className="truncate">{item.label}</span>
          {item.beta ? (
            <span
              data-testid="bible-tools-beta-badge"
              className="shrink-0 rounded bg-[var(--worship-gold)] px-1.5 py-0.5 text-[9px] font-bold leading-none tracking-wider text-[var(--worship-navy)]"
            >
              BETA
            </span>
          ) : null}
        </span>
        {assistant ? (
          <span className="ml-auto rounded-full border border-[var(--worship-gold)]/40 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-[var(--worship-gold)]">
            New
          </span>
        ) : null}
      </Link>
    );
  };

  const desktopNavContent = (
    <>
      <div className="flex-1 min-h-0 overflow-y-auto py-4 flex flex-col gap-1 px-3">
        {renderLink(
          { icon: LayoutDashboard, label: 'Dashboard', href: '/dashboard' },
          'dashboard',
        )}
        {renderLink(
          { icon: MessageCircle, label: 'Assistant', href: '/assistant' },
          'assistant',
        )}
        {navigationGroups.map((group) => (
          <React.Fragment key={group.id}>
            <div className="my-4 mx-3 h-px bg-white/10" />
            <div className="px-3 mb-1 text-[10px] uppercase tracking-widest text-slate-500 font-semibold">
              {group.label}
            </div>
            {group.items.map((item) => renderLink(item, item.href, group.id))}
          </React.Fragment>
        ))}
      </div>

      <BackgroundGenerationIndicator />
      <div className="shrink-0 p-4 border-t border-white/10">
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

  const mobileNavContent = (
    <>
      <div
        data-testid="mobile-sidebar-navigation"
        className="flex-1 min-h-0 overflow-y-auto py-3 flex flex-col gap-1 px-3"
      >
        {renderLink(
          { icon: LayoutDashboard, label: 'Dashboard', href: '/dashboard' },
          'dashboard',
          undefined,
          true,
        )}
        {renderLink(
          { icon: MessageCircle, label: 'Assistant', href: '/assistant' },
          'assistant',
          undefined,
          true,
        )}
        <div className="my-1 mx-3 h-px shrink-0 bg-white/10" />
        {navigationGroups.map((group) => {
          const expanded = expandedMobileGroups.has(group.id);
          const panelId = `mobile-nav-group-${group.id}`;
          return (
            <section key={group.id} className="shrink-0 border-b border-white/10 last:border-b-0">
              <button
                type="button"
                data-testid={`mobile-nav-group-toggle-${group.id}`}
                aria-expanded={expanded}
                aria-controls={panelId}
                onClick={() => toggleMobileGroup(group.id)}
                className="flex min-h-11 w-full items-center justify-between gap-3 rounded-lg px-3 text-left text-[10px] font-semibold uppercase tracking-widest text-slate-300 transition-colors hover:bg-white/5 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--worship-gold)]"
              >
                <span>{group.label}</span>
                <ChevronDown
                  aria-hidden="true"
                  className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${
                    expanded ? 'rotate-180' : ''
                  }`}
                />
              </button>
              <div id={panelId} hidden={!expanded} className="flex flex-col gap-1 pb-2 pl-2">
                {group.items.map((item) => renderLink(item, item.href, group.id, true))}
              </div>
            </section>
          );
        })}
      </div>

      <BackgroundGenerationIndicator />
      <div className="mobile-sidebar-account shrink-0 border-t border-white/10 p-4">
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
        {desktopNavContent}
      </div>

      {/* Mobile sidebar — fixed overlay drawer */}
      <div
        className={`md:hidden fixed inset-y-0 left-0 z-50 flex flex-col w-72 transition-transform duration-300 ease-in-out ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
        style={{ backgroundColor: 'var(--worship-navy)', color: 'white' }}
        aria-hidden={!open}
      >
        <div className="mobile-sidebar-header p-5 flex items-center justify-between gap-3">
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
        {mobileNavContent}
      </div>
    </>
  );
}
