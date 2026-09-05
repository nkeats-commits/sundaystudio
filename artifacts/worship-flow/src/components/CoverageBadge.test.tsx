import assert from 'node:assert/strict';
import { afterEach, mock, test } from 'node:test';
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
  Element: { configurable: true, writable: true, value: dom.window.Element },
  Node: { configurable: true, writable: true, value: dom.window.Node },
  Event: { configurable: true, writable: true, value: dom.window.Event },
  CustomEvent: { configurable: true, writable: true, value: dom.window.CustomEvent },
  MouseEvent: { configurable: true, writable: true, value: dom.window.MouseEvent },
  FocusEvent: { configurable: true, writable: true, value: dom.window.FocusEvent },
  getComputedStyle: { configurable: true, writable: true, value: dom.window.getComputedStyle },
  IS_REACT_ACT_ENVIRONMENT: { configurable: true, writable: true, value: true },
});
Object.defineProperty(globalThis, 'React', {
  configurable: true,
  writable: true,
  value: React,
});

mock.module('lucide-react', {
  namedExports: {
    BookOpen: () => React.createElement('svg'),
  },
});

const { fireEvent, render, screen, cleanup, waitFor } = await import('@testing-library/react');
const { CoverageBadge } = await import('./CoverageBadge');

const source = {
  id: 'reference-source',
  title: 'Reference source',
  author: 'Public domain',
  year: '1901',
  license: 'Public Domain',
  sourceUrl: 'https://example.com',
  description: 'A reference source',
  kind: 'translation' as const,
  lookupType: 'verse text',
  attribution: 'Reference source',
  bookCount: 2,
  scope: '2 books',
  coveredBooks: ['Genesis', 'Psalms'],
};

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
});

async function findTooltipParagraph(text: string) {
  let paragraph: HTMLParagraphElement | undefined;
  await waitFor(() => {
    paragraph = Array.from(document.querySelectorAll('p')).find(
      (element) => element.textContent?.replace(/\s+/g, ' ').trim() === text,
    );
    assert.ok(paragraph);
  });
  return paragraph!;
}

test('coverage tooltip keeps its content readable on hover', async () => {
  render(<CoverageBadge source={source} />);
  const trigger = screen.getByText('2 books');

  fireEvent.pointerMove(trigger, { pointerType: 'mouse' });
  const title = await findTooltipParagraph('2 books covered');
  const bookList = await findTooltipParagraph('Genesis, Psalms');

  assert.match(title.className, /text-primary-foreground/);
  assert.match(bookList.className, /text-primary-foreground/);
});

test('coverage tooltip opens with a keyboard focus event', async () => {
  render(<CoverageBadge source={source} />);
  const trigger = screen.getByText('2 books');

  fireEvent.focus(trigger);
  const title = await findTooltipParagraph('2 books covered');
  const bookList = await findTooltipParagraph('Genesis, Psalms');
  assert.match(title.className, /text-primary-foreground/);
  assert.match(bookList.className, /text-primary-foreground/);
});