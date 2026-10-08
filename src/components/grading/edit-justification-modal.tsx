'use client';

import React, { useState, useEffect } from 'react';
import { AlertTriangle, Sparkles, Plus, Trash2, X } from 'lucide-react';

const MAX_BULLET_LENGTH = 350;

interface JustificationEditorProps {
  initialValue: string;
  isBullets: boolean;
  initialBullets?: string[];
  warningText?: string;
  onSave: (value: string, bullets?: string[]) => void;
  onCancel: () => void;
}

/**
 * Inline editor for an AI justification. Rendered in the left column so the
 * essay stays visible while the teacher edits.
 */
export function JustificationEditor({
  initialValue,
  isBullets,
  initialBullets = [],
  warningText = 'Editing will update AI score',
  onSave,
  onCancel,
}: JustificationEditorProps) {
  const [flowText, setFlowText] = useState(initialValue);
  const [bullets, setBullets] = useState<string[]>(initialBullets.length > 0 ? initialBullets : ['']);

  useEffect(() => {
    setFlowText(initialValue);
    setBullets(initialBullets.length > 0 ? initialBullets : ['']);
  }, [initialValue, initialBullets]);

  const handleBulletChange = (index: number, value: string) => {
    const updated = [...bullets];
    updated[index] = value.slice(0, MAX_BULLET_LENGTH);
    setBullets(updated);
  };

  const addBullet = () => setBullets([...bullets, '']);

  const removeBullet = (index: number) => {
    if (bullets.length <= 1) return;
    setBullets(bullets.filter((_, i) => i !== index));
  };

  const handleSave = () => {
    if (isBullets) {
      const filtered = bullets.filter((b) => b.trim());
      onSave('', filtered);
    } else {
      onSave(flowText);
    }
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-base font-semibold text-[#1E1B4B] dark:text-[#E2E8F0]">Edit Justification</h3>
        <button
          onClick={onCancel}
          className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-slate-700 dark:hover:text-gray-300"
          aria-label="Cancel editing"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="space-y-4">
        <div className="flex items-center gap-3 rounded-lg border border-[#F59E0B]/30 bg-amber-50 px-4 py-3 dark:border-[#F59E0B]/20 dark:bg-amber-900/10">
          <AlertTriangle className="h-5 w-5 shrink-0 text-[#F59E0B]" />
          <p className="text-sm font-medium text-amber-800 dark:text-amber-200">{warningText}</p>
        </div>

        {isBullets ? (
          <div className="space-y-3">
            {bullets.map((bullet, index) => (
              <div key={index} className="space-y-1">
                <div className="flex items-start gap-2">
                  <textarea
                    rows={2}
                    value={bullet}
                    onChange={(e) => handleBulletChange(index, e.target.value)}
                    placeholder={`Bullet point ${index + 1}...`}
                    className="flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-[#1E1B4B] placeholder-gray-400 focus:border-[#6366F1] focus:outline-none focus:ring-2 focus:ring-[#6366F1]/20 dark:border-slate-600 dark:bg-slate-800 dark:text-[#E2E8F0]"
                  />
                  <button
                    onClick={() => removeBullet(index)}
                    disabled={bullets.length <= 1}
                    className="mt-1 cursor-pointer rounded-md p-1.5 text-gray-400 transition-colors hover:bg-red-50 hover:text-[#EF4444] disabled:cursor-not-allowed disabled:opacity-30 dark:hover:bg-red-900/20"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <p className="text-right text-xs text-gray-400 dark:text-slate-500">
                  {bullet.length} / {MAX_BULLET_LENGTH}
                </p>
              </div>
            ))}
            <button
              onClick={addBullet}
              className="cursor-pointer flex items-center gap-1.5 rounded-lg border border-dashed border-gray-300 px-3 py-2 text-sm font-medium text-gray-500 transition-colors hover:border-[#6366F1] hover:text-[#6366F1] dark:border-slate-600 dark:text-slate-400 dark:hover:border-[#818CF8] dark:hover:text-[#818CF8]"
            >
              <Plus className="h-4 w-4" />
              Add bullet point
            </button>
          </div>
        ) : (
          <textarea
            rows={8}
            value={flowText}
            onChange={(e) => setFlowText(e.target.value)}
            placeholder="Enter justification text..."
            className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm text-[#1E1B4B] placeholder-gray-400 focus:border-[#6366F1] focus:outline-none focus:ring-2 focus:ring-[#6366F1]/20 dark:border-slate-600 dark:bg-slate-800 dark:text-[#E2E8F0]"
          />
        )}

        <div className="flex items-center justify-end gap-3 border-t border-gray-200 pt-4 dark:border-slate-700">
          <button
            onClick={onCancel}
            className="cursor-pointer rounded-lg border border-gray-300 px-5 py-2.5 text-sm font-medium text-[#1E1B4B] transition-colors hover:bg-gray-50 dark:border-slate-600 dark:text-[#E2E8F0] dark:hover:bg-slate-800"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="cursor-pointer flex items-center gap-2 rounded-lg bg-[#6366F1] px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#5558E6]"
          >
            <Sparkles className="h-4 w-4" />
            Save &amp; Recalculate AI Score
          </button>
        </div>
      </div>
    </div>
  );
}
