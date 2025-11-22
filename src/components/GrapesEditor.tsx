import { useCallback, useEffect, useRef, useState } from 'react';
import grapesjs, { Editor } from 'grapesjs';
import 'grapesjs/dist/css/grapes.min.css';

type PageKey = keyof typeof PAGE_LIBRARY;

const STORAGE_PREFIX = 'grapes_editor_page_';

const PAGE_LIBRARY = {
  order: {
    label: 'Order Form',
    html: `
      <section class="section">
        <header class="hero">
          <h1>Manual Order Form</h1>
          <p>Collect customer information, shipping preferences, and payment details.</p>
        </header>
        <div class="grid">
          <div>
            <h3>Customer</h3>
            <ul>
              <li>Name / Phone</li>
              <li>Address / Pincode</li>
              <li>Notes</li>
            </ul>
          </div>
          <div>
            <h3>Logistics</h3>
            <ul>
              <li>Quantity</li>
              <li>Shipping Partner</li>
              <li>Tracking Code</li>
            </ul>
          </div>
        </div>
      </section>
    `,
  },
  printslip: {
    label: 'Print Slip',
    html: `
      <section class="section">
        <header class="hero">
          <h1>Courier Slip Template</h1>
          <p>Design how the 4x6 slip looks before printing.</p>
        </header>
        <div class="grid">
          <div>
            <h3>Ship To</h3>
            <p>Customer name, address, phone</p>
          </div>
          <div>
            <h3>Order Meta</h3>
            <p>Order ID, Qty, Shipping Method, Tracking, Barcode</p>
          </div>
        </div>
      </section>
    `,
  },
  manual_orders: {
    label: 'Manual Orders Dashboard',
    html: `
      <section class="section">
        <header class="hero">
          <h1>Manual Orders Dashboard</h1>
          <p>Describe KPI cards, filters, and table columns shown in the React dashboard.</p>
        </header>
        <div class="grid">
          <div>
            <h3>Status Cards</h3>
            <p>Counts for New, Packed, Dispatched, Delivered, RTO...</p>
          </div>
          <div>
            <h3>Filters</h3>
            <p>Agents, Partners, Date range, Duplicates, etc.</p>
          </div>
        </div>
      </section>
    `,
  },
  teams: {
    label: 'Teams Page',
    html: `
      <section class="section">
        <header class="hero">
          <h1>Teams & Allocation</h1>
          <p>Explain how teams, agents, and allocation rules are managed.</p>
        </header>
        <div class="grid">
          <div>
            <h3>Team Roster</h3>
            <p>Cards with avatars and responsibilities.</p>
          </div>
          <div>
            <h3>Rules</h3>
            <p>Percent split, service region, SLAs.</p>
          </div>
        </div>
      </section>
    `,
  },
} as const;

const PAGE_KEYS = Object.keys(PAGE_LIBRARY) as PageKey[];

const canvasStyles = [
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap',
  `data:text/css,body{font-family:'Inter',sans-serif;padding:24px;background:#f5f5f5;} .section{background:#fff;border-radius:16px;padding:24px;box-shadow:0 10px 30px rgba(15,23,42,0.08);} .hero h1{margin-bottom:6px;font-size:28px;} .hero p{color:#64748b;} .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px;margin-top:24px;} .grid h3{margin-bottom:8px;font-size:15px;}`,
];

export default function GrapesEditor() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<Editor | null>(null);
  const [activePage, setActivePage] = useState<PageKey>('order');
  const [status, setStatus] = useState<string>('');
  const [draftVersion, setDraftVersion] = useState(0);

  const ensureEditor = useCallback(() => {
    if (!containerRef.current) return null;
    if (editorRef.current) return editorRef.current;
    const editor = grapesjs.init({
      container: containerRef.current,
      height: '75vh',
      width: '100%',
      storageManager: false,
      selectorManager: { componentFirst: true },
      canvas: { styles: canvasStyles },
    });
    editor.setComponents(PAGE_LIBRARY[activePage].html);
    editorRef.current = editor;
    return editor;
  }, [activePage]);

  useEffect(() => {
    ensureEditor();
    return () => {
      if (editorRef.current) {
        editorRef.current.destroy();
        editorRef.current = null;
      }
    };
  }, [ensureEditor]);

  useEffect(() => {
    const editor = ensureEditor();
    if (!editor) return;
    editor.setComponents(PAGE_LIBRARY[activePage].html);
    editor.setStyle('');
    setStatus(`${PAGE_LIBRARY[activePage].label} template ready.`);
  }, [activePage, ensureEditor]);

  const loadSavedDraft = useCallback(() => {
    const editor = ensureEditor();
    if (!editor) return;
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${activePage}`);
    if (!raw) {
      setStatus('No saved draft for this page yet.');
      return;
    }
    try {
      const parsed = JSON.parse(raw) as { html: string; css: string };
      editor.setComponents(parsed.html || '');
      editor.setStyle(parsed.css || '');
      setStatus('Saved draft loaded.');
    } catch (error) {
      console.error(error);
      setStatus('Failed to load saved draft (corrupt data).');
    }
  }, [activePage, ensureEditor]);

  const saveDraft = useCallback(() => {
    const editor = ensureEditor();
    if (!editor) return;
    const payload = { html: editor.getHtml(), css: editor.getCss() };
    localStorage.setItem(`${STORAGE_PREFIX}${activePage}`, JSON.stringify(payload));
    setDraftVersion((v) => v + 1);
    setStatus('Draft saved to this browser.');
  }, [activePage, ensureEditor]);

  const exportMarkup = useCallback(async () => {
    const editor = ensureEditor();
    if (!editor) return;
    const bundle = `<!-- HTML -->\n${editor.getHtml()}\n\n<!-- CSS -->\n<style>${editor.getCss()}</style>`;
    try {
      await navigator.clipboard.writeText(bundle);
      setStatus('Copied HTML + CSS to clipboard.');
    } catch {
      setStatus('Copy failed. Select and copy manually.');
    }
  }, [ensureEditor]);

  const hasDraft = typeof window !== 'undefined' && !!localStorage.getItem(`${STORAGE_PREFIX}${activePage}`);

  return (
    <div className="space-y-4">
      <div className="bg-white ring-1 ring-slate-200 rounded-2xl p-4 flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-sm font-medium text-slate-700">Page</label>
          <select value={activePage} onChange={(e) => setActivePage(e.target.value as PageKey)} className="ring-1 ring-slate-200 rounded-lg px-3 py-2 text-sm">
            {PAGE_KEYS.map((key) => (
              <option key={key} value={key}>
                {PAGE_LIBRARY[key].label}
              </option>
            ))}
          </select>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => ensureEditor() && saveDraft()} className="hidden" aria-hidden />
            <button onClick={() => ensureEditor() && (editorRef.current?.setComponents(PAGE_LIBRARY[activePage].html), editorRef.current?.setStyle(''), setStatus(`${PAGE_LIBRARY[activePage].label} template loaded.`))} className="px-3 py-1.5 rounded-lg text-sm ring-1 ring-slate-200 hover:bg-slate-50">
              Load Template
            </button>
            <button onClick={loadSavedDraft} className="px-3 py-1.5 rounded-lg text-sm ring-1 ring-slate-200 hover:bg-slate-50" disabled={!hasDraft || !draftVersion && !hasDraft}>
              {hasDraft ? 'Load Saved' : 'No Save'}
            </button>
            <button onClick={saveDraft} className="px-3 py-1.5 rounded-lg text-sm bg-slate-900 text-white hover:bg-slate-800">
              Save Draft
            </button>
            <button onClick={exportMarkup} className="px-3 py-1.5 rounded-lg text-sm ring-1 ring-slate-200 hover:bg-slate-50">
              Copy HTML/CSS
            </button>
          </div>
        </div>
        {status && <p className="text-xs text-slate-500">{status}</p>}
        <p className="text-xs text-slate-500">Use GrapesJS to visually change layout. Drafts stay in this browser's localStorage.</p>
      </div>
      <div className="bg-white ring-1 ring-slate-200 rounded-2xl overflow-hidden">
        <div ref={containerRef} />
      </div>
    </div>
  );
}
