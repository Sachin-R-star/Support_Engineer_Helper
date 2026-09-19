import React, { useState } from 'react';
import { HybridDecisionTrace } from '../types/triage';

interface DecisionTracePanelProps {
  trace: HybridDecisionTrace;
}

export const DecisionTracePanel: React.FC<DecisionTracePanelProps> = ({ trace }) => {
  const [isOpen, setIsOpen] = useState(false);

  const getBandBadge = (band: 'HIGH' | 'MEDIUM' | 'LOW') => {
    switch (band) {
      case 'HIGH':
        return <span className="bg-emerald-900/40 text-emerald-400 border border-emerald-700/50 px-2 py-0.5 rounded text-xs font-semibold">⚡ HIGH CONFIDENCE</span>;
      case 'MEDIUM':
        return <span className="bg-amber-900/40 text-amber-400 border border-amber-700/50 px-2 py-0.5 rounded text-xs font-semibold">⚠️ MEDIUM CONFIDENCE</span>;
      case 'LOW':
        return <span className="bg-rose-900/40 text-rose-400 border border-rose-700/50 px-2 py-0.5 rounded text-xs font-semibold">❓ LOW CONFIDENCE / UNCERTAIN</span>;
    }
  };

  return (
    <div className="mt-4 bg-slate-900/80 border border-indigo-500/30 rounded-xl overflow-hidden shadow-lg backdrop-blur">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-4 py-3 bg-slate-800/70 hover:bg-slate-800 transition flex items-center justify-between text-left border-b border-slate-700/40"
      >
        <div className="flex items-center space-x-3">
          <span className="text-lg">🧠</span>
          <div>
            <h4 className="text-sm font-semibold text-indigo-300">AI Decision Trace & Reasoning Rationale</h4>
            <p className="text-xs text-slate-400">Inspect how deterministic retrieval and AI reasoning arrived at candidate <code className="text-indigo-400">{trace.finalDecisionCandidateId}</code></p>
          </div>
        </div>
        <div className="flex items-center space-x-3">
          {getBandBadge(trace.confidenceBand)}
          <span className="text-slate-400 text-xs">{isOpen ? '▼ Hide' : '▶ Show Trace'}</span>
        </div>
      </button>

      {isOpen && (
        <div className="p-4 space-y-4 text-xs text-slate-300 bg-slate-950/60">
          {/* Grounding & Fallback Alert Banners */}
          {trace.fallbackTriggered && (
            <div className="p-3 bg-amber-950/50 border border-amber-500/40 rounded-lg text-amber-200 space-y-1">
              <div className="font-semibold flex items-center space-x-1.5 text-amber-300">
                <span>🛡️ Safe Deterministic Fallback Active</span>
              </div>
              <p>{trace.fallbackReason || 'AI provider unavailable or output ungrounded. Reverted safely to deterministic retrieval.'}</p>
            </div>
          )}

          {!trace.groundingValidationPassed && (
            <div className="p-3 bg-rose-950/50 border border-rose-500/40 rounded-lg text-rose-200 space-y-1">
              <div className="font-semibold flex items-center space-x-1.5 text-rose-300">
                <span>⚠️ Grounding Violation Rejected</span>
              </div>
              <ul className="list-disc pl-4 space-y-0.5">
                {trace.groundingViolations.map((v, i) => (
                  <li key={i}>{v}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Breakdown Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Deterministic Evidence */}
            <div className="p-3 bg-slate-900/60 border border-slate-800 rounded-lg space-y-1.5">
              <h5 className="font-semibold text-indigo-400 flex items-center space-x-1.5">
                <span>🔍 Retrieved KB Candidates</span>
              </h5>
              <ul className="space-y-1 text-slate-300">
                {trace.decisionBreakdown.deterministicEvidence.map((ev, i) => (
                  <li key={i} className="bg-slate-800/40 p-1.5 rounded border border-slate-700/30">{ev}</li>
                ))}
              </ul>
            </div>

            {/* AI Contribution */}
            <div className="p-3 bg-slate-900/60 border border-slate-800 rounded-lg space-y-1.5">
              <h5 className="font-semibold text-cyan-400 flex items-center space-x-1.5">
                <span>🤖 Decision Rationale</span>
              </h5>
              <p className="bg-slate-800/40 p-2 rounded border border-slate-700/30 text-slate-200 leading-relaxed">
                {trace.aiInterpretation || trace.decisionBreakdown.aiContribution}
              </p>
            </div>
          </div>

          {/* Rule Overrides */}
          <div className="p-3 bg-slate-900/60 border border-slate-800 rounded-lg space-y-1.5">
            <h5 className="font-semibold text-purple-400 flex items-center space-x-1.5">
              <span>🛡️ Deterministic Business & Safety Rules</span>
            </h5>
            <ul className="space-y-1 text-slate-300">
              {trace.decisionBreakdown.ruleOverrides.map((rule, i) => (
                <li key={i} className="flex items-start space-x-1.5">
                  <span className="text-purple-400 font-bold">•</span>
                  <span>{rule}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Extracted Facts */}
          {trace.extractedFacts && trace.extractedFacts.length > 0 && (
            <div className="p-3 bg-slate-900/60 border border-slate-800 rounded-lg space-y-1.5">
              <h5 className="font-semibold text-emerald-400 flex items-center space-x-1.5">
                <span>📌 Verified Grounded Facts</span>
              </h5>
              <div className="flex flex-wrap gap-1.5">
                {trace.extractedFacts.map((fact, i) => (
                  <span key={i} className="bg-emerald-950/60 text-emerald-300 border border-emerald-800/50 px-2 py-1 rounded text-xs">
                    {fact}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
