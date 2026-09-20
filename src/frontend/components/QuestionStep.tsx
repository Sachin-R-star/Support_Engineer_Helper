import React, { useState, useEffect } from 'react';
import { TaxonomyQuestion } from '../types/triage';

interface QuestionStepProps {
  question: TaxonomyQuestion;
  issueTypeName?: string;
  askedCount: number;
  confidence: number;
  onAnswer: (questionId: string, answerValue: string, isUnsure?: boolean) => void;
  onGoBack: () => void;
  canGoBack: boolean;
  isLoading?: boolean;
}

export function sanitizeQuestionText(rawText: string): string {
  if (!rawText) return rawText;
  let text = rawText;

  // Match combined "preceding action (Action '...' on ticket INC-... executed ... (PENDING))"
  text = text.replace(
    /(?:the\s+)?preceding\s+action\s*\([^)]*Action\s+['"][^'"]+['"][^)]*\)/gi,
    'the previous troubleshooting step'
  );

  // Pattern: (Action '...' on ticket INC-... executed ... (PENDING/COMPLETED/etc))
  text = text.replace(
    /\(Action\s+['"][^'"]+['"]\s+on\s+ticket\s+[A-Z0-9-]+\s+executed\s+[^)]+\)+/gi,
    'the previous troubleshooting step'
  );

  // Pattern: Action '...' on ticket INC-... executed ...
  text = text.replace(
    /Action\s+['"][^'"]+['"]\s+on\s+ticket\s+[A-Z0-9-]+\s+executed\s+[^\s)]+(\s+\([^)]+\))?/gi,
    'the previous troubleshooting step'
  );

  // Natural language conversions
  text = text.replace(/did the issue occur immediately after the preceding action execution event\?/gi, 'Did this issue start immediately after the previous troubleshooting step?');
  text = text.replace(/preceding action execution event/gi, 'previous troubleshooting step');
  text = text.replace(/the preceding action/gi, 'the previous troubleshooting step');
  text = text.replace(/preceding action/gi, 'previous troubleshooting step');
  text = text.replace(/reproduce across multiple endpoints/gi, 'happen for anyone else');
  text = text.replace(/ACCOUNT category locked by deterministic security rule/gi, 'Your account may be locked');

  // Strip standalone raw ticket numbers, confidence percentages, and status tags if present in prompt text
  text = text.replace(/\bINC-\d{4}-\d{4}\b/gi, '');
  text = text.replace(/\bwith \d+%\s+confidence\b/gi, '');
  text = text.replace(/\((?:PENDING|IN_PROGRESS|COMPLETED|FAILED)\)/gi, '');

  // Strip dangling closing parentheses before punctuation
  text = text.replace(/\)\s*\?/g, '?');
  text = text.replace(/\)\s*\./g, '.');

  text = text.replace(/\s+/g, ' ').trim();
  text = text.replace(/\s+\?/g, '?');

  return text;
}

export const QuestionStep: React.FC<QuestionStepProps> = ({
  question,
  issueTypeName,
  askedCount,
  confidence,
  onAnswer,
  onGoBack,
  canGoBack,
  isLoading
}) => {
  const [textInput, setTextInput] = useState('');

  // Scroll smoothly to top on question change
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [question?.id, askedCount]);

  // Keyboard navigation (Keys A, B, C, D or 1, 2, 3, 4)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isLoading || question.answer_type === 'TEXT') return;

      if (e.key === 'Backspace' || e.key === 'Escape') {
        if (canGoBack) {
          e.preventDefault();
          onGoBack();
        }
        return;
      }

      const options = question.options || [];
      let selectedIdx = -1;

      // Check numeric keys 1-9
      const num = parseInt(e.key, 10);
      if (!isNaN(num) && num >= 1 && num <= options.length) {
        selectedIdx = num - 1;
      } else {
        // Check letter keys A-D
        const code = e.key.toUpperCase().charCodeAt(0);
        if (code >= 65 && code < 65 + options.length) {
          selectedIdx = code - 65;
        }
      }

      if (selectedIdx >= 0 && selectedIdx < options.length) {
        const opt = options[selectedIdx];
        onAnswer(question.id, opt.value, opt.value === 'UNSURE');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [question, isLoading, canGoBack, onGoBack, onAnswer]);

  const handleTextSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (textInput.trim() && !isLoading) {
      onAnswer(question.id, textInput.trim());
      setTextInput('');
    }
  };

  // Estimate total expected questions (usually ~3 questions)
  const estimatedTotal = Math.max(askedCount + 1, 3);
  const progressPercent = Math.min(95, Math.round((askedCount / estimatedTotal) * 100));

  const displayQuestion = sanitizeQuestionText(question.question_text);

  return (
    <div className="question-step-container">
      {/* Animated Progress Bar */}
      <div className="progress-bar-container">
        <div className="progress-bar-fill" style={{ width: `${progressPercent}%` }} />
      </div>

      <div className="step-indicator">
        <div className="step-left">
          {canGoBack && (
            <button className="back-button" onClick={onGoBack} disabled={isLoading} title="Shortcut: Backspace / Esc">
              &larr; Back <kbd>Esc</kbd>
            </button>
          )}
          <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
            Question {askedCount} of ~{estimatedTotal}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {issueTypeName && <span className="domain-tag">Focus: {issueTypeName}</span>}
          <span className="confidence-meter">
            Certainty: <strong>{confidence}%</strong>
          </span>
        </div>
      </div>

      <div className="question-box">
        <h3>{displayQuestion}</h3>

        {question.answer_type === 'TEXT' ? (
          <form onSubmit={handleTextSubmit} className="input-form">
            <textarea
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              placeholder="Type your response here..."
              disabled={isLoading}
              rows={2}
              autoFocus
            />
            <div className="form-actions">
              <span className="subtitle" style={{ margin: 0 }}>
                Press <kbd>Enter</kbd> to submit
              </span>
              <button type="submit" className="submit-btn" disabled={!textInput.trim() || isLoading}>
                Submit Answer →
              </button>
            </div>
          </form>
        ) : (
          <div className="options-grid">
            {question.options.map((opt, idx) => (
              <button
                key={idx}
                className={`option-button ${opt.value === 'UNSURE' ? 'unsure-option' : ''}`}
                disabled={isLoading}
                onClick={() => onAnswer(question.id, opt.value, opt.value === 'UNSURE')}
              >
                <span className="bullet">{String.fromCharCode(65 + idx)}</span>
                <span className="label" style={{ flex: 1 }}>{sanitizeQuestionText(opt.label)}</span>
                <kbd>{String.fromCharCode(65 + idx)}</kbd>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

