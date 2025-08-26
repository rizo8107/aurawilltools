import { useState, useEffect } from 'react';
import './PrintSlip.css';

export default function PrintSlip() {
  const [inputText, setInputText] = useState<string>('processing\t09-05-2025\t2012\t1\t\tManual\tKarthika Anand, 80/a2, mitta office street, krishnapuram, kadayanallur, Kadayanallur, Tamil Nadu 627759  Phone 9342579621');
  const [output, setOutput] = useState<string>('');

  useEffect(() => {
    // Load JsBarcode script
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js';
    script.async = true;
    document.body.appendChild(script);

    return () => {
      document.body.removeChild(script);
    };
  }, []);

  const generateSlips = () => {
    const rawInput = inputText.trim();
    const lines = rawInput.split('\n');
    let outputHtml = '';

    const fromAddress = `TSMC Creations India\n14/5 2nd Floor, Sri Saara Towers,\nBalasundaram Road, Paapanaickenpalayam,\nCoimbatore, TN - 641037\nPh: 8610554711`;

    lines.forEach((line) => {
      const parts = line.split('\t');
      if (parts.length < 7) return;

      const date = parts[1];
      const orderId = parts[2];
      const qty = parts[3] || '1';
      const mode = parts[5];
      const toRaw = parts.slice(6).join(' ');
      const phoneMatch = toRaw.match(/Phone\s*=?\s*(\d+)/i);
      const phone = phoneMatch ? phoneMatch[1] : '';
      const toAddress = toRaw.replace(/Phone\s*=?\s*\d+/i, '').trim();

      // Derive name, address, city/state from the address blob
      const firstComma = toAddress.indexOf(',');
      const customerName = (firstComma > -1 ? toAddress.slice(0, firstComma) : toAddress).trim();
      const remaining = (firstComma > -1 ? toAddress.slice(firstComma + 1) : '').trim();
      const addrParts = remaining.split(',').map(s => s.trim()).filter(Boolean);
      // Heuristic: last part as city/state/postal if present, rest as street address lines
      const cityState = addrParts.length > 0 ? addrParts[addrParts.length - 1] : '';
      const streetLines = addrParts.length > 1 ? addrParts.slice(0, -1) : addrParts;
      const country = 'India';
      
      // Calculate weight based on quantity (450g per packet)
      const singlePacketWeight = 450; // in grams
      const totalWeightGrams = parseInt(qty) * singlePacketWeight;
      const totalWeightKg = (totalWeightGrams / 1000).toFixed(2) + ' KG';

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
              <div class="detail-value">${date}</div>
            </div>
            <div class="detail-row">
              <div class="detail-label">MODE:</div>
              <div class="detail-value">${mode} | Qty: ${qty}</div>
            </div>
          </div>
          
          <div class="barcode-section">
            <div class="barcode-container">
              <svg class="barcode" jsbarcode-format="code128" jsbarcode-value="${orderId}" jsbarcode-textmargin="5" jsbarcode-fontoptions="bold" jsbarcode-height="100" jsbarcode-width="3" jsbarcode-fontsize="16"></svg>
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
              font-size: 40px;
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
              JsBarcode(".barcode", { 
                width: 3,
                height: 100,
                fontSize: 16,
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
        <h2 className="text-xl font-semibold mb-4 text-gray-900">Courier Slip Generator</h2>
        
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Paste Records (one per line, tab-separated):
          </label>
          <textarea 
            className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 outline-none font-mono text-sm h-40"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Format: status&#9;date&#9;orderID&#9;qty&#9;&#9;mode&#9;address with Phone number"
          />
        </div>
        
        <div className="flex gap-3">
          <button 
            onClick={generateSlips}
            className="flex items-center justify-center gap-2 py-3 px-6 rounded-lg text-white font-medium transition-all duration-300 bg-blue-500 hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            Generate Slips
          </button>
          
          <button 
            onClick={handlePrint}
            disabled={!output}
            className="flex items-center justify-center gap-2 py-3 px-6 rounded-lg text-white font-medium transition-all duration-300 bg-green-500 hover:bg-green-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            🖨️ Print All
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
