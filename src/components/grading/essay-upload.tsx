'use client';

import React, { useCallback, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { FileUp, FileText, RefreshCw } from 'lucide-react';

interface EssayUploadProps {
  essayFile: string | null;
  essayFileName: string | null;
  onFileSelected: (dataUri: string, fileName: string) => void;
}

export default function EssayUpload({ essayFile, essayFileName, onFileSelected }: EssayUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleFile = useCallback(
    (file: File) => {
      if (file.type !== 'application/pdf') {
        alert('Please upload a PDF file.');
        return;
      }
      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result;
        if (typeof result === 'string') {
          onFileSelected(result, file.name);
        }
      };
      reader.readAsDataURL(file);
    },
    [onFileSelected],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
      if (fileInputRef.current) fileInputRef.current.value = '';
    },
    [handleFile],
  );

  if (essayFile) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center gap-4 rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] p-8"
      >
        <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-emerald-500/10">
          <FileText className="h-7 w-7 text-emerald-500" />
        </div>
        <div className="text-center">
          <p className="text-lg font-semibold" style={{ color: 'var(--foreground)' }}>
            Essay Uploaded
          </p>
          <p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>
            {essayFileName || 'essay.pdf'}
          </p>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={handleInputChange}
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          className="flex cursor-pointer items-center gap-2 rounded-lg border border-[var(--card-border)] px-4 py-2 text-sm font-medium transition-colors duration-200 hover:bg-[var(--card-bg)]"
          style={{ color: 'var(--muted)' }}
        >
          <RefreshCw className="h-4 w-4" />
          Change File
        </button>
      </motion.div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={handleInputChange}
      />
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-8 py-20 transition-colors duration-200 ${
          isDragging
            ? 'border-indigo-500 bg-indigo-500/10'
            : 'border-[var(--muted)]/30 hover:border-indigo-400 hover:bg-indigo-500/5'
        }`}
      >
        <FileUp className="mb-4 h-12 w-12" style={{ color: 'var(--muted)' }} />
        <p className="text-lg font-semibold" style={{ color: 'var(--foreground)' }}>
          Drop a PDF here or click to upload
        </p>
        <p className="mt-2 text-sm" style={{ color: 'var(--muted)' }}>
          Upload the student essay you want to grade
        </p>
      </div>
    </motion.div>
  );
}
