import { Fragment as _Fragment, jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { parseLeadsCSV, detectLeaks, computeRevenue } from '@missed-lead/core';
import Report from './components/Report';
import Templates from './components/Templates';
import './styles.css';
function App() {
    const [csvText, setCsvText] = useState('');
    const [defaultTicket, setDefaultTicket] = useState(25000);
    const [report, setReport] = useState(null);
    const [errors, setErrors] = useState([]);
    const [warnings, setWarnings] = useState([]);
    const handleAnalyze = () => {
        if (!csvText.trim()) {
            setErrors(['Please paste CSV data or load sample data']);
            return;
        }
        setErrors([]);
        setWarnings([]);
        const result = parseLeadsCSV(csvText);
        const leakSummary = detectLeaks(result.leads);
        const revenueSummary = computeRevenue(leakSummary.leads, leakSummary, defaultTicket);
        setReport({ summary: leakSummary, revenue: revenueSummary, leads: leakSummary.leads });
        setErrors(result.errors.map((e) => e.message));
        setWarnings(result.warnings.map((w) => w.message));
    };
    const handleLoadSample = async () => {
        try {
            const response = await fetch('/src/data/sample.csv');
            const text = await response.text();
            setCsvText(text);
            setErrors([]);
            setWarnings([]);
        }
        catch {
            setErrors(['Failed to load sample data']);
        }
    };
    const handleFileUpload = (e) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                setCsvText(event.target?.result);
            };
            reader.readAsText(file);
        }
    };
    return (_jsxs("div", { className: "app", children: [_jsx("header", { className: "app-header", children: _jsx("h1", { children: "Missed Lead Revenue Finder" }) }), _jsxs("main", { className: "app-main", children: [_jsxs("section", { className: "input-section", children: [_jsxs("div", { className: "input-group", children: [_jsx("label", { htmlFor: "csv-input", children: "Paste CSV or upload file" }), _jsx("textarea", { id: "csv-input", value: csvText, onChange: (e) => setCsvText(e.target.value), placeholder: "lead_id,created_at,customer_name,contact,source,status,last_contact_at,next_follow_up_at,estimated_value,notes\nL1,2024-01-01,John Doe,john@example.com,Web,new,,,50000,Interested", rows: 8 }), _jsx("input", { type: "file", accept: ".csv,text/csv", onChange: handleFileUpload, className: "file-input" })] }), _jsxs("div", { className: "controls-row", children: [_jsxs("div", { className: "input-group", children: [_jsx("label", { htmlFor: "default-ticket", children: "Default average ticket (cents)" }), _jsx("input", { id: "default-ticket", type: "number", value: defaultTicket, onChange: (e) => setDefaultTicket(parseInt(e.target.value) || 25000), min: "0" })] }), _jsxs("div", { className: "button-group", children: [_jsx("button", { onClick: handleLoadSample, className: "btn-secondary", children: "Load sample data" }), _jsx("button", { onClick: handleAnalyze, className: "btn-primary", children: "Analyze" })] })] }), (errors.length > 0 || warnings.length > 0) && (_jsxs("div", { className: "messages", children: [errors.map((err, i) => (_jsx("div", { className: "error", children: err }, i))), warnings.map((warn, i) => (_jsx("div", { className: "warning", children: warn }, i)))] }))] }), report && (_jsxs(_Fragment, { children: [_jsx(Report, { summary: report.summary, revenue: report.revenue, leads: report.leads }), _jsx(Templates, { leads: report.leads })] }))] })] }));
}
export default App;
//# sourceMappingURL=App.js.map