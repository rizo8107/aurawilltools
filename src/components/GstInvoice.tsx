import React, { useState, useRef } from 'react';
import { Plus, Trash2, Printer } from 'lucide-react';

interface LineItem {
  id: number;
  name: string;
  hsnSac: string;
  qty: number;
  unitPrice: number;
  discount: number;
}

const GstInvoiceGenerator = () => {
  const [customerDetails, setCustomerDetails] = useState({
    name: 'venkatesh chockalingam',
    email: 'venkidejan85@gmail.com',
    phone: '+918838929361',
    shippingAddress: 'NEAR MANAKKULA VINAYAGAR KOVIL,\nNEAR MANAKKULA VINAYAGAR KOVIL,\n638002 Erode TN, India',
    billingAddress: 'NEAR MANAKKULA VINAYAGAR KOVIL,\nNEAR MANAKKULA VINAYAGAR KOVIL,\n638002 Erode TN, India',
  });

  const [invoiceDetails, setInvoiceDetails] = useState({
    invoiceNumber: 'INV-001',
    invoiceDate: new Date().toISOString().split('T')[0],
    dueDate: new Date(new Date().setDate(new Date().getDate() + 30)).toISOString().split('T')[0],
  });

  const [taxType, setTaxType] = useState<'CGST/SGST' | 'IGST'>('CGST/SGST');

  const [shippingCountry, setShippingCountry] = useState('India');
  const [shippingStateCode, setShippingStateCode] = useState('27');
  const [shippingGstin, setShippingGstin] = useState('27AAFCA5678A1Z9');
  const [shippingPhone, setShippingPhone] = useState('9876543210');

  const [billingCountry, setBillingCountry] = useState('India');
  const [billingStateCode, setBillingStateCode] = useState('29');
  const [billingGstin, setBillingGstin] = useState('29AAFCA1234A1Z5');

  const cgstSgstTotalRate = 0.05; // total GST for CGST + SGST (5%)
  const igstTotalRate = 0.05; // IGST total (5%)
  const gstRate = cgstSgstTotalRate; // backward compat reference
  const halfGstRate = cgstSgstTotalRate / 2; // 2.5%
  const initialInclusiveUnitPrice = 360;
  const [lineItems, setLineItems] = useState<LineItem[]>([
    {
      id: 1,
      name: 'Aurawill Health Mix - Daily boost of Wellness - 450 Grams',
      hsnSac: '19019010',
      qty: 2,
      unitPrice: initialInclusiveUnitPrice / (1 + gstRate), // store taxable value
      discount: 0,
    },
  ]);

  const [terms, setTerms] = useState('Payment is due within 30 days.');
  const [notes, setNotes] = useState('Thank you for your business!');

  const [invoiceDetailsEnabled, setInvoiceDetailsEnabled] = useState({
    invoiceNumber: true,
    invoiceDate: true,
    dueDate: true,
  });

  const handleCustomerChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setCustomerDetails(prev => ({ ...prev, [name]: value }));
  };

  const handleInvoiceDetailsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setInvoiceDetails(prev => ({ ...prev, [name]: value }));
  };

  const handleInvoiceDetailToggle = (field: keyof typeof invoiceDetailsEnabled) => {
    setInvoiceDetailsEnabled(prev => ({ ...prev, [field]: !prev[field] }));
  };

  const handleItemChange = (id: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setLineItems(prevItems =>
      prevItems.map((currentItem): LineItem => {
        if (currentItem.id === id) {
          let newName = currentItem.name;
          let newHsnSac = currentItem.hsnSac;
          let newQty = currentItem.qty;
          let newUnitPrice = currentItem.unitPrice;
          let newDiscount = currentItem.discount;

          switch (name) {
            case 'name':
              newName = value;
              break;
            case 'hsnSac':
              newHsnSac = value;
              break;
            case 'qty':
              newQty = parseFloat(value) || 0;
              break;
            case 'unitPrice': {
              const inclusivePrice = parseFloat(value) || 0;
              const totalRate = (taxType === 'IGST') ? igstTotalRate : cgstSgstTotalRate;
              newUnitPrice = inclusivePrice / (1 + totalRate);
              break;
            }
            case 'discount':
              newDiscount = parseFloat(value) || 0;
              break;
            default:
              break;
          }
          return {
            id: currentItem.id,
            name: newName,
            hsnSac: newHsnSac,
            qty: newQty,
            unitPrice: newUnitPrice,
            discount: newDiscount,
          } as LineItem; // Assert type here
        }
        return currentItem as LineItem; // Assert type here as well
      })
    );
  };

  const addItem = () => {
    setLineItems(prev => [...prev, { id: Date.now(), name: '', hsnSac: '', qty: 1, unitPrice: 0, discount: 0 }]);
  };

  const removeItem = (id: number) => {
    setLineItems(prev => prev.filter(item => item.id !== id));
  };

  const subtotal = lineItems.reduce((acc, item) => acc + item.qty * item.unitPrice, 0);
  const totalDiscount = lineItems.reduce((acc, item) => acc + item.discount, 0);
  const taxableAmount = subtotal - totalDiscount;
  let cgstAmount = 0;
  let sgstAmount = 0;
  let igstAmountTotal = 0;
  let taxAmount = 0;

  if (taxType === 'CGST/SGST') {
    cgstAmount = taxableAmount * halfGstRate;
    sgstAmount = taxableAmount * halfGstRate;
    taxAmount = cgstAmount + sgstAmount;
  } else { // IGST
    igstAmountTotal = taxableAmount * igstTotalRate;
    taxAmount = igstAmountTotal;
  }
  const grandTotal = taxableAmount + taxAmount;

  const invoiceRef = useRef<HTMLDivElement>(null);

  const handlePrint = () => {
    const printContents = invoiceRef.current?.innerHTML;
    const originalContents = document.body.innerHTML;
    const aurawillLogoUrl = 'https://aurawill.in/cdn/shop/files/White-label.png?v=1741582343&width=200';

    if (printContents) {
      document.body.innerHTML = `
        <html>
          <head>
            <title>Invoice</title>
            <script src="https://cdn.tailwindcss.com"></script>
            <style>
              body { font-family: sans-serif; }
              .invoice-container { max-width: 800px; margin: auto; padding: 20px; }
            </style>
          </head>
          <body>
            <div class="invoice-container">
              ${printContents.replace(/src="[^"]+"/, `src="${aurawillLogoUrl}"`)}
            </div>
          </body>
        </html>`;
      window.print();
      document.body.innerHTML = originalContents;
      window.location.reload();
    }
  };

  return (
    <div className="bg-gray-50 min-h-screen p-4 sm:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Form Section */}
        <div className="lg:col-span-1 bg-white p-6 rounded-xl shadow-lg">
          <h2 className="text-2xl font-bold text-gray-800 mb-6">Generate Invoice</h2>
          
          {/* Customer Details */}
          <div className="space-y-4 mb-6">
            <h3 className="font-semibold text-lg text-gray-700">Customer Details</h3>
            <label className="block"><span className="text-sm text-gray-600">Customer Name</span><input type="text" name="name" value={customerDetails.name} onChange={handleCustomerChange} placeholder="Customer Name" className="w-full p-2 border rounded mt-1" /></label>
            <label className="block"><span className="text-sm text-gray-600">Email</span><input type="email" name="email" value={customerDetails.email} onChange={handleCustomerChange} placeholder="Email" className="w-full p-2 border rounded mt-1" /></label>
            <label className="block"><span className="text-sm text-gray-600">Phone</span><input type="text" name="phone" value={customerDetails.phone} onChange={handleCustomerChange} placeholder="Phone" className="w-full p-2 border rounded mt-1" /></label>
            <label className="block"><span className="text-sm text-gray-600">Shipping Address</span><textarea name="shippingAddress" value={customerDetails.shippingAddress} onChange={handleCustomerChange} placeholder="Shipping Address" className="w-full p-2 border rounded mt-1" rows={3}></textarea></label>
            <label className="block"><span className="text-sm text-gray-600">Shipping Country</span>
              <input type="text" name="shippingCountry" value={shippingCountry} onChange={e => setShippingCountry(e.target.value)} placeholder="Country" className="w-full p-2 border rounded mt-1" />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block"><span className="text-sm text-gray-600">Shipping State Code</span><input type="text" name="shippingStateCode" value={shippingStateCode} onChange={e => setShippingStateCode(e.target.value)} placeholder="State Code" className="w-full p-2 border rounded mt-1" /></label>
              <label className="block"><span className="text-sm text-gray-600">Shipping GSTIN</span><input type="text" name="shippingGstin" value={shippingGstin} onChange={e => setShippingGstin(e.target.value)} placeholder="GSTIN" className="w-full p-2 border rounded mt-1" /></label>
            </div>
            <label className="block"><span className="text-sm text-gray-600">Shipping Phone</span>
              <input type="text" name="shippingPhone" value={shippingPhone} onChange={e => setShippingPhone(e.target.value)} placeholder="Phone" className="w-full p-2 border rounded mt-1" />
            </label>
            <label className="block"><span className="text-sm text-gray-600">Billing Address</span><textarea name="billingAddress" value={customerDetails.billingAddress} onChange={handleCustomerChange} placeholder="Billing Address (if different from shipping)" className="w-full p-2 border rounded mt-1" rows={3}></textarea></label>
            <label className="block"><span className="text-sm text-gray-600">Billing Country</span>
              <input type="text" name="billingCountry" value={billingCountry} onChange={e => setBillingCountry(e.target.value)} placeholder="Country" className="w-full p-2 border rounded mt-1" />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block"><span className="text-sm text-gray-600">Billing State Code</span><input type="text" name="billingStateCode" value={billingStateCode} onChange={e => setBillingStateCode(e.target.value)} placeholder="State Code" className="w-full p-2 border rounded mt-1" /></label>
              <label className="block"><span className="text-sm text-gray-600">Billing GSTIN</span><input type="text" name="billingGstin" value={billingGstin} onChange={e => setBillingGstin(e.target.value)} placeholder="GSTIN" className="w-full p-2 border rounded mt-1" /></label>
            </div>
          </div>

          {/* Invoice Details */}
          <div className="space-y-4 mb-6">
            <h3 className="font-semibold text-lg text-gray-700">Invoice Details</h3>
            <div className="flex items-center">
              <input type="checkbox" id="enableInvoiceNumber" checked={invoiceDetailsEnabled.invoiceNumber} onChange={() => handleInvoiceDetailToggle('invoiceNumber')} className="mr-2" />
              <label htmlFor="enableInvoiceNumber" className="block flex-grow"><span className="text-sm text-gray-600">Invoice Number</span><input type="text" name="invoiceNumber" value={invoiceDetails.invoiceNumber} onChange={handleInvoiceDetailsChange} placeholder="INV-001" className="w-full p-2 border rounded mt-1" disabled={!invoiceDetailsEnabled.invoiceNumber} /></label>
            </div>
            <div className="flex items-center mt-2">
              <input type="checkbox" id="enableInvoiceDate" checked={invoiceDetailsEnabled.invoiceDate} onChange={() => handleInvoiceDetailToggle('invoiceDate')} className="mr-2" />
              <label htmlFor="enableInvoiceDate" className="block flex-grow"><span className="text-sm text-gray-600">Invoice Date</span><input type="date" name="invoiceDate" value={invoiceDetails.invoiceDate} onChange={handleInvoiceDetailsChange} className="w-full p-2 border rounded mt-1" disabled={!invoiceDetailsEnabled.invoiceDate} /></label>
            </div>
            <div className="flex items-center mt-2">
              <input type="checkbox" id="enableDueDate" checked={invoiceDetailsEnabled.dueDate} onChange={() => handleInvoiceDetailToggle('dueDate')} className="mr-2" />
              <label htmlFor="enableDueDate" className="block flex-grow"><span className="text-sm text-gray-600">Due Date</span><input type="date" name="dueDate" value={invoiceDetails.dueDate} onChange={handleInvoiceDetailsChange} className="w-full p-2 border rounded mt-1" disabled={!invoiceDetailsEnabled.dueDate} /></label>
            </div>
            <label className="block">
              <span className="text-sm text-gray-600">Tax Type</span>
              <select name="taxType" value={taxType} onChange={e => setTaxType(e.target.value as 'CGST/SGST' | 'IGST')} className="w-full p-2 border rounded mt-1">
                <option value="CGST/SGST">CGST/SGST</option>
                <option value="IGST">IGST</option>
              </select>
            </label>
            <label className="block"><span className="text-sm text-gray-600">Terms & Conditions</span><textarea name="terms" value={terms} onChange={e => setTerms(e.target.value)} placeholder="Terms & Conditions" className="w-full p-2 border rounded mt-1" rows={3}></textarea></label>
            <label className="block"><span className="text-sm text-gray-600">Notes</span><textarea name="notes" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Notes" className="w-full p-2 border rounded mt-1" rows={2}></textarea></label>
          </div>

          {/* Line Items */}
          <div>
            <h3 className="font-semibold text-lg text-gray-700 mb-2">Products</h3>
            <div className="space-y-4">
              {lineItems.map(item => (
                <div key={item.id} className="p-3 border rounded-lg bg-gray-50 space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <input type="text" name="name" value={item.name} onChange={e => handleItemChange(item.id, e)} placeholder="Product Name" className="w-full p-2 border rounded" />
                    <input type="text" name="hsnSac" value={item.hsnSac} onChange={e => handleItemChange(item.id, e)} placeholder="HSN/SAC" className="w-full p-2 border rounded" />
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-xs text-gray-600">
                    <label className="block">Qty (units)</label>
                    <label className="block">Unit Price (incl. GST)</label>
                    <label className="block">Discount (₹)</label>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <input type="text" inputMode="numeric" name="qty" value={item.qty} onChange={e => handleItemChange(item.id, e)} placeholder="Qty" className="w-full p-2 border rounded" />
                    {/* Unit Price input: value displays inclusive, onChange handles inclusive input */}
                    <input 
                      type="text" 
                      inputMode="decimal"
                      name="unitPrice" 
                      value={(item.unitPrice * (1 + (taxType === 'IGST' ? igstTotalRate : cgstSgstTotalRate))).toFixed(2)} 
                      onChange={e => handleItemChange(item.id, e)} 
                      placeholder="Unit Price (incl. GST)" 
                      className="w-full p-2 border rounded" 
                    />
                    <input type="text" inputMode="decimal" name="discount" value={item.discount} onChange={e => handleItemChange(item.id, e)} placeholder="Discount" className="w-full p-2 border rounded" />
                  </div>
                  <button onClick={() => removeItem(item.id)} className="text-red-500 hover:text-red-700 text-sm flex items-center"><Trash2 size={14} className="mr-1"/> Remove</button>
                </div>
              ))}
            </div>
            <button onClick={addItem} className="mt-4 w-full flex items-center justify-center p-2 bg-blue-500 text-white rounded hover:bg-blue-600"><Plus size={18} className="mr-1"/> Add Product</button>
          </div>

          <div className="mt-8">
            <button onClick={handlePrint} className="w-full flex items-center justify-center p-3 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 transition-colors"><Printer size={20} className="mr-2"/> Print Invoice</button>
          </div>
        </div>

        {/* Invoice Preview Section */}
        <div className="lg:col-span-2">
          <div ref={invoiceRef} className="bg-white p-6 md:p-10 rounded-lg shadow-xl font-sans text-sm">
            {/* Header Section */}
            <div className="flex justify-between items-start mb-6">
              <div className="w-2/3">
                <img src="https://aurawill.in/cdn/shop/files/White-label.png?v=1741582343&width=200" alt="Aurawill Logo" className="w-36 mb-2" />
                <p className="font-bold text-base">Aurawill (TSMC Creations India Private Limited)</p>
                <p>286 Rajiv Gandhi Salai Nehru Nagar, Perungudi, 12th Floor,</p>
                <p>Chennai, India - 600078</p>
                <p>Email: support@aurawill.in</p>
                <p>GSTIN: 33AAJCT3867G1Z4</p>
              </div>
              <div className="text-right">
                <h1 className="text-2xl md:text-3xl font-bold text-gray-800 mb-2">TAX INVOICE</h1>
                <p><span className="font-semibold">Invoice Number:</span> {invoiceDetails.invoiceNumber}</p>
                <p><span className="font-semibold">Invoice Date:</span> {new Date(invoiceDetails.invoiceDate).toLocaleDateString('en-GB')}</p>
                <p><span className="font-semibold">Due Date:</span> {new Date(invoiceDetails.dueDate).toLocaleDateString('en-GB')}</p>
              </div>
            </div>

            <hr className="my-6"/>

            {/* Customer Information */}
            <div className="mb-6">
              <p className="mb-3"><span className="font-semibold">Customer:</span> {customerDetails.name}</p>
              <div className="flex justify-between">
                <div className="w-[48%]">
                  <h4 className="font-semibold mb-1">Billing Address</h4>
                  <p className="whitespace-pre-line">{customerDetails.billingAddress || 'N/A'}</p>
                  <p>Country: {billingCountry}</p>
                  <p>State Code: {billingStateCode}</p>
                  <p>GSTIN: {billingGstin}</p>
                </div>
                <div className="w-[48%]">
                  <h4 className="font-semibold mb-1">Shipping Address</h4>
                  <p className="whitespace-pre-line">{customerDetails.shippingAddress || 'N/A'}</p>
                  <p>Country: {shippingCountry}</p>
                  <p>State Code: {shippingStateCode}</p>
                  <p>GSTIN: {shippingGstin}</p>
                  <p>Phone: {shippingPhone}</p>
                </div>
              </div>
            </div>

            {/* Line Items Table */}
            <div className="overflow-x-auto mb-6">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="border p-2 text-left font-semibold">No.</th>
                    <th className="border p-2 text-left font-semibold">Name</th>
                    <th className="border p-2 text-left font-semibold">HSN/SAC</th>
                    <th className="border p-2 text-center font-semibold">Qty</th>
                    <th className="border p-2 text-right font-semibold">Rate</th>
                    <th className="border p-2 text-right font-semibold">Disc.</th>
                    {taxType === 'IGST' && <th colSpan={2} className="border p-2 text-center font-semibold">IGST</th>}
                    <th colSpan={2} className="border p-2 text-center font-semibold">CGST</th>
                    <th colSpan={2} className="border p-2 text-center font-semibold">SGST</th>
                    <th className="border p-2 text-right font-semibold">Taxable Amount</th>
                  </tr>
                  <tr className="bg-gray-50">
                    <th className="border p-1"></th>{/* No. */}
                    <th className="border p-1"></th>{/* Name */}
                    <th className="border p-1"></th>{/* HSN/SAC */}
                    <th className="border p-1"></th>{/* Qty */}
                    <th className="border p-1"></th>{/* Rate */}
                    <th className="border p-1"></th>{/* Disc. */}
                    {taxType === 'IGST' && <>
                      <th className="border p-1 text-center text-xs font-medium">%</th>
                      <th className="border p-1 text-right text-xs font-medium">Amt</th>
                    </>}
                    <th className="border p-1 text-center text-xs font-medium">%</th>{/* CGST % */}
                    <th className="border p-1 text-right text-xs font-medium">Amt</th>{/* CGST Amt */}
                    <th className="border p-1 text-center text-xs font-medium">%</th>{/* SGST % */}
                    <th className="border p-1 text-right text-xs font-medium">Amt</th>{/* SGST Amt */}
                    <th className="border p-1"></th>{/* Taxable Amount */}
                  </tr>
                </thead>
                <tbody>
                  {lineItems.map((item, index) => {
                    const taxableItemAmount = (item.qty * item.unitPrice) - item.discount;
                    let itemIgst = 0, itemCgst = 0, itemSgst = 0;
                    if (taxType === 'IGST') {
                      itemIgst = taxableItemAmount * gstRate;
                    } else {
                      itemCgst = taxableItemAmount * halfGstRate;
                      itemSgst = taxableItemAmount * halfGstRate;
                    }
                    return (
                      <tr key={item.id}>
                        <td className="border p-2 text-left">{index + 1}</td>
                        <td className="border p-2 text-left">{item.name}</td>
                        <td className="border p-2 text-left">{item.hsnSac}</td>
                        <td className="border p-2 text-center">{item.qty}</td>
                        <td className="border p-2 text-right">{item.unitPrice.toFixed(2)}</td>
                        <td className="border p-2 text-right">{item.discount.toFixed(2)}</td>
                        {taxType === 'IGST' && <>
                          <td className="border p-2 text-center">{(igstTotalRate * 100)}</td>{/* IGST % */}
                          <td className="border p-2 text-right">{itemIgst.toFixed(2)}</td>{/* IGST Amt */}
                        </>}
                        <td className="border p-2 text-center">{taxType === 'CGST/SGST' ? (halfGstRate * 100) : 0}</td>{/* CGST % */}
                        <td className="border p-2 text-right">{itemCgst.toFixed(2)}</td>{/* CGST Amt */}
                        <td className="border p-2 text-center">{taxType === 'CGST/SGST' ? (halfGstRate * 100) : 0}</td>{/* SGST % */}
                        <td className="border p-2 text-right">{itemSgst.toFixed(2)}</td>{/* SGST Amt */}
                        <td className="border p-2 text-right">{taxableItemAmount.toFixed(2)}</td>{/* Taxable Amount */}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Summary Table */}
            <div className="flex justify-end mb-6">
              <div className="w-full md:w-1/2 lg:w-2/5">
                <table className="w-full border-collapse">
                  <tbody>
                    <tr>
                      <td className="border p-2 font-semibold">Taxable Value</td>
                      <td className="border p-2 text-right">{taxableAmount.toFixed(2)}</td>
                    </tr>
                    <tr>
                      <td className="border p-2">(CGST)</td>
                      <td className="border p-2 text-right">{cgstAmount.toFixed(2)}</td>
                    </tr>
                    <tr>
                      <td className="border p-2">(SGST)</td>
                      <td className="border p-2 text-right">{sgstAmount.toFixed(2)}</td>
                    </tr>
                    {taxType === 'IGST' && <tr>
                      <td className="border p-2">Integrated Goods and Services Tax (IGST)</td>
                      <td className="border p-2 text-right">{igstAmountTotal.toFixed(2)}</td>
                    </tr>}
                    <tr>
                      <td className="border p-2">Round Off</td>
                      <td className="border p-2 text-right">0.00</td>
                    </tr>
                    <tr className="bg-gray-100">
                      <td className="border p-2 font-bold text-base">Total Payable</td>
                      <td className="border p-2 text-right font-bold text-base">₹{grandTotal.toFixed(2)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>


            {/* Terms and Notes */}
            <div className="mt-6 pt-4 border-t">
              <h4 className="font-semibold mb-1">Terms & Conditions</h4>
              <p className="text-xs whitespace-pre-line">{terms}</p>
            </div>
            <div className="mt-4">
              <h4 className="font-semibold mb-1">Notes</h4>
              <p className="text-xs whitespace-pre-line">{notes}</p>
            </div>

            {/* Footer Message */}
            <div className="text-center text-gray-600">
              <p>Thank you for your business!</p>
            </div>

            {/* Bank Details */}
            <div className="mt-6 pt-4 border-t text-sm text-left">
              <h4 className="font-semibold mb-2 text-gray-700">Bank Details:</h4>
              <p><span className="font-medium">Account Name:</span> TSMC CREATIONS INDIA PRIVATE LIMITED</p>
              <p><span className="font-medium">Account No:</span> 10227415981</p>
              <p><span className="font-medium">IFSC:</span> IDFB0080138</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GstInvoiceGenerator;
