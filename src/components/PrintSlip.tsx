import { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Filter, Printer, Search } from 'lucide-react';
import './PrintSlip.css';

interface OrderRecord {
  Id: number;
  Date?: string;
  status: string;
  "Order ID": string;
  Quanity: string;
  Shipping: string;
  Address: string;
  "Phone number": string;
  Notes: string | null;
  Agent?: string;
  "Agent": string;
  "Order type": string;
  Source: string | null;
  "First Sender": string | null;
  "Reason for Manual": string | null;
  "Followup details": string | null;
  "Order status": string;
  Tracking: string | null;
}

// Helpers to safely read fields that may come with different casings/spacing
const normalizeKey = (s: string) => s.toLowerCase().replace(/\s|_/g, '');
const getField = (obj: Record<string, unknown>, candidates: string[]): unknown => {
  for (const key of candidates) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      const val = (obj as any)[key];
      if (val !== null && val !== '') return val;
    }
  }
  const map = new Map<string, unknown>();
  for (const [k, v] of Object.entries(obj)) {
    map.set(normalizeKey(k), v);
  }
  for (const key of candidates) {
    const norm = normalizeKey(key);
    if (map.has(norm)) return map.get(norm);
  }
  return null;
};

const getAgentField = (rec: unknown): string | null => {
  return (
    (getField(rec as Record<string, unknown>, [
      'Agent',
      'Agent',
      'agent',
      'Agent'
    ]) as string | null) || null
  );
};

const getDateField = (rec: unknown): string | null => {
  return (
    (getField(rec as Record<string, unknown>, [
      'Date',
      'date',
      'Order date',
      'Order Date',
      'order_date',
      'status' // fallback if date stored in status
    ]) as string | null) || null
  );
};

const formatDateDisplay = (raw: unknown): string => {
  if (!raw) return '-';
  const s = String(raw).trim();
  if (!s) return '-';
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split('-');
    return `${d}-${m}-${y}`;
  }
  if (/^\d{2}-\d{2}-\d{4}$/.test(s)) return s; // already DD-MM-YYYY
  const dt = new Date(s);
  if (!isNaN(dt.getTime())) return dt.toLocaleDateString('en-GB');
  return s;
};

// Normalize date-like values to YYYY-MM-DD for reliable comparisons
const toYMD = (raw: unknown): string | null => {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  let d: Date | null = null;
  if (/^\d{2}-\d{2}-\d{4}$/.test(s)) {
    const [dd, mm, yyyy] = s.split('-').map((x) => parseInt(x, 10));
    d = new Date(yyyy, mm - 1, dd);
  } else {
    const dt = new Date(s);
    if (!isNaN(dt.getTime())) d = dt;
  }
  if (!d) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

interface ApiResponse {
  list: OrderRecord[];
  pageInfo: {
    totalRows: number;
    page: number;
    pageSize: number;
    isFirstPage: boolean;
    isLastPage: boolean;
  };
}

export default function PrintSlip() {
  const [records, setRecords] = useState<OrderRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [pageSize] = useState(25);
  const [selectedRecords, setSelectedRecords] = useState<Set<number>>(new Set());
  const [customerIdNoteRecords, setCustomerIdNoteRecords] = useState<Set<number>>(new Set());
  
  // Filters
  const [dateFilter, setDateFilter] = useState('');
  const [agentFilter, setAgentFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [shippingFilter, setShippingFilter] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [showOnlyWithTracking, setShowOnlyWithTracking] = useState(false);
  
  const [output, setOutput] = useState<string>('');
  const [apiError, setApiError] = useState('');

  const startIndex = (currentPage - 1) * pageSize;
  const paginatedRecords = records.slice(startIndex, startIndex + pageSize);
  const allPageSelected =
    paginatedRecords.length > 0 &&
    paginatedRecords.every((r) => selectedRecords.has(r.Id));

  useEffect(() => {
    // Load JsBarcode script
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js';
    script.async = true;
    document.body.appendChild(script);

    fetchRecords();

    return () => {
      if (document.body.contains(script)) {
        document.body.removeChild(script);
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchRecords();
  }, [currentPage, dateFilter, agentFilter, statusFilter, shippingFilter, searchTerm, showOnlyWithTracking]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset pagination and selection when filters change
  useEffect(() => {
    setCurrentPage(1);
    setSelectedRecords(new Set());
  }, [dateFilter, agentFilter, statusFilter, shippingFilter, searchTerm, showOnlyWithTracking]);

  // When records refresh, drop any selections that no longer exist
  useEffect(() => {
    setSelectedRecords(prev => {
      const ids = new Set(records.map(r => r.Id));
      const next = new Set<number>();
      prev.forEach(id => { if (ids.has(id)) next.add(id); });
      return next;
    });
    setCustomerIdNoteRecords(prev => {
      const ids = new Set(records.map(r => r.Id));
      const next = new Set<number>();
      prev.forEach(id => { if (ids.has(id)) next.add(id); });
      return next;
    });
  }, [records]);

  const buildWhereClause = () => {
    // Use only client-side filtering to avoid API parser issues
    return '';
  };

  const fetchRecords = async () => {
    setLoading(true);
    try {
      const wherePrimary = buildWhereClause();
      const fields = ['Id','Date','Order ID','Quanity','Shipping','Address','Phone number','Notes','Agent','Order status','Tracking'];
      const fieldsParam = `&fields=${fields.map(encodeURIComponent).join(',')}`;
      const sortParam = `&sort=-Id`;

      // Always pull ALL pages then filter client-side (ensures totals > 25 when date is cleared)
      const allRecords: OrderRecord[] = [];
      const serverPageSize = 500; // fetch in larger chunks to reduce roundtrips
      let offsetAll = 0;
      const maxLoops = 200; // 100k rows cap
      let loops = 0;
      while (loops < maxLoops) {
        let url = `https://app-nocodb.9krcxo.easypanel.host/api/v2/tables/mis8ifo8jxfn2ws/records?offset=${offsetAll}&limit=${serverPageSize}${fieldsParam}${sortParam}`;
        if (wherePrimary) {
          url += `&where=${encodeURIComponent(wherePrimary)}`;
        }
        const resp = await fetch(url, {
          headers: { 'xc-token': 'CdD-fhN2ctMOe-rOGWY5g7ET5BisIDx5r32eJMn4' }
        });
        if (!resp.ok) {
          const raw = await resp.text();
          try {
            const obj = JSON.parse(raw);
            setApiError(String(obj.msg || obj.message || raw));
          } catch {
            setApiError(raw || `HTTP ${resp.status}`);
          }
          setRecords([]);
          setTotalPages(1);
          return;
        }
        const pageData: ApiResponse = await resp.json();
        allRecords.push(...pageData.list);
        if (pageData.pageInfo?.isLastPage || pageData.list.length < serverPageSize) break;
        offsetAll += serverPageSize;
        loops++;
      }

      // Apply client-side filtering
      let filteredRecords = allRecords;
      
      if (dateFilter) {
        filteredRecords = filteredRecords.filter(record => {
          const recordDate = toYMD(getDateField(record));
          return recordDate === dateFilter;
        });
      }
      
      if (agentFilter) {
        filteredRecords = filteredRecords.filter(record => {
          const recordAgent = getAgentField(record);
          return recordAgent === agentFilter;
        });
      }
      
      if (statusFilter) {
        filteredRecords = filteredRecords.filter(record => {
          return record["Order status"] === statusFilter;
        });
      }

      if (shippingFilter) {
        const needle = shippingFilter.toLowerCase();
        filteredRecords = filteredRecords.filter(record => {
          return (record.Shipping || '').toLowerCase() === needle;
        });
      }
      
      if (searchTerm) {
        filteredRecords = filteredRecords.filter(record => {
          return record["Order ID"]?.toLowerCase().includes(searchTerm.toLowerCase());
        });
      }
      
      if (showOnlyWithTracking) {
        filteredRecords = filteredRecords.filter(record => {
          return record.Tracking && String(record.Tracking).trim();
        });
      }
      
      setRecords(filteredRecords);
      setTotalPages(Math.ceil(filteredRecords.length / pageSize));
      setApiError('');
    } catch (error) {
      console.error('Error fetching records:', error);
      setApiError(error instanceof Error ? error.message : 'Failed to fetch records');
    } finally {
      setLoading(false);
    }
  };

  const generateSlipsFromRecords = (recordsToGenerate: OrderRecord[]) => {
    let outputHtml = '';
    const fromAddress = `TSMC Creations India\n14/5 2nd Floor, Sri Saara Towers,\nBalasundaram Road, Paapanaickenpalayam,\nCoimbatore, TN - 641037\nPh: 8610554711`;

    recordsToGenerate.forEach((record) => {
      const orderId = record["Order ID"];
      const qty = record.Quanity || '1';
      const shipping = record.Shipping;
      const address = record.Address;
      const phone = record["Phone number"];
      const date = getDateField(record);
      const tracking = record.Tracking;
      const courierRaw = (shipping || '').toString().trim();
      const isIndiaPost = courierRaw.toLowerCase() === 'india post';
      const addCustomerIdNote = customerIdNoteRecords.has(record.Id);

      // Parse address to extract customer name and address parts
      const addressParts = address.split(',').map(s => s.trim());
      const customerName = addressParts[0] || '';
      const streetLines = addressParts.slice(1, -1);
      const cityState = addressParts[addressParts.length - 1] || '';
      const country = 'India';
      
      // Calculate weight based on quantity (450g per packet)
      const singlePacketWeight = 450;
      const totalWeightGrams = parseInt(qty) * singlePacketWeight;
      const totalWeightKg = (totalWeightGrams / 1000).toFixed(2) + ' KG';

      const html = `
        <div class="slip">
          <div class="slip-header">
            <div class="ship-to-label">SHIP TO:</div>
            ${isIndiaPost ? `
            <div class="detail-row india-post-note" style="margin-top:2px;">
              <div class="detail-value">Speed Post Booked Under Advance Customer ID: 1790889211 @coimbatore HPO</div>
            </div>` : ''}
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
            ${addCustomerIdNote ? `
            <div class="detail-row">
              <div class="detail-value customer-id-note">Speed post booked under the customer id 1790889211</div>
            </div>` : ''}
            ${tracking ? `
            <div class="detail-row">
              <div class="detail-label">TRACKING:</div>
              <div class="detail-value">${tracking}</div>
            </div>` : ''}
          </div>
          
          <div class="barcode-section">
            <div class="barcode-container">
              <svg class="barcode" jsbarcode-format="code128" jsbarcode-value="${tracking || orderId}" jsbarcode-textmargin="5" jsbarcode-fontoptions="bold" jsbarcode-height="100" jsbarcode-width="3" jsbarcode-fontsize="50"></svg>
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
    
    // Initialize barcodes after rendering
    setTimeout(() => {
      if (window.JsBarcode) {
        window.JsBarcode(".barcode").init();
      }
    }, 100);
  };

  const handleSelectRecord = (recordId: number) => {
    const newSelected = new Set(selectedRecords);
    if (newSelected.has(recordId)) {
      newSelected.delete(recordId);
    } else {
      newSelected.add(recordId);
    }
    setSelectedRecords(newSelected);
  };

  const handleToggleCustomerIdNote = (recordId: number) => {
    const next = new Set(customerIdNoteRecords);
    if (next.has(recordId)) {
      next.delete(recordId);
    } else {
      next.add(recordId);
    }
    setCustomerIdNoteRecords(next);
  };

  const handleSelectAll = () => {
    const newSelected = new Set(selectedRecords);
    if (allPageSelected) {
      paginatedRecords.forEach((r) => newSelected.delete(r.Id));
    } else {
      paginatedRecords.forEach((r) => newSelected.add(r.Id));
    }
    setSelectedRecords(newSelected);
  };

  const generateSelectedSlips = () => {
    const selectedRecordsList = records.filter(r => selectedRecords.has(r.Id));
    generateSlipsFromRecords(selectedRecordsList);
  };

  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <title>Courier Slip Generator</title>
          <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js"></script>
          <style>
            @page {
              size: auto;
              margin: 0;
            }
            body {
              font-family: Arial, sans-serif;
              margin: 0;
              padding: 0;
              background: white;
              width: 100%;
              height: 100%;
            }
            .slip {
              background: white;
              border: 2px solid #000;
              box-sizing: border-box;
              width: 100%;
              height: 100%;
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
            .india-post-note {
              background: #fffbe6;
              border-top: 1px dashed #d4b106;
              border-bottom: 1px dashed #d4b106;
              font-weight: 700;
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
              padding: 15px;
              display: inline-block;
              border: 1px solid #ddd;
            }
            .barcode {
              width: 100%;
              height: 100px;
              background-color: white;
              font-size: 40px;
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
              JsBarcode(".barcode", { 
                width: 5,
                height: 200,
                fontSize: 50,
                margin: 5,
                displayValue: true,
                textMargin: 5
              }).init();
              setTimeout(() => {
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

  return (
    <div className="space-y-8">
      <div className="bg-white rounded-2xl shadow-lg p-6 md:p-8">
        <h2 className="text-xl font-semibold mb-4 text-gray-900">Print Slip Generator</h2>
        
        {/* Filters */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <Filter className="inline w-4 h-4 mr-1" />
              Date Filter
            </label>
            <input
              type="date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Agent</label>
            <select
              value={agentFilter}
              onChange={(e) => setAgentFilter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">All Agents</option>
              <option value="Mahesh">Mahesh</option>
              <option value="Vidhula">Vidhula</option>
              <option value="Shijo">Shijo</option>
              <option value="Nandhini">Nandhini</option>
              <option value="Akash">Akash</option>
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Order Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">All Status</option>
              <option value="Picked UP">Picked UP</option>
              <option value="Dispatched">Dispatched</option>
              <option value="Delivered">Delivered</option>
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <Search className="inline w-4 h-4 mr-1" />
              Search Order ID
            </label>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Enter Order ID"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Shipping</label>
            <select
              value={shippingFilter}
              onChange={(e) => setShippingFilter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">All Shipping</option>
              <option value="Proff">Proff</option>
              <option value="India Post">India Post</option>
              <option value="ST Courier">ST Courier</option>
            </select>
          </div>
        </div>

        {/* Additional Filter Options */}
        <div className="flex items-center gap-4 mb-4">
          <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
            <input
              type="checkbox"
              checked={showOnlyWithTracking}
              onChange={(e) => setShowOnlyWithTracking(e.target.checked)}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            Show only records with tracking information
          </label>
        </div>

        {/* API Error */}
        {apiError && (
          <div className="mb-4 rounded border border-red-200 bg-red-50 text-red-700 px-4 py-2 text-sm">
            {apiError}
          </div>
        )}

        {/* Stat Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <div className="text-xs text-gray-500">Total</div>
            <div className="text-xl font-semibold">{records.length}</div>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <div className="text-xs text-gray-500">With Tracking</div>
            <div className="text-xl font-semibold">{records.filter(r => r.Tracking && String(r.Tracking).trim()).length}</div>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <div className="text-xs text-gray-500">Without Tracking</div>
            <div className="text-xl font-semibold">{records.length - records.filter(r => r.Tracking && String(r.Tracking).trim()).length}</div>
          </div>
        </div>

        {/* Records Table */}
        <div className="overflow-x-auto mb-6">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  <input
                    type="checkbox"
                    checked={allPageSelected}
                    onChange={handleSelectAll}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Cust ID Note</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Order ID</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Agent</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Shipping</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tracking</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-6 py-4 text-center text-gray-500">
                    Loading records...
                  </td>
                </tr>
              ) : records.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-4 text-center text-gray-500">
                    No records found
                  </td>
                </tr>
              ) : paginatedRecords.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-4 text-center text-gray-500">
                    No records on this page
                  </td>
                </tr>
              ) : (
                paginatedRecords.map((record) => (
                  <tr key={record.Id} className={selectedRecords.has(record.Id) ? 'bg-blue-50' : ''}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <input
                        type="checkbox"
                        checked={selectedRecords.has(record.Id)}
                        onChange={() => handleSelectRecord(record.Id)}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <input
                        type="checkbox"
                        checked={customerIdNoteRecords.has(record.Id)}
                        onChange={() => handleToggleCustomerIdNote(record.Id)}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {record["Order ID"]}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatDateDisplay(getDateField(record))}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {getAgentField(record) || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <span className={`px-2 py-1 text-xs rounded-full ${
                        record["Order status"] === 'Picked UP' ? 'bg-green-100 text-green-800' :
                        record["Order status"] === 'Dispatched' ? 'bg-blue-100 text-blue-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {record["Order status"]}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {record.Shipping}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {record.Tracking || '-'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between mb-6">
          <div className="text-sm text-gray-700">
            Page {currentPage} of {totalPages}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
              disabled={currentPage === 1}
              className="px-3 py-2 border border-gray-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
              disabled={currentPage === totalPages}
              className="px-3 py-2 border border-gray-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
        
        {/* Action Buttons */}
        <div className="flex gap-3">
          <button 
            onClick={generateSelectedSlips}
            disabled={selectedRecords.size === 0}
            className="flex items-center justify-center gap-2 py-3 px-6 rounded-lg text-white font-medium transition-all duration-300 bg-blue-500 hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Generate Slips ({selectedRecords.size})
          </button>
          
          <button 
            onClick={handlePrint}
            disabled={!output}
            className="flex items-center justify-center gap-2 py-3 px-6 rounded-lg text-white font-medium transition-all duration-300 bg-green-500 hover:bg-green-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Printer className="w-4 h-4" />
            Print All
          </button>
        </div>
      </div>
      
      {output && (
        <div className="bg-white rounded-2xl shadow-lg p-6 md:p-8">
          <h2 className="text-xl font-semibold mb-4 text-gray-900">Preview</h2>
          <div 
            className="preview-container" 
            dangerouslySetInnerHTML={{ __html: output }}
          />
        </div>
      )}
    </div>
  );
}

// Add TypeScript interface for the global window object
declare global {
  interface Window {
    JsBarcode: (selector: string) => {
      init: () => void;
    };
  }
}
