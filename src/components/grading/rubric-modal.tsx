'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import { FileUp, Type, Loader2 } from 'lucide-react';
import { extractTextFromPdf } from '@/lib/pdf-utils';
import Modal from '@/components/ui/modal';

const EXAMPLE_RUBRIC = `Criterion 1: System Design
- Excellent (5): Demonstrates a comprehensive and well-justified system design. All components are clearly defined, logically connected, and appropriate for the problem scope. Trade-offs are discussed thoughtfully.
- Good (4): Presents a solid system design with most components well-defined. Minor gaps in justification or connectivity between components.
- Satisfactory (3): Provides an adequate system design. Some components may be underdeveloped or lack clear justification. Connections between components are present but not fully articulated.
- Needs Improvement (2): System design is incomplete or poorly justified. Key components are missing or not logically connected.
- Insufficient (1): No meaningful system design is presented, or the design is fundamentally flawed.

Criterion 2: Tools
- Excellent (5): Selects and applies highly appropriate tools and technologies for the task. Justifies tool choices with clear reasoning and demonstrates deep understanding of their capabilities and limitations.
- Good (4): Uses appropriate tools with reasonable justification. Demonstrates good understanding of tool capabilities.
- Satisfactory (3): Tools are adequate but choices may not be fully justified. Some understanding of tool capabilities demonstrated.
- Needs Improvement (2): Tool selection is questionable or poorly justified. Limited understanding of tool capabilities shown.
- Insufficient (1): Tools are inappropriate for the task or no tools are discussed.

Criterion 3: Process Reflection
- Excellent (5): Provides deep and insightful reflection on the development process. Clearly identifies challenges, decisions, and lessons learned. Demonstrates critical thinking about what worked and what could be improved.
- Good (4): Offers meaningful reflection with identification of key challenges and decisions. Some critical analysis present.
- Satisfactory (3): Reflection is present but surface-level. Identifies some challenges but lacks depth in analysis.
- Needs Improvement (2): Minimal reflection provided. Few challenges or decisions are discussed.
- Insufficient (1): No meaningful reflection on the process is provided.

Criterion 4: Expectations & Conclusion
- Excellent (5): Sets clear expectations and provides a compelling conclusion. Effectively summarizes key findings, acknowledges limitations, and outlines future directions with specificity.
- Good (4): Expectations are clear and conclusion is well-structured. Most key points are summarized with some discussion of limitations and future work.
- Satisfactory (3): Expectations and conclusion are present but may lack clarity or completeness. Some summary of findings provided.
- Needs Improvement (2): Expectations are vague and conclusion is weak. Limited summary of findings.
- Insufficient (1): No clear expectations set and conclusion is missing or meaningless.`;

type InputMode = 'paste' | 'upload';

interface RubricModalProps {
  isOpen: boolean;
  onClose: () => void;
  rubricContent: string;
  onSave: (content: string) => void;
}

export default function RubricModal({ isOpen, onClose, rubricContent, onSave }: RubricModalProps) {
  const [content, setContent] = useState(rubricContent);
  const [mode, setMode] = useState<InputMode>('paste');
  const [isExtracting, setIsExtracting] = useState(false);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setContent(rubricContent);
  }, [rubricContent]);

  const handleSave = () => {
    onSave(content);
    onClose();
  };

  const handleFillExample = () => {
    setContent(EXAMPLE_RUBRIC);
  };

  const handlePdfUpload = useCallback(async (file: File) => {
    if (file.type !== 'application/pdf') {
      alert('Please upload a PDF file.');
      return;
    }
    setIsExtracting(true);
    setUploadedFileName(file.name);
    try {
      const text = await extractTextFromPdf(file);
      if (text) {
        setContent(text);
      } else {
        alert('Could not extract text from the PDF. Try pasting the rubric text instead.');
      }
    } catch {
      alert('Error reading PDF. Try pasting the rubric text instead.');
    } finally {
      setIsExtracting(false);
    }
  }, []);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handlePdfUpload(file);
      if (fileInputRef.current) fileInputRef.current.value = '';
    },
    [handlePdfUpload],
  );

  const tabs: { id: InputMode; label: string; icon: React.ReactNode }[] = [
    { id: 'paste', label: 'Paste Text', icon: <Type className="h-4 w-4" /> },
    { id: 'upload', label: 'Upload PDF', icon: <FileUp className="h-4 w-4" /> },
  ];

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Add Grading Rubric" size="3xl">
      <div className="space-y-4">
        {/* Tabs */}
        <div className="flex gap-1 rounded-lg p-1" style={{ background: 'var(--background)', border: '1px solid var(--card-border)' }}>
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setMode(tab.id)}
              className="relative flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors duration-200"
              style={{ color: mode === tab.id ? '#6366F1' : 'var(--muted)' }}
            >
              {mode === tab.id && (
                <motion.div
                  layoutId="rubric-tab"
                  className="absolute inset-0 rounded-md shadow-sm"
                  style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                />
              )}
              <span className="relative z-10 flex items-center gap-2">
                {tab.icon}
                {tab.label}
              </span>
            </button>
          ))}
        </div>

        {/* Paste mode */}
        {mode === 'paste' && (
          <div className="space-y-3">
            <label className="mb-1.5 block text-sm font-medium text-[#1E1B4B] dark:text-[#E2E8F0]">
              Rubric Content
            </label>
            <textarea
              rows={10}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Paste or type your rubric here..."
              className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm text-[#1E1B4B] placeholder-gray-400 transition-colors focus:border-[#6366F1] focus:outline-none focus:ring-2 focus:ring-[#6366F1]/20 dark:border-slate-600 dark:bg-slate-800 dark:text-[#E2E8F0] dark:placeholder-slate-500 dark:focus:border-[#818CF8]"
            />
            <button
              onClick={handleFillExample}
              className="cursor-pointer text-sm font-medium text-[#6366F1] transition-colors hover:text-[#818CF8] dark:text-[#818CF8] dark:hover:text-[#a5b4fc]"
            >
              Click here to see an example rubric
            </button>
          </div>
        )}

        {/* Upload mode */}
        {mode === 'upload' && (
          <div className="space-y-3">
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={handleFileChange}
            />

            {isExtracting ? (
              <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-indigo-300 bg-indigo-500/5 py-12">
                <Loader2 className="mb-3 h-8 w-8 animate-spin text-indigo-500" />
                <p className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>
                  Extracting text from {uploadedFileName}...
                </p>
              </div>
            ) : (
              <div
                onClick={() => fileInputRef.current?.click()}
                className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-[var(--muted)]/30 py-12 transition-colors duration-200 hover:border-indigo-400 hover:bg-indigo-500/5"
              >
                <FileUp className="mb-3 h-8 w-8" style={{ color: 'var(--muted)' }} />
                <p className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>
                  Click to upload a rubric PDF
                </p>
                <p className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>
                  Text will be extracted automatically
                </p>
              </div>
            )}

            {content && !isExtracting && (
              <div className="space-y-2">
                <label className="block text-sm font-medium text-[#1E1B4B] dark:text-[#E2E8F0]">
                  Extracted Text {uploadedFileName && <span className="font-normal text-[var(--muted)]">from {uploadedFileName}</span>}
                </label>
                <textarea
                  rows={8}
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm text-[#1E1B4B] placeholder-gray-400 transition-colors focus:border-[#6366F1] focus:outline-none focus:ring-2 focus:ring-[#6366F1]/20 dark:border-slate-600 dark:bg-slate-800 dark:text-[#E2E8F0] dark:placeholder-slate-500 dark:focus:border-[#818CF8]"
                />
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-gray-200 pt-4 dark:border-slate-700">
          <button
            onClick={onClose}
            className="cursor-pointer rounded-lg border border-gray-300 px-5 py-2.5 text-sm font-medium text-[#1E1B4B] transition-colors hover:bg-gray-50 dark:border-slate-600 dark:text-[#E2E8F0] dark:hover:bg-slate-800"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!content.trim()}
            className="cursor-pointer rounded-lg bg-[#6366F1] px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#5558E6] disabled:cursor-not-allowed disabled:opacity-50"
          >
            Save Rubric
          </button>
        </div>
      </div>
    </Modal>
  );
}
