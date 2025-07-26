import React, { useState, useRef, useEffect } from 'react';
import { Search, AlertCircle, CheckCircle, Clock, Calendar, Package, DollarSign, User, Phone, Mail, ArrowRight, X } from 'lucide-react';

// Define interfaces for the response data
interface Product {
  order_number: number;
  order_date: string;
  total_amount: string;
  products: string;
}

interface CustomerData {
  customer_name: string;
  customer_phone: string;
  customer_email: string;
  total_orders: number;
  first_order_date: string;
  last_order_date: string;
  duration_between_first_and_last_order: string;
  orders: Product[];
  call_status?: string; 
}

interface FeedbackForm {
  firstTimeReason: string;
  reorderReason: string;
  likedFeatures: string;
  usageRecipe: string;
  usageTime: string;
  perceivedDifference: string;
  userProfile: string;
  gender: 'Male' | 'Female' | 'Other' | '';
  age: string;
  wouldRecommend: 'Yes' | 'No' | '';
  generalFeedback: string;
  monthlyDelivery: 'Yes' | 'No' | '';
  willGiveReview: 'Yes' | 'No' | '';
  sharedLink: 'Yes' | 'No' | '';
  reviewReceived: 'Yes' | 'No' | '';
  orderId: string;
}



interface RepeatCampaignProps {
  initialOrderNumber?: string;
}

// Define a list of callers for the dropdown
const CALLERS = [
  'Priya',
  'Megha',
  'Sri',
  'Ram'
];

export default function RepeatCampaign({ initialOrderNumber = '' }: RepeatCampaignProps) {
  const [orderId, setOrderId] = useState(initialOrderNumber || '');
  const [customerData, setCustomerData] = useState<CustomerData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState<'success' | 'error' | 'info' | ''>('');
  const [callStatus, setCallStatus] = useState('');
  const [callStatusType, setCallStatusType] = useState<'success' | 'error' | 'info' | ''>('');
  const [selectedCallStatus, setSelectedCallStatus] = useState('');
  
  // Caller selection state
  const [showCallerDialog, setShowCallerDialog] = useState(false);
  const [selectedCaller, setSelectedCaller] = useState('');
  const [callerError, setCallerError] = useState('');
  const [storedCaller, setStoredCaller] = useState<string | null>(null);
  
  // State for the feedback form
  // Reference to track if initial search has been performed
  const initialSearchDone = useRef(false);

  const [feedbackForm, setFeedbackForm] = useState<FeedbackForm>({
    firstTimeReason: '',
    reorderReason: '',
    likedFeatures: '',
    usageRecipe: '',
    usageTime: '',
    perceivedDifference: '',
    userProfile: '',
    gender: '',
    age: '',
    wouldRecommend: '',
    generalFeedback: '',
    monthlyDelivery: '',
    willGiveReview: '',
    sharedLink: '',
    reviewReceived: '',
    orderId: ''
  });
  
  const orderInputRef = useRef<HTMLInputElement>(null);
  
  useEffect(() => {
    // Check if user is authenticated
    const authToken = localStorage.getItem('auth_token');
    if (authToken !== 'authenticated') {
      window.location.href = '/';
    }
  }, []);
  
  useEffect(() => {
    // Focus the order input field when the component mounts
    if (orderInputRef.current) {
      orderInputRef.current.focus();
    }
  }, []);
  
  // Effect to automatically search when initialOrderNumber is provided
  // Check for stored caller in localStorage on component mount
  useEffect(() => {
    const savedCaller = localStorage.getItem('caller_name');
    if (savedCaller) {
      setSelectedCaller(savedCaller);
      setStoredCaller(savedCaller);
    }
  }, []);

  useEffect(() => {
    // Only perform the search if initialOrderNumber is provided and not empty
    // and we haven't already performed the initial search
    if (initialOrderNumber && !initialSearchDone.current) {
      initialSearchDone.current = true;
      
      // Check if we have a caller name before searching
      const savedCaller = localStorage.getItem('caller_name');
      if (savedCaller) {
        // Use the existing search function
        handleOrderSearch(null);
      } else {
        // Show caller selection dialog first
        setShowCallerDialog(true);
      }
    }
  }, [initialOrderNumber]); // eslint-disable-line react-hooks/exhaustive-deps
  
  // Handle caller selection
  const handleCallerSelect = () => {
    if (!selectedCaller) {
      setCallerError('Please select your name');
      return;
    }
    
    // Store caller name in localStorage
    localStorage.setItem('caller_name', selectedCaller);
    setStoredCaller(selectedCaller);
    setShowCallerDialog(false);
    setCallerError('');
    
    // If there's an order ID, proceed with search
    if (orderId.trim()) {
      handleOrderSearch(null);
    }
  };
  
  const handleOrderSearch = async (e: React.FormEvent | null) => {
    // Only prevent default if e is not null (i.e., if called from form submission)
    if (e) {
      e.preventDefault();
    }
    
    if (!orderId.trim()) {
      setError('Please enter an order ID');
      return;
    }
    
    // Check if caller is selected
    if (!storedCaller) {
      setShowCallerDialog(true);
      return;
    }
    
    setLoading(true);
    setError('');
    
    try {
      const response = await fetch('https://auto-n8n.9krcxo.easypanel.host/webhook/20b5c30b-5815-41fc-863c-c1e96f32e083', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          Order: orderId,
          caller: storedCaller // Include caller name in the request with the correct parameter name
        }),
      });
      
      if (!response.ok) {
        throw new Error(`Error: ${response.status}`);
      }
      
      const data = await response.json();
      console.log('Response data:', data);
      
      // Check if data is an array or a single object
      if (data) {
        // If it's a direct object (not in an array), use it directly
        if (!Array.isArray(data) && typeof data === 'object') {
          setCustomerData(data);
          
          // Pre-fill the orderId in the feedback form and set the initial call status
          setFeedbackForm(prev => ({ ...prev, orderId: orderId }));
          setSelectedCallStatus(data.call_status || '');
        } 
        // If it's an array with at least one item
        else if (Array.isArray(data) && data.length > 0) {
          setCustomerData(data[0]);
          
          // Pre-fill the orderId in the feedback form and set the initial call status
          setFeedbackForm(prev => ({ ...prev, orderId: orderId }));
          setSelectedCallStatus(data[0].call_status || '');
        } else {
          setError('No customer data found for this order ID');
        }
      } else {
        setError('No customer data found for this order ID');
      }
    } catch (err) {
      setError('Failed to fetch customer data. Please try again.');
      console.error('Error fetching customer data:', err);
    } finally {
      setLoading(false);
    }
  };
  
  const handleFeedbackChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFeedbackForm(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleStatusUpdate = async (newStatus: string) => {
    if (!customerData?.customer_email) {
      setMessage('Customer email is not available.');
      setMessageType('error');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('https://app-supabase.9krcxo.easypanel.host/rest/v1/rpc/update_call_status', {
        method: 'POST',
        headers: {
          'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzUwMDEyMjAwLCJleHAiOjE5MDc3Nzg2MDB9.eJ81pv114W4ZLvg0E-AbNtNZExPoLYbxGdeWTY5PVVs',
          'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzUwMDEyMjAwLCJleHAiOjE5MDc3Nzg2MDB9.eJ81pv114W4ZLvg0E-AbNtNZExPoLYbxGdeWTY5PVVs',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 
          p_email: customerData.customer_email,
          p_status: newStatus
        })
      });

      if (!response.ok) {
        throw new Error(`Error: ${response.status}`);
      }

      setSelectedCallStatus(newStatus);
      setMessage('Call status updated successfully!');
      setMessageType('success');

    } catch (err) {
      console.error('Error updating call status:', err);
      setMessage('Failed to update call status.');
      setMessageType('error');
    } finally {
      setLoading(false);
    }
  };

  const handleCall = async (phoneNumber: string) => {
    setCallStatus('Initiating call...');
    setCallStatusType('info');

    if (!phoneNumber || phoneNumber.length < 10) {
      setCallStatus('Invalid phone number.');
      setCallStatusType('error');
      return;
    }

    const apiUrl = `https://app.callerdesk.io/api/click_to_call_v2?calling_party_a=09025500829&calling_party_b=${phoneNumber}&deskphone=08062863034&authcode=aee60239bd42b6427d82b94bbb676a3d&call_from_did=1`;

    try {
      const response = await fetch(apiUrl);
      const data = await response.json();

      const successText = 'Call to Customer Initiate Successfully';
      
      // The API can return a success message even if the HTTP status or API status field suggests an error.
      // We prioritize checking the message content for the specific success text.
      if (data && data.message && data.message.includes(successText)) {
        setCallStatus(data.message); // Display the exact success message from the API
        setCallStatusType('success');
      } else {
        // If the specific success text is not found, we treat it as a failure.
        const errorMessage = data.message || 'An unknown error occurred.';
        setCallStatus(`Failed: ${errorMessage}`);
        setCallStatusType('error');
      }
    } catch (err) {
      // This block catches network errors or issues with JSON parsing.
      console.error('Click-to-call network/parsing error:', err);
      const errorMessage = err instanceof Error ? err.message : String(err);
      setCallStatus(`Failed to initiate call: ${errorMessage}`);
      setCallStatusType('error');
    }
  };
  
  const submitFeedback = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!customerData) {
      setMessage('No customer data available. Please search for a customer first.');
      setMessageType('error');
      return;
    }
    
    setLoading(true);
    setMessage('');
    setMessageType('');
    
    try {
      // Create a payload that includes both customer details and feedback data
      const payload = {
        // Customer information
        customer_name: customerData.customer_name,
        customer_phone: customerData.customer_phone,
        customer_email: customerData.customer_email,
        total_orders: customerData.total_orders,
        first_order_date: customerData.first_order_date,
        last_order_date: customerData.last_order_date,
        duration_between_orders: customerData.duration_between_first_and_last_order,
        // Order history summary
        orders: customerData.orders.map(order => ({
          order_number: order.order_number,
          order_date: order.order_date,
          total_amount: order.total_amount,
          products: order.products
        })),
        // Feedback form data
        ...feedbackForm
      };
      
      const response = await fetch('https://auto-n8n.9krcxo.easypanel.host/webhook/8cfda1b9-ceab-4f0e-b631-162dcaa4e3cb', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      
      if (!response.ok) {
        throw new Error(`Error: ${response.status}`);
      }
      
      setMessage('Feedback submitted successfully!');
      setMessageType('success');
      
      // Reset form fields except orderId
      setFeedbackForm({
        firstTimeReason: '',
        reorderReason: '',
        likedFeatures: '',
        usageRecipe: '',
        usageTime: '',
        perceivedDifference: '',
        userProfile: '',
        gender: '',
        age: '',
        wouldRecommend: '',
        generalFeedback: '',
        monthlyDelivery: '',
        willGiveReview: '',
        sharedLink: '',
        reviewReceived: '',
        orderId: feedbackForm.orderId
      });
      
      // Scroll to top to show success message
      window.scrollTo({ top: 0, behavior: 'smooth' });
      
    } catch (err) {
      console.error('Error submitting feedback:', err);
      setMessage('Failed to submit feedback. Please try again.');
      setMessageType('error');
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <div className="max-w-6xl mx-auto p-4">
      {/* Status Message */}
      {message && (
        <div className={`mb-4 p-3 rounded-lg flex items-center ${
          messageType === 'success' ? 'bg-green-50 text-green-700 border border-green-200' :
          messageType === 'error' ? 'bg-red-50 text-red-700 border border-red-200' :
          'bg-blue-50 text-blue-700 border border-blue-200'
        }`}>
          {messageType === 'success' ? <CheckCircle className="w-5 h-5 mr-2" /> :
           messageType === 'error' ? <AlertCircle className="w-5 h-5 mr-2" /> :
           <Clock className="w-5 h-5 mr-2" />}
          <span>{message}</span>
        </div>
      )}
      
      {/* Caller Selection Dialog */}
      {showCallerDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold">Select Your Name</h2>
              <button 
                onClick={() => setShowCallerDialog(false)} 
                className="text-gray-500 hover:text-gray-700"
                aria-label="Close dialog"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            
            <p className="text-gray-600 mb-4">
              Please select your name to track who is handling this order.
            </p>
            
            <div className="mb-4">
              <label htmlFor="caller-select" className="block text-sm font-medium text-gray-700 mb-1">
                Your Name
              </label>
              <select
                id="caller-select"
                value={selectedCaller}
                onChange={(e) => setSelectedCaller(e.target.value)}
                className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">-- Select your name --</option>
                {CALLERS.map((caller) => (
                  <option key={caller} value={caller}>{caller}</option>
                ))}
              </select>
              {callerError && (
                <p className="text-red-500 text-sm mt-1">{callerError}</p>
              )}
            </div>
            
            <div className="flex justify-end">
              <button
                onClick={handleCallerSelect}
                className="bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Current Caller Display */}
      {storedCaller && (
        <div className="bg-blue-50 border border-blue-200 rounded-md p-3 mb-6 flex justify-between items-center">
          <div className="flex items-center">
            <User className="h-5 w-5 text-blue-500 mr-2" />
            <span className="text-blue-800">Current caller: <strong>{storedCaller}</strong></span>
          </div>
          <button 
            onClick={() => {
              setShowCallerDialog(true);
            }}
            className="text-blue-600 hover:text-blue-800 text-sm font-medium"
          >
            Change
          </button>
        </div>
      )}
      
      {/* Order Search Form */}
      <div className="mb-6">
        <h2 className="text-xl font-semibold mb-4">Search Customer by Order ID</h2>
        <form onSubmit={handleOrderSearch} className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1">
            <input
              type="text"
              value={orderId}
              onChange={(e) => setOrderId(e.target.value)}
              placeholder="Enter Order ID"
              className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              ref={orderInputRef}
              disabled={loading}
            />
          </div>
          <button
            type="submit"
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center justify-center transition-colors"
            disabled={loading}
          >
            {loading ? (
              <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></span>
            ) : (
              <Search className="w-4 h-4 mr-2" />
            )}
            Search
          </button>
        </form>
        {error && (
          <div className="mt-2 text-red-600 flex items-center">
            <AlertCircle className="w-4 h-4 mr-1" />
            <span>{error}</span>
          </div>
        )}
      </div>
      
      {/* Customer Data and Feedback Form - Side by Side Layout */}
      {customerData && (
        <div className="flex flex-col lg:flex-row gap-6">
          {/* Left Column: Customer Info and Timeline */}
          <div className="lg:w-1/2">
            {/* Customer Information Card */}
            <div className="bg-white rounded-lg shadow-md p-6 mb-6">
              <h2 className="text-xl font-semibold mb-4">Customer Information</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex items-start">
                  <User className="w-5 h-5 text-gray-500 mr-2 mt-0.5" />
                  <div>
                    <p className="text-sm text-gray-500">Customer Name</p>
                    <p className="font-medium">{customerData.customer_name}</p>
                  </div>
                </div>
                <div className="flex items-start">
                  <Phone className="w-5 h-5 text-gray-500 mr-2 mt-0.5" />
                  <div>
                    <p className="text-sm text-gray-500">Phone</p>
                    <button
                      onClick={() => handleCall(customerData.customer_phone)}
                      className="font-medium text-blue-600 hover:underline cursor-pointer flex items-center"
                      title="Click to call"
                    >
                      {customerData.customer_phone}
                      <ArrowRight className="w-4 h-4 ml-1" />
                    </button>
                  </div>
                </div>
                <div className="flex items-start md:col-span-2">
                  <Phone className="w-5 h-5 text-gray-500 mr-2 mt-0.5" />
                  <div>
                    <p className="text-sm text-gray-500">Call Status</p>
                    <select 
                      value={selectedCallStatus} 
                      onChange={(e) => handleStatusUpdate(e.target.value)}
                      className="font-medium p-1 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 transition"
                      disabled={loading}
                      aria-label="Update call status"
                    >
                      <option value="">Not Called</option>
                      <option value="Called">Called</option>
                      <option value="Call Waiting">Call Waiting</option>
                      <option value="Cancelled">Cancelled</option>
                      <option value="No Response">No Response</option>
                      <option value="Customer Busy">Customer Busy</option>  
                      <option value="Wrong Number">Wrong Number</option>
                      <option value="Call Later">Call Later</option>
                      <option value="Invalid Number">Invalid Number</option>
                    </select>
                  </div>
                </div>
                <div className="flex items-start">
                  <Mail className="w-5 h-5 text-gray-500 mr-2 mt-0.5" />
                  <div>
                    <p className="text-sm text-gray-500">Email</p>
                    <p className="font-medium">{customerData.customer_email}</p>
                  </div>
                </div>
                <div className="flex items-start">
                  <Package className="w-5 h-5 text-gray-500 mr-2 mt-0.5" />
                  <div>
                    <p className="text-sm text-gray-500">Total Orders</p>
                    <p className="font-medium">{customerData.total_orders}</p>
                  </div>
                </div>
                <div className="flex items-start">
                  <Calendar className="w-5 h-5 text-gray-500 mr-2 mt-0.5" />
                  <div>
                    <p className="text-sm text-gray-500">First Order Date</p>
                    <p className="font-medium">{customerData.first_order_date}</p>
                  </div>
                </div>
                <div className="flex items-start">
                  <Calendar className="w-5 h-5 text-gray-500 mr-2 mt-0.5" />
                  <div>
                    <p className="text-sm text-gray-500">Last Order Date</p>
                    <p className="font-medium">{customerData.last_order_date}</p>
                  </div>
                </div>
                <div className="flex items-start md:col-span-2">
                  <Clock className="w-5 h-5 text-gray-500 mr-2 mt-0.5" />
                  <div>
                    <p className="text-sm text-gray-500">Duration Between Orders</p>
                    <p className="font-medium">{customerData.duration_between_first_and_last_order}</p>
                  </div>
                </div>
              </div>

              {/* Call Status Message */}
              {callStatus && (
                <div className={`mt-4 p-3 rounded-lg flex items-center ${
                  callStatusType === 'success' ? 'bg-green-50 text-green-700 border border-green-200' :
                  callStatusType === 'error' ? 'bg-red-50 text-red-700 border border-red-200' :
                  'bg-blue-50 text-blue-700 border border-blue-200'
                }`}>
                  {callStatusType === 'success' ? <CheckCircle className="w-5 h-5 mr-2" /> :
                   callStatusType === 'error' ? <AlertCircle className="w-5 h-5 mr-2" /> :
                   <Clock className="w-5 h-5 mr-2" />}
                  <span>{callStatus}</span>
                </div>
              )}
            </div>
            
            {/* Order Timeline */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-xl font-semibold mb-4">Order History</h2>
              <div className="relative">
                {customerData.orders.map((order, index) => {
                  let daysGapText = '';
                  if (index > 0) {
                    const currentOrderDate = new Date(order.order_date);
                    const previousOrderDate = new Date(customerData.orders[index - 1].order_date);
                    const diffInMs = currentOrderDate.getTime() - previousOrderDate.getTime();
                    const daysGap = Math.round(diffInMs / (1000 * 60 * 60 * 24));
                    daysGapText = `${daysGap} days since last order`;
                  }

                  return (
                    <div key={order.order_number} className="mb-8 relative">
                      {/* Timeline connector */}
                      {index < customerData.orders.length - 1 && (
                        <div className="absolute left-4 top-8 bottom-0 w-0.5 bg-blue-200"></div>
                      )}
                      
                      <div className="flex">
                        <div className="flex-shrink-0 bg-blue-500 rounded-full w-8 h-8 flex items-center justify-center z-10">
                          <span className="text-white text-sm font-medium">{index + 1}</span>
                        </div>
                        <div className="ml-4 flex-1">
                          <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                            <div className="flex flex-wrap justify-between mb-1">
                              <h3 className="text-lg font-medium">Order #{order.order_number}</h3>
                              <span className="text-gray-500 text-sm">{order.order_date}</span>
                            </div>
                            {daysGapText && (
                              <p className="text-xs text-blue-600 mb-2 text-right">{daysGapText}</p>
                            )}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-2">
                              <div className="flex items-center">
                                <DollarSign className="w-4 h-4 text-gray-500 mr-1" />
                                <span className="text-gray-700">{order.total_amount}</span>
                              </div>
                            </div>
                            <div className="mt-2 pt-2 border-t border-gray-200">
                              <h4 className="text-sm font-medium text-gray-700 mb-1">Products:</h4>
                              <p className="text-gray-600">{order.products}</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
          
          {/* Right Column: Feedback Form */}
          <div className="lg:w-1/2">
            <div className="bg-white rounded-lg shadow-md p-6 h-full">
              <h2 className="text-xl font-semibold mb-4">Customer Feedback Form</h2>
              <form onSubmit={submitFeedback}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                  <div>
                    <label className="block text-gray-700 text-sm font-medium mb-1">
                      For what reason did you buy the health mix for the first time?
                    </label>
                    <input
                  type="text"
                  name="firstTimeReason"
                  value={feedbackForm.firstTimeReason}
                  onChange={handleFeedbackChange}
                  className="w-full p-2 border border-gray-300 rounded-lg"
                  required
                  aria-label="First time purchase reason"
                  title="Reason for first purchase"
                />
              </div>
              
              <div>
                <label className="block text-gray-700 text-sm font-medium mb-1">
                  Reason for ordering again?
                </label>
                <input
                  type="text"
                  name="reorderReason"
                  value={feedbackForm.reorderReason}
                  onChange={handleFeedbackChange}
                  className="w-full p-2 border border-gray-300 rounded-lg"
                  required
                  aria-label="Reason for reordering"
                  title="Reason for ordering again"
                />
              </div>
              
              <div>
                <label className="block text-gray-700 text-sm font-medium mb-1">
                What changes did you notice, and what did you like about the health mix?
                </label>
                <input
                  type="text"
                  name="likedFeatures"
                  value={feedbackForm.likedFeatures}
                  onChange={handleFeedbackChange}
                  className="w-full p-2 border border-gray-300 rounded-lg"
                  required
                  aria-label="Liked features"
                  title="What you liked about the health mix"
                />
              </div>
              
              <div>
                <label className="block text-gray-700 text-sm font-medium mb-1">
                  How did you use it? (Recipe)
                </label>
                <input
                  type="text"
                  name="usageRecipe"
                  value={feedbackForm.usageRecipe}
                  onChange={handleFeedbackChange}
                  className="w-full p-2 border border-gray-300 rounded-lg"
                  required
                  aria-label="Usage recipe"
                  title="How you used the health mix"
                />
              </div>
              
              <div>
                <label className="block text-gray-700 text-sm font-medium mb-1">
                  When did you use it? (Time of the day)
                </label>
                <input
                  type="text"
                  name="usageTime"
                  value={feedbackForm.usageTime}
                  onChange={handleFeedbackChange}
                  className="w-full p-2 border border-gray-300 rounded-lg"
                  required
                  aria-label="Time of usage"
                  title="When you used the health mix"
                />
              </div>
              

              <div>
                <label className="block text-gray-700 text-sm font-medium mb-1">
                  Who used this?
                </label>
                <input
                  type="text"
                  name="userProfile"
                  value={feedbackForm.userProfile}
                  onChange={handleFeedbackChange}
                  className="w-full p-2 border border-gray-300 rounded-lg"
                  required
                  aria-label="User profile"
                  title="Who used this product"
                />
              </div>
              
              <div>
                <label className="block text-gray-700 text-sm font-medium mb-1">
                  Gender
                </label>
                <select
                  name="gender"
                  value={feedbackForm.gender}
                  onChange={handleFeedbackChange}
                  className="w-full p-2 border border-gray-300 rounded-lg"
                  required
                  aria-label="Gender"
                  title="User's gender"
                >
                  <option value="">Select Gender</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              
              <div>
                <label className="block text-gray-700 text-sm font-medium mb-1">
                  Age
                </label>
                <input
                  type="text"
                  name="age"
                  value={feedbackForm.age}
                  onChange={handleFeedbackChange}
                  className="w-full p-2 border border-gray-300 rounded-lg"
                  required
                  aria-label="Age"
                  title="User's age"
                />
              </div>
              
              <div>
                <label className="block text-gray-700 text-sm font-medium mb-1">
                  Will you recommend this to others?
                </label>
                <select
                  name="wouldRecommend"
                  value={feedbackForm.wouldRecommend}
                  onChange={handleFeedbackChange}
                  className="w-full p-2 border border-gray-300 rounded-lg"
                  required
                  aria-label="Would recommend"
                  title="Whether you would recommend this to others"
                >
                  <option value="">Select</option>
                  <option value="Yes">Yes</option>
                  <option value="No">No</option>
                </select>
              </div>
            </div>
            
            <div className="mb-4">
              <label className="block text-gray-700 text-sm font-medium mb-1">
                Any feedback for us or to our product
              </label>
              <textarea
                name="generalFeedback"
                value={feedbackForm.generalFeedback}
                onChange={handleFeedbackChange}
                className="w-full p-2 border border-gray-300 rounded-lg"
                rows={3}
                required
                aria-label="General feedback"
                title="Any feedback for us or our product"
              ></textarea>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              <div>
                <label className="block text-gray-700 text-sm font-medium mb-1">
                  Do you want to opt for the monthly delivery model?
                </label>
                <select
                  name="monthlyDelivery"
                  value={feedbackForm.monthlyDelivery}
                  onChange={handleFeedbackChange}
                  className="w-full p-2 border border-gray-300 rounded-lg"
                  required
                  aria-label="Monthly delivery"
                  title="Whether you want to opt for monthly delivery"
                >
                  <option value="">Select</option>
                  <option value="Yes">Yes</option>
                  <option value="No">No</option>
                </select>
              </div>
              
              <div>
                <label className="block text-gray-700 text-sm font-medium mb-1">
                  Could you please give us a review, I will share the link via whatsapp?
                </label>
                <select
                  name="willGiveReview"
                  value={feedbackForm.willGiveReview}
                  onChange={handleFeedbackChange}
                  className="w-full p-2 border border-gray-300 rounded-lg"
                  required
                  aria-label="Will give review"
                  title="Whether you would give a review"
                >
                  <option value="">Select</option>
                  <option value="Yes">Yes</option>
                  <option value="No">No</option>
                </select>
              </div>
              
              <div>
                <label className="block text-gray-700 text-sm font-medium mb-1">
                  Shared the link
                </label>
                <select
                  name="sharedLink"
                  value={feedbackForm.sharedLink}
                  onChange={handleFeedbackChange}
                  className="w-full p-2 border border-gray-300 rounded-lg"
                  required
                  aria-label="Shared link"
                  title="Whether the link was shared"
                >
                  <option value="">Select</option>
                  <option value="Yes">Yes</option>
                  <option value="No">No</option>
                </select>
              </div>
              
              <div>
                <label className="block text-gray-700 text-sm font-medium mb-1">
                  Using in cover or in container
                </label>
                <select
                  name="usingInCoverOrContainer"
                  value={feedbackForm.usingInCoverOrContainer}
                  onChange={handleFeedbackChange}
                  className="w-full p-2 border border-gray-300 rounded-lg"
                  required
                  aria-label="Using in cover or container"
                  title="Whether the product was used in a cover or container"
                >
                  <option value="">Select</option>
                  <option value="Cover">Cover</option>
                  <option value="Container">Container</option>
                  <option value="Don't Know">Don't Know</option>
                  <option value="Cover with Container">Cover with Container</option>
                </select>
              </div>
            </div>
            
            <div className="flex justify-end">
              <button
                type="submit"
                className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-lg flex items-center justify-center transition-colors"
                disabled={loading}
              >
                {loading ? (
                  <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></span>
                ) : (
                  <ArrowRight className="w-4 h-4 mr-2" />
                )}
                Submit Feedback
              </button>
            </div>
            </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
