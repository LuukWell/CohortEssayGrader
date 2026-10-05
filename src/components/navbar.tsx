'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  GraduationCap,
  FileText,
  BarChart3,
  LayoutDashboard,
  Sun,
  Moon,
  Download,
  LogOut,
  Loader2,
} from 'lucide-react';
import type { ViewType, StudySession } from '@/types';

interface NavbarProps {
  currentView: ViewType;
  onNavigate: (view: ViewType) => void;
  session: StudySession | null;
  onExportCSV: () => void;
  onEndSession?: () => void;
  isAiGrading?: boolean;
}

export default function Navbar({
  currentView,
  onNavigate,
  session,
  onExportCSV,
  onEndSession,
  isAiGrading,
}: NavbarProps) {
  const [isDark, setIsDark] = useState(true);

  const navLinks: { view: ViewType; label: string; icon: React.ElementType }[] = [
    ...(session?.condition === 'dashboard'
      ? [{ view: 'cohort' as ViewType, label: 'Cohort', icon: LayoutDashboard }]
      : []),
    { view: 'grading', label: 'Grading', icon: FileText },
    { view: 'analytics', label: 'Analytics', icon: BarChart3 },
  ];

  useEffect(() => {
    const stored = localStorage.getItem('theme');
    const dark = stored !== 'light';
    setIsDark(dark);
    document.documentElement.classList.toggle('dark', dark);
  }, []);

  const toggleTheme = () => {
    const next = !isDark;
    setIsDark(next);
    document.documentElement.classList.toggle('dark', next);
    localStorage.setItem('theme', next ? 'dark' : 'light');
  };

  const conditionLabel = session?.condition === 'dashboard' ? 'DC' : 'BC';
  const conditionColor = session?.condition === 'dashboard'
    ? 'bg-violet-500/10 text-violet-500'
    : 'bg-emerald-500/10 text-emerald-600';

  return (
    <nav className="sticky top-4 z-40 mx-4 rounded-2xl border border-[var(--navbar-border)] bg-[var(--navbar-bg)] px-4 py-2.5 backdrop-blur-xl">
      <div className="flex items-center justify-between">
        {/* Left: Brand */}
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-500">
            <GraduationCap className="h-5 w-5 text-white" />
          </div>
          <span className="hidden text-lg font-bold sm:block">Essay Grader</span>
        </div>

        {/* Center: Nav links + AI grading indicator */}
        <div className="flex items-center gap-2">
        {isAiGrading && (
          <div className="flex items-center gap-1.5 rounded-lg bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-500">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            AI grading…
          </div>
        )}
        <div className="flex items-center gap-1 rounded-xl bg-[var(--card-bg)] p-1">
          {navLinks.map(({ view, label, icon: Icon }) => {
            const isActive = currentView === view;
            return (
              <button
                key={view}
                onClick={() => onNavigate(view)}
                className={`relative flex h-11 cursor-pointer items-center gap-2 rounded-lg px-3 text-sm font-semibold transition-colors duration-200 sm:px-4 ${
                  isActive ? 'text-white' : 'text-[var(--muted)] hover:text-[var(--foreground)]'
                }`}
                aria-current={isActive ? 'page' : undefined}
              >
                {isActive && (
                  <motion.div
                    layoutId="nav-pill"
                    className="absolute inset-0 rounded-lg bg-indigo-500"
                    transition={{ type: 'spring', duration: 0.4, bounce: 0.15 }}
                  />
                )}
                <span className="relative z-10 flex items-center gap-2">
                  <Icon className="h-4 w-4" />
                  <span className="hidden sm:inline">{label}</span>
                </span>
              </button>
            );
          })}
        </div>
        </div>

        {/* Right: Session info + actions */}
        <div className="flex items-center gap-2">
          {session && (
            <div className="hidden items-center gap-2 md:flex">
              {/* Participant ID */}
              <div className="rounded-lg bg-[var(--card-bg)] px-3 py-1.5 text-sm font-medium" style={{ color: 'var(--foreground)' }}>
                {session.participantId}
              </div>
              {/* Condition badge */}
              <span className={`rounded-md px-2 py-1 text-xs font-bold ${conditionColor}`}>
                {conditionLabel}
              </span>
              {/* Set badge */}
              <span className="rounded-md bg-indigo-500/10 px-2 py-1 text-xs font-bold text-indigo-500">
                Set {session.essaySet}
              </span>
            </div>
          )}

          {/* Theme toggle */}
          <button
            onClick={toggleTheme}
            className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-lg text-[var(--muted)] transition-colors duration-200 hover:bg-[var(--card-bg)] hover:text-[var(--foreground)]"
            aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {isDark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </button>

          {/* Export CSV */}
          <button
            onClick={onExportCSV}
            className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-lg text-[var(--muted)] transition-colors duration-200 hover:bg-[var(--card-bg)] hover:text-[var(--foreground)]"
            aria-label="Export CSV"
          >
            <Download className="h-5 w-5" />
          </button>

          {/* End session */}
          {onEndSession && (
            <button
              onClick={onEndSession}
              className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-lg text-[var(--muted)] transition-colors duration-200 hover:bg-red-500/10 hover:text-red-500"
              aria-label="End session"
              title="End session"
            >
              <LogOut className="h-5 w-5" />
            </button>
          )}
        </div>
      </div>
    </nav>
  );
}
