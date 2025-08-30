import { useState, useEffect } from 'react';
import { AlertCircle, Loader, Package, MapPin, CheckCircle, XCircle, Truck } from 'lucide-react';

// Define the structure of the order response
interface OrderResponse {
  order_id: string;
  order_number: string;
  status: string;
  customer_name: string;
  phone: string;
  address: string;
  product: string;
  variant: string;
  price: number;
  tracking_company: string;
  tracking_number: string;
  tracking_url: string;
  email: string;
  expected_delivery: string;
  quantity: number;
  order_date: string;
  call_status: string | null;
  print_slip: {
    order_id: string;
    customer: string;
    phone: string;
    address: string;
    product: string;
    quantity: number;
    variant: string;
    price_per_unit: number;
    total_price: number;
    order_date: string;
  };
  // Service availability fields
  extracted_address?: string;
  pincode?: string;
  serviceable?: boolean;
  matched_area?: string | null;
  service_center?: string | null;
  hub_center?: string | null;
  doc_delivery?: string;
  non_doc_delivery?: string;
  oda_location?: string;
  priority?: string;
  district?: string;
  delivery_type?: string;
  communication?: string;
}

// Type definitions for the form

// Define the submission status
type FormStatus = 'idle' | 'submitting' | 'success' | 'error';
type Mode = 'single' | 'bulk';

type BulkItem = {
  order: string;
  status: FormStatus;
  error?: string;
  serviceable?: boolean;
};

const OrderForm = () => {
  const [mode, setMode] = useState<Mode>('single');
  const [orderNumber, setOrderNumber] = useState('');
  const [status, setStatus] = useState<FormStatus>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [orderData, setOrderData] = useState<OrderResponse | null>(null);
  const [trackingNumber, setTrackingNumber] = useState('');
  const [trackingCompany, setTrackingCompany] = useState('');
  const [trackingStatus, setTrackingStatus] = useState<FormStatus>('idle');
  const [trackingError, setTrackingError] = useState('');
  const [callerName, setCallerName] = useState<string | null>(null);

  // Bulk mode state
  const [bulkInput, setBulkInput] = useState('');
  const [bulkItems, setBulkItems] = useState<BulkItem[]>([]);
  const [bulkOverall, setBulkOverall] = useState<FormStatus>('idle');

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setOrderNumber(e.target.value);
  };
  
  const handleTrackingNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTrackingNumber(e.target.value);
  };
  
  const handleTrackingCompanyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTrackingCompany(e.target.value);
  };

  const parseBulkOrders = (text: string): string[] => {
    return text
      .split(/\r?\n/) // lines
      .map(l => l.trim())
      .filter(Boolean);
  };

  const submitSingleOrder = async (order: string): Promise<boolean | null> => {
    const payload = { Order: order.trim() };
    const response = await fetch('https://auto-n8n.9krcxo.easypanel.host/webhook/cbf01aea-9be4-4cba-9b1c-0a0367a6f823', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error(`Webhook failed with status: ${response.status}`);
    const responseText = await response.text();
    try {
      type ServiceableObj = { serviceable?: boolean };
      const data: unknown = JSON.parse(responseText);
      if (Array.isArray(data)) {
        const arr = data as ServiceableObj[];
        const found = arr.find((it) => typeof it?.serviceable !== 'undefined');
        return typeof found?.serviceable === 'boolean' ? found.serviceable : null;
      } else if (data && typeof data === 'object') {
        const obj = data as ServiceableObj;
        return typeof obj.serviceable === 'boolean' ? obj.serviceable : null;
      }
      return null;
    } catch {
      // If JSON parsing fails, we cannot determine serviceability in bulk
      return null;
    }
  };

  const handleBulkSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const orders = parseBulkOrders(bulkInput);
    if (orders.length === 0) return;

    setBulkOverall('submitting');
    setBulkItems(orders.map(o => ({ order: o, status: 'idle' as FormStatus })));

    const results: BulkItem[] = [];
    for (const o of orders) {
      const item: BulkItem = { order: o, status: 'submitting' as FormStatus };
      results.push(item);
      setBulkItems([...results, ...orders.slice(results.length).map(rem => ({ order: rem, status: 'idle' as FormStatus }))]);
      try {
        const svc = await submitSingleOrder(o);
        item.status = 'success';
        if (svc !== null) item.serviceable = svc;
      } catch (err) {
        item.status = 'error';
        item.error = err instanceof Error ? err.message : 'Unknown error';
      }
      // push state after each order to show progress
      setBulkItems([...results, ...orders.slice(results.length).map(rem => ({ order: rem, status: 'idle' as FormStatus }))]);
    }
    const hasError = results.some(r => r.status === 'error');
    setBulkOverall(hasError ? 'error' : 'success');
  };

  // Load caller name from localStorage on component mount
  useEffect(() => {
    const savedCaller = localStorage.getItem('caller_name');
    if (savedCaller) {
      setCallerName(savedCaller);
    }
  }, []);

  const handleTrackingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!orderData) {
      setTrackingError('No order data available');
      return;
    }
    
    if (!trackingNumber.trim()) {
      setTrackingError('Please enter a tracking number');
      return;
    }
    
    setTrackingStatus('submitting');
    setTrackingError('');
    
    try {
      // Include all order data and add the new tracking information
      const payload = {
        ...orderData,
        tracking_number: trackingNumber,
        tracking_company: trackingCompany,
        // Include caller name with the exact parameter name expected by the webhook
        caller: callerName || 'Unknown',
        // Ensure print_slip is included if it exists
        print_slip: orderData.print_slip ? {
          ...orderData.print_slip
        } : undefined
      };
      
      const response = await fetch('https://auto-n8n.9krcxo.easypanel.host/webhook/manualsheet', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      
      if (!response.ok) {
        throw new Error(`Webhook failed with status: ${response.status}`);
      }
      
      // Update the local order data with the new tracking information
      setOrderData({
        ...orderData,
        tracking_number: trackingNumber,
        tracking_company: trackingCompany
      });
      
      setTrackingStatus('success');
      // Reset form fields after successful submission
      setTrackingNumber('');
      setTrackingCompany('');
    } catch (error) {
      setTrackingStatus('error');
      if (error instanceof Error) {
        setTrackingError(error.message);
      } else {
        setTrackingError('An unknown error occurred.');
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orderNumber.trim()) {
      setErrorMessage('Please enter an order number');
      return;
    }
    
    setStatus('submitting');
    setErrorMessage('');
    setOrderData(null);

    try {
      const payload = {
        Order: orderNumber.trim()
      };

      const response = await fetch('https://auto-n8n.9krcxo.easypanel.host/webhook/cbf01aea-9be4-4cba-9b1c-0a0367a6f823', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`Webhook failed with status: ${response.status}`);
      }

      // Get the raw text first to check if it's valid JSON
      const responseText = await response.text();
      
      try {
        // Try to parse the text as JSON
        const data = JSON.parse(responseText);
        
        // Handle array response format
        if (Array.isArray(data)) {
          // If it's an array, take the first element that has order_id
          const orderItem = data.find(item => item.order_id !== undefined);
          if (orderItem) {
            setOrderData(orderItem as OrderResponse);
          }
        } else {
          // Handle single object response (backward compatibility)
          setOrderData(data as OrderResponse);
        }
        
        setStatus('success');
      } catch (jsonError: unknown) {
        console.error('JSON parsing error:', jsonError);
        console.error('Raw response:', responseText);
        throw new Error(`Invalid JSON response: ${jsonError instanceof Error ? jsonError.message : 'Unknown error'}`);
      }
    } catch (error) {
      setStatus('error');
      if (error instanceof Error) {
        setErrorMessage(error.message);
      } else {
        setErrorMessage('An unknown error occurred.');
      }
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 lg:p-8">
      <div className="bg-white rounded-2xl shadow-xl p-6 md:p-8">
        <div className="flex items-center gap-4 mb-8">
          <div className="bg-indigo-100 text-indigo-600 p-3 rounded-full">
            <Package size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Order Lookup</h1>
            <p className="text-gray-500">Enter an order number to retrieve order details.</p>
          </div>
        </div>

        {/* Mode Toggle */}
        <div className="mb-4 inline-flex rounded-lg overflow-hidden border border-gray-200">
          <button
            type="button"
            className={`px-4 py-2 text-sm font-medium ${mode === 'single' ? 'bg-indigo-600 text-white' : 'bg-white text-gray-700'}`}
            onClick={() => setMode('single')}
          >
            Single
          </button>
          <button
            type="button"
            className={`px-4 py-2 text-sm font-medium border-l border-gray-200 ${mode === 'bulk' ? 'bg-indigo-600 text-white' : 'bg-white text-gray-700'}`}
            onClick={() => setMode('bulk')}
          >
            Bulk
          </button>
        </div>

        {mode === 'single' && (
        <form onSubmit={handleSubmit} className="mb-8">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-grow">
              <label htmlFor="orderNumber" className="block text-sm font-medium text-gray-700 mb-1">Order Number</label>
              <input
                type="text"
                name="orderNumber"
                id="orderNumber"
                value={orderNumber}
                onChange={handleChange}
                placeholder="Enter order number"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                required
              />
            </div>
            <div className="flex items-end">
              <button
                type="submit"
                disabled={status === 'submitting'}
                className="w-full md:w-auto flex justify-center items-center px-8 py-3 border border-transparent text-base font-medium rounded-lg shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:bg-indigo-400 transition-all duration-300"
              >
                {status === 'submitting' ? (
                  <>
                    <Loader className="animate-spin -ml-1 mr-2 h-5 w-5" />
                    Loading...
                  </>
                ) : (
                  'Lookup Order'
                )}
              </button>
            </div>
          </div>

          {/* Status Messages */}
          <div className="mt-4">
            {status === 'error' && (
              <div className="rounded-md bg-red-50 p-4">
                <div className="flex">
                  <div className="flex-shrink-0">
                    <AlertCircle className="h-5 w-5 text-red-400" />
                  </div>
                  <div className="ml-3">
                    <h3 className="text-sm font-medium text-red-800">Error</h3>
                    <div className="mt-2 text-sm text-red-700">
                      <p>{errorMessage}</p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </form>
        )}

        {mode === 'bulk' && (
          <form onSubmit={handleBulkSubmit} className="mb-8">
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Order Numbers</label>
              <textarea
                value={bulkInput}
                onChange={(e) => setBulkInput(e.target.value)}
                placeholder={"Enter one order number per line"}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 h-40 font-mono"
              />
              <p className="text-xs text-gray-500 mt-1">Tip: Paste from Excel/Sheets. One order per line.</p>
            </div>
            <div className="flex items-end">
              <button
                type="submit"
                disabled={bulkOverall === 'submitting' || !bulkInput.trim()}
                className="w-full md:w-auto flex justify-center items-center px-8 py-3 border border-transparent text-base font-medium rounded-lg shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:bg-indigo-400 transition-all duration-300"
              >
                {bulkOverall === 'submitting' ? (
                  <>
                    <Loader className="animate-spin -ml-1 mr-2 h-5 w-5" />
                    Submitting...
                  </>
                ) : (
                  'Submit All'
                )}
              </button>
            </div>

            {/* Progress & Results */}
            {bulkItems.length > 0 && (
              <div className="mt-4 border border-gray-200 rounded-lg">
                <div className="px-4 py-2 bg-gray-50 border-b">Results</div>
                <ul className="divide-y">
                  {bulkItems.map((bi, idx) => (
                    <li key={idx} className="px-4 py-2 text-sm flex items-center justify-between">
                      <span className="font-mono">{bi.order}</span>
                      <div className="flex items-center gap-3">
                        <span className={
                          bi.status === 'success' ? 'text-green-700' : bi.status === 'error' ? 'text-red-700' : 'text-gray-500'
                        }>
                          {bi.status === 'submitting' && 'Processing...'}
                          {bi.status === 'success' && '✓ Success'}
                          {bi.status === 'error' && `✕ ${bi.error || 'Error'}`}
                          {bi.status === 'idle' && 'Queued'}
                        </span>
                        {typeof bi.serviceable === 'boolean' && (
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium flex items-center ${bi.serviceable ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                            {bi.serviceable ? (
                              <>
                                <CheckCircle className="h-3 w-3 mr-1" />
                                Serviceable
                              </>
                            ) : (
                              <>
                                <XCircle className="h-3 w-3 mr-1" />
                                Not Serviceable
                              </>
                            )}
                          </span>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </form>
        )}

        {/* Service Availability Display */}
        {orderData && orderData.serviceable !== undefined && (
          <div className="border border-gray-200 rounded-lg overflow-hidden mb-6">
            <div className="bg-gray-50 px-6 py-4 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <MapPin className="h-5 w-5 text-gray-500 mr-2" />
                  <h2 className="text-lg font-semibold text-gray-800">Delivery Service Availability</h2>
                </div>
                <span className={`px-3 py-1 rounded-full text-sm font-medium flex items-center ${orderData.serviceable ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                  {orderData.serviceable ? (
                    <>
                      <CheckCircle className="h-4 w-4 mr-1" />
                      Serviceable
                    </>
                  ) : (
                    <>
                      <XCircle className="h-4 w-4 mr-1" />
                      Not Serviceable
                    </>
                  )}
                </span>
              </div>
            </div>
            
            <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
              <div>
                <h3 className="text-sm font-medium text-gray-500 mb-3">Location Information</h3>
                <div className="space-y-3">
                  {orderData.pincode && (
                    <div>
                      <p className="text-sm font-medium text-gray-500">Pincode</p>
                      <p className="text-base font-medium text-gray-900">{orderData.pincode}</p>
                    </div>
                  )}
                  {orderData.matched_area && (
                    <div>
                      <p className="text-sm font-medium text-gray-500">Matched Area</p>
                      <p className="text-base font-medium text-gray-900">{orderData.matched_area}</p>
                    </div>
                  )}
                  {orderData.district && (
                    <div>
                      <p className="text-sm font-medium text-gray-500">District</p>
                      <p className="text-base font-medium text-gray-900">{orderData.district}</p>
                    </div>
                  )}
                  {orderData.delivery_type && (
                    <div>
                      <p className="text-sm font-medium text-gray-500">Location Type</p>
                      <p className="text-base font-medium text-gray-900">{orderData.delivery_type}</p>
                    </div>
                  )}
                  {orderData.extracted_address && (
                    <div>
                      <p className="text-sm font-medium text-gray-500">Extracted Address</p>
                      <p className="text-base font-medium text-gray-900">{orderData.extracted_address}</p>
                    </div>
                  )}
                </div>
              </div>
              
              <div>
                <h3 className="text-sm font-medium text-gray-500 mb-3">Service Information</h3>
                <div className="space-y-3">
                  {orderData.hub_center && (
                    <div>
                      <p className="text-sm font-medium text-gray-500">Hub Center</p>
                      <p className="text-base font-medium text-gray-900">{orderData.hub_center}</p>
                    </div>
                  )}
                  {orderData.service_center && (
                    <div>
                      <p className="text-sm font-medium text-gray-500">Service Center</p>
                      <p className="text-base font-medium text-gray-900">{orderData.service_center}</p>
                    </div>
                  )}
                  {orderData.doc_delivery && (
                    <div>
                      <p className="text-sm font-medium text-gray-500">Document Delivery</p>
                      <p className="text-base font-medium text-gray-900">{orderData.doc_delivery}</p>
                    </div>
                  )}
                  {orderData.non_doc_delivery && (
                    <div>
                      <p className="text-sm font-medium text-gray-500">Non-Document Delivery</p>
                      <p className="text-base font-medium text-gray-900">{orderData.non_doc_delivery}</p>
                    </div>
                  )}
                  {orderData.oda_location && (
                    <div>
                      <p className="text-sm font-medium text-gray-500">ODA Location</p>
                      <p className="text-base font-medium text-gray-900">{orderData.oda_location}</p>
                    </div>
                  )}
                  {orderData.priority && (
                    <div>
                      <p className="text-sm font-medium text-gray-500">Priority</p>
                      <p className="text-base font-medium text-gray-900">{orderData.priority}</p>
                    </div>
                  )}
                </div>
              </div>
              
              {/* Communication section */}
              {orderData.communication && (
                <div className="md:col-span-2">
                  <h3 className="text-sm font-medium text-gray-500 mb-2">Communication</h3>
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <p className="text-sm text-gray-700">{orderData.communication}</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
        
        {/* Tracking Update Form */}
        {orderData && (
          <div className="border border-gray-200 rounded-lg overflow-hidden mb-6">
            <div className="bg-gray-50 px-6 py-4 border-b border-gray-200">
              <div className="flex items-center">
                <Truck className="h-5 w-5 text-gray-500 mr-2" />
                <h2 className="text-lg font-semibold text-gray-800">Update Tracking Information</h2>
              </div>
            </div>
            <div className="p-6">
              <form onSubmit={handleTrackingSubmit} className="space-y-4">
                <div>
                  <label htmlFor="trackingNumber" className="block text-sm font-medium text-gray-700 mb-1">
                    Tracking Number
                  </label>
                  <input
                    id="trackingNumber"
                    type="text"
                    value={trackingNumber}
                    onChange={handleTrackingNumberChange}
                    className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Enter tracking number"
                  />
                </div>
                
                <div>
                  <label htmlFor="trackingCompany" className="block text-sm font-medium text-gray-700 mb-1">
                    Tracking Company
                  </label>
                  <input
                    id="trackingCompany"
                    type="text"
                    value={trackingCompany}
                    onChange={handleTrackingCompanyChange}
                    className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Enter courier company name"
                  />
                </div>
                
                <div>
                  <button
                    type="submit"
                    disabled={trackingStatus === 'submitting'}
                    className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:bg-blue-300 disabled:cursor-not-allowed"
                  >
                    {trackingStatus === 'submitting' ? (
                      <span className="flex items-center justify-center">
                        <Loader className="h-4 w-4 animate-spin mr-2" />
                        Updating...
                      </span>
                    ) : 'Update Tracking'}
                  </button>
                </div>
                
                {trackingError && (
                  <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md flex items-start">
                    <AlertCircle className="h-5 w-5 text-red-400 mr-2 mt-0.5" />
                    <span>{trackingError}</span>
                  </div>
                )}
                
                {trackingStatus === 'success' && (
                  <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-md flex items-start">
                    <CheckCircle className="h-5 w-5 text-green-400 mr-2 mt-0.5" />
                    <span>Tracking information updated successfully!</span>
                  </div>
                )}
              </form>
            </div>
          </div>
        )}
        
        {/* Order Details Display */}
        {orderData && (
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <div className="bg-gray-50 px-6 py-4 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <Package className="h-5 w-5 text-gray-500 mr-2" />
                  <h2 className="text-lg font-semibold text-gray-800">Order Details</h2>
                </div>
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${orderData.status === 'paid' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                  {orderData.status}
                </span>
              </div>
            </div>
            
            <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
              {/* Customer Information */}
              <div>
                <h3 className="text-sm font-medium text-gray-500 mb-3">Customer Information</h3>
                <div className="space-y-3">
                  <div>
                    <p className="text-sm font-medium text-gray-500">Name</p>
                    <p className="text-base font-medium text-gray-900">{orderData.customer_name}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-500">Phone</p>
                    <p className="text-base font-medium text-gray-900">{orderData.phone}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-500">Email</p>
                    <p className="text-base font-medium text-gray-900">{orderData.email}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-500">Address</p>
                    <p className="text-base font-medium text-gray-900">{orderData.address}</p>
                  </div>
                </div>
              </div>
              
              {/* Order Information */}
              <div>
                <h3 className="text-sm font-medium text-gray-500 mb-3">Order Information</h3>
                <div className="space-y-3">
                  <div>
                    <p className="text-sm font-medium text-gray-500">Order ID</p>
                    <p className="text-base font-medium text-gray-900">{orderData.order_id}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-500">Order Number</p>
                    <p className="text-base font-medium text-gray-900">{orderData.order_number}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-500">Order Date</p>
                    <p className="text-base font-medium text-gray-900">{new Date(orderData.order_date).toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-500">Call Status</p>
                    <p className="text-base font-medium text-gray-900">{orderData.call_status || 'Not contacted'}</p>
                  </div>
                </div>
              </div>
              
              {/* Product Information */}
              <div className="md:col-span-2">
                <h3 className="text-sm font-medium text-gray-500 mb-3">Product Information</h3>
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                    <div className="md:col-span-2">
                      <p className="text-sm font-medium text-gray-500">Product</p>
                      <p className="text-base font-medium text-gray-900">{orderData.product}</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-500">Variant</p>
                      <p className="text-base font-medium text-gray-900">{orderData.variant}</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-500">Quantity</p>
                      <p className="text-base font-medium text-gray-900">{orderData.quantity}</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-500">Price</p>
                      <p className="text-base font-medium text-gray-900">₹{orderData.price}</p>
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Tracking Information */}
              <div className="md:col-span-2">
                <h3 className="text-sm font-medium text-gray-500 mb-3">Tracking Information</h3>
                {orderData.tracking_number ? (
                  <div className="space-y-3">
                    <div>
                      <p className="text-sm font-medium text-gray-500">Tracking Company</p>
                      <p className="text-base font-medium text-gray-900">{orderData.tracking_company || 'Not specified'}</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-500">Tracking Number</p>
                      <p className="text-base font-medium text-gray-900">{orderData.tracking_number}</p>
                    </div>
                    {orderData.tracking_url && (
                      <div>
                        <p className="text-sm font-medium text-gray-500">Tracking URL</p>
                        <a href={orderData.tracking_url} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:text-indigo-800">
                          Track Package
                        </a>
                      </div>
                    )}
                    {orderData.expected_delivery && (
                      <div>
                        <p className="text-sm font-medium text-gray-500">Expected Delivery</p>
                        <p className="text-base font-medium text-gray-900">{orderData.expected_delivery}</p>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-gray-500 italic">No tracking information available</p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default OrderForm;
