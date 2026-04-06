const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const fs = require('fs');
const path = require('path');

// Brand colors (RGB 0-1)
const CRIMSON = rgb(187 / 255, 35 / 255, 25 / 255);
const GOLD    = rgb(201 / 255, 168 / 255, 76 / 255);
const DARK    = rgb(20 / 255, 16 / 255, 8 / 255);
const STEEL   = rgb(107 / 255, 114 / 255, 128 / 255);
const WHITE   = rgb(1, 1, 1);
const LIGHT   = rgb(0.96, 0.94, 0.91);

const LOGO_PATH = path.join(__dirname, '../assets/logo.png');
const PAGE_W = 612;   // US Letter
const PAGE_H = 792;
const MARGIN = 48;

// ── helpers ──────────────────────────────────────────────────────────────────

// Helvetica (Standard PDF font) only supports Windows-1252 / Latin-1.
// Strip any character outside that range to avoid pdf-lib throwing.
function sanitize(str) {
  if (!str) return '';
  return String(str).replace(/[^\x00-\xFF]/g, '?')
    // common Unicode → Latin equivalents
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/[^\x00-\xFF]/g, '?');
}

function drawRect(page, x, y, w, h, color) {
  page.drawRectangle({ x, y, width: w, height: h, color });
}

function text(page, font, str, x, y, size, color = DARK) {
  try {
    const safe = sanitize(str);
    if (!safe) return;
    page.drawText(safe, { x, y, size, font, color });
  } catch { /* skip unsupported glyphs */ }
}

function money(amount, currency = 'USD') {
  if (amount == null) return '—';
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);
  } catch {
    return `${currency} ${Number(amount).toFixed(2)}`;
  }
}

function shortDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

// Wrap text to max width, returns array of lines
function wrapText(font, str, size, maxWidth) {
  if (!str) return [];
  const words = sanitize(str).split(' ');
  const lines = [];
  let current = '';
  for (const w of words) {
    const test = current ? `${current} ${w}` : w;
    if (font.widthOfTextAtSize(test, size) > maxWidth && current) {
      lines.push(current);
      current = w;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  return lines;
}

// Draw wrapped text, returns new Y
function drawWrapped(page, font, str, x, y, size, maxWidth, lineHeight, color = DARK) {
  const lines = wrapText(font, str, size, maxWidth);
  let cy = y;
  for (const l of lines) {
    text(page, font, l, x, cy, size, color);
    cy -= lineHeight;
  }
  return cy;
}

// ── Header (logo + company info) ──────────────────────────────────────────────

async function drawHeader(pdfDoc, page, regular, bold, org) {
  // Dark header bar
  drawRect(page, 0, PAGE_H - 90, PAGE_W, 90, DARK);

  // Logo
  try {
    const logoBytes = fs.readFileSync(LOGO_PATH);
    const logoImage = await pdfDoc.embedPng(logoBytes);
    const logoDims = logoImage.scale(0.18);
    page.drawImage(logoImage, {
      x: MARGIN,
      y: PAGE_H - 90 + (90 - logoDims.height) / 2,
      width: logoDims.width,
      height: logoDims.height,
    });
  } catch {
    // fallback text if logo unavailable
    text(page, bold, 'AIS', MARGIN, PAGE_H - 56, 22, GOLD);
  }

  // Company name right side
  const companyName = org?.companyName || 'Aircraft Interiors Solutions';
  const cw = bold.widthOfTextAtSize(companyName, 11);
  text(page, bold, companyName, PAGE_W - MARGIN - cw, PAGE_H - 38, 11, WHITE);

  const sub = [org?.phone, org?.email].filter(Boolean).join('  |  ');
  if (sub) {
    const sw = regular.widthOfTextAtSize(sub, 8);
    text(page, regular, sub, PAGE_W - MARGIN - sw, PAGE_H - 54, 8, rgb(0.7, 0.7, 0.7));
  }
  if (org?.address) {
    const aw = regular.widthOfTextAtSize(org.address, 8);
    text(page, regular, org.address, PAGE_W - MARGIN - aw, PAGE_H - 66, 8, rgb(0.7, 0.7, 0.7));
  }

  // Gold accent line below header
  drawRect(page, 0, PAGE_H - 92, PAGE_W, 2, GOLD);
}

// ── Section heading ───────────────────────────────────────────────────────────

function drawSectionHeading(page, font, label, y) {
  drawRect(page, MARGIN, y - 2, PAGE_W - MARGIN * 2, 18, LIGHT);
  drawRect(page, MARGIN, y - 2, 3, 18, CRIMSON);
  text(page, font, label.toUpperCase(), MARGIN + 10, y + 3, 8, STEEL);
  return y - 26;
}

// ── Line items table ──────────────────────────────────────────────────────────

function drawLineItems(page, regular, bold, items, startY, currency) {
  const cols = { desc: MARGIN, qty: 340, unit: 420, total: 505 };
  let y = startY;

  // Table header
  drawRect(page, MARGIN, y - 2, PAGE_W - MARGIN * 2, 18, DARK);
  text(page, bold, 'DESCRIPTION', cols.desc + 6, y + 3, 8, WHITE);
  text(page, bold, 'QTY', cols.qty, y + 3, 8, WHITE);
  text(page, bold, 'UNIT PRICE', cols.unit, y + 3, 8, WHITE);
  text(page, bold, 'TOTAL', cols.total, y + 3, 8, WHITE);
  y -= 22;

  // Rows
  let rowAlt = false;
  for (const item of items) {
    const rowH = 20;
    if (rowAlt) drawRect(page, MARGIN, y - 4, PAGE_W - MARGIN * 2, rowH, LIGHT);
    text(page, regular, item.description || item.service || '', cols.desc + 6, y + 4, 9, DARK);
    text(page, regular, String(item.qty ?? 1), cols.qty, y + 4, 9, DARK);
    text(page, regular, money(item.unitPrice, currency), cols.unit, y + 4, 9, DARK);
    text(page, regular, money(item.total ?? (item.qty * item.unitPrice), currency), cols.total, y + 4, 9, DARK);
    y -= rowH;
    rowAlt = !rowAlt;
  }

  // Bottom border
  drawRect(page, MARGIN, y, PAGE_W - MARGIN * 2, 1, GOLD);
  return y - 8;
}

// ── Totals block ──────────────────────────────────────────────────────────────

function drawTotals(page, regular, bold, q, currency, y) {
  const lx = PAGE_W - MARGIN - 200;
  const vx = PAGE_W - MARGIN - 5;
  const row = (label, value, isBold = false, color = DARK) => {
    const f = isBold ? bold : regular;
    text(page, regular, label, lx, y, 9.5, STEEL);
    const vw = f.widthOfTextAtSize(String(value), 9.5);
    text(page, f, String(value), vx - vw, y, 9.5, color);
    y -= 16;
  };

  if (q.subtotal != null) row('Subtotal', money(q.subtotal, currency));
  if (q.discount) row('Discount', `– ${money(q.discount, currency)}`);
  if (q.taxRate) row(`Tax (${q.taxRate}%)`, money(q.taxAmount, currency));

  // Total box
  y -= 4;
  drawRect(page, lx - 8, y - 4, PAGE_W - MARGIN - lx + 8, 22, CRIMSON);
  const totalLabel = 'TOTAL';
  text(page, bold, totalLabel, lx, y + 4, 11, WHITE);
  const totalStr = money(q.total, currency);
  const tw = bold.widthOfTextAtSize(totalStr, 11);
  text(page, bold, totalStr, vx - tw, y + 4, 11, WHITE);
  y -= 30;

  if (q.amountPaid) {
    row('Amount Paid', money(q.amountPaid, currency));
    const balance = (q.total || 0) - (q.amountPaid || 0);
    drawRect(page, lx - 8, y - 4, PAGE_W - MARGIN - lx + 8, 20, DARK);
    text(page, bold, 'BALANCE DUE', lx, y + 3, 10, GOLD);
    const bw = bold.widthOfTextAtSize(money(balance, currency), 10);
    text(page, bold, money(balance, currency), vx - bw, y + 3, 10, GOLD);
    y -= 28;
  }

  return y;
}

// ── Footer ────────────────────────────────────────────────────────────────────

function drawFooter(page, regular, docType, docNumber) {
  drawRect(page, 0, 0, PAGE_W, 34, DARK);
  drawRect(page, 0, 34, PAGE_W, 1, GOLD);
  text(page, regular, `Aircraft Interiors Solutions  —  ${docType} ${docNumber || ''}`, MARGIN, 12, 8, rgb(0.6, 0.6, 0.6));
  const genStr = `Generated ${shortDate(new Date())}`;
  const gw = regular.widthOfTextAtSize(genStr, 8);
  text(page, regular, genStr, PAGE_W - MARGIN - gw, 12, 8, rgb(0.6, 0.6, 0.6));
}

// ══════════════════════════════════════════════════════════════════════════════
// QUOTE PDF
// ══════════════════════════════════════════════════════════════════════════════

async function generateQuotePdf(quote, org) {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([PAGE_W, PAGE_H]);
  const regular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold    = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  await drawHeader(pdfDoc, page, regular, bold, org);

  let y = PAGE_H - 110;

  // ── Document title ─────────────────────────────────────────────────────────
  text(page, bold, 'ESTIMATE / QUOTE', MARGIN, y, 18, CRIMSON);
  y -= 6;
  drawRect(page, MARGIN, y, 160, 1.5, GOLD);
  y -= 16;

  // ── Quote meta (two columns) ───────────────────────────────────────────────
  const metaRight = 380;
  const col2 = metaRight + 130;

  const metaL = [
    ['Quote #', quote.quoteNumber || '—'],
    ['Date',    shortDate(quote.date)],
    ['Valid Until', shortDate(quote.validUntil)],
  ];
  const metaR = [
    ['Status',   (quote.status || 'draft').toUpperCase()],
    ['Currency', quote.currency || 'USD'],
    ['Payment Terms', quote.paymentTerms || '—'],
  ];

  const startMetaY = y;
  for (const [label, val] of metaL) {
    text(page, regular, label + ':', MARGIN, y, 9, STEEL);
    text(page, bold, val, MARGIN + 90, y, 9, DARK);
    y -= 14;
  }
  y = startMetaY;
  for (const [label, val] of metaR) {
    text(page, regular, label + ':', metaRight, y, 9, STEEL);
    text(page, bold, val, metaRight + 90, y, 9, DARK);
    y -= 14;
  }
  y -= 14;

  // ── Client ─────────────────────────────────────────────────────────────────
  y = drawSectionHeading(page, regular, 'Bill To', y);
  const client = quote.client || {};
  text(page, bold,    client.name    || '—',  MARGIN, y, 10, DARK); y -= 14;
  if (client.company) { text(page, regular, client.company, MARGIN, y, 9, STEEL); y -= 13; }
  const addrParts = [client.address, [client.city, client.state, client.zip].filter(Boolean).join(', ')].filter(Boolean);
  for (const p of addrParts) { text(page, regular, p, MARGIN, y, 9, STEEL); y -= 13; }
  if (client.email) { text(page, regular, client.email, MARGIN, y, 9, STEEL); y -= 13; }
  if (client.phone) { text(page, regular, client.phone, MARGIN, y, 9, STEEL); y -= 13; }
  y -= 8;

  // ── Aircraft ───────────────────────────────────────────────────────────────
  if (quote.aircraftMake || quote.tailNumber) {
    y = drawSectionHeading(page, regular, 'Aircraft', y);
    const acStr = [
      quote.aircraftYear, quote.aircraftMake, quote.aircraftModel
    ].filter(Boolean).join(' ');
    if (acStr) { text(page, bold, acStr, MARGIN, y, 10, DARK); y -= 14; }
    if (quote.tailNumber) { text(page, regular, `Tail #: ${quote.tailNumber}`, MARGIN, y, 9, STEEL); y -= 13; }
    if (quote.location)   { text(page, regular, `Location: ${quote.location}`, MARGIN, y, 9, STEEL); y -= 13; }
    y -= 8;
  }

  // ── Project description ────────────────────────────────────────────────────
  if (quote.description) {
    y = drawSectionHeading(page, regular, 'Project Description', y);
    y = drawWrapped(page, regular, quote.description, MARGIN, y, 9, PAGE_W - MARGIN * 2, 14, DARK);
    y -= 12;
  }

  // ── Line items ─────────────────────────────────────────────────────────────
  let items = [];
  try { items = JSON.parse(quote.lineItems || '[]'); } catch {}
  if (items.length > 0) {
    y = drawSectionHeading(page, regular, 'Scope of Work', y);
    y = drawLineItems(page, regular, bold, items, y, quote.currency);
    y -= 8;
  }

  // ── Totals ─────────────────────────────────────────────────────────────────
  if (quote.total != null || quote.subtotal != null) {
    y = drawTotals(page, regular, bold, quote, quote.currency || 'USD', y);
    y -= 8;
  }

  // ── Timeline ───────────────────────────────────────────────────────────────
  if (quote.estimatedStart || quote.estimatedEnd) {
    y = drawSectionHeading(page, regular, 'Project Timeline', y);
    if (quote.estimatedStart) { text(page, regular, `Start: ${shortDate(quote.estimatedStart)}`, MARGIN, y, 9, DARK); y -= 13; }
    if (quote.estimatedEnd)   { text(page, regular, `Completion: ${shortDate(quote.estimatedEnd)}`, MARGIN, y, 9, DARK); y -= 13; }
    if (quote.depositRequired) { text(page, regular, `Deposit Required: ${money(quote.depositRequired, quote.currency)}`, MARGIN, y, 9, DARK); y -= 13; }
    y -= 8;
  }

  // ── Notes ─────────────────────────────────────────────────────────────────
  if (quote.notes) {
    y = drawSectionHeading(page, regular, 'Notes', y);
    y = drawWrapped(page, regular, quote.notes, MARGIN, y, 9, PAGE_W - MARGIN * 2, 14, STEEL);
    y -= 8;
  }

  // ── Terms ─────────────────────────────────────────────────────────────────
  const terms = quote.terms || 'This quote is valid for 30 days from the date issued. All work subject to inspection and approval. Prices may change based on final scope.';
  y = drawSectionHeading(page, regular, 'Terms & Conditions', y);
  drawWrapped(page, regular, terms, MARGIN, y, 8, PAGE_W - MARGIN * 2, 12, STEEL);

  drawFooter(page, regular, 'Quote', quote.quoteNumber);

  return pdfDoc.save();
}

// ══════════════════════════════════════════════════════════════════════════════
// INVOICE PDF
// ══════════════════════════════════════════════════════════════════════════════

async function generateInvoicePdf(invoice, org) {
  const pdfDoc = await PDFDocument.create();
  const page   = pdfDoc.addPage([PAGE_W, PAGE_H]);
  const regular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold    = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  await drawHeader(pdfDoc, page, regular, bold, org);

  let y = PAGE_H - 110;

  // ── Document title ─────────────────────────────────────────────────────────
  text(page, bold, 'INVOICE', MARGIN, y, 22, CRIMSON);
  y -= 6;
  drawRect(page, MARGIN, y, 80, 1.5, GOLD);
  y -= 16;

  // ── Invoice meta ───────────────────────────────────────────────────────────
  const metaRight = 380;
  const metaL = [
    ['Invoice #',   invoice.invoiceNumber || '—'],
    ['Issue Date',  shortDate(invoice.issueDate)],
    ['Due Date',    shortDate(invoice.dueDate)],
  ];
  const metaR = [
    ['Status',        (invoice.status || 'draft').toUpperCase()],
    ['Payment Terms', invoice.paymentTerms || '—'],
    ...(invoice.poNumber ? [['PO Number', invoice.poNumber]] : []),
  ];

  const startMetaY = y;
  for (const [label, val] of metaL) {
    text(page, regular, label + ':', MARGIN, y, 9, STEEL);
    text(page, bold, val, MARGIN + 90, y, 9, val === 'PAID' ? rgb(0.2, 0.7, 0.2) : DARK);
    y -= 14;
  }
  y = startMetaY;
  for (const [label, val] of metaR) {
    text(page, regular, label + ':', metaRight, y, 9, STEEL);
    text(page, bold, val, metaRight + 100, y, 9, DARK);
    y -= 14;
  }
  y -= 14;

  // ── Bill To ────────────────────────────────────────────────────────────────
  y = drawSectionHeading(page, regular, 'Bill To', y);
  text(page, bold,    invoice.billToName    || '—', MARGIN, y, 10, DARK); y -= 14;
  if (invoice.billToCompany) { text(page, regular, invoice.billToCompany, MARGIN, y, 9, STEEL); y -= 13; }
  if (invoice.billToAddress) { text(page, regular, invoice.billToAddress, MARGIN, y, 9, STEEL); y -= 13; }
  const cityLine = [invoice.billToCity, invoice.billToState, invoice.billToZip].filter(Boolean).join(', ');
  if (cityLine) { text(page, regular, cityLine, MARGIN, y, 9, STEEL); y -= 13; }
  if (invoice.billToEmail) { text(page, regular, invoice.billToEmail, MARGIN, y, 9, STEEL); y -= 13; }
  if (invoice.billToPhone) { text(page, regular, invoice.billToPhone, MARGIN, y, 9, STEEL); y -= 13; }
  y -= 8;

  // ── Quote reference ────────────────────────────────────────────────────────
  if (invoice.quote) {
    y = drawSectionHeading(page, regular, 'Quote Reference', y);
    text(page, regular, `Quote #${invoice.quote.quoteNumber || invoice.quoteId} — ${invoice.quote.title || ''}`, MARGIN, y, 9, STEEL);
    y -= 20;
  }

  // ── Line items ─────────────────────────────────────────────────────────────
  let items = [];
  try { items = JSON.parse(invoice.lineItems || '[]'); } catch {}
  if (items.length > 0) {
    y = drawSectionHeading(page, regular, 'Services & Materials', y);
    y = drawLineItems(page, regular, bold, items, y, invoice.currency);
    y -= 8;
  }

  // ── Totals ─────────────────────────────────────────────────────────────────
  y = drawTotals(page, regular, bold, invoice, invoice.currency || 'USD', y);
  y -= 16;

  // ── Payment info ───────────────────────────────────────────────────────────
  if (invoice.paymentMethod || invoice.paymentNotes) {
    y = drawSectionHeading(page, regular, 'Payment Information', y);
    if (invoice.paymentMethod) { text(page, bold, `Method: ${invoice.paymentMethod}`, MARGIN, y, 9, DARK); y -= 13; }
    if (invoice.paymentNotes)  { y = drawWrapped(page, regular, invoice.paymentNotes, MARGIN, y, 9, PAGE_W - MARGIN * 2, 13, STEEL); }
    y -= 8;
  }

  // ── Notes ──────────────────────────────────────────────────────────────────
  if (invoice.notes) {
    y = drawSectionHeading(page, regular, 'Notes', y);
    y = drawWrapped(page, regular, invoice.notes, MARGIN, y, 9, PAGE_W - MARGIN * 2, 14, STEEL);
    y -= 8;
  }

  // ── Terms ──────────────────────────────────────────────────────────────────
  const terms = invoice.terms || 'Payment is due by the date specified above. Late payments may incur a 1.5% monthly finance charge. All work performed by Aircraft Interiors Solutions is subject to our standard warranty terms.';
  y = drawSectionHeading(page, regular, 'Terms & Conditions', y);
  drawWrapped(page, regular, terms, MARGIN, y, 8, PAGE_W - MARGIN * 2, 12, STEEL);

  drawFooter(page, regular, 'Invoice', invoice.invoiceNumber);

  return pdfDoc.save();
}

module.exports = { generateQuotePdf, generateInvoicePdf };
