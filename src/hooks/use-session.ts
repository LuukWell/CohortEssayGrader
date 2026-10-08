'use client';

import { useState, useEffect, useRef } from 'react';
import { CsvRecorder } from '@/lib/csv-recorder';
import { ActionLogger } from '@/lib/action-logger';
import type { StudySession } from '@/types';

const SESSION_KEY = 'essay_grader_study_session';
const INSTANCE_KEY = 'essay_grader_server_instance_id';

export function useSession() {
  const [session, setSessionState] = useState<StudySession | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const recorderRef = useRef<CsvRecorder | null>(null);
  const loggerRef = useRef<ActionLogger | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') {
      setIsLoading(false);
      return;
    }
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) {
      setIsLoading(false);
      return;
    }
    let parsed: StudySession | null = null;
    try {
      parsed = JSON.parse(raw) as StudySession;
    } catch {
      localStorage.removeItem(SESSION_KEY);
      localStorage.removeItem(INSTANCE_KEY);
      setIsLoading(false);
      return;
    }
    if (!parsed?.sessionId) {
      localStorage.removeItem(SESSION_KEY);
      localStorage.removeItem(INSTANCE_KEY);
      setIsLoading(false);
      return;
    }
    // Compare the server's process instance ID to the one captured when this
    // session was created. If the dev server has been restarted since, drop the
    // session so the user lands on the setup screen.
    const storedInstance = localStorage.getItem(INSTANCE_KEY);
    fetch('/api/instance')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data?.instanceId || data.instanceId !== storedInstance) {
          localStorage.removeItem(SESSION_KEY);
          localStorage.removeItem(INSTANCE_KEY);
          return null;
        }
        // Same server instance: check the session still exists and isn't completed.
        return fetch(`/api/sessions/${parsed!.sessionId}`)
          .then((r) => (r.ok ? r.json() : null))
          .then((sessData) => {
            if (!sessData?.session || sessData.session.completed_at) {
              localStorage.removeItem(SESSION_KEY);
              localStorage.removeItem(INSTANCE_KEY);
              return;
            }
            setSessionState(parsed);
            recorderRef.current = new CsvRecorder(parsed!.participantId);
            loggerRef.current = new ActionLogger(parsed!.sessionId, parsed!.participantId, parsed!.condition, parsed!.essaySet);
          });
      })
      .catch(() => {
        localStorage.removeItem(SESSION_KEY);
        localStorage.removeItem(INSTANCE_KEY);
      })
      .finally(() => setIsLoading(false));
  }, []);

  const setSession = (s: StudySession) => {
    setSessionState(s);
    if (typeof window !== 'undefined') {
      localStorage.setItem(SESSION_KEY, JSON.stringify(s));
      // Capture the current server instance ID so a restart invalidates this session.
      fetch('/api/instance')
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (data?.instanceId) localStorage.setItem(INSTANCE_KEY, data.instanceId);
        })
        .catch(() => { /* best-effort */ });
    }
    recorderRef.current = new CsvRecorder(s.participantId);
    loggerRef.current = new ActionLogger(s.sessionId, s.participantId, s.condition, s.essaySet);
  };

  const clearSession = () => {
    setSessionState(null);
    if (typeof window !== 'undefined') {
      localStorage.removeItem(SESSION_KEY);
      localStorage.removeItem(INSTANCE_KEY);
    }
    recorderRef.current = null;
    loggerRef.current = null;
  };

  return {
    session,
    setSession,
    clearSession,
    recorder: recorderRef.current,
    actionLogger: loggerRef.current,
    isLoading,
  };
}
