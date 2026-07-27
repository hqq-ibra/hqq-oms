/**
 * The stylesheet from quotation_form_10.html, scoped under .qform.
 * Kept as a plain string (not a CSS module) because the print window is a
 * fresh document that receives this same text — hashed module class names
 * would not resolve there.
 *
 * Transformed from the source's <style> block (lines 9-352) by:
 *   1. Prefixing every top-level selector with `.qform `.
 *   2. Replacing `:root {` with `.qform {`.
 *   3. Replacing `html[dir="rtl"]` / `html[dir="ltr"]` with
 *      `.qform[dir="rtl"]` / `.qform[dir="ltr"]`.
 *   4. Replacing the `html, body {...}` and `body { padding: 24px 12px; }`
 *      rules with a single `.qform { background: #eef0f3; ...; padding: 24px 12px; }` rule.
 *   5. Deleting every rule for `.img-slot`, `.paste-hint`, `.lightbox`,
 *      `td.img-cell`, `th.col-img`, `table.items.no-images`, and the
 *      `@keyframes fadeInPulse` block — there is no image column.
 *
 * `@page` and the `@media print` / `@media (max-width: 720px)` blocks are
 * NOT touched by edits 1-3/5 (see note above the `@media print` block below)
 * — the one exception is the `.qform-specs` rule added to `@media print`,
 * which is a new addition (Task 10 Step 3), not part of the source form.
 *
 * One deliberate deviation from a byte-literal edit 3: the source rules
 * `html[dir="rtl"] body { font-family: 'Tajawal', 'Cairo', sans-serif; }`
 * and `html[dir="ltr"] body { font-family: 'Inter', sans-serif; }` set the
 * whole page's base font via the actual <body> element, which is a sibling
 * of .qform in both the live app and the print window — never a descendant
 * of it. A literal `.qform[dir="rtl"] body {...}` text substitution would
 * therefore never match anything and silently drop the base Arabic/Latin
 * font for the whole form. Edit 4 already establishes `.qform` as body's
 * stand-in for whole-form styling, so these two rules are rebound directly
 * to `.qform[dir="..."]` instead of `.qform[dir="..."] body`. See the Task 10
 * report for the full reasoning.
 */
export const QUOTATION_CSS = `
  .qform * { box-sizing: border-box; margin: 0; padding: 0; }
  .qform {
    --red: #c8102e;
    --green: #1f9d55;
    --ink: #1a1a1a;
    --muted: #6b7280;
    --line: #e5e7eb;
    --soft: #f8f9fa;
    --paper: #ffffff;
  }
  .qform { background: #eef0f3; color: var(--ink); -webkit-print-color-adjust: exact; print-color-adjust: exact; padding: 24px 12px; }
  .qform[dir="rtl"] { font-family: 'Tajawal', 'Cairo', sans-serif; }
  .qform[dir="ltr"] { font-family: 'Inter', sans-serif; }
  .qform .page {
    max-width: 880px;
    margin: 0 auto;
    background: var(--paper);
    box-shadow: 0 10px 40px rgba(0,0,0,0.08);
    border-radius: 6px;
    overflow: hidden;
    position: relative;
  }
  .qform .header-img { width: 100%; display: block; border-bottom: 3px double var(--red); }
  .qform .title-bar {
    background: linear-gradient(90deg, var(--red) 0%, #a30d24 100%);
    color: #fff;
    padding: 10px 28px;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .qform[dir="rtl"] .title-bar h1 { font-family: 'Cairo', sans-serif; }
  .qform[dir="ltr"] .title-bar h1 { font-family: 'Playfair Display', serif; letter-spacing: 1px; }
  .qform .title-bar h1 { font-size: 20px; font-weight: 900; }
  .qform .title-bar .sub { font-size: 12px; opacity: 0.9; font-weight: 500; }

  .qform .meta {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0 24px;
    padding: 12px 28px;
    border-bottom: 1px solid var(--line);
    background: var(--soft);
  }
  .qform .meta .field { display: flex; align-items: center; gap: 8px; padding: 4px 0; font-size: 13px; }
  .qform .meta .field label { font-weight: 700; color: var(--muted); min-width: 100px; }
  .qform .meta input { border: none; border-bottom: 1px dashed #c4c8cf; padding: 3px 6px; background: transparent; font-family: inherit; font-size: 13px; flex: 1; outline: none; transition: border-color .15s; }
  .qform[dir="ltr"] .meta input { text-align: left; }
  .qform .meta input:focus { border-color: var(--red); background: #fff; }

  .qform .client-box { padding: 12px 28px; border-bottom: 1px solid var(--line); display: grid; grid-template-columns: 2fr 1fr; gap: 14px; align-items: start; }
  .qform .client-box .field-group { display: flex; flex-direction: column; }
  .qform .client-box h3 { font-size: 11px; color: var(--red); font-weight: 700; margin-bottom: 4px; letter-spacing: 0.5px; text-transform: uppercase; }
  .qform .client-box textarea { width: 100%; border: 1px solid var(--line); border-radius: 4px; padding: 6px 8px; font-family: inherit; font-size: 13px; resize: none; height: 54px; outline: none; line-height: 1.4; }
  .qform .client-box input.cli-input { width: 100%; border: 1px solid var(--line); border-radius: 4px; padding: 6px 8px; font-family: inherit; font-size: 13px; outline: none; }
  .qform .client-box textarea:focus, .qform .client-box input.cli-input:focus { border-color: var(--red); }
  .qform[dir="ltr"] .client-box textarea, .qform[dir="ltr"] .client-box input.cli-input { text-align: left; }

  .qform table.items { width: 100%; border-collapse: collapse; }
  .qform table.items thead th {
    background: var(--ink);
    color: #fff;
    padding: 10px 8px;
    font-size: 13px;
    font-weight: 700;
    text-align: center;
  }
  .qform[dir="rtl"] table.items thead th { font-family: 'Cairo', sans-serif; }
  .qform table.items thead th:first-child { width: 40px; }
  .qform table.items thead th.col-desc { width: 38%; }
  .qform[dir="rtl"] table.items thead th.col-desc { text-align: right; }
  .qform[dir="ltr"] table.items thead th.col-desc { text-align: left; }
  .qform table.items thead th.col-num { width: 90px; }

  .qform table.items tbody td { padding: 4px 6px; border-bottom: 1px solid var(--line); vertical-align: middle; }
  .qform table.items tbody td.idx { text-align: center; color: var(--muted); font-weight: 700; background: var(--soft); }
  .qform table.items input.cell, .qform table.items textarea.cell {
    width: 100%; border: none; padding: 8px 6px; font-family: inherit; font-size: 14px; background: transparent; outline: none; text-align: center;
  }
  .qform[dir="rtl"] table.items td.desc textarea.cell { text-align: right; }
  .qform[dir="ltr"] table.items td.desc textarea.cell { text-align: left; }
  .qform table.items td.desc textarea.cell { resize: none; min-height: 36px; line-height: 1.5; }
  .qform table.items input.cell:focus, .qform table.items textarea.cell:focus { background: #fff8e1; }
  .qform table.items td.total { text-align: center; font-weight: 700; background: #fafbfc; color: var(--red); font-size: 14px; }
  .qform table.items td.action { text-align: center; }
  .qform .btn-del { background: transparent; border: none; color: #c0392b; cursor: pointer; font-size: 16px; padding: 4px 8px; border-radius: 4px; }
  .qform .btn-del:hover { background: #fde8e8; }

  .qform .table-actions { padding: 10px 28px; border-bottom: 1px solid var(--line); display: flex; gap: 10px; background: var(--soft); flex-wrap: wrap; }
  .qform .btn { font-family: inherit; font-size: 13px; font-weight: 700; padding: 8px 16px; border-radius: 4px; border: none; cursor: pointer; transition: all .15s; }
  .qform .btn-add { background: var(--green); color: #fff; }
  .qform .btn-add:hover { background: #168045; }
  .qform .btn-print { background: var(--ink); color: #fff; }
  .qform .btn-print:hover { background: #000; }
  .qform .btn-reset { background: #fff; color: var(--ink); border: 1px solid var(--line); }
  .qform .btn-reset:hover { background: var(--soft); }
  .qform .btn-vat { background: #fff; color: var(--ink); border: 1px solid var(--line); display: inline-flex; align-items: center; gap: 8px; }
  .qform .btn-vat:hover { background: var(--soft); }
  .qform .btn-vat.active { background: var(--green); color: #fff; border-color: var(--green); }
  .qform .btn-vat .dot { width: 10px; height: 10px; border-radius: 50%; background: #c0392b; transition: background .2s; }
  .qform .btn-vat.active .dot { background: #fff; }
  .qform .btn-lang { background: #1e40af; color: #fff; display: inline-flex; align-items: center; gap: 6px; }
  .qform .btn-lang:hover { background: #1d3a8a; }
  .qform .vat-row.hidden { display: none !important; }

  .qform .totals-wrap { display: grid; grid-template-columns: 1fr 340px; gap: 0; align-items: stretch; }
  .qform .notes { padding: 14px 28px; display: flex; flex-direction: column; }
  .qform .notes h3 { font-size: 11px; color: var(--red); font-weight: 700; margin-bottom: 6px; letter-spacing: 0.5px; text-transform: uppercase; }
  .qform .notes textarea { width: 100%; flex: 1; min-height: 0; border: 1px solid var(--line); border-radius: 4px; padding: 8px 10px; font-family: inherit; font-size: 13px; resize: none; outline: none; line-height: 1.5; }
  .qform .notes textarea:focus { border-color: var(--red); }
  .qform[dir="ltr"] .notes textarea { text-align: left; }

  .qform .totals { padding: 14px 22px; background: var(--soft); }
  .qform[dir="rtl"] .totals { border-right: 1px solid var(--line); }
  .qform[dir="ltr"] .totals { border-left: 1px solid var(--line); }
  .qform .totals .row { display: flex; justify-content: space-between; align-items: center; padding: 5px 0; font-size: 13px; border-bottom: 1px dashed #d1d5db; }
  .qform .totals .row:last-child { border-bottom: none; }
  .qform .totals .label { color: var(--muted); font-weight: 600; }
  .qform .totals .value { font-weight: 700; }
  .qform[dir="rtl"] .totals .value { font-family: 'Cairo', sans-serif; }
  .qform .totals input.disc { width: 60px; text-align: center; border: 1px solid var(--line); border-radius: 4px; padding: 3px 5px; font-family: inherit; font-size: 12px; outline: none; }
  .qform .totals input.disc.disc-amt { width: 100px; font-weight: 700; font-size: 13px; }
  .qform .totals input.disc:focus { border-color: var(--red); }
  .qform .totals .grand { background: var(--red); color: #fff; padding: 10px 12px; margin-top: 6px; border-radius: 4px; display: flex; justify-content: space-between; align-items: center; }
  .qform .totals .grand .label { color: #fff; font-weight: 700; font-size: 14px; }
  .qform .totals .grand .value { font-size: 17px; font-weight: 900; }
  .qform[dir="rtl"] .totals .grand .value { font-family: 'Cairo', sans-serif; }

  .qform .footer-sign { display: grid; grid-template-columns: 1fr 1fr; gap: 30px; padding: 18px 28px; border-top: 1px solid var(--line); }
  .qform .sign-box { text-align: center; font-size: 12px; }
  .qform .sign-box .line { border-top: 1px solid var(--ink); margin-top: 36px; padding-top: 4px; color: var(--muted); }
  .qform .sign-box .label { font-weight: 700; margin-bottom: 4px; }

  .qform .page-foot { background: var(--ink); color: #ddd; text-align: center; padding: 10px 14px; font-size: 11.5px; line-height: 1.7; }
  .qform .page-foot span.brand { color: var(--green); font-weight: 700; }
  .qform .page-foot .row1, .qform .page-foot .row2, .qform .page-foot .row-iban { display: block; }
  .qform .page-foot .row2 { margin-top: 2px; padding-top: 6px; border-top: 1px solid #333; color: #f0f0f0; }
  .qform .page-foot .ico { display: inline-block; margin: 0 4px; opacity: 0.85; }
  .qform .page-foot .sep { color: #555; margin: 0 6px; }
  .qform .page-foot .row-iban {
    margin-top: 6px;
    padding: 6px 10px;
    background: rgba(31, 157, 85, 0.12);
    border-top: 1px solid #333;
    color: #fff;
    font-size: 12px;
  }
  .qform .page-foot .row-iban .iban-label { color: #7dd3a8; font-weight: 700; margin: 0 6px; }
  .qform .page-foot .row-iban .iban-num { font-family: 'Inter', 'Courier New', monospace; font-weight: 700; letter-spacing: 1.5px; color: #fff; font-size: 13px; }
  .qform .page-foot .row-iban .bank-holder { color: #ddd; font-size: 11px; }

  /* Print */
  @page { margin: 10mm; size: A4; }
  @media print {
    body { background: #fff; padding: 0; }
    .page { box-shadow: none; max-width: 100%; }
    .table-actions, .btn-del { display: none !important; }
    table.items th.col-action, table.items td.action { display: none !important; }
    input, textarea { border: none !important; }
    .meta input { border-bottom: 1px solid #ccc !important; }
    .print-tip, .lightbox { display: none !important; }
    /* Image slot in print: clean borders, no placeholder, no remove button */
    .img-slot { border: 1px solid #ddd !important; background: #fff !important; cursor: default; transform: none !important; }
    .img-slot:hover { border-color: #ddd !important; background: #fff !important; transform: none !important; }
    .img-slot .placeholder, .img-slot .remove-img { display: none !important; }
    .img-slot:not(.has-img) { border: none !important; }
    /* Hide image column entirely in print when no images present */
    table.items.no-images th.col-img,
    table.items.no-images td.img-cell { display: none !important; }
    /* Hide discount % info row in print — customer only sees the discount amount */
    .disc-info-row { display: none !important; }
    /* Mold spec editors are for staff only; the customer's copy shows the
       composed spec label baked into the description cell instead. */
    .qform .qform-specs { display: none; }
    /* The "missing mold specs" banner is a staff-only nudge (Task 10 Step 3).
       Tailwind's own print:hidden utility isn't available inside the
       standalone print window (only this stylesheet is), so it is hidden
       here instead. */
    .qform .qform-warning { display: none; }
  }

  /* Print tip modal */
  .qform .print-tip-overlay {
    display: none;
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.55);
    z-index: 9999;
    align-items: center;
    justify-content: center;
    padding: 20px;
  }
  .qform .print-tip-overlay.show { display: flex; }
  .qform .print-tip {
    background: #fff;
    border-radius: 8px;
    max-width: 460px;
    width: 100%;
    padding: 22px 24px;
    box-shadow: 0 20px 60px rgba(0,0,0,0.3);
    border-top: 4px solid var(--red);
  }
  .qform .print-tip h4 { color: var(--red); font-size: 16px; margin-bottom: 10px; font-weight: 800; }
  .qform[dir="rtl"] .print-tip h4 { font-family: 'Cairo', sans-serif; }
  .qform .print-tip p { font-size: 13.5px; line-height: 1.7; color: #333; margin-bottom: 8px; }
  .qform .print-tip .step { background: var(--soft); padding: 8px 12px; border-radius: 4px; margin: 6px 0; font-size: 13px; }
  .qform .print-tip .step b { color: var(--red); }
  .qform .print-tip-actions { display: flex; gap: 8px; margin-top: 14px; justify-content: flex-end; }
  .qform .print-tip-actions .btn-go { background: var(--red); color: #fff; border: none; padding: 9px 18px; border-radius: 4px; font-family: inherit; font-weight: 700; cursor: pointer; font-size: 13px; }
  .qform .print-tip-actions .btn-go:hover { background: #a30d24; }
  .qform .print-tip-actions .btn-cancel { background: #fff; color: var(--ink); border: 1px solid var(--line); padding: 9px 18px; border-radius: 4px; font-family: inherit; font-weight: 700; cursor: pointer; font-size: 13px; }
  .qform .print-tip-actions .btn-cancel:hover { background: var(--soft); }

  /* hidden discount rows */
  .qform .disc-row.hidden { display: none !important; }

  @media (max-width: 720px) {
    .qform .meta { grid-template-columns: 1fr; padding: 12px; }
    .qform .client-box { grid-template-columns: 1fr; padding: 12px; }
    .qform .totals-wrap { grid-template-columns: 1fr; }
    .qform .totals { border-right: none !important; border-left: none !important; border-top: 1px solid var(--line); }
    .qform table.items thead th.col-desc { width: auto; }
    .qform .footer-sign { grid-template-columns: 1fr; }
  }
`;
