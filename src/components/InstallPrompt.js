import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useEffect } from 'react';
export function InstallPrompt({ onDismiss }) {
    const [showPrompt, setShowPrompt] = useState(false);
    const [deferredPrompt, setDeferredPrompt] = useState(null);
    useEffect(() => {
        const handler = (e) => {
            e.preventDefault();
            setDeferredPrompt(e);
            setShowPrompt(true);
        };
        window.addEventListener('beforeinstallprompt', handler);
        return () => {
            window.removeEventListener('beforeinstallprompt', handler);
        };
    }, []);
    const handleInstall = async () => {
        if (!deferredPrompt)
            return;
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === 'accepted') {
            console.log('User accepted the install prompt');
        }
        else {
            console.log('User dismissed the install prompt');
        }
        setDeferredPrompt(null);
        setShowPrompt(false);
        onDismiss?.();
    };
    const handleDismiss = () => {
        setShowPrompt(false);
        onDismiss?.();
    };
    if (!showPrompt)
        return null;
    return (_jsxs("div", { className: "install-prompt", children: [_jsxs("div", { className: "install-prompt-header", children: [_jsx("span", { className: "install-prompt-title", children: "Install App" }), _jsx("button", { className: "install-prompt-close", onClick: handleDismiss, children: "\u2715" })] }), _jsx("p", { className: "install-prompt-message", children: "Add Missed Lead Revenue Finder to your home screen for quick access." }), _jsxs("div", { className: "install-prompt-buttons", children: [_jsx("button", { className: "btn-primary", onClick: handleInstall, children: "Install" }), _jsx("button", { className: "btn-secondary", onClick: handleDismiss, children: "Later" })] })] }));
}
//# sourceMappingURL=InstallPrompt.js.map