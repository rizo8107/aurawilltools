import { useState, useEffect } from 'react';
import { Printer, FileText, Loader } from 'lucide-react';

declare global {
  interface Window {
    JsBarcode: ((selector: string, options?: Record<string, unknown>) => { init: () => void }) | undefined;
  }
}

interface N8nOrderRecord {
  Id?: number;
  Date?: string;
  status?: string;
  "Order ID"?: string;
  Quanity?: string | number;
  Shipping?: string;
  Address?: string;
  "Phone number"?: string | number;
  Notes?: string | null;
  Agent?: string;
  "Order type"?: string;
  Source?: string | null;
  "First Sender"?: string | null;
  "Reason for Manual"?: string | null;
  "Followup details"?: string | null;
  "Order status"?: string;
  Tracking?: string | number | null;
}

 interface FailedOrder {
  orderId: string;
  reason: string;
 }

const formatDateDisplay = (raw: unknown): string => {
  if (!raw) return '-';
  const s = String(raw).trim();
  if (!s) return '-';
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split('-');
    return `${d}-${m}-${y}`;
  }
  if (/^\d{2}-\d{2}-\d{4}$/.test(s)) return s;
  const dt = new Date(s);
  if (!isNaN(dt.getTime())) return dt.toLocaleDateString('en-GB');
  return s;
};

type Mode = 'single' | 'bulk';

export default function N8nPrintSlip() {
  const [mode, setMode] = useState<Mode>('single');
  const [orderId, setOrderId] = useState('');
  const [bulkInput, setBulkInput] = useState('');
  const [dispatchDate, setDispatchDate] = useState('');
  const [courierPartner, setCourierPartner] = useState('');
  const [agentName, setAgentName] = useState('');
  const [rawJson, setRawJson] = useState('');
  const [records, setRecords] = useState<N8nOrderRecord[]>([]);
  const [output, setOutput] = useState('');
  const [error, setError] = useState('');
  const [failedOrders, setFailedOrders] = useState<FailedOrder[]>([]);
  const [loading, setLoading] = useState(false);

  // Load JsBarcode script once
  useEffect(() => {
    if (!document.querySelector('script[src*="jsbarcode"]')) {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js';
      script.async = true;
      document.body.appendChild(script);
    }
  }, []);

  // Initialize barcodes in preview whenever output changes
  useEffect(() => {
    if (output && window.JsBarcode) {
      setTimeout(() => {
        window.JsBarcode?.('.barcode', {
          width: 3,
          height: 100,
          fontSize: 16,
          margin: 5,
          displayValue: true,
          textMargin: 5,
        }).init();
      }, 100);
    }
  }, [output]);

  const parseBulkOrders = (text: string): string[] => {
    return text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
  };

  const handleParseJson = () => {
    setError('');
    setRecords([]);
    setOutput('');
    try {
      const parsed = JSON.parse(rawJson);
      if (!Array.isArray(parsed)) {
        setError('JSON must be an array of objects as returned by n8n');
        return;
      }
      setRecords(parsed as N8nOrderRecord[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to parse JSON');
    }
  };

  const generateSlipsFromRecords = (recordsToGenerate: N8nOrderRecord[]) => {
    let outputHtml = '';
    const fromAddress = `TSMC Creations India\n14/5 2nd Floor, Sri Saara Towers,\nBalasundaram Road, Paapanaickenpalayam,\nCoimbatore, TN - 641037\nPh: 8610554711`;

    recordsToGenerate.forEach((record, index) => {
      const orderId = record["Order ID"] ?? '';
      const qtyRaw = record.Quanity ?? 1;
      const qty = Number(qtyRaw) || 1;
      const shipping = record.Shipping ?? '';
      const address = record.Address ?? '';
      const phone = record["Phone number"] ?? '';
      const date = record.Date ?? record.status ?? '';
      const trackingRaw = record.Tracking;
      const tracking = trackingRaw != null ? String(trackingRaw) : '';

      const addressParts = address.split(',').map((s) => s.trim()).filter(Boolean);
      const customerName = addressParts[0] || '';
      const streetLines = addressParts.slice(1, -1);
      const cityState = addressParts[addressParts.length - 1] || '';
      const country = 'India';

      const singlePacketWeight = 450;
      const totalWeightGrams = qty * singlePacketWeight;
      const totalWeightKg = (totalWeightGrams / 1000).toFixed(2) + ' KG';

      const barcodeValue = tracking || String(orderId || index + 1);

      const html = `
        <div class="slip">
          <div class="slip-header">
            <div class="ship-to-label">SHIP TO:</div>
            <div class="address">
              ${customerName ? `<div class="to-name">${customerName}</div>` : ''}
              ${streetLines.length ? `<div>${streetLines.join(', ')}</div>` : ''}
              ${cityState ? `<div>${cityState}</div>` : ''}
              <div>${country}</div>
              ${phone ? `<div class="phone-highlight">Phone: ${phone}</div>` : ''}
            </div>
          </div>

          <div class="order-details">
            <div class="detail-row">
              <div class="detail-label">ORDER:</div>
              <div class="detail-value">${orderId}</div>
            </div>
            <div class="detail-row">
              <div class="detail-label">WEIGHT:</div>
              <div class="detail-value">${totalWeightKg}</div>
            </div>
            <div class="detail-row">
              <div class="detail-label">DATE:</div>
              <div class="detail-value">${formatDateDisplay(date)}</div>
            </div>
            <div class="detail-row">
              <div class="detail-label">SHIPPING:</div>
              <div class="detail-value">${shipping} | Qty: ${qty}</div>
            </div>
            ${tracking ? `
            <div class="detail-row">
              <div class="detail-label">TRACKING:</div>
              <div class="detail-value">${tracking}</div>
            </div>` : ''}
          </div>
          
          <div class="barcode-section">
            <div class="barcode-container">
              <svg class="barcode" jsbarcode-format="code128" jsbarcode-value="${barcodeValue}" jsbarcode-textmargin="5" jsbarcode-fontoptions="bold" jsbarcode-height="100" jsbarcode-width="3" jsbarcode-fontsize="16"></svg>
            </div>
          </div>
          
          <div class="from-section">
            <div class="from-label">FROM:</div>
            <img src="https://aurawill.in/cdn/shop/files/White-label.png?v=1741582343&width=200" class="logo" alt="Aurawill Logo" />
            <div class="from-address" style="font-size: 12px; line-height: 1.4;">${fromAddress}</div>
          </div>
        </div>
      `;
      outputHtml += html;
    });

    setOutput(outputHtml);
  };

  const handleGenerate = () => {
    if (!records.length) {
      setError('No records available. Fetch by Order ID or parse JSON first.');
      return;
    }
    setError('');
    generateSlipsFromRecords(records);
  };

  const handlePrint = () => {
    if (!output) {
      setError('No slips generated. Click Generate Slips first.');
      return;
    }
    setError('');
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <title>Courier Slip Generator (n8n)</title>
          <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js"></script>
          <style>
            @page {
              size: 4in 6in portrait;
              margin: 0;
            }
            body {
              font-family: Arial, sans-serif;
              margin: 0;
              padding: 0;
              background: white;
              width: 4in;
              height: 6in;
            }
            .slip {
              background: white;
              border: 2px solid #000;
              box-sizing: border-box;
              width: 4in;
              height: 6in;
              padding: 0;
              margin: 0;
              page-break-after: always;
              overflow: hidden;
              display: flex;
              flex-direction: column;
            }
            .slip-header {
              padding: 5px;
            }
            .ship-to-label {
              background: #000;
              color: white;
              padding: 3px 5px;
              font-weight: bold;
              font-size: 18px;
              display: inline-block;
            }
            .address {
              padding: 5px;
              font-size: 20px;
              line-height: 1.25;
              font-weight: 500;
            }
            .to-name {
              font-size: 30px;
              font-weight: 700;
              margin-bottom: 2px;
            }
            .order-details {
              border-top: 1px solid #000;
            }
            .detail-row {
              padding: 3px 5px;
              display: flex;
              border-bottom: 1px solid #ddd;
              font-size: 11px;
            }
            .detail-label {
              font-weight: bold;
              width: 30%;
              color: #555;
            }
            .detail-value {
              width: 70%;
            }
            .barcode-section {
              padding: 5px;
              text-align: center;
              border-top: 1px solid #000;
              border-bottom: 1px solid #000;
              margin: 3px 0;
              background-color: white;
            }
            .barcode-container {
              background-color: white;
              padding: 8px;
              display: inline-block;
              border: 1px solid #ddd;
            }
            .barcode {
              width: 95%;
              height: 60px;
              background-color: white;
              font-size: 24px;
            }
            .from-section {
              padding: 5px;
              border-top: 1px solid #000;
            }
            .from-label {
              font-weight: bold;
              font-size: 11px;
              color: #555;
              margin-bottom: 2px;
            }
            .logo {
              height: 30px;
              object-fit: contain;
              margin-bottom: 3px;
              display: block;
            }
            .from-address {
              font-size: 20px;
              line-height: 1.4;
            }
            .phone-highlight {
              background-color: #ffff00;
              padding: 1px 2px;
              font-weight: bold;
              font-size: 28px;
            }
            @media print {
              body {
                margin: 0;
                padding: 0;
              }
              .slip {
                margin: 0;
                border: 2px solid #000;
                width: 100%;
                height: 100%;
                box-sizing: border-box;
              }
              .detail-row, .barcode-section, .from-section {
                border-color: #000 !important;
              }
            }
          </style>
        </head>
        <body>
          <div id="output">${output}</div>
          <script>
            window.onload = function() {
              if (typeof JsBarcode === 'function') {
                JsBarcode(".barcode", {
                  width: 3,
                  height: 100,
                  fontSize: 16,
                  margin: 5,
                  displayValue: true,
                  textMargin: 5
                }).init();
              }
              setTimeout(function() {
                window.print();
              }, 500);
            };
          </script>
        </body>
        </html>
      `);
      printWindow.document.close();
    }
  };

  const fetchFromN8n = async (orders: string[]): Promise<{ records: N8nOrderRecord[]; failures: Record<string, string> }> => {
    const all: N8nOrderRecord[] = [];
    const failures: Record<string, string> = {};

    for (const raw of orders) {
      const trimmed = raw.trim();
      if (!trimmed) continue;

      try {
        const resp = await fetch('https://auto-n8n.9krcxo.easypanel.host/webhook/tpc', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            Order: trimmed,
            dispatch_date: dispatchDate || '',
            courier_partner: courierPartner || '',
            agent_name: agentName || '',
          }),
        });

        if (!resp.ok) {
          const txt = await resp.text();
          failures[trimmed] = `Webhook failed (${resp.status}): ${txt || 'No response body'}`;
          continue;
        }

        const text = await resp.text();
        try {
          const data = JSON.parse(text);
          if (Array.isArray(data)) {
            all.push(...(data as N8nOrderRecord[]));
          } else if (data && typeof data === 'object') {
            all.push(data as N8nOrderRecord);
          } else {
            failures[trimmed] = 'Unexpected response from n8n (not an object/array)';
          }
        } catch (e) {
          failures[trimmed] = `Invalid JSON: ${e instanceof Error ? e.message : 'Unknown parse error'}`;
          continue;
        }
      } catch (e) {
        failures[trimmed] = e instanceof Error ? e.message : 'Unknown fetch error';
        continue;
      }
    }

    return { records: all, failures };
  };

  const handleFetchAndGenerate = async () => {
    setError('');
    setRecords([]);
    setOutput('');
    setFailedOrders([]);

    const orders =
      mode === 'single'
        ? [orderId]
        : parseBulkOrders(bulkInput);

    if (!orders.length || orders.every((o) => !o.trim())) {
      setError('Please enter at least one Order ID');
      return;
    }

    try {
      setLoading(true);
      const { records: fetched, failures: initialFailures } = await fetchFromN8n(orders);
      
      // Filter out empty/invalid records (no Order ID or no Tracking)
      const validRecords = fetched.filter(
        (r) => r["Order ID"] && r.Tracking
      );

      // Find which input orders didn't get a valid record
      const validOrderIds = new Set(
        validRecords.map((r) => String(r["Order ID"]).trim())
      );

      const mergedFailures: Record<string, string> = { ...initialFailures };
      for (const o of orders.map((x) => x.trim()).filter(Boolean)) {
        if (!validOrderIds.has(o) && !mergedFailures[o]) {
          mergedFailures[o] = 'No valid Tracking returned';
        }
      }

      setFailedOrders(
        Object.entries(mergedFailures).map(([oid, reason]) => ({ orderId: oid, reason }))
      );

      if (!validRecords.length) {
        setError('No valid records with Tracking found for any of the given Order ID(s).');
        return;
      }

      setRecords(validRecords);
      generateSlipsFromRecords(validRecords);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to fetch records from n8n');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl shadow-lg p-6 md:p-8">
        <h2 className="text-xl font-semibold mb-4 text-gray-900 flex items-center gap-2">
          <Printer className="w-5 h-5" />
          N8n Print Slip (Tracking-based)
        </h2>
        <p className="text-sm text-gray-600 mb-4 flex items-center gap-2">
          <FileText className="w-4 h-4" />
          Enter one or more Order IDs, plus optional dispatch details, and this page will call the n8n webhook to fetch details and generate slips.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <label className="block text-sm font-medium text-gray-700">
            Dispatch Date
            <input
              type="date"
              value={dispatchDate}
              onChange={(e) => setDispatchDate(e.target.value)}
              className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </label>
          <label className="block text-sm font-medium text-gray-700">
            Courier Partner
            <input
              type="text"
              value={courierPartner}
              onChange={(e) => setCourierPartner(e.target.value)}
              placeholder="e.g. Indiapost, Stcourier"
              className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </label>
          <label className="block text-sm font-medium text-gray-700">
            Agent Name
            <input
              type="text"
              value={agentName}
              onChange={(e) => setAgentName(e.target.value)}
              placeholder="e.g. Akash"
              className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </label>
        </div>

        <div className="mb-4 inline-flex rounded-lg overflow-hidden border border-gray-200">
          <button
            type="button"
            className={`px-4 py-2 text-sm font-medium ${
              mode === 'single' ? 'bg-indigo-600 text-white' : 'bg-white text-gray-700'
            }`}
            onClick={() => setMode('single')}
          >
            Single
          </button>
          <button
            type="button"
            className={`px-4 py-2 text-sm font-medium border-l border-gray-200 ${
              mode === 'bulk' ? 'bg-indigo-600 text-white' : 'bg-white text-gray-700'
            }`}
            onClick={() => setMode('bulk')}
          >
            Bulk
          </button>
        </div>

        {mode === 'single' && (
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Order ID</label>
            <input
              type="text"
              value={orderId}
              onChange={(e) => setOrderId(e.target.value)}
              placeholder="Enter Order ID"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        )}

        {mode === 'bulk' && (
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Order IDs (one per line)</label>
            <textarea
              value={bulkInput}
              onChange={(e) => setBulkInput(e.target.value)}
              rows={5}
              placeholder="43556\n43557\n43558"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg font-mono text-xs focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <p className="text-xs text-gray-500 mt-1">Paste from Excel/Sheets, one order per line.</p>
          </div>
        )}

        {error && (
          <div className="mb-3 rounded border border-red-200 bg-red-50 text-red-700 px-4 py-2 text-sm">
            {error}
          </div>
        )}

        {failedOrders.length > 0 && (
          <div className="mb-3 rounded border border-orange-200 bg-orange-50 text-orange-800 px-4 py-2 text-sm">
            <p className="font-semibold mb-1">⚠️ The following Order ID(s) had no valid Tracking and were skipped:</p>
            <ul className="list-disc list-inside">
              {failedOrders.map((o) => (
                <li key={o.orderId} className="font-mono">
                  {o.orderId}{o.reason ? ` — ${o.reason}` : ''}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex flex-wrap gap-3 items-center mb-3">
          <button
            onClick={handleFetchAndGenerate}
            disabled={loading}
            className="inline-flex items-center px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <Loader className="w-4 h-4 mr-2 animate-spin" />
                Fetching from n8n...
              </>
            ) : (
              'Fetch & Generate Slips'
            )}
          </button>
          <button
            onClick={handleGenerate}
            disabled={!records.length}
            className="inline-flex items-center px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Generate Slips ({records.length})
          </button>
          <button
            onClick={handlePrint}
            disabled={!output}
            className="inline-flex items-center px-4 py-2 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Printer className="w-4 h-4 mr-1" />
            Print
          </button>
        </div>

        <div className="text-xs text-gray-500 mb-4">
          Records loaded: <span className="font-semibold">{records.length}</span>
        </div>

        <div className="mt-4 border-t pt-4">
          <p className="text-xs font-semibold text-gray-700 mb-1 flex items-center gap-1">
            <FileText className="w-3 h-3" /> Advanced: Paste raw n8n JSON (optional)
          </p>
          <textarea
            value={rawJson}
            onChange={(e) => setRawJson(e.target.value)}
            rows={6}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg font-mono text-xs focus:ring-2 focus:ring-blue-500 focus:border-transparent mb-2"
            placeholder='[
  {
    "Order ID": "43556",
    "Quanity": "4",
    "Address": "...",
    "Phone number": "8056000312",
    "Tracking": 90471106,
    "Date": "2025-11-13",
    "Shipping": "Professional",
    "Agent": "Akash",
    "Id": 6156
  }
]'
          />
          <button
            onClick={handleParseJson}
            className="inline-flex items-center px-3 py-1 rounded-lg bg-gray-200 text-gray-800 text-xs font-medium hover:bg-gray-300 focus:outline-none focus:ring-1 focus:ring-offset-1 focus:ring-gray-400"
          >
            Parse JSON into records
          </button>
        </div>
      </div>

      {output && (
        <div className="bg-white rounded-2xl shadow-lg p-6 md:p-8">
          <h3 className="text-lg font-semibold mb-4 text-gray-900">Preview</h3>
          <div
            className="preview-container overflow-auto border border-gray-200 rounded-lg p-4"
            dangerouslySetInnerHTML={{ __html: output }}
          />
        </div>
      )}
    </div>
  );
}
