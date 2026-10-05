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

const { render, cleanup, fireEvent } = await import('@testing-library/react');
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
  return Array.from(sidebar.querySelectorAll<HTMLAnchorElement>('a')).filter(
    (link) => !link.closest('[hidden]'),
  );
}

function getDesktopSidebar(container: HTMLElement) {
  return getResponsiveSidebars(container)[0]!;
}

function getMobileSidebar(container: HTMLElement) {
  return getResponsiveSidebars(container)[1]!;
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

test('keeps desktop navigation expanded in its existing order', () => {
  const { container } = renderSidebar();
  const desktopSidebar = getDesktopSidebar(container);
  const links = getLinks(desktopSidebar).map((link) => link.getAttribute('href'));

  assert.deepEqual(links, navigation.map((item) => item.href));
  const sidebarText = desktopSidebar.textContent ?? '';
  assert.ok(sidebarText.indexOf('Dashboard') < sidebarText.indexOf('SERMON PREP'));
  assert.ok(sidebarText.indexOf('SERMON PREP') < sidebarText.indexOf('OTHER TOOLS'));
  assert.ok(sidebarText.indexOf('OTHER TOOLS') < sidebarText.indexOf('SETTINGS'));
  assert.equal(desktopSidebar.querySelectorAll('button[aria-expanded]').length, 0);
});

test('keeps phone navigation compact while showing all group labels', () => {
  const { container } = renderSidebar();
  const mobileSidebar = getMobileSidebar(container);

  assert.deepEqual(
    getLinks(mobileSidebar).map((link) => link.getAttribute('href')),
    ['/dashboard', '/assistant'],
  );
  for (const group of ['sermon-prep', 'other-tools', 'settings']) {
    const toggle = mobileSidebar.querySelector<HTMLButtonElement>(
      `[data-testid="mobile-nav-group-toggle-${group}"]`,
    );
    assert.ok(toggle, `expected ${group} disclosure control`);
    assert.equal(toggle.getAttribute('aria-expanded'), 'false');
  }
  assert.match(mobileSidebar.textContent ?? '', /SERMON PREP.*OTHER TOOLS.*SETTINGS/);
  assert.match(mobileSidebar.textContent ?? '', /Pastor Example/);
});

test('exposes collapsed mobile groups as named disclosures with hidden controlled panels', () => {
  const { container } = renderSidebar();
  const mobileSidebar = getMobileSidebar(container);

  for (const group of [
    { id: 'sermon-prep', label: 'SERMON PREP' },
    { id: 'other-tools', label: 'OTHER TOOLS' },
    { id: 'settings', label: 'SETTINGS' },
  ]) {
    const toggle = mobileSidebar.querySelector<HTMLButtonElement>(
      `[data-testid="mobile-nav-group-toggle-${group.id}"]`,
    );
    const panel = mobileSidebar.querySelector<HTMLDivElement>(
      `#mobile-nav-group-${group.id}`,
    );

    assert.ok(toggle, `expected a disclosure button for ${group.label}`);
    assert.ok(panel, `expected a controlled panel for ${group.label}`);
    assert.equal(toggle.textContent?.trim(), group.label);
    assert.equal(toggle.getAttribute('aria-expanded'), 'false');
    assert.equal(toggle.getAttribute('aria-controls'), panel.id);
    assert.equal(panel.hidden, true);
    assert.equal(panel.querySelectorAll('a').length > 0, true);
  }
});

test('renders the Bible Tools BETA badge inside its link in both responsive sidebars', () => {
  const { container } = renderSidebar();

  for (const sidebar of getResponsiveSidebars(container)) {
    const bibleToolsLink = Array.from(sidebar.querySelectorAll<HTMLAnchorElement>('a'))
      .find((link) => link.getAttribute('href') === '/bible-tools');
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

test('bounds the desktop rail and keeps its account block outside the navigation scroll area', () => {
  const { container } = renderSidebar();
  const desktopSidebar = getDesktopSidebar(container);
  const navigationList = desktopSidebar.querySelector<HTMLElement>(
    '[data-testid="desktop-sidebar-navigation"]',
  );
  const accountBlock = Array.from(desktopSidebar.children).find((element) =>
    element.classList.contains('border-t'),
  );

  assert.ok(desktopSidebar.classList.contains('min-h-0'));
  assert.match(desktopSidebar.style.height, /100dvh/);
  assert.match(desktopSidebar.style.height, /safe-area-inset-top/);
  assert.match(desktopSidebar.style.maxHeight, /100dvh/);
  assert.match(desktopSidebar.style.maxHeight, /safe-area-inset-top/);
  assert.ok(navigationList, 'expected a dedicated desktop navigation scroll area');
  assert.ok(accountBlock, 'expected a desktop account block below navigation');
  assert.ok(accountBlock.classList.contains('shrink-0'));
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
  const desktopSidebar = getDesktopSidebar(container);
  const mobileSidebar = getMobileSidebar(container);

  for (const { href } of navigation) {
    assert.equal(
      getLinks(desktopSidebar).filter((link) => link.getAttribute('href') === href).length,
      1,
      `expected ${href} in the expanded desktop sidebar`,
    );
  }

  for (const group of [
    {
      id: 'sermon-prep',
      hrefs: ['/sermons/new', '/sermons', '/sermons/series', '/bible-tools', '/resources'],
    },
    {
      id: 'other-tools',
      hrefs: [
        '/service-builder',
        '/generators/liturgy',
        '/generators/songs',
        '/generators/speaking-moment',
        '/generators/devotional',
        '/generators/soul-care',
        '/library',
        '/services',
      ],
    },
    {
      id: 'settings',
      hrefs: ['/help', '/church', '/settings/integrations', '/billing', '/settings', '/admin'],
    },
  ]) {
    const toggle = mobileSidebar.querySelector<HTMLButtonElement>(
      `[data-testid="mobile-nav-group-toggle-${group.id}"]`,
    )!;
    fireEvent.click(toggle);
    assert.equal(toggle.getAttribute('aria-expanded'), 'true');
    assert.deepEqual(
      Array.from(
        mobileSidebar.querySelectorAll<HTMLAnchorElement>(`#mobile-nav-group-${group.id} a`),
      ).map((link) => link.getAttribute('href')),
      group.hrefs,
      `expected every ${group.id} destination in its expanded mobile group`,
    );
  }
});

test('shows Admin only after ownership confirms in both responsive render paths', () => {
  const ownerRender = renderSidebar();
  const ownerMobile = getMobileSidebar(ownerRender.container);
  fireEvent.click(ownerMobile.querySelector('[data-testid="mobile-nav-group-toggle-settings"]')!);

  assert.equal(getLinks(getDesktopSidebar(ownerRender.container)).filter((link) => link.getAttribute('href') === '/admin').length, 1);
  assert.equal(getLinks(ownerMobile).filter((link) => link.getAttribute('href') === '/admin').length, 1);

  ownerRender.unmount();
  currentIsOwnerLoading = true;
  const loadingRender = renderSidebar();
  const loadingMobile = getMobileSidebar(loadingRender.container);
  fireEvent.click(loadingMobile.querySelector('[data-testid="mobile-nav-group-toggle-settings"]')!);

  assert.equal(getLinks(getDesktopSidebar(loadingRender.container)).filter((link) => link.getAttribute('href') === '/admin').length, 0);
  assert.equal(getLinks(loadingMobile).filter((link) => link.getAttribute('href') === '/admin').length, 0);

  loadingRender.unmount();
  currentIsOwnerLoading = false;
  currentIsOwner = false;
  const nonOwnerRender = renderSidebar();
  const nonOwnerMobile = getMobileSidebar(nonOwnerRender.container);
  fireEvent.click(nonOwnerMobile.querySelector('[data-testid="mobile-nav-group-toggle-settings"]')!);

  assert.equal(getLinks(getDesktopSidebar(nonOwnerRender.container)).filter((link) => link.getAttribute('href') === '/admin').length, 0);
  assert.equal(getLinks(nonOwnerMobile).filter((link) => link.getAttribute('href') === '/admin').length, 0);
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

test('opens the active mobile group when the drawer opens', () => {
  currentLocation = '/generators/songs';
  const onClose = () => undefined;
  const { container, rerender } = render(<Sidebar open={false} onClose={onClose} />);
  const mobileSidebar = getMobileSidebar(container);
  const otherToolsToggle = mobileSidebar.querySelector<HTMLButtonElement>(
    '[data-testid="mobile-nav-group-toggle-other-tools"]',
  )!;

  assert.equal(otherToolsToggle.getAttribute('aria-expanded'), 'false');
  rerender(<Sidebar open onClose={onClose} />);

  assert.equal(otherToolsToggle.getAttribute('aria-expanded'), 'true');
  const activeLink = getLinks(mobileSidebar).find((link) => link.getAttribute('href') === '/generators/songs');
  assert.ok(activeLink);
  assert.equal(isActive(activeLink), true);
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