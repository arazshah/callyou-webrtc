import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from './App';
describe('landing page', () => {
  it('renders the Persian room form by default', () => {
    history.pushState({}, '', '/');
    render(<App />);
    expect(screen.getByRole('heading', { name: 'ساخت اتاق' })).toBeInTheDocument();
    expect(document.documentElement.lang).toBe('fa');
  });
});
