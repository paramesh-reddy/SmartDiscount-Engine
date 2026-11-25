import React, { useState } from 'react';
import { Send, CheckCircle2, AlertTriangle, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { parseNaturalLanguageRule } from '../api/aiRules';
import { createDiscountRule } from '../api/discountRules';
import { ParsedAiRule } from '../types';
import { useDiscountWorkspace } from '../hooks/useDiscountWorkspace';
import { extractApiError, formatINR, formatRuleValue } from '../utils/formatters';
import { Dialog } from '../components/ui/Dialog';
import { ErrorBanner } from '../components/ErrorBanner';

const EXAMPLE_PROMPTS = [
  '20% off for Natura Casa brand, stackable with other offers.',
  'Rs.100 flat discount on all Flipkart items.',
  '10% off if cart value is more than Rs.5,000.',
  'Give a discount for big orders.',
];

export function AiBuilderPage() {
  const { refreshAll, pushToast } = useDiscountWorkspace();

  const [inputText, setInputText] = useState('');
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [parsedResult, setParsedResult] = useState<ParsedAiRule | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  async function handleParse(e: React.FormEvent) {
    e.preventDefault();
    if (!inputText.trim()) return;

    setParsing(true);
    setParseError(null);
    setParsedResult(null);

    try {
      const result = await parseNaturalLanguageRule(inputText.trim());
      setParsedResult(result);
      if (result.is_valid) {
        setConfirmOpen(true);
      }
    } catch (err) {
      setParseError(extractApiError(err, 'Unable to parse discount rule.'));
    } finally {
      setParsing(false);
    }
  }

  async function handleConfirmSave() {
    if (!parsedResult || !parsedResult.is_valid || !parsedResult.scope || !parsedResult.discount_type || parsedResult.value === null) {
      return;
    }

    setSaving(true);
    try {
      const created = await createDiscountRule({
        scope: parsedResult.scope,
        applies_to: parsedResult.scope === 'cart' ? null : parsedResult.applies_to,
        discount_type: parsedResult.discount_type,
        value: parsedResult.value,
        stackable: parsedResult.stackable,
        min_cart_value: parsedResult.scope === 'cart' ? parsedResult.min_cart_value : null,
        is_active: true,
      });

      setConfirmOpen(false);
      setInputText('');
      setParsedResult(null);
      await refreshAll();
      pushToast({
        type: 'success',
        title: `Saved ${created.rule_code}`,
        message: 'Rule saved and active cart recalculated.',
      });
    } catch (err) {
      pushToast({ type: 'error', title: 'Failed to save rule', message: extractApiError(err) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h2 className="font-display text-lg font-semibold text-slate-900">Natural Language Discount Rule Builder</h2>
        <p className="mt-1 text-xs text-slate-500">
          Describe an offer in plain English. The backend parses and validates the structured rule before asking for your confirmation.
        </p>
      </div>

      {/* Input Card */}
      <form onSubmit={handleParse} className="rounded-xl border border-slate-200 bg-white p-6 space-y-4">
        <div>
          <label htmlFor="ai-rule-input" className="block text-xs font-medium text-slate-700">
            Discount Rule Prompt
          </label>
          <textarea
            id="ai-rule-input"
            rows={3}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder='e.g. "20% off for Natura Casa brand, stackable with other offers."'
            className="mt-1.5 w-full rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none"
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-xs text-slate-500">
            Unconfirmed rules are never automatically saved.
          </span>
          <button
            type="submit"
            disabled={parsing || inputText.trim().length < 3}
            className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-800 disabled:opacity-50 whitespace-nowrap shrink-0"
          >
            <Send className="h-3.5 w-3.5" />
            <span>{parsing ? 'Parsing Rule...' : 'Parse Discount Rule'}</span>
          </button>
        </div>
      </form>

      {/* Example Prompts */}
      <div className="space-y-2">
        <div className="text-xs font-medium text-slate-500">Try an example</div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {EXAMPLE_PROMPTS.map((example) => (
            <button
              key={example}
              type="button"
              onClick={() => {
                setInputText(example);
                setParseError(null);
                setParsedResult(null);
              }}
              className="rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-left text-xs text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-50"
            >
              &ldquo;{example}&rdquo;
            </button>
          ))}
        </div>
      </div>

      {/* API / Server Key Error */}
      {parseError && <ErrorBanner errors={[parseError]} title="AI Parsing Unavailable" />}

      {/* Ambiguous / Clarification Guidance */}
      {parsedResult && !parsedResult.is_valid && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4 text-sm text-amber-950">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <div>
              <div className="font-medium">More detail needed</div>
              <p className="mt-1 text-xs text-amber-900">
                {parsedResult.clarification_message ||
                  'Please specify the discount percentage or amount, target brand/platform, or minimum cart value.'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Valid Parsed Summary (if dialog was closed without discarding) */}
      {parsedResult && parsedResult.is_valid && !confirmOpen && (
        <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50/60 p-4">
          <div className="flex items-center gap-2.5 text-sm text-emerald-950">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            <span>Rule parsed and ready for your confirmation.</span>
          </div>
          <button
            type="button"
            onClick={() => setConfirmOpen(true)}
            className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800"
          >
            Review Rule
          </button>
        </div>
      )}

      <div className="flex items-center justify-between border-t border-slate-200 pt-4 text-xs text-slate-500">
        <span>Want to inspect or edit all saved rules?</span>
        <Link to="/rules" className="inline-flex items-center gap-1 font-medium text-blue-600 hover:text-blue-700">
          <span>Manage Discount Rules</span>
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      {/* Confirmation Dialog */}
      <Dialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Confirm Parsed Discount Rule"
        description="Review the structured rule extracted from your prompt before saving and recalculating."
      >
        {parsedResult && (
          <div className="space-y-5">
            <div className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-slate-50/50 text-sm">
              <div className="flex items-center justify-between px-4 py-2.5">
                <span className="text-xs text-slate-500">Scope</span>
                <span className="font-medium capitalize text-slate-900">{parsedResult.scope}</span>
              </div>
              <div className="flex items-center justify-between px-4 py-2.5">
                <span className="text-xs text-slate-500">Applies To</span>
                <span className="font-medium text-slate-900">
                  {parsedResult.scope === 'cart' ? 'Entire Cart' : parsedResult.applies_to || '—'}
                </span>
              </div>
              <div className="flex items-center justify-between px-4 py-2.5">
                <span className="text-xs text-slate-500">Discount</span>
                <span className="font-mono font-semibold text-slate-900">
                  {parsedResult.discount_type && parsedResult.value !== null
                    ? formatRuleValue(parsedResult.discount_type, parsedResult.value)
                    : '—'}
                </span>
              </div>
              <div className="flex items-center justify-between px-4 py-2.5">
                <span className="text-xs text-slate-500">Stackable</span>
                <span className="font-medium text-slate-900">{parsedResult.stackable ? 'Yes' : 'No'}</span>
              </div>
              {parsedResult.scope === 'cart' && (
                <div className="flex items-center justify-between px-4 py-2.5">
                  <span className="text-xs text-slate-500">Minimum Cart Value</span>
                  <span className="font-mono font-semibold text-slate-900">
                    {formatINR(parsedResult.min_cart_value)}
                  </span>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setConfirmOpen(false);
                  setParsedResult(null);
                }}
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Discard
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void handleConfirmSave()}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Confirm & Save Rule'}
              </button>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}
