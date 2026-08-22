import { jsx as _jsx } from "react/jsx-runtime";
import { TamaguiProvider } from '@tamagui/core';
import config from '../tamagui.config';
export function TamaguiRoot({ children }) {
    return (_jsx(TamaguiProvider, { config: config, defaultTheme: "light", children: children }));
}
//# sourceMappingURL=TamaguiRoot.js.map