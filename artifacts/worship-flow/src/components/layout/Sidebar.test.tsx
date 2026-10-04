import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mock, test, beforeEach, afterEach } from 'node:test';
import { JSDOM } from 'jsdom';
import React from 'react';

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'http://localhost/',
});

Object.defineProperties(globalThis, {
  window: { configurable: true, writable: true, value: dom.window },
  document: { configurable: true, writable: true, value: dom.window.document },
  navigator: { configurable: true, writable: true, value: dom.window.navigator },
  HTMLElement: { configurable: true, writable: true, value: dom.window.HTMLElement },
  Node: { configurable: true, writable: true, value: dom.window.Node },
  getComputedStyle: { configurable: true, writable: true, value: dom.window.getComputedStyle },
  IS_REACT_ACT_ENVIRONMENT: { configurable: true, writable: true, value: true },
});
Object.defineProperty(globalThis, 'React', {
  configurable: true,
  writable: true,
  value: React,
});

let currentLocation = '/dashboard';
let currentIsOwner = true;
let currentIsOwnerLoading = false;

mock.module('@clerk/react', {
  namedExports: {
    useAuth: () => ({ isLoaded: true, isSignedIn: true }),
    useUser: () => ({
      user: {
        firstName: 'Pastor',
        lastName: 'Example',
        primaryEmailAddress: { emailAddress: 'pastor@example.com' },
      },
    }),
  },
});

mock.module('wouter', {
  namedExports: {
    Link: ({
      href,
      children,
      ...props
    }: {
      href: string;
      children: React.ReactNode;
    }) => (
      <a href={href} {...props}>
        {children}
      </a>
    ),
    useLocation: () => [currentLocation, () => undefined],
  },
});

mock.module('../../hooks/useIsOwner', {
  namedExports: {
    useIsOwner: () => ({ isOwner: currentIsOwner, isLoading: currentIsOwnerLoading }),
  },
});

mock.module('../../contexts/GenerationJobStore', {
  namedExports: {
    useAnyPendingGenerationJobs: () => [],
  },
});

mock.module('../../hooks/useJobGenerate', {
  namedExports: {
    generatorPagePath: (startPath: string) => startPath,
  },
});

const { render, cleanup } = await import('@testing-library/react');
const { Sidebar } = await import('./Sidebar');

const appLayoutSource = readFileSync(new URL('./AppLayout.tsx', import.meta.url), 'utf8');
const appStyles = readFileSync(new URL('../../index.css', import.meta.url), 'utf8');

const navigation = [
  { label: 'Dashboard', href: '/dashboard' },
  { label: 'Assistant', href: '/assistant' },
  { label: 'Sermon Builder', href: '/sermons/new' },
  { label: 'Sermon Archive', href: '/sermons' },
  { label: 'Sermon Series', href: '/sermons/series' },
  { label: 'Bible Tools', href: '/bible-tools' },
  { label: 'Sermon Resources', href: '/resources' },
  { label: 'Service Builder', href: '/service-builder' },
  { label: 'Liturgy Generator', href: '/generators/liturgy' },
  { label: 'Song Assistant', href: '/generators/songs' },
  { label: 'Speaking Moments', href: '/generators/speaking-moment' },
  { label: 'Team Devotionals', href: '/generators/devotional' },
  { label: 'Soul Care', href: '/generators/soul-care' },
  { label: 'Library', href: '/library' },
  { label: 'Saved Services', href: '/services' },
  { label: 'Help Center', href: '/help' },
  { label: 'Your Profile', href: '/church' },
  { label: 'Integrations', href: '/settings/integrations' },
  { label: 'Billing', href: '/billing' },
  { label: 'Settings', href: '/settings' },
  { label: 'Admin', href: '/admin' },
] as const;

function renderSidebar(onClose: () => void = () => undefined) {
  return render(<Sidebar open onClose={onClose} />);
}

function getResponsiveSidebars(container: HTMLElement) {
  const sidebars = Array.from(container.children).filter((element) =>
    element instanceof HTMLElement && (
      element.className.includes('hidden md:flex') ||
      element.className.includes('md:hidden fixed')
    ),
  ) as HTMLElement[];

  assert.equal(sidebars.length, 2);
  return sidebars;
}

function getLinks(sidebar: HTMLElement) {
  return Array.from(sidebar.querySelectorAll<HTMLAnchorElement>('a'));
}

function isActive(link: HTMLAnchorElement) {
  return link.className.includes('bg-white/10') && link.className.includes('text-white');
}

beforeEach(() => {
  currentLocation = '/dashboard';
  currentIsOwner = true;
  currentIsOwnerLoading = false;
  document.body.innerHTML = '';
});

afterEach(() => {
  cleanup();
});

test('keeps the Dashboard, SERMON PREP, and OTHER TOOLS sections in order', () => {
  const { container } = renderSidebar();

  for (const sidebar of getResponsiveSidebars(container)) {
    const links = getLinks(sidebar).map((link) => link.getAttribute('href'));
    assert.deepEqual(
      links,
      navigation.map((item) => item.href),
    );

    const sidebarText = sidebar.textContent ?? '';
    assert.ok(sidebarText.indexOf('Dashboard') < sidebarText.indexOf('SERMON PREP'));
    assert.ok(sidebarText.indexOf('SERMON PREP') < sidebarText.indexOf('OTHER TOOLS'));
  }
});

test('renders the Bible Tools BETA badge inside its link in both responsive sidebars', () => {
  const { container } = renderSidebar();

  for (const sidebar of getResponsiveSidebars(container)) {
    const bibleToolsLink = getLinks(sidebar).find((link) => link.getAttribute('href') === '/bible-tools');
    assert.ok(bibleToolsLink, 'expected Bible Tools link in each responsive sidebar');

    const badge = bibleToolsLink.querySelector('[data-testid="bible-tools-beta-badge"]');
    assert.ok(badge, 'expected BETA badge inside the Bible Tools link');
    assert.equal(badge.textContent, 'BETA');
    assert.equal(bibleToolsLink.querySelectorAll('a').length, 0, 'expected the badge not to contain a nested link');
    assert.equal(
      sidebar.querySelectorAll('[data-testid="bible-tools-beta-badge"]').length,
      1,
      'expected one Bible Tools BETA badge per sidebar',
    );
  }
});

test('keeps each responsive sidebar navigation list independently scrollable', () => {
  const { container } = renderSidebar();

  for (const sidebar of getResponsiveSidebars(container)) {
    const navigationList = Array.from(sidebar.children).find((element) =>
      element.classList.contains('overflow-y-auto'),
    );

    assert.ok(navigationList, 'expected the sidebar navigation to retain its own vertical scroll area');
    assert.equal(navigationList.classList.contains('flex-1'), true);
  }
});

test('keeps page scrolling on the document instead of a contained main panel', () => {
  const mainClass = appLayoutSource.match(/<main className="([^"]*worship-app-main[^"]*)"/)?.[1];
  const mainStyles = appStyles.match(/\.worship-app-main\s*\{([^}]*)\}/)?.[1];

  assert.ok(mainClass, 'expected the app layout to define its shared main content region');
  assert.ok(mainStyles, 'expected the shared main content styles');
  assert.equal(mainClass.includes('overflow-y-auto'), false);
  assert.doesNotMatch(mainStyles, /overscroll-behavior-y\s*:\s*contain/i);
});

test('keeps every navigation destination in both responsive render paths', () => {
  const { container } = renderSidebar();
  const sidebars = getResponsiveSidebars(container);

  for (const { href } of navigation) {
    for (const sidebar of sidebars) {
      assert.equal(
        getLinks(sidebar).filter((link) => link.getAttribute('href') === href).length,
        1,
        `expected ${href} in each responsive sidebar`,
      );
    }
  }
});

test('shows Admin only after ownership confirms in both responsive render paths', () => {
  const ownerRender = renderSidebar();

  for (const sidebar of getResponsiveSidebars(ownerRender.container)) {
    assert.equal(
      getLinks(sidebar).filter((link) => link.getAttribute('href') === '/admin').length,
      1,
      'expected Admin in each owner sidebar',
    );
  }

  ownerRender.unmount();
  currentIsOwnerLoading = true;
  const loadingRender = renderSidebar();

  for (const sidebar of getResponsiveSidebars(loadingRender.container)) {
    assert.equal(
      getLinks(sidebar).filter((link) => link.getAttribute('href') === '/admin').length,
      0,
      'expected Admin to be omitted from each sidebar while ownership is loading',
    );
  }

  loadingRender.unmount();
  currentIsOwnerLoading = false;
  currentIsOwner = false;
  const nonOwnerRender = renderSidebar();

  for (const sidebar of getResponsiveSidebars(nonOwnerRender.container)) {
    assert.equal(
      getLinks(sidebar).filter((link) => link.getAttribute('href') === '/admin').length,
      0,
      'expected Admin to be omitted from each non-owner sidebar',
    );
  }
});

test('highlights the matching nested sermon and saved-service routes', () => {
  const routeExpectations = [
    { location: '/assistant', activeHref: '/assistant' },
    { location: '/assistant/anything', activeHref: '/assistant' },
    { location: '/sermons/123', activeHref: '/sermons' },
    { location: '/sermons/series/456', activeHref: '/sermons/series' },
    { location: '/bible-tools', activeHref: '/bible-tools' },
    { location: '/services/789', activeHref: '/services' },
    { location: '/services/789/print', activeHref: '/services' },
  ];

  for (const { location, activeHref } of routeExpectations) {
    currentLocation = location;
    const { container, unmount } = renderSidebar();

    for (const sidebar of getResponsiveSidebars(container)) {
      for (const link of getLinks(sidebar)) {
        assert.equal(
          isActive(link),
          link.getAttribute('href') === activeHref,
          `${location}: unexpected active state for ${link.textContent?.trim()}`,
        );
      }
    }

    unmount();
  }
});

test('closes the mobile drawer when the location changes', () => {
  const closeCalls: number[] = [];
  const onClose = () => closeCalls.push(1);
  const { container, rerender } = renderSidebar(onClose);

  currentLocation = '/services/123';
  rerender(<Sidebar open onClose={onClose} />);

  assert.equal(closeCalls.length, 1);
  assert.equal(getResponsiveSidebars(container).length, 2);
});