import React, { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { UploadCloud, FileText, Download, CheckCircle2, AlertTriangle, Trash2 } from 'lucide-react';
import { uploadCartPdf, importPdfPreview } from '../api/pdfUpload';
import { CartItemPayload, MalformedPdfRow, PdfUploadPreview, ValidatedPdfRow } from '../types';
import { useDiscountWorkspace } from '../hooks/useDiscountWorkspace';
import { extractApiError, formatINR } from '../utils/formatters';
import { buildSampleCartPdfBlob } from '../utils/samplePdfGenerator';
import { ErrorBanner } from '../components/ErrorBanner';

const MAX_SIZE_BYTES = 5 * 1024 * 1024;

export function PdfUploadPage() {
  const navigate = useNavigate();
  const { activeCart, refreshAll, pushToast } = useDiscountWorkspace();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [preview, setPreview] = useState<PdfUploadPreview | null>(null);

  const [validRows, setValidRows] = useState<ValidatedPdfRow[]>([]);
  const [malformedRows, setMalformedRows] = useState<MalformedPdfRow[]>([]);
  const [importing, setImporting] = useState(false);

  async function processFile(file: File) {
    setUploadError(null);
    setPreview(null);

    if (file.type && file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      setUploadError('Invalid file format. Please upload a .pdf document.');
      return;
    }
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setUploadError('Invalid file extension. Only .pdf files are supported.');
      return;
    }
    if (file.size === 0) {
      setUploadError('Uploaded PDF file is empty.');
      return;
    }
    if (file.size > MAX_SIZE_BYTES) {
      setUploadError('File exceeds the 5 MB maximum upload limit.');
      return;
    }

    setUploading(true);
    setUploadProgress(10);

    try {
      const res = await uploadCartPdf(file, (pct) => setUploadProgress(pct));
      setPreview(res);
      setValidRows(res.valid_rows);
      setMalformedRows(res.malformed_rows);
      pushToast({
        type: res.valid_rows.length > 0 ? 'success' : 'info',
        title: 'PDF extracted',
        message: `${res.valid_rows.length} valid rows, ${res.malformed_rows.length} rows needing review.`,
      });
    } catch (err) {
      setUploadError(extractApiError(err, 'Failed to extract cart table from PDF.'));
    } finally {
      setUploading(false);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void processFile(file);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) void processFile(file);
    e.target.value = '';
  }

  function handleDownloadSamplePdf() {
    const blob = buildSampleCartPdfBlob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'opptra_sample_cart.pdf';
    a.click();
    URL.revokeObjectURL(url);
  }

  function updateMalformedField(
    rowNum: number,
    field: keyof MalformedPdfRow['partial'],
    value: string
  ) {
    setMalformedRows((prev) =>
      prev.map((row) =>
        row.row_number === rowNum
          ? { ...row, partial: { ...row.partial, [field]: value } }
          : row
      )
    );
  }

  function promoteMalformedRow(row: MalformedPdfRow) {
    const price = Number(row.partial.base_price.replace(/[^0-9.]/g, ''));
    const errs: string[] = [];
    if (!row.partial.product_name.trim()) errs.push('Product name is required.');
    if (!row.partial.brand.trim()) errs.push('Brand is required.');
    if (!row.partial.platform.trim()) errs.push('Platform is required.');
    if (!Number.isFinite(price) || price <= 0) errs.push('Base price must be positive.');

    if (errs.length > 0) {
      setMalformedRows((prev) =>
        prev.map((r) => (r.row_number === row.row_number ? { ...r, errors: errs } : r))
      );
      return;
    }

    setValidRows((prev) => [
      ...prev,
      {
        row_number: row.row_number,
        product_name: row.partial.product_name.trim(),
        brand: row.partial.brand.trim(),
        platform: row.partial.platform.trim(),
        base_price: Math.round(price),
      },
    ]);
    setMalformedRows((prev) => prev.filter((r) => r.row_number !== row.row_number));
  }

  function removeValidRow(rowNum: number) {
    setValidRows((prev) => prev.filter((r) => r.row_number !== rowNum));
  }

  async function handleConfirmImport() {
    if (validRows.length === 0) return;
    setImporting(true);
    try {
      const items: CartItemPayload[] = validRows.map((r) => ({
        product_name: r.product_name,
        brand: r.brand,
        platform: r.platform,
        base_price: r.base_price,
      }));
      const res = await importPdfPreview({
        cart_id: activeCart?.id,
        items,
      });
      await refreshAll();
      pushToast({
        type: 'success',
        title: `Imported ${items.length} products`,
        message: `Cart replaced and recalculated. Final total: ${formatINR(res.cart.final_total)}`,
      });
      navigate('/results');
    } catch (err) {
      pushToast({ type: 'error', title: 'Import failed', message: extractApiError(err) });
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-display text-lg font-semibold text-slate-900">PDF Cart Upload &amp; Preview</h2>
          <p className="mt-1 text-xs text-slate-500">
            Upload a cart PDF with columns: Product | Brand | Platform | Base Price. Preview and fix rows before replacing the active cart.
          </p>
        </div>

        <button
          type="button"
          onClick={handleDownloadSamplePdf}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
        >
          <Download className="h-3.5 w-3.5" />
          <span>Download Sample PDF</span>
        </button>
      </div>

      {/* Dropzone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click();
        }}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors ${
          dragging
            ? 'border-blue-600 bg-blue-50/50'
            : 'border-slate-300 bg-white hover:border-slate-400'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,application/pdf"
          onChange={handleFileChange}
          className="hidden"
        />
        <UploadCloud className="h-8 w-8 text-slate-400" />
        <div className="mt-3 text-sm font-medium text-slate-900">
          {uploading ? 'Extracting cart table...' : 'Drag and drop a cart PDF here, or click to browse'}
        </div>
        <div className="mt-1 text-xs text-slate-500">
          Accepts .pdf up to 5 MB · Validated by MIME type and %PDF- signature
        </div>

        {uploading && (
          <div className="mt-4 w-full max-w-xs">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full bg-blue-600 transition-all"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
            <div className="mt-1 font-mono text-[11px] text-slate-500">{uploadProgress}% uploaded</div>
          </div>
        )}
      </div>

      {uploadError && <ErrorBanner errors={[uploadError]} title="PDF upload error" />}

      {preview && (
        <div className="space-y-6">
          {/* Status Summary */}
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white px-5 py-4">
            <div className="flex items-center gap-3">
              <FileText className="h-5 w-5 text-slate-500" />
              <div>
                <div className="text-sm font-semibold text-slate-900">{preview.filename}</div>
                <div className="text-xs text-slate-500">
                  {preview.total_pages} {preview.total_pages === 1 ? 'page' : 'pages'} · {validRows.length} valid rows · {malformedRows.length} malformed rows
                </div>
              </div>
            </div>

            <button
              type="button"
              disabled={validRows.length === 0 || importing}
              onClick={() => void handleConfirmImport()}
              className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              <CheckCircle2 className="h-4 w-4" />
              <span>{importing ? 'Importing...' : `Confirm & Replace Cart (${validRows.length})`}</span>
            </button>
          </div>

          {preview.warnings.length > 0 && (
            <ErrorBanner errors={preview.warnings} title="Extraction notices" />
          )}

          {/* Malformed Rows Editor */}
          {malformedRows.length > 0 && (
            <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50/40 p-5">
              <div className="flex items-center gap-2 text-sm font-semibold text-amber-950">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                <span>Rows Requiring Correction ({malformedRows.length})</span>
              </div>
              <p className="text-xs text-amber-900">
                Fix any missing or invalid fields below and click Add to Preview, or leave them excluded.
              </p>

              <div className="space-y-3">
                {malformedRows.map((row) => (
                  <div key={row.row_number} className="rounded-lg border border-amber-200 bg-white p-4 space-y-3">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-mono font-semibold text-slate-700">Row #{row.row_number}</span>
                      <span className="text-red-600">{row.errors.join(' ')}</span>
                    </div>
                    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-4">
                      <input
                        type="text"
                        value={row.partial.product_name}
                        onChange={(e) => updateMalformedField(row.row_number, 'product_name', e.target.value)}
                        placeholder="Product"
                        className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs"
                      />
                      <input
                        type="text"
                        value={row.partial.brand}
                        onChange={(e) => updateMalformedField(row.row_number, 'brand', e.target.value)}
                        placeholder="Brand"
                        className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs"
                      />
                      <input
                        type="text"
                        value={row.partial.platform}
                        onChange={(e) => updateMalformedField(row.row_number, 'platform', e.target.value)}
                        placeholder="Platform"
                        className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs"
                      />
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={row.partial.base_price}
                          onChange={(e) => updateMalformedField(row.row_number, 'base_price', e.target.value)}
                          placeholder="Price"
                          className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 font-mono text-xs"
                        />
                        <button
                          type="button"
                          onClick={() => promoteMalformedRow(row)}
                          className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 whitespace-nowrap shrink-0"
                        >
                          Fix
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Valid Rows Preview Table */}
          {validRows.length > 0 && (
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
              <div className="border-b border-slate-200 bg-slate-50 px-4 py-3 text-xs font-semibold text-slate-700">
                Validated Cart Preview ({validRows.length} items ready to import)
              </div>
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs font-medium text-slate-500">
                    <th className="px-4 py-2.5">Row</th>
                    <th className="px-4 py-2.5">Product</th>
                    <th className="px-4 py-2.5">Brand</th>
                    <th className="px-4 py-2.5">Platform</th>
                    <th className="px-4 py-2.5 text-right">Base Price</th>
                    <th className="px-4 py-2.5 text-right">Remove</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {validRows.map((row) => (
                    <tr key={row.row_number} className="hover:bg-slate-50/70">
                      <td className="px-4 py-2.5 font-mono text-xs text-slate-400">{row.row_number}</td>
                      <td className="px-4 py-2.5 font-medium text-slate-900">{row.product_name}</td>
                      <td className="px-4 py-2.5 text-xs text-slate-600">{row.brand}</td>
                      <td className="px-4 py-2.5 text-xs text-slate-600">{row.platform}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-xs tabular-nums text-slate-900">
                        {formatINR(row.base_price)}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <button
                          type="button"
                          onClick={() => removeValidRow(row.row_number)}
                          aria-label={`Remove row ${row.row_number}`}
                          className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
