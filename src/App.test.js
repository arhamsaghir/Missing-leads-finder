import { jsx as _jsx } from "react/jsx-runtime";
import { render, screen } from '@testing-library/react';
import App from './App';
test('renders Missed Lead Revenue Finder heading', () => {
    render(_jsx(App, {}));
    const headingElement = screen.getByText(/Missed Lead Revenue Finder/i);
    expect(headingElement).toBeInTheDocument();
});
//# sourceMappingURL=App.test.js.map