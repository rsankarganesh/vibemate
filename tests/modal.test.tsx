import {fireEvent, render, screen, cleanup} from '@testing-library/react';
import {afterEach, expect, it, vi} from 'vitest';
import {Modal} from '../src/components/Modal';

afterEach(cleanup);

it('keeps keyboard focus inside the dialog and closes on Escape', () => {
  const close = vi.fn();
  render(<Modal title="Add expense" onClose={close}><input aria-label="Description"/></Modal>);
  const closeButton = screen.getByRole('button', {name: 'Close'});
  const input = screen.getByRole('textbox');
  expect(closeButton).toHaveFocus();
  fireEvent.keyDown(document, {key: 'Tab', shiftKey: true});
  expect(input).toHaveFocus();
  fireEvent.keyDown(document, {key: 'Tab'});
  expect(closeButton).toHaveFocus();
  fireEvent.keyDown(document, {key: 'Escape'});
  expect(close).toHaveBeenCalledOnce();
});

it('restores focus and scrolling after closing', () => {
  const trigger = document.createElement('button');
  document.body.append(trigger);
  trigger.focus();
  const {unmount} = render(<Modal title="Details" onClose={() => {}}>Details</Modal>);
  expect(document.body.style.overflow).toBe('hidden');
  unmount();
  expect(trigger).toHaveFocus();
  expect(document.body.style.overflow).toBe('');
  trigger.remove();
});
