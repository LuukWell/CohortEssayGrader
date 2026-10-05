'use client';

import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, FileUp, X, FileText } from 'lucide-react';
import Modal from '@/components/ui/modal';
import { ContextItem } from '@/types';
import { extractTextFromPdf } from '@/lib/pdf-utils';

const MAX_CONTENT_LENGTH = 20000;

interface ContextDialogProps {
  isOpen: boolean;
  onClose: () => void;
  contextList: ContextItem[];
  setContextList: (list: ContextItem[]) => void;
}

export default function ContextDialog({
  isOpen,
  onClose,
  contextList,
  setContextList,
}: ContextDialogProps) {
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [pdfLoading, setPdfLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetForm = () => {
    setTitle('');
    setContent('');
    setShowForm(false);
  };

  const handleAdd = () => {
    if (!title.trim() || !content.trim()) return;
    const newItem: ContextItem = {
      id: crypto.randomUUID(),
      title: title.trim(),
      content: content.trim().slice(0, MAX_CONTENT_LENGTH),
    };
    setContextList([...contextList, newItem]);
    resetForm();
  };

  const handleRemove = (id: string) => {
    setContextList(contextList.filter((item) => item.id !== id));
  };

  const handlePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setPdfLoading(true);
    try {
      const text = await extractTextFromPdf(file);
      const newItem: ContextItem = {
        id: crypto.randomUUID(),
        title: file.name.replace(/\.pdf$/i, ''),
        content: text.slice(0, MAX_CONTENT_LENGTH),
      };
      setContextList([...contextList, newItem]);
    } catch {
      // PDF extraction failed silently
    } finally {
      setPdfLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Manage Context Items" size="3xl">
      <div className="space-y-4">
        {/* Existing context items */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <AnimatePresence mode="popLayout">
            {contextList.map((item) => (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="relative rounded-lg border border-gray-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800"
              >
                <button
                  onClick={() => handleRemove(item.id!)}
                  className="absolute right-2 top-2 cursor-pointer rounded-md p-1 text-gray-400 transition-colors hover:bg-red-50 hover:text-[#EF4444] dark:hover:bg-red-900/20"
                >
                  <X className="h-4 w-4" />
                </button>
                <div className="flex items-start gap-2 pr-6">
                  <FileText className="mt-0.5 h-4 w-4 shrink-0 text-[#6366F1]" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-[#1E1B4B] dark:text-[#E2E8F0]">
                      {item.title}
                    </p>
                    <p className="mt-1 line-clamp-2 text-xs text-gray-500 dark:text-slate-400">
                      {item.content}
                    </p>
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          {/* Add new context card */}
          <button
            onClick={() => setShowForm(true)}
            className="cursor-pointer flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-gray-300 p-6 text-gray-400 transition-colors hover:border-[#6366F1] hover:text-[#6366F1] dark:border-slate-600 dark:hover:border-[#818CF8] dark:hover:text-[#818CF8]"
          >
            <Plus className="h-6 w-6" />
            <span className="text-sm font-medium">Add Context</span>
          </button>

          {/* Upload PDF card */}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={pdfLoading}
            className="cursor-pointer flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-gray-300 p-6 text-gray-400 transition-colors hover:border-[#6366F1] hover:text-[#6366F1] disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600 dark:hover:border-[#818CF8] dark:hover:text-[#818CF8]"
          >
            <FileUp className="h-6 w-6" />
            <span className="text-sm font-medium">
              {pdfLoading ? 'Extracting...' : 'Upload PDF'}
            </span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf"
            onChange={handlePdfUpload}
            className="hidden"
          />
        </div>

        {/* Add form */}
        <AnimatePresence>
          {showForm && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-slate-700 dark:bg-slate-800/50">
                <div>
                  <label className="mb-1 block text-sm font-medium text-[#1E1B4B] dark:text-[#E2E8F0]">
                    Title
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Context item title"
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-[#1E1B4B] placeholder-gray-400 focus:border-[#6366F1] focus:outline-none focus:ring-2 focus:ring-[#6366F1]/20 dark:border-slate-600 dark:bg-slate-800 dark:text-[#E2E8F0]"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-[#1E1B4B] dark:text-[#E2E8F0]">
                    Content
                  </label>
                  <textarea
                    rows={5}
                    value={content}
                    onChange={(e) => setContent(e.target.value.slice(0, MAX_CONTENT_LENGTH))}
                    placeholder="Paste context content here..."
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-[#1E1B4B] placeholder-gray-400 focus:border-[#6366F1] focus:outline-none focus:ring-2 focus:ring-[#6366F1]/20 dark:border-slate-600 dark:bg-slate-800 dark:text-[#E2E8F0]"
                  />
                  <p className="mt-1 text-right text-xs text-gray-400 dark:text-slate-500">
                    {content.length.toLocaleString()} / {MAX_CONTENT_LENGTH.toLocaleString()}
                  </p>
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    onClick={resetForm}
                    className="cursor-pointer rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-[#1E1B4B] transition-colors hover:bg-gray-100 dark:border-slate-600 dark:text-[#E2E8F0] dark:hover:bg-slate-700"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleAdd}
                    disabled={!title.trim() || !content.trim()}
                    className="cursor-pointer rounded-lg bg-[#6366F1] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#5558E6] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Add
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </Modal>
  );
}
