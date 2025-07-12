import { useState, useEffect } from 'react';
import { CheckCircle, AlertCircle, Loader, FilePlus2 } from 'lucide-react';

// Define the structure of the form data
interface OrderFormState {
  orderNumber: string;
  customerName: string;
  phone: string;
  address: string;
  productName: string;
  quantity: number;
  price: number;
  trackingNumber: string;
}

// Define the submission status
type FormStatus = 'idle' | 'submitting' | 'success' | 'error';

const initialFormState: OrderFormState = {
  orderNumber: '',
  customerName: '',
  phone: '',
  address: '',
  productName: '',
  quantity: 1,
  price: 0,
  trackingNumber: '',
};

const OrderForm = () => {
  const [formData, setFormData] = useState<OrderFormState>(initialFormState);
  const [status, setStatus] = useState<FormStatus>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  // Set the next order number when the component mounts
  useEffect(() => {
    const lastOrderNum = parseInt(localStorage.getItem('lastOrderNumber') || '1000', 10);
    const nextOrderNum = lastOrderNum + 1;
    setFormData(prev => ({ ...prev, orderNumber: `ORD-${nextOrderNum}` }));
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('submitting');
    setErrorMessage('');

    try {
      const now = new Date();
      const payload = {
        ...formData,
        orderDate: now.toLocaleDateString('en-CA'), // YYYY-MM-DD
        orderTime: now.toLocaleTimeString('en-GB'), // HH:MM:SS
      };

      const response = await fetch('https://backend-n8n.7za6uc.easypanel.host/webhook/karigai_order_creation', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`Webhook failed with status: ${response.status}`);
      }

      // On success, save the current order number and prepare the next one
      const submittedOrderNumber = formData.orderNumber.replace('ORD-', '');
      localStorage.setItem('lastOrderNumber', submittedOrderNumber);
      
      setStatus('success');
      setTimeout(() => {
        const nextOrderNum = parseInt(submittedOrderNumber, 10) + 1;
        setStatus('idle');
        setFormData({
          ...initialFormState,
          orderNumber: `ORD-${nextOrderNum}`,
        });
      }, 3000);
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
            <FilePlus2 size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Create a New Order</h1>
            <p className="text-gray-500">Fill in the details below to create and submit a new order.</p>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="space-y-6">
            <div>
              <label htmlFor="orderNumber" className="block text-sm font-medium text-gray-700 mb-1">Order Number</label>
              <input
                type="text"
                name="orderNumber"
                id="orderNumber"
                value={formData.orderNumber}
                readOnly
                className="w-full px-4 py-2 bg-gray-100 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-400 cursor-not-allowed"
              />
            </div>

            <div className="grid md:grid-cols-2 gap-x-8 gap-y-6">
              {/* Customer Details */}
              <div className="space-y-4 p-6 bg-gray-50 rounded-lg border border-gray-200">
                <h2 className="text-lg font-semibold text-gray-800 mb-4">Customer Shipping Details</h2>
                <div>
                  <label htmlFor="customerName" className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
                  <input type="text" name="customerName" id="customerName" value={formData.customerName} onChange={handleChange} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" required />
                </div>
                <div>
                  <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-1">Phone Number</label>
                  <input type="tel" name="phone" id="phone" value={formData.phone} onChange={handleChange} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" required />
                </div>
                <div>
                  <label htmlFor="address" className="block text-sm font-medium text-gray-700 mb-1">Shipping Address</label>
                  <textarea name="address" id="address" rows={3} value={formData.address} onChange={handleChange} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" required></textarea>
                </div>
              </div>

              {/* Product & Tracking Details */}
              <div className="space-y-4 p-6 bg-gray-50 rounded-lg border border-gray-200">
                <h2 className="text-lg font-semibold text-gray-800 mb-4">Product & Tracking</h2>
                <div>
                  <label htmlFor="productName" className="block text-sm font-medium text-gray-700 mb-1">Product Name</label>
                  <input type="text" name="productName" id="productName" value={formData.productName} onChange={handleChange} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" required />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="quantity" className="block text-sm font-medium text-gray-700 mb-1">Quantity</label>
                    <input type="number" name="quantity" id="quantity" min="1" value={formData.quantity} onChange={handleChange} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" required />
                  </div>
                  <div>
                    <label htmlFor="price" className="block text-sm font-medium text-gray-700 mb-1">Price (per item)</label>
                    <input type="number" name="price" id="price" min="0" step="0.01" value={formData.price} onChange={handleChange} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" required />
                  </div>
                </div>
                <div>
                  <label htmlFor="trackingNumber" className="block text-sm font-medium text-gray-700 mb-1">Tracking Number (Optional)</label>
                  <input type="text" name="trackingNumber" id="trackingNumber" value={formData.trackingNumber} onChange={handleChange} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
              </div>
            </div>
          </div>

          {/* Submission Button & Status Messages */}
          <div className="mt-8 pt-5 border-t border-gray-200">
            <div className="flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="w-full md:w-1/2">
                {status === 'success' && (
                  <div className="rounded-md bg-green-50 p-4">
                    <div className="flex">
                      <div className="flex-shrink-0">
                        <CheckCircle className="h-5 w-5 text-green-400" />
                      </div>
                      <div className="ml-3">
                        <p className="text-sm font-medium text-green-800">Order submitted successfully!</p>
                      </div>
                    </div>
                  </div>
                )}
                {status === 'error' && (
                  <div className="rounded-md bg-red-50 p-4">
                    <div className="flex">
                      <div className="flex-shrink-0">
                        <AlertCircle className="h-5 w-5 text-red-400" />
                      </div>
                      <div className="ml-3">
                        <h3 className="text-sm font-medium text-red-800">Submission failed</h3>
                        <div className="mt-2 text-sm text-red-700">
                          <p>{errorMessage}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
              <button
                type="submit"
                disabled={status === 'submitting'}
                className="w-full md:w-auto flex justify-center items-center px-8 py-3 border border-transparent text-base font-medium rounded-lg shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:bg-indigo-400 transition-all duration-300"
              >
                {status === 'submitting' ? (
                  <><Loader className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" /> Submitting...</>
                ) : 'Submit Order'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

export default OrderForm;
