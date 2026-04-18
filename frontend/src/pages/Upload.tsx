import React, { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import {
  UploadCloud,
  FileImage,
  FileText,
  Loader2,
  ShieldCheck,
  Info,
} from "lucide-react";
import { api } from "@/services/api";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import clsx from "clsx";

export const Upload: React.FC = () => {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [clientOcr, setClientOcr] = useState(false);
  const [dragFile, setDragFile] = useState<File | null>(null);
  const navigate = useNavigate();

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      const file = acceptedFiles[0];
      if (!file) return;

      setUploading(true);
      setError("");
      setDragFile(file);

      try {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("client_side_ocr", clientOcr.toString());

        const { data } = await api.post("/upload", formData, {
          headers: { "Content-Type": "multipart/form-data" },
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
        setError(
          err.response?.data?.detail ||
            "Failed to upload receipt. Please try again.",
        );
        setUploading(false);
      }
    },
    [clientOcr, navigate],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "image/*": [".jpeg", ".jpg", ".png", ".webp"],
      "application/pdf": [".pdf"],
    },
    maxSize: 10 * 1024 * 1024,
    multiple: false,
    disabled: uploading,
  });

  return (
    <div className="max-w-xl mx-auto space-y-6 animate-fade-in pb-10">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Upload Receipt</h1>
        <p className="text-sm mt-1 mb-2 text-muted-foreground">
          Upload an image or PDF. Our AI will extract and categorize all details
          automatically.
        </p>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="flex items-start gap-3 p-4 rounded-xl text-sm animate-slide-up bg-destructive/10 border border-destructive/20 text-destructive">
          <Info size={16} className="flex-shrink-0 mt-0.5" />
          <p className="font-medium">{error}</p>
        </div>
      )}

      {/* Dropzone */}
      <Card className="glass-card border-border/40 overflow-hidden shadow-sm transition-all duration-300">
        <CardContent className="p-0">
          <div
            {...getRootProps()}
            id="receipt-upload-zone"
            className={clsx(
              "relative cursor-pointer transition-all duration-300 outline-none flex flex-col items-center justify-center min-h-[320px] p-8 text-center",
              isDragActive
                ? "border-2 border-dashed border-primary bg-primary/5"
                : "border-2 border-dashed border-border bg-transparent",
              uploading
                ? "bg-muted/30 opacity-80 pointer-events-none"
                : "hover:bg-muted/10",
            )}
          >
            <input {...getInputProps()} />

            {uploading ? (
              <div className="flex flex-col items-center gap-5 text-center animate-fade-in">
                {/* Spinning rings */}
                <div className="relative w-16 h-16">
                  <div className="absolute inset-0 rounded-full animate-spin border-2 border-transparent border-t-primary border-r-primary/50" />
                  <div className="absolute inset-2 rounded-full animate-spin-slow border-2 border-transparent border-t-primary/30 animation-reverse" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Loader2 size={24} className="animate-spin text-primary" />
                  </div>
                </div>
                <div>
                  <p className="font-bold text-foreground text-lg tracking-tight">
                    Processing receipt...
                  </p>
                  <p className="text-sm mt-1.5 font-medium text-muted-foreground flex items-center justify-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />{" "}
                    Running AI extraction
                  </p>
                </div>
                {dragFile && (
                  <div className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold bg-primary/10 border border-primary/20 text-primary mt-2 shadow-sm">
                    <FileImage size={14} />
                    <span className="truncate max-w-[200px]">
                      {dragFile.name}
                    </span>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center gap-5">
                <div
                  className={clsx(
                    "w-16 h-16 rounded-2xl flex items-center justify-center transition-all duration-300 border shadow-sm",
                    isDragActive
                      ? "bg-primary/20 border-primary/40 shadow-[0_0_20px_hsl(var(--primary)/0.2)] text-primary"
                      : "bg-muted/40 border-border/60 text-muted-foreground",
                  )}
                >
                  <UploadCloud size={28} />
                </div>
                <div>
                  <p className="font-bold text-lg text-foreground tracking-tight">
                    {isDragActive
                      ? "Drop it here..."
                      : "Drag & drop your receipt"}
                  </p>
                  <p className="text-sm mt-1.5 text-muted-foreground">
                    or{" "}
                    <span className="text-primary font-semibold hover:underline">
                      click to browse
                    </span>{" "}
                    · JPEG, PNG, PDF (up to 10MB)
                  </p>
                </div>

                {/* Formats */}
                <div className="flex items-center gap-3 pt-2">
                  {[
                    { icon: FileImage, label: "Images" },
                    { icon: FileText, label: "Documents" },
                  ].map(({ icon: Icon, label }) => (
                    <div
                      key={label}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-muted-foreground bg-background border border-border/40 shadow-sm"
                    >
                      <Icon size={14} className="text-foreground/70" />
                      {label}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {!uploading && (
        <div className="flex justify-center -mt-2 animate-fade-in relative z-10 w-full sm:hidden">
          <Button
            onClick={() =>
              document.getElementById("receipt-upload-zone")?.click()
            }
            className="rounded-full shadow-lg gap-2 px-6 h-12 text-base"
          >
            <UploadCloud size={18} /> Browse Files
          </Button>
        </div>
      )}

      {/* Settings & Info */}
      <div className="grid gap-4 sm:grid-cols-2 pt-2">
        {/* OCR Toggle */}
        <Card className="glass-card border-border/40 hover:border-border/80 transition-colors shadow-sm">
          <CardContent className="p-5 flex items-center justify-between h-full">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 bg-success/10 border border-success/20">
                <ShieldCheck size={18} className="text-success" />
              </div>
              <div>
                <p className="text-sm font-bold text-foreground">
                  Client-side OCR
                </p>
                <p className="text-[11px] mt-0.5 text-muted-foreground font-medium uppercase tracking-wider">
                  Process image locally
                </p>
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer ml-4 flex-shrink-0">
              <input
                type="checkbox"
                className="sr-only peer"
                checked={clientOcr}
                onChange={(e) => setClientOcr(e.target.checked)}
                disabled={uploading}
              />
              <div
                className={clsx(
                  "w-10 h-5 rounded-full transition-all duration-200 relative border border-transparent peer-focus:ring-2 peer-focus:ring-primary/40",
                  clientOcr
                    ? "bg-primary shadow-[0_0_12px_hsl(var(--primary)/0.4)]"
                    : "bg-muted/80",
                )}
              >
                <div
                  className="absolute top-[1.5px] left-[2px] w-4 h-4 rounded-full bg-white transition-transform duration-200 shadow-sm"
                  style={{
                    transform: clientOcr ? "translateX(20px)" : "translateX(0)",
                  }}
                />
              </div>
            </label>
          </CardContent>
        </Card>

        {/* Info Card */}
        <Card className="glass-card border-primary/20 bg-primary/5 shadow-sm">
          <CardContent className="p-5 space-y-3 h-full">
            <p className="font-bold text-xs text-primary uppercase tracking-wider">
              How it works
            </p>
            <div className="space-y-2.5">
              {[
                "Securely uploaded (AES-256)",
                "AI extracts & parses data",
                "Review details before saving",
              ].map((step, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2.5 text-xs font-medium text-foreground/80"
                >
                  <span className="w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 bg-primary border border-primary text-primary-foreground shadow-sm">
                    {i + 1}
                  </span>
                  {step}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
