'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { CsvRecorder } from '@/lib/csv-recorder';

const TEACHER_NAME_KEY = 'essay_grader_teacher_name';

export function useTeacherSession() {
  const [teacherName, setTeacherNameState] = useState<string>('');
  const [isSessionActive, setIsSessionActive] = useState<boolean>(false);
  const recorderRef = useRef<CsvRecorder | null>(null);

  // Load teacher name from localStorage on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = localStorage.getItem(TEACHER_NAME_KEY);
    if (stored) {
      setTeacherNameState(stored);
      recorderRef.current = new CsvRecorder(stored);
      setIsSessionActive(true);
    }
  }, []);

  const setTeacherName = useCallback((name: string) => {
    setTeacherNameState(name);
    if (typeof window !== 'undefined') {
      localStorage.setItem(TEACHER_NAME_KEY, name);
    }
    if (name) {
      recorderRef.current = new CsvRecorder(name);
      setIsSessionActive(true);
    } else {
      recorderRef.current = null;
      setIsSessionActive(false);
    }
  }, []);

  const endSession = useCallback(() => {
    if (recorderRef.current && recorderRef.current.getRecordCount() > 0) {
      recorderRef.current.downloadCSV();
    }
    recorderRef.current = null;
    setIsSessionActive(false);
    setTeacherNameState('');
    if (typeof window !== 'undefined') {
      localStorage.removeItem(TEACHER_NAME_KEY);
    }
  }, []);

  return {
    teacherName,
    setTeacherName,
    recorder: recorderRef.current,
    isSessionActive,
    endSession,
  };
}
