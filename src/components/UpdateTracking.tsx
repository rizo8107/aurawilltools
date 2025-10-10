import { useState } from 'react';
import React from 'react';
import { CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { updateOrderTracking } from '../services/orderService';

interface TrackingEntry {
  orderNumber: string;
  trackingCode: string;
  timestamp: string;
  phoneNumber?: string;
}

export default function UpdateTracking() {
  const [orderNumber, setOrderNumber] = useState('');
  const [trackingCode, setTrackingCode] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [trackingHistory, setTrackingHistory] = useState<TrackingEntry[]>([]);
  // CSV upload state
  const [csvName, setCsvName] = useState('');
  const [csvRows, setCsvRows] = useState<TrackingEntry[]>([]);
  const [csvError, setCsvError] = useState('');
  const [csvSubmitting, setCsvSubmitting] = useState(false);
  const [csvSubmittedCount, setCsvSubmittedCount] = useState(0);
  
  // References for form inputs
  const orderNumberRef = React.useRef<HTMLInputElement>(null);
  const trackingCodeRef = React.useRef<HTMLInputElement>(null);

  // Load tracking history from localStorage on component mount
  useState(() => {
    const storedHistory = localStorage.getItem('trackingHistory');
    if (storedHistory) {
      try {
        setTrackingHistory(JSON.parse(storedHistory));
      } catch (e) {
        console.error('Error parsing tracking history:', e);
        localStorage.removeItem('trackingHistory');
      }
    }
  });

  // Handle order number input keydown
  const handleOrderNumberKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      trackingCodeRef.current?.focus();
    }
  };

  // --- CSV Helpers ---
  const parseCsvText = (text: string): TrackingEntry[] => {
    const lines = text.split(/\r?\n/).filter(l => l.trim().length);
    if (!lines.length) return [];
    // Basic CSV split: supports quoted fields with commas
    const splitCsv = (line: string): string[] => {
      const out: string[] = [];
      let cur = '';
      let inQ = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
          if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
          else inQ = !inQ;
        } else if (ch === ',' && !inQ) {
          out.push(cur); cur = '';
        } else {
          cur += ch;
        }
      }
      out.push(cur);
      return out.map(s => s.trim());
    };
    const header = splitCsv(lines[0]).map(h => h.toLowerCase());
    const idx = (names: string[]) => names.map(n => header.indexOf(n)).find(i => i >= 0) ?? -1;
    const orderIdx = idx(['order', 'order_number', 'order id', 'orderid', 'ordernumber']);
    const trackIdx = idx(['tracking', 'tracking_code', 'awb', 'tracking code', 'awb number', 'consignment no', 'consignment number']);
    const timeIdx = idx(['timestamp', 'date', 'updated_at']);
    const phoneIdx = idx(['phone', 'mobile', 'customer_phone', 'phone number', 'contact', 'contact number']);
    const nowISO = () => new Date().toISOString();
    const rows: TrackingEntry[] = [];
    for (let li = 1; li < lines.length; li++) {
      const cols = splitCsv(lines[li]);
      if (!cols.length) continue;
      const orderNumber = orderIdx >= 0 ? String(cols[orderIdx] || '').trim() : '';
      const trackingCode = trackIdx >= 0 ? String(cols[trackIdx] || '').trim() : '';
      if (!orderNumber || !trackingCode) continue;
      const tsRaw = timeIdx >= 0 ? String(cols[timeIdx] || '').trim() : '';
      const timestamp = tsRaw ? new Date(tsRaw).toString() !== 'Invalid Date' ? new Date(tsRaw).toISOString() : nowISO() : nowISO();
      const phoneNumber = phoneIdx >= 0 ? String(cols[phoneIdx] || '').trim() : undefined;
      rows.push({ orderNumber, trackingCode, timestamp, phoneNumber });
    }
    return rows;
  };

  const handleCsvChosen: React.ChangeEventHandler<HTMLInputElement> = async (e) => {
    setCsvError(''); setCsvName(''); setCsvRows([]); setCsvSubmittedCount(0);
    const f = e.target.files?.[0];
    if (!f) return;
    setCsvName(f.name);
    try {
      const txt = await f.text();
      const rows = parseCsvText(txt);
      if (!rows.length) {
        setCsvError('No rows found. Ensure the CSV has headers and includes Order and Tracking columns.');
      }
      setCsvRows(rows);
    } catch {
      setCsvError('Failed to read/parse the CSV file.');
    }
  };

  const WEBHOOK_URL = 'https://auto-n8n.9krcxo.easypanel.host/webhook/268073e1-6504-48d4-b4ac-1a66a51865a2';

  const submitCsv = async () => {
    if (!csvRows.length) { setCsvError('No rows to submit'); return; }
    setCsvSubmitting(true); setCsvError(''); setCsvSubmittedCount(0);
    try {
      for (let i = 0; i < csvRows.length; i++) {
        const entry = csvRows[i];
        const payload = { orderNumber: entry.orderNumber, trackingCode: entry.trackingCode, timestamp: entry.timestamp, phoneNumber: entry.phoneNumber };
        const res = await fetch(WEBHOOK_URL, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
        });
        if (!res.ok) throw new Error(`Row ${i + 1} failed: ${res.status}`);
        // Mirror single submit behavior: persist to history and update service
        await handleSuccessfulUpdate(entry);
        setCsvSubmittedCount(i + 1);
      }
    } catch (err) {
      setCsvError(err instanceof Error ? err.message : 'Submission failed');
    } finally {
      setCsvSubmitting(false);
    }
  };

  // Handle tracking code input keydown
  const handleTrackingKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSubmit(e as unknown as React.FormEvent);
    }
  };

  // Reset form and focus order number input
  const resetForm = () => {
    setOrderNumber('');
    setTrackingCode('');
    setPhoneNumber('');
    setTimeout(() => {
      orderNumberRef.current?.focus();
    }, 100);
  };

  // Handle successful tracking update
  const handleSuccessfulUpdate = async (trackingData: TrackingEntry) => {
    // Save to tracking history
    const updatedHistory = [trackingData, ...trackingHistory].slice(0, 50);
    setTrackingHistory(updatedHistory);
    localStorage.setItem('trackingHistory', JSON.stringify(updatedHistory));
    
    try {
      // Update the order in the shared order service (now async with Supabase)
      await updateOrderTracking(trackingData.orderNumber, trackingData.trackingCode);
      
      setStatus('success');
      setMessage('Tracking code updated successfully!');
      resetForm();
    } catch (error) {
      console.error('Error updating tracking in Supabase:', error);
      setStatus('error');
      setMessage('Tracking updated in local history but failed to sync with database');
    }
  };

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!orderNumber.trim() || !trackingCode.trim()) {
      setStatus('error');
      setMessage('Please fill in all fields');
      return;
    }

    setStatus('submitting');
    setMessage('');

    // Create the payload
    const payload = {
      orderNumber: orderNumber.trim(),
      trackingCode: trackingCode.trim(),
      timestamp: new Date().toISOString(),
      phoneNumber: phoneNumber.trim() || undefined,
    };

    try {
      // Try to fetch from the API
      const response = await fetch('https://auto-n8n.9krcxo.easypanel.host/webhook/268073e1-6504-48d4-b4ac-1a66a51865a2', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      
      if (response.ok) {
        // API call was successful, update tracking (now async)
        await handleSuccessfulUpdate(payload);
      } else {
        throw new Error('Failed to update tracking');
      }
    } catch (error) {
      console.error('Error updating tracking:', error);
      setStatus('error');
      if (error instanceof TypeError && error.message.includes('Failed to fetch')) {
        setMessage('Could not connect to the server. Please check your internet connection or try again later.');
      } else {
        setMessage(error instanceof Error ? error.message : 'An error occurred while updating tracking');
      }
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-lg p-6 w-full">
      <h2 className="text-2xl font-semibold text-gray-900 mb-6">Update Tracking Information</h2>
      
      <form onSubmit={handleSubmit} className="space-y-6 max-w-3xl">
        <div className="space-y-4">
          <div>
            <label htmlFor="orderNumber" className="block text-sm font-medium text-gray-700 mb-1">
              Order Number
            </label>
            <input
              type="text"
              id="orderNumber"
              ref={orderNumberRef}
              value={orderNumber}
              onChange={(e) => setOrderNumber(e.target.value)}
              onKeyDown={handleOrderNumberKeyDown}
              placeholder="Enter order number"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              disabled={status === 'submitting'}
              autoFocus
            />
          </div>
          
          <div>
            <label htmlFor="trackingCode" className="block text-sm font-medium text-gray-700 mb-1">
              Tracking Code
            </label>
            <div className="flex space-x-2">
              <input
                type="text"
                id="trackingCode"
                ref={trackingCodeRef}
                value={trackingCode}
                onChange={(e) => setTrackingCode(e.target.value)}
                onKeyDown={handleTrackingKeyDown}
                placeholder="Scan or enter tracking code"
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                disabled={status === 'submitting'}
                autoComplete="off"
              />
              <button
                type="button"
                onClick={() => {
                  // This will trigger the device's barcode scanner on mobile
                  // On desktop, it will just focus the input
                  document.getElementById('trackingCode')?.focus();
                }}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors"
              >
                Scan
              </button>
            </div>
          </div>

          <div>
            <label htmlFor="phoneNumber" className="block text-sm font-medium text-gray-700 mb-1">
              Phone Number (optional)
            </label>
            <input
              type="text"
              id="phoneNumber"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              placeholder="Enter customer phone (optional)"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              disabled={status === 'submitting'}
              inputMode="numeric"
            />
          </div>
        </div>

        <div className="flex items-center space-x-4">
          <button
            type="submit"
            disabled={status === 'submitting'}
            className={`px-6 py-2 rounded-lg font-medium text-white ${
              status === 'submitting'
                ? 'bg-blue-400 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {status === 'submitting' ? (
              <span className="flex items-center">
                <Loader2 className="animate-spin -ml-1 mr-2 h-4 w-4" />
                Updating...
              </span>
            ) : (
              'Update Tracking'
            )}
          </button>

          {(status === 'success' || status === 'error') && (
            <div className={`flex items-center text-sm ${
              status === 'success' ? 'text-green-600' : 'text-red-600'
            }`}>
              {status === 'success' ? (
                <CheckCircle className="h-5 w-5 mr-1.5" />
              ) : (
                <AlertCircle className="h-5 w-5 mr-1.5" />
              )}
              {message}
            </div>
          )}
        </div>
      </form>

      {/* CSV Upload Section */}
      <div className="mt-10 pt-6 border-t border-gray-100 max-w-4xl">
        <h3 className="text-lg font-semibold text-gray-900 mb-3">Bulk Update via CSV</h3>
        <p className="text-sm text-gray-600 mb-3">Upload a CSV with headers including Order and Tracking columns. We will preview the parsed rows before submission.</p>
        <div className="flex items-center gap-3">
          <input type="file" accept=".csv" onChange={handleCsvChosen} title="Choose CSV file" />
          {csvName && <span className="text-sm text-gray-700">{csvName}</span>}
        </div>
        {csvError && <div className="mt-2 text-sm text-red-600 flex items-center"><AlertCircle className="w-4 h-4 mr-1" />{csvError}</div>}

        {csvRows.length > 0 && (
          <div className="mt-4">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm text-gray-700">Parsed rows: <strong>{csvRows.length}</strong></div>
              <div className="flex items-center gap-2">
                <button
                  className={`px-4 py-1.5 rounded-md text-white ${csvSubmitting ? 'bg-blue-400' : 'bg-blue-600 hover:bg-blue-700'}`}
                  onClick={submitCsv}
                  disabled={csvSubmitting}
                  title="Submit all rows to webhook"
                >
                  {csvSubmitting ? 'Submitting…' : `Submit ${csvRows.length} rows`}
                </button>
                <button
                  className="px-3 py-1.5 rounded-md border border-gray-300 hover:bg-gray-50"
                  onClick={()=>{ setCsvRows([]); setCsvSubmittedCount(0); setCsvError(''); setCsvName(''); }}
                  title="Clear preview"
                >
                  Clear
                </button>
              </div>
            </div>
            {csvSubmittedCount > 0 && (
              <div className="text-sm text-green-600 flex items-center mb-2"><CheckCircle className="w-4 h-4 mr-1" />Submitted {csvSubmittedCount} / {csvRows.length}</div>
            )}
            <div className="overflow-auto border border-gray-200 rounded-md">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 text-gray-700">
                  <tr className="*:px-3 *:py-2 *:whitespace-nowrap">
                    <th>#</th>
                    <th>Order Number</th>
                    <th>Tracking Code</th>
                    <th>Timestamp</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {csvRows.slice(0, 200).map((r, i) => (
                    <tr key={i} className="*:px-3 *:py-2">
                      <td>{i + 1}</td>
                      <td className="font-mono">{r.orderNumber}</td>
                      <td className="font-mono">{r.trackingCode}</td>
                      <td className="text-gray-500">{new Date(r.timestamp).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {csvRows.length > 200 && (
                <div className="p-2 text-xs text-gray-500">Showing first 200 rows…</div>
              )}
            </div>
          </div>
        )}
      </div>
      
      <div className="mt-8 pt-6 border-t border-gray-100">
        <h3 className="text-lg font-medium text-gray-900 mb-3">Recent Tracking Updates</h3>
        
        {trackingHistory.length > 0 ? (
          <div className="space-y-3">
            {trackingHistory.map((entry, index) => {
              const date = new Date(entry.timestamp);
              const formattedDate = `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
              
              return (
                <div key={index} className="bg-white border border-gray-200 rounded-lg p-3 shadow-sm hover:shadow-md transition-shadow">
                  <div className="flex flex-col sm:flex-row sm:justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900">Order:</span>
                        <span className="text-gray-800">{entry.orderNumber}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900">Tracking:</span>
                        <span className="text-gray-800">{entry.trackingCode}</span>
                      </div>
                    </div>
                    <div className="mt-2 sm:mt-0 text-sm text-gray-500">
                      {formattedDate}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="bg-gray-50 p-4 rounded-lg">
            <p className="text-sm text-gray-600">
              No tracking updates yet. Scan a tracking code using your device's barcode scanner or enter it manually.
              The order number and tracking code will be sent to our system and displayed here.
            </p>
          </div>
        )}
        
        {trackingHistory.length > 0 && (
          <div className="mt-4 flex justify-end">
            <button
              onClick={() => {
                localStorage.removeItem('trackingHistory');
                setTrackingHistory([]);
              }}
              className="text-sm text-red-600 hover:text-red-800 px-3 py-1 border border-red-200 rounded-md hover:bg-red-50 transition-colors"
            >
              Clear History
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
