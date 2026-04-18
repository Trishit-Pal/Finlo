import React, { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { UploadCloud, FileImage, FileText, Loader2, ShieldCheck, Info } from 'lucide-react';
import { api } from '../services/api';
import { useNavigate } from 'react-router-dom';

export const Upload: React.FC = () => {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [clientOcr, setClientOcr] = useState(false);
  const [dragFile, setDragFile] = useState<File | null>(null);
  const navigate = useNavigate();

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file) return;

    setUploading(true);
    setError('');
    setDragFile(file);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('client_side_ocr', clientOcr.toString());

      const { data } = await api.post('/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      navigate(`/review/${data.receipt_id}`, {
        state: {
          parsed: data.parsed,
          confidence: data.ocr_confidence,
          duplicate_detected: data.duplicate_detected,
          duplicate_of_receipt_id: data.duplicate_of_receipt_id,
          duplicate_confidence: data.duplicate_confidence,
        },
      });
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to upload receipt. Please try again.');
      setUploading(false);
    }
  }, [clientOcr, navigate]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.jpeg', '.jpg', '.png', '.webp'],
      'application/pdf': ['.pdf'],
    },
    maxSize: 10 * 1024 * 1024,
    multiple: false,
    disabled: uploading,
  });

  return (
    <div className="max-w-2xl mx-auto space-y-8 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Upload Receipt</h1>
        <p className="text-sm mt-1 text-muted">
          Upload an image or PDF. Our AI will extract and categorize all details automatically.
        </p>
      </div>

      {/* Error Banner */}
      {error && (
        <div
          className="flex items-start gap-3 p-4 rounded-xl text-sm animate-slide-up"
          style={{
            background: 'rgba(244,63,94,0.08)',
            border: '1px solid rgba(244,63,94,0.2)',
            color: '#fb7185',
          }}
        >
          <Info size={16} className="flex-shrink-0 mt-0.5" />
          <p>{error}</p>
        </div>
      )}

      {/* Dropzone */}
      <div
        {...getRootProps()}
        id="receipt-upload-zone"
        className="relative rounded-2xl cursor-pointer transition-all duration-300 outline-none"
        style={{
          padding: '56px 40px',
          border: `2px dashed ${isDragActive ? '#6366f1' : 'rgba(255,255,255,0.1)'}`,
          background: isDragActive
            ? 'rgba(99,102,241,0.06)'
            : uploading
              ? 'rgba(255,255,255,0.02)'
              : 'rgba(13,13,18,0.6)',
          boxShadow: isDragActive ? '0 0 40px rgba(99,102,241,0.15)' : 'none',
          opacity: uploading ? 0.75 : 1,
          pointerEvents: uploading ? 'none' : 'all',
        }}
      >
        <input {...getInputProps()} />

        {uploading ? (
          <div className="flex flex-col items-center gap-4 text-center animate-fade-in">
            {/* Spinning rings */}
            <div className="relative w-16 h-16">
              <div
                className="absolute inset-0 rounded-full animate-spin"
                style={{
                  border: '2px solid transparent',
                  borderTopColor: '#6366f1',
                  borderRightColor: '#8b5cf6',
                }}
              />
              <div
                className="absolute inset-2 rounded-full animate-spin-slow"
                style={{
                  border: '2px solid transparent',
                  borderTopColor: 'rgba(99,102,241,0.4)',
                  animationDirection: 'reverse',
                }}
              />
              <div className="absolute inset-0 flex items-center justify-center">
                <Loader2 size={20} className="animate-spin" style={{ color: '#818cf8' }} />
              </div>
            </div>
            <div>
              <p className="font-semibold text-foreground text-base">Processing receipt...</p>
              <p className="text-xs mt-1.5 text-muted">
                Running OCR & AI extraction · This takes a few seconds
              </p>
            </div>
            {dragFile && (
              <div
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs"
                style={{ background: 'rgba(99,102,241,0.1)', color: '#818cf8' }}
              >
                <FileImage size={14} />
                {dragFile.name}
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-5 text-center">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center transition-all duration-300"
              style={{
                background: isDragActive
                  ? 'rgba(99,102,241,0.2)'
                  : 'rgba(255,255,255,0.04)',
                border: `1px solid ${isDragActive ? 'rgba(99,102,241,0.4)' : 'rgba(255,255,255,0.08)'}`,
                boxShadow: isDragActive ? '0 0 20px rgba(99,102,241,0.25)' : 'none',
              }}
            >
              <UploadCloud
                size={28}
                style={{ color: isDragActive ? '#818cf8' : '#888899' }}
              />
            </div>
            <div>
              <p className="font-semibold text-base text-foreground">
                {isDragActive ? 'Drop it here' : 'Drag & drop your receipt'}
              </p>
              <p className="text-xs mt-1.5 text-muted">
                or{' '}
                <span style={{ color: '#818cf8', fontWeight: 500 }}>click to browse files</span>
                {' '} · JPEG, PNG, PDF up to 10MB
              </p>
            </div>

            {/* Formats */}
            <div className="flex items-center gap-3">
              {[
                { icon: FileImage, label: 'JPEG / PNG' },
                { icon: FileImage, label: 'WEBP' },
                { icon: FileText, label: 'PDF' },
              ].map(({ icon: Icon, label }) => (
                <div
                  key={label}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-muted"
                  style={{
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.06)',
                  }}
                >
                  <Icon size={12} />
                  {label}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* OCR Toggle */}
      <div
        className="flex items-center justify-between p-4 rounded-2xl"
        style={{
          background: 'rgba(19,19,26,0.9)',
          border: '1px solid rgba(255,255,255,0.07)',
        }}
      >
        <div className="flex items-start gap-3">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
            style={{ background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.2)' }}
          >
            <ShieldCheck size={15} style={{ color: '#34d399' }} />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">Client-side OCR</p>
            <p className="text-xs mt-0.5 text-muted">
              Process the image directly in your browser — nothing is sent to servers
            </p>
          </div>
        </div>
        <label className="relative inline-flex items-center cursor-pointer ml-4 flex-shrink-0">
          <input
            type="checkbox"
            id="client-ocr-toggle"
            className="sr-only peer"
            checked={clientOcr}
            onChange={e => setClientOcr(e.target.checked)}
            disabled={uploading}
          />
          <div
            className="w-10 h-5 rounded-full transition-all duration-200 relative"
            style={{
              background: clientOcr ? '#6366f1' : 'rgba(255,255,255,0.1)',
              boxShadow: clientOcr ? '0 0 12px rgba(99,102,241,0.4)' : 'none',
            }}
          >
            <div
              className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform duration-200 shadow"
              style={{ transform: clientOcr ? 'translateX(20px)' : 'translateX(0)' }}
            />
          </div>
        </label>
      </div>

      {/* Info Card */}
      <div
        className="p-4 rounded-xl text-xs space-y-2"
        style={{
          background: 'rgba(99,102,241,0.05)',
          border: '1px solid rgba(99,102,241,0.12)',
        }}
      >
        <p className="font-medium" style={{ color: '#818cf8' }}>How it works</p>
        {['Receipt is uploaded and stored securely with AES encryption', 'OCR extracts text — then our AI parses merchant, date, items & amounts', 'You review and confirm the extracted data before it\'s saved'].map((step, i) => (
          <div key={i} className="flex items-start gap-2 text-muted">
            <span
              className="w-4 h-4 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0 mt-0.5"
              style={{ background: 'rgba(99,102,241,0.2)', color: '#818cf8' }}
            >
              {i + 1}
            </span>
            {step}
          </div>
        ))}
      </div>
    </div>
  );
};
