'use client';

import { useState, FormEvent } from 'react';
import { motion } from 'framer-motion';
import { GraduationCap } from 'lucide-react';

interface TeacherGateProps {
  onSubmit: (name: string) => void;
}

export default function TeacherGate({ onSubmit }: TeacherGateProps) {
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Please enter your name to continue.');
      return;
    }
    setError('');
    onSubmit(trimmed);
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center overflow-hidden">
      {/* Gradient background */}
      <div className="absolute inset-0 bg-gradient-to-br from-indigo-600 via-violet-600 to-purple-700" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(129,140,248,0.3),transparent_50%),radial-gradient(ellipse_at_bottom_right,rgba(167,139,250,0.3),transparent_50%)]" />

      {/* Floating orbs */}
      <div className="absolute left-1/4 top-1/4 h-64 w-64 rounded-full bg-indigo-400/20 blur-3xl" />
      <div className="absolute bottom-1/4 right-1/4 h-80 w-80 rounded-full bg-violet-400/20 blur-3xl" />

      {/* Card */}
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
        className="relative z-10 mx-4 w-full max-w-md"
      >
        <div className="rounded-2xl border border-white/20 bg-white/80 p-8 shadow-2xl backdrop-blur-xl dark:border-white/10 dark:bg-slate-900/80">
          {/* Icon */}
          <div className="mb-6 flex justify-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-500 shadow-lg shadow-indigo-500/30">
              <GraduationCap className="h-8 w-8 text-white" />
            </div>
          </div>

          {/* Title */}
          <h1 className="mb-1 text-center text-2xl font-bold text-slate-900 dark:text-white">
            Essay Grader
          </h1>
          <p className="mb-8 text-center text-sm font-medium text-slate-500 dark:text-slate-400">
            Welcome
          </p>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="teacher-name" className="mb-1.5 block text-sm font-semibold text-slate-700 dark:text-slate-300">
                Your Name
              </label>
              <input
                id="teacher-name"
                type="text"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (error) setError('');
                }}
                placeholder="Enter your name (e.g., Dr. Smith)"
                className="h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-900 placeholder-slate-400 transition-colors duration-200 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-600 dark:bg-slate-800 dark:text-white dark:placeholder-slate-500 dark:focus:border-indigo-400"
                autoFocus
                autoComplete="name"
              />
              {error && (
                <motion.p
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-1.5 text-xs font-medium text-red-500"
                >
                  {error}
                </motion.p>
              )}
            </div>

            <button
              type="submit"
              className="flex h-12 w-full cursor-pointer items-center justify-center rounded-xl bg-gradient-to-r from-indigo-500 to-violet-500 text-sm font-bold text-white shadow-lg shadow-indigo-500/30 transition-all duration-200 hover:from-indigo-600 hover:to-violet-600 hover:shadow-xl hover:shadow-indigo-500/40 active:scale-[0.98]"
            >
              Start Session
            </button>
          </form>
        </div>
      </motion.div>
    </div>
  );
}
