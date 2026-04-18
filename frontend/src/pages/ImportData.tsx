import React, { useRef, useState } from "react";
import { api } from "@/services/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Upload,
  FileSpreadsheet,
  ClipboardPaste,
  Download,
  CheckCircle2,
  AlertCircle,
  Loader2,
  FileText,
} from "lucide-react";

export const ImportData: React.FC = () => {
  const [tab, setTab] = useState("csv");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{
    batch_id: string;
    imported: number;
    skipped: number;
    duplicates: number;
    errors: string[];
  } | null>(null);
  const [pastedText, setPastedText] = useState("");
  const [preview, setPreview] = useState<{
    headers: string[];
    rows: string[][];
  } | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedFile(file);
    setError("");
    setResult(null);

    // Parse preview
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const lines = text.trim().split("\n");
      if (lines.length < 2) {
        setPreview(null);
        return;
      }
      const headers = lines[0]
        .split(",")
        .map((h) => h.trim().replace(/^"|"$/g, ""));
      const rows = lines.slice(1, 21).map((line) => {
        // Simple CSV parse (handles quoted values)
        const cells: string[] = [];
        let current = "";
        let inQuote = false;
        for (const ch of line) {
          if (ch === '"') {
            inQuote = !inQuote;
            continue;
          }
          if (ch === "," && !inQuote) {
            cells.push(current.trim());
            current = "";
            continue;
          }
          current += ch;
        }
        cells.push(current.trim());
        return cells;
      });
      setPreview({ headers, rows });
    };
    reader.readAsText(file);
  };

  const handleUpload = async () => {
    if (!selectedFile) return;
    setUploading(true);
    setError("");
    setResult(null);

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);

      const { data } = await api.post("/transactions/import", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setResult(data);
      setPreview(null);
      setSelectedFile(null);
      if (fileRef.current) fileRef.current.value = "";
    } catch (err: any) {
      setError(
        err.response?.data?.detail ||
          err.userMessage ||
          "Import failed. Check your CSV format.",
      );
    }
    setUploading(false);
  };

  const handlePasteImport = async () => {
    if (!pastedText.trim()) return;
    setUploading(true);
    setError("");
    setResult(null);

    try {
      // Convert pasted text to CSV blob and upload
      const blob = new Blob([pastedText], { type: "text/csv" });
      const formData = new FormData();
      formData.append("file", blob, "pasted_import.csv");

      const { data } = await api.post("/transactions/import", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setResult(data);
      setPastedText("");
    } catch (err: any) {
      setError(
        err.response?.data?.detail ||
          err.userMessage ||
          "Import failed. Check your pasted data format.",
      );
    }
    setUploading(false);
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-fade-in pb-10">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Import Data</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Import transactions from CSV files or pasted text from bank statements
        </p>
      </div>

      {/* Success/Error Banners */}
      {result && (
        <Card className="border-emerald-500/30 bg-emerald-500/8">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-400 mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-semibold text-sm text-foreground">
                  Import Complete
                </p>
                <div className="flex flex-wrap gap-4 mt-1.5 text-xs text-muted-foreground">
                  <span>
                    <strong className="text-emerald-400">
                      {result.imported}
                    </strong>{" "}
                    imported
                  </span>
                  {result.duplicates > 0 && (
                    <span>
                      <strong className="text-amber-400">
                        {result.duplicates}
                      </strong>{" "}
                      duplicates skipped
                    </span>
                  )}
                  {result.skipped > 0 && (
                    <span>
                      <strong className="text-red-400">{result.skipped}</strong>{" "}
                      errors
                    </span>
                  )}
                </div>
                {result.errors.length > 0 && (
                  <div className="mt-3 space-y-1 max-h-32 overflow-y-auto">
                    {result.errors.map((e, i) => (
                      <p
                        key={i}
                        className="text-[11px] text-muted-foreground font-mono"
                      >
                        {e}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {error && (
        <Card className="border-destructive/30 bg-destructive/8">
          <CardContent className="p-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-destructive mt-0.5 flex-shrink-0" />
            <p className="text-sm text-foreground">{error}</p>
          </CardContent>
        </Card>
      )}

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="csv" className="gap-1.5">
            <FileSpreadsheet size={14} /> CSV Upload
          </TabsTrigger>
          <TabsTrigger value="paste" className="gap-1.5">
            <ClipboardPaste size={14} /> Paste Text
          </TabsTrigger>
        </TabsList>

        {/* CSV Upload Tab */}
        <TabsContent value="csv" className="mt-4 space-y-4">
          <Card className="glass-card border-border/40 border-dashed">
            <CardContent className="p-8">
              <div className="flex flex-col items-center text-center gap-4">
                <div className="p-4 rounded-2xl bg-primary/10">
                  <Upload className="w-8 h-8 text-primary" />
                </div>
                <div>
                  <p className="font-medium text-foreground">
                    Drop your CSV file here
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    or click to browse. Max 5 MB.
                  </p>
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv,text/csv"
                  onChange={handleFileSelect}
                  className="hidden"
                  id="csv-upload"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fileRef.current?.click()}
                >
                  <FileText size={14} className="mr-1.5" /> Choose File
                </Button>
                {selectedFile && (
                  <p className="text-xs text-muted-foreground">
                    Selected: <strong>{selectedFile.name}</strong> (
                    {(selectedFile.size / 1024).toFixed(1)} KB)
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* CSV Preview */}
          {preview && (
            <Card className="glass-card border-border/40">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold text-foreground">
                  Preview (first {preview.rows.length} rows)
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border/40">
                        {preview.headers.map((h, i) => (
                          <th
                            key={i}
                            className="px-3 py-2 text-left text-muted-foreground font-medium whitespace-nowrap"
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {preview.rows.map((row, ri) => (
                        <tr
                          key={ri}
                          className="border-b border-border/20 last:border-0"
                        >
                          {row.map((cell, ci) => (
                            <td
                              key={ci}
                              className="px-3 py-1.5 text-foreground whitespace-nowrap max-w-[200px] truncate"
                            >
                              {cell}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {selectedFile && (
            <Button
              onClick={handleUpload}
              disabled={uploading}
              className="w-full gap-1.5"
            >
              {uploading ? (
                <>
                  <Loader2 size={14} className="animate-spin" /> Importing...
                </>
              ) : (
                <>
                  <Upload size={14} /> Import CSV
                </>
              )}
            </Button>
          )}

          {/* Accepted Formats */}
          <Card className="glass-card border-border/40">
            <CardContent className="p-4">
              <p className="text-xs font-semibold text-foreground mb-2">
                Accepted Column Names
              </p>
              <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-[11px] text-muted-foreground">
                <p>
                  <strong className="text-foreground">Date:</strong> date, Date,
                  Transaction Date, txn_date
                </p>
                <p>
                  <strong className="text-foreground">Description:</strong>{" "}
                  merchant, Description, Narration
                </p>
                <p>
                  <strong className="text-foreground">Amount:</strong> amount,
                  Amount
                </p>
                <p>
                  <strong className="text-foreground">Debit/Credit:</strong>{" "}
                  debit, Withdrawal / credit, Deposit
                </p>
                <p>
                  <strong className="text-foreground">Category:</strong>{" "}
                  category, Category
                </p>
                <p>
                  <strong className="text-foreground">Type:</strong> type, Type
                  (income/expense/transfer)
                </p>
              </div>
              <p className="text-[11px] text-muted-foreground mt-3">
                Date formats supported: YYYY-MM-DD, DD/MM/YYYY, MM/DD/YYYY,
                DD-MM-YYYY, DD Mon YYYY. Duplicates are auto-detected and
                skipped.
              </p>
            </CardContent>
          </Card>

          {/* Sample CSVs */}
          <div className="flex gap-3">
            <a
              href="/samples/sample_bank_statement.csv"
              download
              className="flex-1"
            >
              <Button
                variant="outline"
                size="sm"
                className="w-full gap-1.5 text-xs"
              >
                <Download size={12} /> Bank Statement Sample
              </Button>
            </a>
            <a
              href="/samples/sample_credit_card.csv"
              download
              className="flex-1"
            >
              <Button
                variant="outline"
                size="sm"
                className="w-full gap-1.5 text-xs"
              >
                <Download size={12} /> Credit Card Sample
              </Button>
            </a>
          </div>
        </TabsContent>

        {/* Paste Text Tab */}
        <TabsContent value="paste" className="mt-4 space-y-4">
          <Card className="glass-card border-border/40">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground mb-3">
                Paste CSV-formatted text (with headers) from your bank
                statement, email alert, or spreadsheet.
              </p>
              <textarea
                value={pastedText}
                onChange={(e) => setPastedText(e.target.value)}
                placeholder="date,merchant,amount,category&#10;2025-01-15,Grocery Store,2500,Groceries&#10;2025-01-16,Uber,350,Transportation"
                className="w-full h-48 rounded-lg border border-border/40 bg-background px-3 py-2 text-xs font-mono text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
              />
            </CardContent>
          </Card>
          <Button
            onClick={handlePasteImport}
            disabled={!pastedText.trim() || uploading}
            className="w-full gap-1.5"
          >
            {uploading ? (
              <>
                <Loader2 size={14} className="animate-spin" /> Importing...
              </>
            ) : (
              <>
                <ClipboardPaste size={14} /> Import Pasted Data
              </>
            )}
          </Button>
        </TabsContent>
      </Tabs>
    </div>
  );
};
