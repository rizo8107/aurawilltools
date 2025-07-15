import { useState } from 'react';
import { CheckCircle, AlertCircle, Loader, FilePlus2, Package } from 'lucide-react';

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
}

// Define the submission status
type FormStatus = 'idle' | 'submitting' | 'success' | 'error';

const OrderForm = () => {
  const [orderNumber, setOrderNumber] = useState('');
  const [status, setStatus] = useState<FormStatus>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [orderData, setOrderData] = useState<OrderResponse | null>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setOrderNumber(e.target.value);
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
        setOrderData(data);
        setStatus('success');
      } catch (jsonError) {
        console.error('JSON parsing error:', jsonError);
        console.error('Raw response:', responseText);
        throw new Error(`Invalid JSON response: ${jsonError.message}`);
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

        {/* Order Details Display */}
        {orderData && (
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <div className="bg-gray-50 px-6 py-4 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-800">Order Details</h2>
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
