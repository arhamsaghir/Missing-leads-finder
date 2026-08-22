import { render, screen } from '@testing-library/react';
import App from './App';

test('renders Missed Lead Revenue Finder heading', () => {
  render(<App />);
  const headingElement = screen.getByText(/Missed Lead Revenue Finder/i);
  expect(headingElement).toBeInTheDocument();
});
