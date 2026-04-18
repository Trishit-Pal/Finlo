import React, { useEffect, useMemo, useState } from "react";
import { useParams, useLocation, useNavigate } from "react-router-dom";
import { useForm, useFieldArray } from "react-hook-form";
import {
  AlertTriangle,
  Plus,
  Trash2,
  ArrowRight,
  ShieldAlert,
  Sparkles,
  Link2,
} from "lucide-react";
import { api } from "../services/api";
import type { ParsedReceipt, Receipt } from "../types";
import clsx from "clsx";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";

const ConfidenceBadge = ({ conf }: { conf?: number }) => {
  if (conf === undefined || conf > 0.8) return null;
  const isLow = conf < 0.6;
  return (
    <div
      className={clsx(
        "absolute right-3 top-3.5 flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider",
        isLow
          ? "bg-destructive text-destructive-foreground shadow-sm"
          : "bg-warning text-warning-foreground shadow-sm",
      )}
    >
      <AlertTriangle size={10} />
      {Math.round(conf * 100)}%
    </div>
  );
};

const EMPTY_RECEIPT: ParsedReceipt = {
  merchant: "",
  date: "",
  due_date: "",
  total: 0,
  tax: 0,
  currency: "INR",
  category_suggestion: "",
  recurring_indicator: false,
  account_suffix: "",
  parser_provider: "",
  items: [],
  field_confidence: {},
};

export const Review: React.FC = () => {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(!location.state?.parsed);
  const [error, setError] = useState("");
  const [ocrConfidence, setOcrConfidence] = useState<number>(
    location.state?.confidence || 0,
  );
  const [duplicateOfReceiptId, setDuplicateOfReceiptId] = useState<
    string | null
  >(location.state?.duplicate_of_receipt_id || null);
  const [duplicateConfidence, setDuplicateConfidence] = useState<number | null>(
    location.state?.duplicate_confidence || null,
  );

  const initialParsed: ParsedReceipt = useMemo(
    () => location.state?.parsed || EMPTY_RECEIPT,
    [location.state],
  );

  const { register, control, handleSubmit, reset } = useForm<ParsedReceipt>({
    defaultValues: initialParsed,
  });

  const { fields, append, remove } = useFieldArray({ control, name: "items" });

  useEffect(() => {
    const loadReceipt = async () => {
      if (location.state?.parsed || !id) return;
      setLoading(true);
      setError("");
      try {
        const { data } = await api.get<Receipt>(`/receipts/${id}`);
        const parsedFromReceipt: ParsedReceipt = {
          merchant: data.merchant || "",
          date: data.date || "",
          due_date: data.due_date || "",
          total: data.total || 0,
          tax: data.tax || 0,
          currency: data.currency || "INR",
          category_suggestion: data.category_suggestion || "",
          recurring_indicator: data.recurring_indicator || false,
          account_suffix: data.account_suffix || "",
          parser_provider: data.parser_provider || "",
          items: data.items || [],
          field_confidence: {},
        };
        reset(parsedFromReceipt);
        setOcrConfidence(data.ocr_confidence || 0);
        setDuplicateOfReceiptId(data.duplicate_of_receipt_id || null);
        setDuplicateConfidence(data.duplicate_confidence || null);
      } catch (err: any) {
        setError(
          err?.response?.data?.detail || "Unable to load receipt details.",
        );
      } finally {
        setLoading(false);
      }
    };

    loadReceipt();
  }, [id, location.state, reset]);

  const onSubmit = async (data: ParsedReceipt) => {
    if (!id) return;
    setSubmitting(true);
    setError("");
    try {
      await api.post("/confirm", { receipt_id: id, edits: data });
      navigate("/transactions");
    } catch (err: any) {
      setError(
        err.response?.data?.detail ||
          err.response?.data?.message ||
          "Failed to confirm receipt",
      );
      setSubmitting(false);
    }
  };

  const getConfClassName = (conf: number) => {
    if (conf >= 0.8) return "bg-success/10 text-success border-success/20";
    if (conf >= 0.6) return "bg-warning/10 text-warning border-warning/20";
    return "bg-destructive/10 text-destructive border-destructive/20";
  };

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto animate-fade-in space-y-6">
        <Skeleton className="h-10 w-48 rounded-md" />
        <Skeleton className="h-[500px] w-full rounded-2xl border border-border/40" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto animate-fade-in space-y-6 pb-12">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">
            Review Receipt
          </h1>
          <p className="text-sm mt-0.5 font-medium text-muted-foreground">
            Confirm or edit extracted fields before final saving.
          </p>
        </div>
        {ocrConfidence > 0 && (
          <div
            className={clsx(
              "flex items-center gap-2.5 px-4 py-2 rounded-xl text-[11px] font-bold uppercase tracking-wider border shadow-sm",
              getConfClassName(ocrConfidence),
            )}
          >
            <Sparkles size={14} />
            <span>
              Extraction confidence:{" "}
              <strong className="text-[13px] ml-0.5">
                {Math.round(ocrConfidence * 100)}%
              </strong>
            </span>
          </div>
        )}
      </div>

      {error && (
        <div className="flex items-start gap-3 p-4 rounded-xl text-sm font-semibold shadow-sm animate-slide-up bg-destructive/10 border border-destructive/20 text-destructive">
          <ShieldAlert size={18} className="flex-shrink-0" />
          {error}
        </div>
      )}

      {duplicateOfReceiptId && (
        <div className="flex items-start gap-4 p-5 rounded-2xl bg-warning/10 border border-warning/20 text-warning shadow-sm">
          <div className="w-10 h-10 rounded-full bg-background flex items-center justify-center border border-warning/30 flex-shrink-0">
            <Link2 size={18} className="text-warning" />
          </div>
          <div>
            <p className="font-bold text-foreground">
              Possible duplicate detected
            </p>
            <p className="text-sm text-foreground/80 font-medium mt-0.5 leading-relaxed">
              This resembles an existing receipt{" "}
              <strong>{duplicateOfReceiptId}</strong>.
            </p>
            {typeof duplicateConfidence === "number" && (
              <p className="text-[11px] uppercase tracking-wider font-bold mt-2 pt-2 border-t border-warning/20 w-fit">
                Similarity Match: {Math.round(duplicateConfidence * 100)}%
              </p>
            )}
          </div>
        </div>
      )}

      {ocrConfidence > 0 && ocrConfidence < 0.6 && (
        <div className="flex items-start gap-4 p-5 rounded-2xl bg-destructive/5 border border-destructive/20 text-destructive shadow-sm">
          <AlertTriangle size={20} className="flex-shrink-0 text-destructive" />
          <p className="text-sm font-medium leading-relaxed">
            Low confidence extraction. The document quality might be poor.
            Please review all fields carefully before confirming.
          </p>
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <Card className="glass-card border-border/40 shadow-sm">
          <CardContent className="p-6 sm:p-8">
            <h2 className="text-base font-bold text-foreground mb-6 tracking-tight uppercase">
              Base Receipt Details
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2 relative">
                <Label className="text-sm font-semibold">Merchant Name</Label>
                <Input
                  className="glass-panel h-11"
                  {...register("merchant")}
                  placeholder="Store or merchant"
                />
                <ConfidenceBadge
                  conf={initialParsed.field_confidence?.merchant}
                />
              </div>
              <div className="space-y-2 relative">
                <Label className="text-sm font-semibold">
                  Transaction Date
                </Label>
                <Input
                  className="glass-panel h-11"
                  type="date"
                  {...register("date")}
                />
                <ConfidenceBadge conf={initialParsed.field_confidence?.date} />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-semibold">
                  Due Date{" "}
                  <span className="opacity-60 text-xs font-normal">
                    (if bill)
                  </span>
                </Label>
                <Input
                  className="glass-panel h-11"
                  type="date"
                  {...register("due_date")}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-semibold">
                  Category Suggestion
                </Label>
                <Input
                  className="glass-panel h-11"
                  {...register("category_suggestion")}
                  placeholder="e.g. Utilities"
                />
              </div>
              <div className="space-y-2 relative">
                <Label className="text-sm font-semibold">Total Amount</Label>
                <div className="relative">
                  <span className="absolute left-3.5 top-[11px] text-muted-foreground font-bold font-mono">
                    ₹
                  </span>
                  <Input
                    className="glass-panel h-11 pl-8 font-mono text-lg tracking-wider"
                    type="number"
                    step="0.01"
                    {...register("total", { valueAsNumber: true })}
                    placeholder="0.00"
                  />
                </div>
                <ConfidenceBadge conf={initialParsed.field_confidence?.total} />
              </div>
              <div className="space-y-2 relative">
                <Label className="text-sm font-semibold">Tax Amount</Label>
                <div className="relative">
                  <span className="absolute left-3.5 top-[11px] text-muted-foreground font-bold font-mono">
                    ₹
                  </span>
                  <Input
                    className="glass-panel h-11 pl-8 font-mono text-lg tracking-wider"
                    type="number"
                    step="0.01"
                    {...register("tax", { valueAsNumber: true })}
                    placeholder="0.00"
                  />
                </div>
                <ConfidenceBadge conf={initialParsed.field_confidence?.tax} />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-semibold">Currency</Label>
                <select
                  {...register("currency")}
                  className="flex h-11 w-full items-center justify-between rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-sm shadow-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:cursor-not-allowed disabled:opacity-50 font-bold tracking-wider"
                >
                  {["INR", "USD", "EUR", "GBP", "CAD", "AUD", "JPY", "SGD"].map(
                    (currencyCode) => (
                      <option
                        key={currencyCode}
                        value={currencyCode}
                        className="bg-background text-foreground"
                      >
                        {currencyCode}
                      </option>
                    ),
                  )}
                </select>
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-semibold">
                  Account / Card Suffix
                </Label>
                <Input
                  className="glass-panel h-11 font-mono tracking-widest text-base placeholder:tracking-normal placeholder:font-sans"
                  {...register("account_suffix")}
                  maxLength={4}
                  placeholder="Last 4"
                />
              </div>
            </div>
            <div className="mt-8 p-4 rounded-xl bg-primary/5 border border-primary/20 flex items-center gap-3 text-sm text-foreground font-bold cursor-pointer transition-colors hover:bg-primary/10">
              <input
                type="checkbox"
                id="recurring-check"
                {...register("recurring_indicator")}
                className="w-5 h-5 rounded border-primary/40 text-primary shadow-sm focus:ring-primary bg-background"
              />
              <label
                htmlFor="recurring-check"
                className="cursor-pointer select-none"
              >
                Mark as recurring monthly bill
              </label>
            </div>
          </CardContent>
        </Card>

        <Card className="glass-card border-border/40 shadow-sm">
          <CardContent className="p-6 sm:p-8">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
              <h2 className="text-base font-bold text-foreground uppercase tracking-tight">
                Extracted Line Items
              </h2>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  append({ name: "", price: 0, quantity: 1, category: "" })
                }
                className="gap-2 font-bold shadow-sm"
              >
                <Plus size={14} /> Add Item Row
              </Button>
            </div>

            <div className="space-y-4">
              {fields.length === 0 && (
                <div className="text-center py-12 rounded-2xl text-sm border border-dashed border-border/60 bg-muted/10 text-muted-foreground">
                  No line items could be extracted automatically.
                  <br />
                  Add items manually if needed for detailed tracking.
                </div>
              )}
              {fields.map((field, index) => (
                <div
                  key={field.id}
                  className="flex flex-col sm:flex-row items-start sm:items-center gap-4 p-5 rounded-2xl animate-fade-in bg-card border border-border/40 shadow-sm hover:border-primary/20 transition-all group"
                >
                  <div className="flex-1 space-y-4 w-full">
                    <Input
                      className="glass-panel h-11 font-medium"
                      {...register(`items.${index}.name`)}
                      placeholder="Item internal identifier"
                    />
                    <div className="grid grid-cols-3 gap-4">
                      <div className="relative">
                        <span className="absolute left-3 top-3 text-xs text-muted-foreground font-bold uppercase">
                          Price
                        </span>
                        <Input
                          className="glass-panel h-11 pl-12 font-mono tracking-wider"
                          type="number"
                          step="0.01"
                          {...register(`items.${index}.price`, {
                            valueAsNumber: true,
                          })}
                        />
                      </div>
                      <div className="relative">
                        <span className="absolute left-3 top-3 text-xs text-muted-foreground font-bold uppercase">
                          Qty
                        </span>
                        <Input
                          className="glass-panel h-11 pl-10 font-mono tracking-wider text-center"
                          type="number"
                          step="0.01"
                          {...register(`items.${index}.quantity`, {
                            valueAsNumber: true,
                          })}
                        />
                      </div>
                      <Input
                        className="glass-panel h-11 font-medium"
                        {...register(`items.${index}.category`)}
                        placeholder="Cat."
                      />
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => remove(index)}
                    className="h-10 w-10 text-muted-foreground hover:text-destructive hover:bg-destructive/10 self-end sm:self-auto border border-transparent shadow-[0_0_0_0_rgba(0,0,0,0)]"
                  >
                    <Trash2 size={16} />
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end pt-4 pb-8">
          <Button
            type="submit"
            id="review-confirm-btn"
            disabled={submitting}
            className="w-full sm:w-auto min-w-[220px] h-12 gap-2 text-base font-bold shadow-lg"
            size="lg"
          >
            {submitting ? (
              <>
                <svg
                  className="animate-spin w-5 h-5"
                  viewBox="0 0 24 24"
                  fill="none"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  />
                </svg>
                Saving securely...
              </>
            ) : (
              <>
                Confirm Extracted Metadata
                <ArrowRight size={18} />
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
};
