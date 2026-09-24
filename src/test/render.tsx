import type { ReactElement } from 'react';
import { render } from '@testing-library/react';

/**
 * Render a component for testing. Currently a thin pass-through to Testing
 * Library — the components use plain HTML/CSS and need no provider. Kept as a
 * seam so that when the Tamagui design system is adopted, its provider is added
 * here once rather than in every test.
 */
export function renderWithProviders(ui: ReactElement) {
  return render(ui);
}
