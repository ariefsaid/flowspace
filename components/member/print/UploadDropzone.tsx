"use client";

import { Upload } from "lucide-react";
import { useRef, useState, useCallback } from "react";
import { cn } from "@/lib/cn";

interface UploadDropzoneProps {
  onFileSelect?: (file: File) => void;
}

export function UploadDropzone({ onFileSelect }: UploadDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const handleFile = useCallback(
    (file: File) => {
      setSelectedFile(file);
      onFileSelect?.(file);
    },
    [onFileSelect],
  );

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => setIsDragging(false);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  return (
    <div>
      <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-gray-800">
        <Upload className="h-4 w-4 text-gray-700" />
        Upload File
      </div>
      <p className="mb-3 text-xs text-gray-500">
        Format yang didukung: PDF, Word, Excel, PowerPoint, JPG, PNG, TIFF
      </p>

      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-12 transition-colors",
          isDragging
            ? "border-teal-400 bg-teal-50"
            : "border-slate-300 bg-white hover:border-teal-400 hover:bg-slate-50",
        )}
      >
        <Upload
          className={cn(
            "h-9 w-9 transition-colors",
            isDragging ? "text-teal-500" : "text-gray-400",
          )}
          strokeWidth={1.5}
        />
        {selectedFile ? (
          <p className="text-sm font-medium text-teal-600">{selectedFile.name}</p>
        ) : (
          <>
            <p className="text-sm text-gray-600">Drag &amp; drop file di sini</p>
            <p className="text-xs text-gray-400">atau klik untuk memilih file</p>
          </>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png,.tiff,.tif"
        className="hidden"
        onChange={handleChange}
      />
    </div>
  );
}
