import React, { useState } from 'react';
import { TriageSession, IncidentCategory } from '../types/triage';
import { ApiClient } from '../services/apiClient';
import { UniversalInput } from './UniversalInput';
import { IssueSelection } from './IssueSelection';
import { QuestionStep } from './QuestionStep';
import { ResultScreen } from './ResultScreen';
import { AdaptiveStepPanel } from './AdaptiveStepPanel';

interface TriageFlowProps {
  userId: string;
  deviceId?: string;
  initialQuery?: string;
  onQueryConsumed?: () => void;
}

export const TriageFlow: React.FC<TriageFlowProps> = ({
  userId,
  deviceId,
  initialQuery,
  onQueryConsumed
}) => {
  const [session, setSession] = useState<TriageSession | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  React.useEffect(() => {
    if (initialQuery) {
      handleStart(initialQuery);
      if (onQueryConsumed) onQueryConsumed();
    }
  }, [initialQuery]);

  const handleStart = async (query: string) => {
    try {
      setLoading(true);
      setError(null);
      const newSession = await ApiClient.startTriage(userId, query, deviceId);
      setSession(newSession);
    } catch (err: any) {
      setError(err.message || 'Error starting triage session');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectCategory = async (category: IncidentCategory) => {
    try {
      setLoading(true);
      setError(null);
      const query = `Issue related to ${category}`;
      const newSession = await ApiClient.startTriage(userId, query, deviceId);
      setSession(newSession);
    } catch (err: any) {
      setError(err.message || 'Error starting category triage');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectCandidate = async (issueTypeId: string) => {
    if (!session) return;
    try {
      setLoading(true);
      setError(null);
      const updated = await ApiClient.selectCandidate(session.sessionId, issueTypeId);
      setSession(updated);
    } catch (err: any) {
      setError(err.message || 'Error selecting candidate issue');
    } finally {
      setLoading(false);
    }
  };

  const handleAnswer = async (questionId: string, answerValue: string, isUnsure = false) => {
    if (!session) return;
    try {
      setLoading(true);
      setError(null);
      const updated = await ApiClient.answerQuestion(session.sessionId, questionId, answerValue, isUnsure);
      setSession(updated);
    } catch (err: any) {
      setError(err.message || 'Error recording triage answer');
    } finally {
      setLoading(false);
    }
  };

  const handleGoBack = async () => {
    if (!session) return;
    try {
      setLoading(true);
      setError(null);
      const updated = await ApiClient.goBack(session.sessionId);
      setSession(updated);
    } catch (err: any) {
      setError(err.message || 'Error navigating back');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setSession(null);
    setError(null);
  };

  const handleEscalate = () => {
    alert(`Incident session ${session?.sessionId || ''} escalated to Tier 2 IT Support Lead.`);
  };

  return (
    <div className="triage-flow-container">
      {error && (
        <div className="error-banner">
          ⚠️ <strong>System Notice:</strong> {error}
        </div>
      )}

      {!session && (
        <UniversalInput 
          onSubmitQuery={handleStart} 
          onSelectCategory={handleSelectCategory}
          isLoading={loading} 
        />
      )}

      {session && session.currentStep === 'AMBIGUITY_SELECTION' && (
        <IssueSelection
          candidates={session.candidateIssues}
          initialQuery={session.originalInput}
          onSelectCandidate={handleSelectCandidate}
          recoveryPayload={session.recoveryPayload}
          isLoading={loading}
        />
      )}

      {session && session.currentStep === 'PROGRESSIVE_QUESTION' && session.currentQuestion && (
        <QuestionStep
          question={session.currentQuestion}
          issueTypeName={session.selectedIssue?.display_name || session.selectedIssue?.id}
          askedCount={session.questionHistory.length}
          confidence={session.confidence}
          onAnswer={handleAnswer}
          onGoBack={handleGoBack}
          canGoBack={session.questionHistory.length > 0}
          isLoading={loading}
        />
      )}

      {session && session.currentStep === 'TRIAGE_COMPLETE' && session.finalTriageResult && (
        <ResultScreen 
          result={session.finalTriageResult} 
          onReset={handleReset} 
          onEscalate={handleEscalate}
        />
      )}

      {session && session.currentStep === 'PROGRESSIVE_QUESTION' && session.adaptiveStep && (
        <AdaptiveStepPanel adaptiveStep={session.adaptiveStep} />
      )}
    </div>
  );
};

