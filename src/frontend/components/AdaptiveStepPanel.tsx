import React, { useState } from 'react';
import { AdaptiveStepPayload } from '../types/triage';

interface AdaptiveStepPanelProps {
  adaptiveStep?: AdaptiveStepPayload;
}

export const AdaptiveStepPanel: React.FC<AdaptiveStepPanelProps> = ({ adaptiveStep }) => {
  if (!adaptiveStep) return null;

  const bandTextMap: Record<string, string> = {
    HIGH: 'High',
    MEDIUM: 'Medium',
    LOW: 'Low'
  };

  const bandColors: Record<string, string> = {
    HIGH: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
    MEDIUM: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
    LOW: 'bg-blue-500/10 text-blue-400 border-blue-500/30'
  };

  const confidenceLabel = bandTextMap[adaptiveStep.confidenceBand] || 'High';
  const confidenceClass = bandColors[adaptiveStep.confidenceBand] || bandColors.HIGH;

  // Format clean human rationale for default employee view
  let humanRationale = "This question helps us determine whether your login problem is related to your account or your network connection.";
  const rawRationale = adaptiveStep.rationale || "";
  
  if (rawRationale && !/distinguish|hypothesis|score|effort|risk|gain|algorithm|KB|timeout|lockout/i.test(rawRationale)) {
    humanRationale = rawRationale;
  }

  return (
    <div className="mt-4 rounded-xl border border-slate-700/60 bg-slate-800/40 p-4 backdrop-blur-sm">
      {/* Employee View Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-indigo-500/20 text-indigo-400">
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-300">Why are we asking?</h4>
        </div>
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${confidenceClass}`}>
            Confidence: {confidenceLabel}
          </span>
        </div>
      </div>

      <p className="mt-2 text-xs leading-relaxed text-slate-300 font-normal">
        {humanRationale}
      </p>

      <div className="mt-2 text-[11px] text-slate-400 font-normal">
        💡 Choose the option that best matches what happened.
      </div>
    </div>
  );
};
