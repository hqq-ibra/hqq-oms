'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import {
  Button,
  Badge,
  useToast,
  SearchableSelect,
  type SearchableSelectOption,
  type SelectOption,
  type OrderStatusKey,
} from '@/components/ui';
import { Printer, Languages, ArrowLeft } from 'lucide-react';
import { OrderStatus } from '@/lib/types';
import { computeQuotationTotals, type QuotationTotals } from '@/lib/quotation-totals';
import { QUOTATION_CSS } from './quotation-css';

// Copied from orders/new/page.tsx:24-46 — the fixed option lists for a mold
// placeholder line's spec editors. Keyed by requiresLineSpecs, never a SKU.
const THERMOFORMING_MACHINES: SelectOption[] = [
  { value: 'MV', label: 'MultiVac' },
  { value: 'HI', label: 'Hilutec' },
  { value: 'SM', label: 'SmartMacIv' },
  { value: 'UT', label: 'Utien' },
  { value: 'VV', label: 'ViviVac' },
  { value: 'GE', label: 'GEA' },
  { value: 'SP', label: 'Sealpack' },
  { value: 'BP', label: 'BetaPack' },
  { value: 'UL', label: 'Ulma' },
];

const THERMOFORMING_CAPACITIES: SelectOption[] = [
  { value: '2K', label: '2K' }, { value: '4K', label: '4K' },
  { value: '6K', label: '6K' }, { value: '8K', label: '8K' },
  { value: '10K', label: '10K' }, { value: '12K', label: '12K' },
];

const THERMOFORMING_GRAMS: SelectOption[] = [
  { value: '1000', label: '1000g' }, { value: '500', label: '500g' },
  { value: '250', label: '250g' }, { value: '50S', label: '50S' },
  { value: '50L', label: '50L' }, { value: '30', label: '30g' },
];

// Mirrors apps/api/src/orders/mold-specs.ts REQUIRED_SPEC_KEYS. Not imported
// directly — apps/api and apps/web are separate projects/tsconfigs — but the
// four keys are a fixed contract (see Task 10 brief), not something to derive.
const REQUIRED_SPEC_KEYS = ['machine', 'capacity', 'grams', 'pattern'] as const;

interface QuotationLine {
  id: string;
  description: string;
  productName: string;
  requiresLineSpecs: boolean;
  specs: Record<string, string> | null;
  quantity: number;
  unitLabel: string;
  unitPrice: number | null;
  lineTotal: number;
}

interface QuotationView {
  orderId: string;
  quoteNumber: string | null;
  orderNumber: string | null;
  status: string;
  quoteDate: string | null;
  validUntil: string | null;
  payMethod: string;
  clientBlock: string;
  contact: string | null;
  attn: string | null;
  notes: string | null;
  discountAmount: number;
  vatEnabled: boolean;
  vatPercent: number;
  language: string;
  customerName: string;
  lines: QuotationLine[];
  totals: QuotationTotals;
}

interface QuotationLinePatch {
  id: string;
  quantity?: number;
  unitPrice?: number | null;
  unitLabel?: string;
  description?: string | null;
  specs?: Record<string, string> | null;
}

interface QuotationPatch {
  quoteDate?: string;
  validUntil?: string | null;
  payMethod?: string;
  clientBlock?: string;
  contact?: string | null;
  attn?: string | null;
  notes?: string | null;
  discountAmount?: number;
  vatEnabled?: boolean;
  vatPercent?: number;
  language?: string;
  lines?: QuotationLinePatch[];
}

// The source form's I18N dictionary (quotation_form_10.html lines 494-613),
// copied verbatim minus thImg / imgLabel / pasteHint — there is no image column.
const I18N: Record<'ar' | 'en', Record<string, string>> = {
  ar: {
    docTitle: 'عرض سعر - مؤسسة حسن القرقوش التجارية',
    titleMain: 'عرض سعر',
    titleSub: 'Hassan AlQarqoosh Trading Est.',
    lblQuoteNo: 'رقم العرض:',
    lblDate: 'التاريخ:',
    lblValid: 'صالح حتى:',
    lblPay: 'طريقة الدفع:',
    payValue: 'نقداً / تحويل بنكي',
    hClient: 'السادة العميل',
    phClient: 'اسم العميل / الشركة، العنوان...',
    hContact: 'رقم التواصل / المرجع',
    phContact: 'جوال / مرجع الطلب',
    phAttn: 'عناية / المسؤول',
    thDesc: 'البيان',
    thQty: 'الكمية',
    thUnit: 'الوحدة',
    thPrice: 'السعر',
    thTotal: 'الإجمالي',
    thDel: 'حذف',
    unitDefault: 'عدد',
    rowDescPh: 'وصف الصنف / الخدمة',
    btnAdd: '+ إضافة بند',
    btnPrint: '🖨️ طباعة / حفظ PDF',
    btnReset: '↺ تفريغ',
    btnLang: '🌐 English',
    vatOn: 'الضريبة: مفعّلة',
    vatOff: 'الضريبة: موقوفة',
    hNotes: 'ملاحظات',
    phNotes: 'أي شروط أو ملاحظات إضافية...',
    tSub: 'المجموع قبل الخصم',
    tDiscAmt: 'الخصم (ر.س)',
    tDiscPctInfo: 'نسبة الخصم',
    tNet: 'الصافي',
    tVatPct: 'ضريبة القيمة المضافة %',
    tVatVal: 'قيمة الضريبة',
    tGrand: 'الإجمالي النهائي',
    signPrep: 'المُعِدّ',
    signLine: 'التوقيع',
    signClient: 'موافقة العميل',
    signStamp: 'التوقيع والختم',
    currency: 'ر.س',
    footName: 'مؤسسة حسن القرقوش التجارية',
    footCR: 'س.ت 2050044548',
    footPO: 'ص.ب 8035 الدمام 31482',
    ibanLabel: '🏦 الآيبان:',
    ibanHolder: 'مؤسسة حسن جاسم القرقوش التجارية',
    confirmReset: 'سيتم تفريغ جميع البيانات. هل أنت متأكد؟',
    tipTitle: '💡 قبل الطباعة - نصيحة سريعة',
    tipDesc: 'عشان تطلع الورقة نظيفة بدون مسار الملف والتاريخ في الحواف، سوي هذي الخطوة مرة وحدة:',
    tipStep1: 'في نافذة الطباعة، اضغط على "More settings" / "خيارات إضافية"',
    tipStep2: 'شيل علامة الصح من خانة "Headers and footers" / "الرؤوس والتذييلات"',
    tipNote: '(يكفي تسويها مرة، المتصفح يحفظها للطبعات الجاية)',
    tipCancel: 'إلغاء',
    tipGo: 'فهمت، اطبع الآن',
  },
  en: {
    docTitle: 'Quotation - Hassan AlQarqoosh Trading Est.',
    titleMain: 'Quotation',
    titleSub: 'Hassan AlQarqoosh Trading Est.',
    lblQuoteNo: 'Quote No.:',
    lblDate: 'Date:',
    lblValid: 'Valid Until:',
    lblPay: 'Payment Terms:',
    payValue: 'Cash / Bank Transfer',
    hClient: 'To (Client)',
    phClient: 'Client / Company name, address...',
    hContact: 'Contact / Reference',
    phContact: 'Mobile / Order reference',
    phAttn: 'Attn / Person in charge',
    thDesc: 'Description',
    thQty: 'Qty',
    thUnit: 'Unit',
    thPrice: 'Unit Price',
    thTotal: 'Amount',
    thDel: 'Del',
    unitDefault: 'pcs',
    rowDescPh: 'Item / service description',
    btnAdd: '+ Add Item',
    btnPrint: '🖨️ Print / Save PDF',
    btnReset: '↺ Clear',
    btnLang: '🌐 العربية',
    vatOn: 'VAT: Enabled',
    vatOff: 'VAT: Disabled',
    hNotes: 'Notes',
    phNotes: 'Any additional terms or remarks...',
    tSub: 'Subtotal',
    tDiscAmt: 'Discount (SAR)',
    tDiscPctInfo: 'Discount Rate',
    tNet: 'Net Amount',
    tVatPct: 'VAT %',
    tVatVal: 'VAT Amount',
    tGrand: 'Grand Total',
    signPrep: 'Prepared by',
    signLine: 'Signature',
    signClient: 'Client Approval',
    signStamp: 'Signature & Stamp',
    currency: 'SAR',
    footName: 'Hassan AlQarqoosh Trading Est.',
    footCR: 'C.R. 2050044548',
    footPO: 'P.O. Box 8035, Dammam 31482',
    ibanLabel: '🏦 IBAN:',
    ibanHolder: 'Hassan Jasem AlQarqoosh Trading Est.',
    confirmReset: 'All data will be cleared. Are you sure?',
    tipTitle: '💡 Before printing - Quick tip',
    tipDesc: 'To get a clean printout without the file path and date in the margins, do this once:',
    tipStep1: 'In the print dialog, click on "More settings"',
    tipStep2: 'Uncheck the box "Headers and footers"',
    tipNote: '(You only need to do this once, the browser will remember it for next time)',
    tipCancel: 'Cancel',
    tipGo: 'Got it, print now',
  },
};

export default function QuotationPage() {
  const params = useParams();
  const id = params.id as string;
  const router = useRouter();
  const queryClient = useQueryClient();
  const { addToast } = useToast();

  const fetchQuotation = useCallback(
    () => api.get<QuotationView>(`/api/v1/orders/${id}/quotation`),
    [id],
  );

  const { data, isLoading, error } = useQuery({
    queryKey: ['quotation', id],
    queryFn: fetchQuotation,
    enabled: !!id,
    // Belt and braces alongside the reseed guard below. The provider's
    // defaults (providers/query-provider.tsx) leave refetchOnWindowFocus at
    // its default `true`, so once the 60s staleTime lapses — trivial while
    // pricing a multi-line quote — alt-tabbing away and back would refetch
    // and hand this page a new `data` object mid-edit. This page is an
    // editor, not a dashboard: nothing good comes of it refetching under the
    // user's cursor.
    refetchOnWindowFocus: false,
  });

  const [draft, setDraft] = useState<QuotationView | null>(null);
  const [lang, setLang] = useState<'ar' | 'en'>('ar');
  const printRef = useRef<HTMLDivElement>(null);
  const pendingRef = useRef<QuotationPatch>({});
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // True from the moment an edit is queued until it is *confirmed saved* —
  // cleared only by patchMutation's onSuccess (never at dispatch time, never
  // on error; see the comment above save() for why). Covers the debounce
  // window, the in-flight request, and — if the save fails — indefinitely
  // afterward, so the money display never reverts to server numbers that
  // predate a visible, still-unsaved edit. The money display reads the
  // server's authoritative draft.totals / line.lineTotal whenever this is
  // false, and only overlays the local, instant recompute while it is true —
  // see displayTotals below.
  const [hasUnsavedEdit, setHasUnsavedEdit] = useState(false);
  // The last server payload the reseed effect has already made a decision
  // about — see that effect for why "decided" and not "applied".
  const seenDataRef = useRef<QuotationView | null>(null);

  const locked = draft?.status !== OrderStatus.QUOTATION;

  const patchMutation = useMutation({
    mutationFn: (payload: QuotationPatch) =>
      api.patch<QuotationView>(`/api/v1/orders/${id}/quotation`, payload),
    onSuccess: (response) => {
      setDraft(response);
      // The PATCH response *is* the newest server truth, so it belongs in the
      // query cache too. Without this the cache keeps whatever the last GET
      // returned, and any later consumer of `data` — including the reseed
      // effect below — would be working from a snapshot that predates this
      // save.
      queryClient.setQueryData(['quotation', id], response);
      seenDataRef.current = response;
      // Only a *successful* round trip may hand money display back to the
      // server's numbers — see hasUnsavedEdit's declaration and the note
      // above save() below. A failed save leaves this true, deliberately.
      setHasUnsavedEdit(false);
      queryClient.invalidateQueries({ queryKey: ['order', id] });
    },
    onError: (err: Error) => addToast(err.message, 'error'),
  });

  // Seed (and reseed) the local draft from the server — but *only* when there
  // is nothing unsaved to destroy.
  //
  // Ungated, this ran on every new `data` object, and any refetch produces
  // one. That silently discarded everything typed since the last successful
  // save, mid-keystroke, with no warning. It also defeated the guarantee
  // hasUnsavedEdit exists to provide: that flag keeps the displayed *totals*
  // consistent with the visible inputs after a failed save, which is worth
  // nothing if the inputs themselves get overwritten underneath it.
  //
  // Both flags are needed: hasUnsavedEdit covers the debounce window and any
  // failed save that has not been superseded, and isPending covers the gap
  // between dispatch and the response landing. addLine / removeLine do not
  // rely on this effect at all — they reseed explicitly, see below.
  //
  // seenDataRef is what makes the gate safe rather than merely delayed. The
  // flags are in the dependency array, so the effect re-runs when they flip —
  // and without the ref, the run triggered by hasUnsavedEdit going false at
  // the end of a *successful* save would re-apply the still-stale cached
  // `data`, wiping the save's own response. (Observed: server at 575, UI
  // snapped back to 230.) So each payload is consumed exactly once, at the
  // moment it arrives: applied if nothing is unsaved, otherwise dropped for
  // good. A payload that showed up mid-edit is stale by definition and must
  // never be resurrected later.
  //
  // `totals` always comes along with the server payload — we never locally
  // patch that field, so it is implicitly always the server's own reconciled
  // value.
  useEffect(() => {
    if (!data || data === seenDataRef.current) return;
    seenDataRef.current = data;
    if (hasUnsavedEdit || patchMutation.isPending) return;
    setDraft(data);
    setLang(data.language === 'en' ? 'en' : 'ar');
  }, [data, hasUnsavedEdit, patchMutation.isPending]);

  // Adding or removing a line is a structural change, so afterwards the draft
  // *must* be replaced by the server's answer — but the reseed effect above
  // deliberately refuses to overwrite an unsaved edit, and hasUnsavedEdit can
  // legitimately still be armed here (a failed save leaves it engaged by
  // design). So these two mutations do their own reseed rather than relying
  // on an invalidation to reach the effect.
  //
  // staleTime: 0 is load-bearing — the provider's 60s default would let
  // fetchQuery return the pre-change cache and the new line would never
  // appear.
  const reseedFromServer = async () => {
    const fresh = await queryClient.fetchQuery({
      queryKey: ['quotation', id],
      queryFn: fetchQuotation,
      staleTime: 0,
    });
    seenDataRef.current = fresh;
    setDraft(fresh);
    setLang(fresh.language === 'en' ? 'en' : 'ar');
    setHasUnsavedEdit(false);
    queryClient.invalidateQueries({ queryKey: ['order', id] });
  };

  // Any debounced edit still sitting in pendingRef has to land before a
  // structural change, or the reseed that follows would throw it away.
  // If the flush itself fails this rejects, so the add/remove is abandoned
  // and the unsaved edit is preserved rather than silently discarded — at the
  // cost of two toasts (the patch's and the caller's) for the one failure.
  const flushPending = async () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const payload = pendingRef.current;
    pendingRef.current = {};
    if (Object.keys(payload).length > 0) {
      await patchMutation.mutateAsync(payload);
    }
  };

  const addLine = useMutation({
    mutationFn: async (productId: string) => {
      await flushPending();
      return api.post(`/api/v1/orders/${id}/items`, { productId, quantity: 1 });
    },
    onSuccess: reseedFromServer,
    onError: (err: Error) => addToast(err.message, 'error'),
  });

  const removeLine = useMutation({
    mutationFn: async (itemId: string) => {
      await flushPending();
      return api.delete(`/api/v1/orders/${id}/items/${itemId}`);
    },
    onSuccess: reseedFromServer,
    onError: (err: Error) => addToast(err.message, 'error'),
  });

  // Debounce ~800ms after the last keystroke. Pending header fields and line
  // patches are merged (not simply replaced) so two fields edited within the
  // same window are both flushed, instead of the later call silently
  // clobbering the earlier one.
  //
  // hasUnsavedEdit is set true here and only ever cleared by patchMutation's
  // onSuccess (never at dispatch time, never on error) — see displayTotals
  // below. That means a failed save (network error, 500, or a 409 because
  // the order was confirmed in another tab) leaves it engaged: the visible
  // inputs still show the user's unsaved edit, and the overlay keeps the
  // displayed totals consistent with those inputs instead of silently
  // reverting to server numbers that predate the edit. It stays engaged
  // until either the user edits again (which re-dispatches) or they navigate
  // away — this file deliberately does not auto-retry or discard the edit.
  //
  // Known accepted tradeoff (ledgered, not engineered around): if two save
  // cycles overlap — a second edit's debounce elapses and dispatches while an
  // earlier request is still in flight — and their *successes* settle out of
  // order, the earlier one's onSuccess can clear hasUnsavedEdit and reset
  // `draft` before the later edit's own request has completed. This cannot
  // corrupt persisted data: updateQuotation applies per-field partial Prisma
  // updates, so out-of-order responses only affect transient client display,
  // and the next successful round trip (or reload) self-heals it.
  const save = (patch: QuotationPatch) => {
    if (locked) return;
    setHasUnsavedEdit(true);
    const { lines: newLines, ...header } = patch;
    Object.assign(pendingRef.current, header);
    if (newLines) {
      const merged = [...(pendingRef.current.lines ?? [])];
      for (const line of newLines) {
        const idx = merged.findIndex((l) => l.id === line.id);
        if (idx >= 0) {
          const prevSpecs = merged[idx].specs;
          merged[idx] = {
            ...merged[idx],
            ...line,
            specs: line.specs ? { ...(prevSpecs ?? {}), ...line.specs } : merged[idx].specs,
          };
        } else {
          merged.push(line);
        }
      }
      pendingRef.current.lines = merged;
    }
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      const payload = pendingRef.current;
      pendingRef.current = {};
      timerRef.current = null;
      if (Object.keys(payload).length > 0) {
        patchMutation.mutate(payload);
      } else {
        // Nothing actually queued (shouldn't normally happen) — there is no
        // mutation left to resolve this, so nothing will ever clear the flag
        // otherwise.
        setHasUnsavedEdit(false);
      }
    }, 800);
  };

  const updateHeader = (patch: Omit<QuotationPatch, 'lines'>) => {
    if (locked || !draft) return;
    setDraft({ ...draft, ...patch });
    save(patch);
  };

  const updateLine = (lineId: string, patch: Omit<QuotationLinePatch, 'id'>) => {
    if (locked || !draft) return;
    setDraft({
      ...draft,
      lines: draft.lines.map((l) =>
        l.id === lineId
          ? { ...l, ...patch, description: patch.description ?? l.description }
          : l,
      ),
    });
    save({ lines: [{ id: lineId, ...patch }] });
  };

  const setSpec = (line: QuotationLine, key: string, value: string) => {
    updateLine(line.id, { specs: { ...(line.specs ?? {}), [key]: value } });
  };

  const handleToggleLang = () => {
    const next = lang === 'ar' ? 'en' : 'ar';
    setLang(next);
    updateHeader({ language: next });
  };

  const handlePrint = () => {
    const el = printRef.current;
    if (!el) return;
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(
      `<!DOCTYPE html><html dir="${lang === 'ar' ? 'rtl' : 'ltr'}" lang="${lang}">` +
        `<head><meta charset="utf-8"><title>&#8203;</title>` +
        `<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;900&family=Tajawal:wght@400;500;700&family=Inter:wght@400;500;600;700;800&family=Playfair+Display:wght@700;900&display=swap" rel="stylesheet">` +
        `<style>${QUOTATION_CSS}</style></head><body>`,
    );
    win.document.write(el.outerHTML);
    win.document.write('</body></html>');
    win.document.close();

    // This is a customer-facing document. A fixed 600ms timer fired whether or
    // not the letterhead image and the remote font families had arrived, so on
    // a cold cache the printout came out with no letterhead and fallback
    // fonts. Wait for the real signals — the window's load event (images) and
    // document.fonts.ready (webfonts) — and keep a timer only as a fallback so
    // a font CDN that never answers cannot leave the user staring at a window
    // that refuses to print.
    const loaded = new Promise<void>((resolve) => {
      if (win.document.readyState === 'complete') {
        resolve();
        return;
      }
      win.addEventListener('load', () => resolve(), { once: true });
    });
    const fontsReady = win.document.fonts
      ? win.document.fonts.ready.then(() => undefined)
      : Promise.resolve();
    const fallback = new Promise<void>((resolve) => setTimeout(resolve, 4000));

    void Promise.race([
      Promise.all([loaded, fontsReady]).then(() => undefined),
      fallback,
    ]).then(() => {
      if (win.closed) return;
      win.focus();
      win.print();
      // print() blocks on the print dialog, so by here the user has either
      // printed or cancelled. Leaving the window open left an orphan blank
      // tab behind after every print.
      win.close();
    });
  };

  const [addProductSearch, setAddProductSearch] = useState('');
  const { data: addProductsData, isLoading: productsLoading } = useQuery({
    queryKey: ['products', 'quotation-add', addProductSearch],
    queryFn: () =>
      api.get<{ data: { id: string; sku: string; nameEn: string }[] }>('/api/v1/products', {
        search: addProductSearch,
        pageSize: '20',
      }),
    enabled: !locked,
  });
  const productOptions: SearchableSelectOption[] = (addProductsData?.data ?? []).map((p) => ({
    value: p.id,
    label: p.nameEn,
    sublabel: p.sku,
  }));

  // Instant, local recompute so numbers move while typing. This is a
  // transient overlay only — see showLiveOverlay/displayTotals below, which
  // decide whether this or the server's authoritative draft.totals is what
  // actually gets rendered.
  const liveTotals: QuotationTotals = draft
    ? computeQuotationTotals({
        lines: draft.lines.map((l) => ({ quantity: l.quantity, unitPrice: l.unitPrice })),
        discountAmount: draft.discountAmount,
        vatEnabled: draft.vatEnabled,
        vatPercent: draft.vatPercent,
      })
    : { lineTotals: [], subtotal: 0, discount: 0, discountPercent: 0, net: 0, vat: 0, grandTotal: 0 };

  const isLineMissingSpecs = (line: QuotationLine) =>
    line.requiresLineSpecs &&
    REQUIRED_SPEC_KEYS.some((key) => !line.specs?.[key]?.trim());

  const hasMissingSpecs = draft?.lines.some(isLineMissingSpecs) ?? false;

  if (isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-blue-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 text-center">
        <p className="text-sm text-gray-600">
          {error instanceof Error ? error.message : 'Could not load this quotation.'}
        </p>
        <Button variant="secondary" size="md" onClick={() => router.push('/orders')}>
          <ArrowLeft className="h-4 w-4" />
          Back to orders
        </Button>
      </div>
    );
  }

  if (!draft) {
    // The query already resolved (isLoading is false, no error) but the
    // useEffect that seeds `draft` from it hasn't committed yet — a one-render
    // gap, not a failure. Keep spinning; the next render has draft set.
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-blue-600" />
      </div>
    );
  }

  const t = I18N[lang];

  // Money display authority: while an edit is queued, its save is in flight,
  // or a prior save attempt failed and hasn't been superseded by a
  // successful one, show the instant local recompute so numbers move as you
  // type and never contradict the visible inputs. The moment a save actually
  // *succeeds*, patchMutation's onSuccess replaces `draft` (including
  // `totals` and every line's `lineTotal`) with the server's own numbers and
  // clears hasUnsavedEdit, flipping this back to reading those — never a
  // second, independently-computed source of truth for money once a save
  // has actually landed. Always false while locked, since save() early-
  // returns before ever setting hasUnsavedEdit — the confirmed/print view
  // renders server numbers unconditionally.
  const showLiveOverlay = hasUnsavedEdit || patchMutation.isPending;
  const displayTotals: QuotationTotals = showLiveOverlay ? liveTotals : draft.totals;
  const lineTotal = (line: QuotationLine, index: number) =>
    showLiveOverlay ? (liveTotals.lineTotals[index] ?? 0) : line.lineTotal;
  // Matches the source's calcAll(): whole percents once >=10 or at exactly
  // 0, one decimal place otherwise (so "5.3%", not "5.32%").
  const formatDiscPct = (pct: number) => pct.toFixed(pct >= 10 || pct === 0 ? 0 : 1);

  // Fidelity note: the source form's calcAll() hides every `.disc-row`
  // (including the discount-amount input's own row) whenever the discount is
  // zero — on paper this is exactly what a customer should see. Doing that
  // unconditionally in our editor would also hide the only control that lets
  // staff *start* a discount from zero, so here it only collapses once the
  // quotation is locked (i.e. for the final, read-only/printed view); while
  // still editable the three discount rows stay visible regardless of value.
  const hideDiscountRows = locked && displayTotals.discount === 0;

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 bg-white p-4 print:hidden">
        <div className="flex items-center gap-3">
          <Button variant="secondary" size="md" onClick={() => router.push(`/orders/${id}`)}>
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
          <div className="flex flex-col text-xs text-gray-500 sm:flex-row sm:items-center sm:gap-2">
            {draft.orderNumber && <span>Order #{draft.orderNumber}</span>}
            <span>{draft.customerName}</span>
          </div>
          <Badge variant={draft.status as OrderStatusKey}>{draft.status}</Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="md" onClick={handleToggleLang}>
            <Languages className="h-4 w-4" />
            {lang === 'ar' ? 'English' : 'العربية'}
          </Button>
          <Button variant="primary" size="md" onClick={handlePrint}>
            <Printer className="h-4 w-4" />
            Print
          </Button>
        </div>
      </div>

      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link
        href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;900&family=Tajawal:wght@400;500;700&family=Inter:wght@400;500;600;700;800&family=Playfair+Display:wght@700;900&display=swap"
        rel="stylesheet"
      />
      <style dangerouslySetInnerHTML={{ __html: QUOTATION_CSS }} />

      <div className="qform" dir={lang === 'ar' ? 'rtl' : 'ltr'} ref={printRef}>
        <div className="page">
          <img className="header-img" src="/quotation-letterhead.jpg" alt="Hassan AlQarqoosh Trading Est." />

          <div className="title-bar">
            <h1>{t.titleMain}</h1>
            <span className="sub">{t.titleSub}</span>
          </div>

          <div className="meta">
            <div className="field">
              <label>{t.lblQuoteNo}</label>
              <span>{draft.quoteNumber ?? '—'}</span>
            </div>
            <div className="field">
              <label>{t.lblDate}</label>
              {locked ? (
                <span>{draft.quoteDate ? draft.quoteDate.slice(0, 10) : '—'}</span>
              ) : (
                <input
                  type="date"
                  value={draft.quoteDate ? draft.quoteDate.slice(0, 10) : ''}
                  onChange={(e) => {
                    if (!e.target.value) return;
                    updateHeader({ quoteDate: e.target.value });
                  }}
                />
              )}
            </div>
            <div className="field">
              <label>{t.lblValid}</label>
              {locked ? (
                <span>{draft.validUntil ? draft.validUntil.slice(0, 10) : '—'}</span>
              ) : (
                <input
                  type="date"
                  value={draft.validUntil ? draft.validUntil.slice(0, 10) : ''}
                  onChange={(e) => updateHeader({ validUntil: e.target.value || null })}
                />
              )}
            </div>
            <div className="field">
              <label>{t.lblPay}</label>
              {locked ? (
                <span>{draft.payMethod || '—'}</span>
              ) : (
                <input
                  type="text"
                  value={draft.payMethod}
                  onChange={(e) => updateHeader({ payMethod: e.target.value })}
                />
              )}
            </div>
          </div>

          <div className="client-box">
            <div className="field-group">
              <h3>{t.hClient}</h3>
              {locked ? (
                <p style={{ whiteSpace: 'pre-line' }}>{draft.clientBlock || draft.customerName}</p>
              ) : (
                <textarea
                  value={draft.clientBlock}
                  placeholder={t.phClient}
                  onChange={(e) => updateHeader({ clientBlock: e.target.value })}
                />
              )}
            </div>
            <div className="field-group">
              <h3>{t.hContact}</h3>
              {locked ? (
                <>
                  <p>{draft.contact || '—'}</p>
                  <p>{draft.attn || '—'}</p>
                </>
              ) : (
                <>
                  <input
                    type="text"
                    className="cli-input"
                    placeholder={t.phContact}
                    value={draft.contact ?? ''}
                    onChange={(e) => updateHeader({ contact: e.target.value || null })}
                  />
                  <input
                    type="text"
                    className="cli-input"
                    placeholder={t.phAttn}
                    style={{ marginTop: 6 }}
                    value={draft.attn ?? ''}
                    onChange={(e) => updateHeader({ attn: e.target.value || null })}
                  />
                </>
              )}
            </div>
          </div>

          {hasMissingSpecs && (
            <div
              className="qform-warning"
              style={{
                margin: '0 28px',
                marginTop: 12,
                padding: '8px 12px',
                borderRadius: 4,
                background: '#fff3cd',
                color: '#7a5c00',
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              Missing mold specifications — this quotation cannot be confirmed until they are set.
            </div>
          )}

          <table className="items">
            <thead>
              <tr>
                <th>#</th>
                <th className="col-desc">{t.thDesc}</th>
                <th className="col-num">{t.thQty}</th>
                <th className="col-num">{t.thUnit}</th>
                <th className="col-num">{t.thPrice}</th>
                <th className="col-num">{t.thTotal}</th>
                {!locked && (
                  <th className="col-action" style={{ width: 50 }}>
                    {t.thDel}
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {draft.lines.map((line, index) => (
                <tr key={line.id}>
                  <td className="idx">{index + 1}</td>
                  <td className="desc">
                    {!locked && !line.requiresLineSpecs ? (
                      <textarea
                        className="cell"
                        value={line.description}
                        placeholder={t.rowDescPh}
                        onChange={(e) => updateLine(line.id, { description: e.target.value })}
                      />
                    ) : (
                      <p style={{ whiteSpace: 'pre-line' }}>{line.description}</p>
                    )}
                    {!locked && line.requiresLineSpecs && (
                      <div
                        className="qform-specs"
                        style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}
                      >
                        <select
                          value={line.specs?.machine ?? ''}
                          onChange={(e) => setSpec(line, 'machine', e.target.value)}
                        >
                          <option value="">Machine…</option>
                          {THERMOFORMING_MACHINES.map((m) => (
                            <option key={m.value} value={m.value}>
                              {m.label}
                            </option>
                          ))}
                        </select>
                        <select
                          value={line.specs?.capacity ?? ''}
                          onChange={(e) => setSpec(line, 'capacity', e.target.value)}
                        >
                          <option value="">Capacity…</option>
                          {THERMOFORMING_CAPACITIES.map((c) => (
                            <option key={c.value} value={c.value}>
                              {c.label}
                            </option>
                          ))}
                        </select>
                        <select
                          value={line.specs?.grams ?? ''}
                          onChange={(e) => setSpec(line, 'grams', e.target.value)}
                        >
                          <option value="">Grams…</option>
                          {THERMOFORMING_GRAMS.map((g) => (
                            <option key={g.value} value={g.value}>
                              {g.label}
                            </option>
                          ))}
                        </select>
                        <input
                          type="text"
                          placeholder="Pattern"
                          value={line.specs?.pattern ?? ''}
                          onChange={(e) => setSpec(line, 'pattern', e.target.value)}
                        />
                      </div>
                    )}
                  </td>
                  <td>
                    {locked ? (
                      <span>{line.quantity}</span>
                    ) : (
                      <input
                        type="number"
                        className="cell"
                        min={1}
                        value={line.quantity}
                        onChange={(e) =>
                          updateLine(line.id, { quantity: Math.max(1, Number(e.target.value) || 1) })
                        }
                      />
                    )}
                  </td>
                  <td>
                    {locked ? (
                      <span>{line.unitLabel}</span>
                    ) : (
                      <input
                        type="text"
                        className="cell"
                        value={line.unitLabel}
                        onChange={(e) => updateLine(line.id, { unitLabel: e.target.value })}
                      />
                    )}
                  </td>
                  <td>
                    {locked ? (
                      <span>{(line.unitPrice ?? 0).toFixed(2)}</span>
                    ) : (
                      <input
                        type="number"
                        className="cell"
                        min={0}
                        step="0.01"
                        value={line.unitPrice ?? ''}
                        onChange={(e) =>
                          updateLine(line.id, {
                            unitPrice: e.target.value === '' ? null : Number(e.target.value),
                          })
                        }
                      />
                    )}
                  </td>
                  <td className="total">{lineTotal(line, index).toFixed(2)}</td>
                  {!locked && (
                    <td className="action">
                      <button
                        type="button"
                        className="btn-del"
                        title={t.thDel}
                        disabled={draft.lines.length === 1}
                        onClick={() => removeLine.mutate(line.id)}
                      >
                        ✕
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>

          {!locked && (
            <div className="table-actions">
              <div style={{ minWidth: 260 }}>
                <SearchableSelect
                  placeholder={t.btnAdd}
                  value=""
                  onChange={(value) => {
                    if (value) addLine.mutate(value);
                  }}
                  options={productOptions}
                  onSearch={setAddProductSearch}
                  searchValue={addProductSearch}
                  onSearchChange={setAddProductSearch}
                  loading={productsLoading}
                  renderOption={(opt) => (
                    <span>
                      <span className="font-medium text-gray-500">{opt.sublabel}</span>
                      {' — '}
                      {opt.label}
                    </span>
                  )}
                />
              </div>
              <button
                type="button"
                className={`btn btn-vat${draft.vatEnabled ? ' active' : ''}`}
                onClick={() => updateHeader({ vatEnabled: !draft.vatEnabled })}
              >
                <span className="dot" />
                <span>{draft.vatEnabled ? t.vatOn : t.vatOff}</span>
              </button>
            </div>
          )}

          <div className="totals-wrap">
            <div className="notes">
              <h3>{t.hNotes}</h3>
              {locked ? (
                <p style={{ whiteSpace: 'pre-line' }}>{draft.notes || '—'}</p>
              ) : (
                <textarea
                  value={draft.notes ?? ''}
                  placeholder={t.phNotes}
                  onChange={(e) => updateHeader({ notes: e.target.value || null })}
                />
              )}
            </div>
            <div className="totals">
              <div className="row">
                <span className="label">{t.tSub}</span>
                <span className="value">
                  {displayTotals.subtotal.toFixed(2)} <span className="cur">{t.currency}</span>
                </span>
              </div>

              {!hideDiscountRows && (
                <>
                  <div className="row disc-row">
                    <span className="label">{t.tDiscAmt}</span>
                    {locked ? (
                      <span className="value">
                        {displayTotals.discount.toFixed(2)} <span className="cur">{t.currency}</span>
                      </span>
                    ) : (
                      <span>
                        <input
                          type="number"
                          className="disc disc-amt"
                          min={0}
                          step="0.01"
                          value={draft.discountAmount}
                          onChange={(e) => updateHeader({ discountAmount: Number(e.target.value) || 0 })}
                        />{' '}
                        <span className="cur" style={{ fontSize: 11, color: 'var(--muted)' }}>
                          {t.currency}
                        </span>
                      </span>
                    )}
                  </div>
                  <div className="row disc-row disc-info-row">
                    <span className="label">{t.tDiscPctInfo}</span>
                    <span
                      className="value"
                      style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}
                    >
                      {formatDiscPct(displayTotals.discountPercent)}%
                    </span>
                  </div>
                  <div className="row disc-row">
                    <span className="label">{t.tNet}</span>
                    <span className="value">
                      {displayTotals.net.toFixed(2)} <span className="cur">{t.currency}</span>
                    </span>
                  </div>
                </>
              )}

              {draft.vatEnabled && (
                <>
                  <div className="row vat-row">
                    <span className="label">{t.tVatPct}</span>
                    {locked ? (
                      <span className="value">{draft.vatPercent}%</span>
                    ) : (
                      <input
                        type="number"
                        className="disc"
                        min={0}
                        max={100}
                        step="0.5"
                        value={draft.vatPercent}
                        onChange={(e) => updateHeader({ vatPercent: Number(e.target.value) || 0 })}
                      />
                    )}
                  </div>
                  <div className="row vat-row">
                    <span className="label">{t.tVatVal}</span>
                    <span className="value">
                      {displayTotals.vat.toFixed(2)} <span className="cur">{t.currency}</span>
                    </span>
                  </div>
                </>
              )}

              <div className="grand">
                <span className="label">{t.tGrand}</span>
                <span className="value">
                  {displayTotals.grandTotal.toFixed(2)} <span className="cur">{t.currency}</span>
                </span>
              </div>
            </div>
          </div>

          <div className="footer-sign">
            <div className="sign-box">
              <div className="label">{t.signPrep}</div>
              <div className="line">{t.signLine}</div>
            </div>
            <div className="sign-box">
              <div className="label">{t.signClient}</div>
              <div className="line">{t.signStamp}</div>
            </div>
          </div>

          <div className="page-foot">
            <div className="row1">
              <span className="brand">HQQ</span>
              <span className="sep">•</span>
              <span>{t.footName}</span>
              <span className="sep">•</span>
              <span>{t.footCR}</span>
              <span className="sep">•</span>
              <span>{t.footPO}</span>
            </div>
            <div className="row2">
              <span>📱 0544259874</span>
              <span className="sep">•</span>
              <span>📱 0504807303</span>
              <span className="sep">•</span>
              <span>✉️ hqq.ibra@gmail.com</span>
            </div>
            <div className="row-iban">
              <span className="iban-label">{t.ibanLabel}</span>
              <span className="iban-num">SA83 1000 0008 2716 0400 0101</span>
              <span className="sep">•</span>
              <span className="bank-holder">{t.ibanHolder}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
