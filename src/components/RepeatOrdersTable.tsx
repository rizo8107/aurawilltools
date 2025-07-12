import { useState, useEffect, useCallback } from 'react';
import { Search, User, ShoppingCart, BarChart2, Phone, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import OrderDetailsDialog from './OrderDetailsDialog';

interface RepeatOrder {
  email: string;
  phone: string;
  order_count: number;
  order_ids: string[];
  order_numbers: string[];
  first_order: string;
  last_order: string;
  call_status?: 'Called' | 'Busy' | 'Cancelled' | 'No Response' | 'Wrong Number' | 'Invalid Number' | '';
}



export default function RepeatOrdersTable() {
  // Data and loading states
  const [orders, setOrders] = useState<RepeatOrder[]>([]);
  const [filteredOrders, setFilteredOrders] = useState<RepeatOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [callStatus, setCallStatus] = useState('');
  const [callStatusType, setCallStatusType] = useState<'success' | 'error' | 'info' | ''>('');
  
  // Dialog state
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedOrderNumber, setSelectedOrderNumber] = useState('');
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [totalPages, setTotalPages] = useState(1);
  
  // Filter state
  const [filters, setFilters] = useState({
    search: '',
    callStatus: '',
    dateRange: {
      start: '',
      end: ''
    },
    orderCount: {
      min: '',
      max: ''
    }
  });
  
  // Analytics state
  const [analytics, setAnalytics] = useState({
    totalOrders: 0,
    totalCustomers: 0,
    averageOrdersPerCustomer: 0,
    callStatusBreakdown: {
      Called: 0,
      Busy: 0,
      Cancelled: 0,
      'No Response': 0,
      'Wrong Number': 0,
      'Invalid Number': 0,
      'Not Called': 0
    }
  });

  // Apply filters and pagination whenever orders or filters change
  useEffect(() => {
    let filtered = [...orders];

    // Search filter
    if (filters.search) {
      const searchTerm = filters.search.toLowerCase();
      filtered = filtered.filter(order => 
        (order.email && order.email.toLowerCase().includes(searchTerm)) ||
        (order.phone && order.phone.includes(searchTerm)) ||
        (order.order_numbers && order.order_numbers.some(num => num && num.includes(searchTerm)))
      );
    }

    // Call status filter
    if (filters.callStatus) {
      filtered = filtered.filter(order => order.call_status === filters.callStatus);
    }

    // Date range filter
    if (filters.dateRange.start && filters.dateRange.end) {
      filtered = filtered.filter(order => {
        const lastOrderDate = new Date(order.last_order);
        return lastOrderDate >= new Date(filters.dateRange.start) && lastOrderDate <= new Date(filters.dateRange.end);
      });
    }

    // Order count filter
    if (filters.orderCount.min) {
      filtered = filtered.filter(order => order.order_count >= parseInt(filters.orderCount.min, 10));
    }
    if (filters.orderCount.max) {
      filtered = filtered.filter(order => order.order_count <= parseInt(filters.orderCount.max, 10));
    }

    setFilteredOrders(filtered);
    setTotalPages(Math.ceil(filtered.length / itemsPerPage));
    setCurrentPage(1); // Reset to first page after filtering

  }, [orders, filters, itemsPerPage]);

  const paginatedOrders = filteredOrders.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const fetchRepeatOrders = useCallback(async () => {
    setLoading(true);
    setError('');
    
    try {
      const response = await fetch('https://app-supabase.9krcxo.easypanel.host/rest/v1/rpc/get_repeat_orders', {
        method: 'POST',
        headers: {
          'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzUwMDEyMjAwLCJleHAiOjE5MDc3Nzg2MDB9.eJ81pv114W4ZLvg0E-AbNtNZExPoLYbxGdeWTY5PVVs',
          'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzUwMDEyMjAwLCJleHAiOjE5MDc3Nzg2MDB9.eJ81pv114W4ZLvg0E-AbNtNZExPoLYbxGdeWTY5PVVs',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({})
      });
      
      if (!response.ok) {
        throw new Error(`Error: ${response.status}`);
      }
      
      const data: RepeatOrder[] = await response.json();
      
      // Process the data and calculate analytics
      const processedData = data.map((order: RepeatOrder) => ({
        ...order,
        call_status: (order.call_status || '') as RepeatOrder['call_status'] // Ensure call_status exists and is correctly typed
      }));
      
      // Set the orders
      setOrders(processedData);
      setFilteredOrders(processedData);
      
      // Calculate pagination
      setTotalPages(Math.ceil(processedData.length / itemsPerPage));
      
      // Calculate analytics
      const totalOrders = processedData.reduce((sum: number, order: RepeatOrder) => sum + order.order_count, 0);
      const totalCustomers = processedData.length;
      const averageOrdersPerCustomer = totalCustomers > 0 ? totalOrders / totalCustomers : 0;
      
      // Count call status breakdown
      const callStatusCounts = {
        Called: 0,
        Busy: 0,
        Cancelled: 0,
        'No Response': 0,
        'Wrong Number': 0,
        'Invalid Number': 0,
        'Not Called': 0
      };
      
      processedData.forEach((order: RepeatOrder) => {
        const status = order.call_status as keyof typeof callStatusCounts;
        if (status && Object.prototype.hasOwnProperty.call(callStatusCounts, status)) {
          callStatusCounts[status] += 1;
        } else {
          callStatusCounts['Not Called'] += 1;
        }
      });
      
      setAnalytics({
        totalOrders,
        totalCustomers,
        averageOrdersPerCustomer,
        callStatusBreakdown: callStatusCounts
      });
      
    } catch (err) {
      setError('Failed to fetch repeat orders. Please try again.');
      console.error('Error fetching repeat orders:', err);
    } finally {
      setLoading(false);
    }
  }, [itemsPerPage]); // Dependency on itemsPerPage to recalculate pagination if it changes

  useEffect(() => {
    fetchRepeatOrders();
  }, [fetchRepeatOrders]);

  const handleCall = async (phoneNumber: string) => {
    setCallStatus('Initiating call...');
    setCallStatusType('info');

    if (!phoneNumber || phoneNumber.length < 10) {
      setCallStatus('Invalid phone number.');
      setCallStatusType('error');
      return;
    }

    const apiUrl = `https://app.callerdesk.io/api/click_to_call_v2?calling_party_a=09363744463&calling_party_b=${phoneNumber}&deskphone=08062863034&authcode=aee60239bd42b6427d82b94bbb676a3d&call_from_did=1`;

    try {
      const response = await fetch(apiUrl);
      const data = await response.json();

      const successText = 'Call to Customer Initiate Successfully';
      
      if (data && data.message && data.message.includes(successText)) {
        setCallStatus(data.message);
        setCallStatusType('success');
      } else {
        const errorMessage = data.message || 'An unknown error occurred.';
        setCallStatus(`Failed: ${errorMessage}`);
        setCallStatusType('error');
      }
    } catch (err) {
      console.error('Click-to-call network/parsing error:', err);
      const errorMessage = err instanceof Error ? err.message : String(err);
      setCallStatus(`Failed to initiate call: ${errorMessage}`);
      setCallStatusType('error');
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const handleFilterChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFilters(prev => ({ ...prev, [name]: value }));
  };

  const handleDateRangeChange = (e: React.ChangeEvent<HTMLInputElement>, field: 'start' | 'end') => {
    const { value } = e.target;
    setFilters(prev => ({ 
      ...prev, 
      dateRange: { ...prev.dateRange, [field]: value } 
    }));
  };

  const handleOrderCountChange = (e: React.ChangeEvent<HTMLInputElement>, field: 'min' | 'max') => {
    const { value } = e.target;
    setFilters(prev => ({ 
      ...prev, 
      orderCount: { ...prev.orderCount, [field]: value } 
    }));
  };

  return (
    <div className="bg-gray-100 min-h-screen font-sans py-4 -mx-40">
      <header className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Repeat Customers</h1>
        <p className="text-gray-600 mt-1">Analyze, filter, and manage customers with repeat orders.</p>
      </header>

      {/* Analytics Section */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
        <div className="bg-white p-5 rounded-lg shadow flex items-center justify-between">
          <div>
            <h3 className="text-sm font-medium text-gray-500">Total Customers</h3>
            <p className="mt-1 text-3xl font-semibold text-gray-900">{analytics.totalCustomers}</p>
          </div>
          <div className="bg-blue-100 p-3 rounded-full">
            <User className="h-6 w-6 text-blue-600" />
          </div>
        </div>
        <div className="bg-white p-5 rounded-lg shadow flex items-center justify-between">
          <div>
            <h3 className="text-sm font-medium text-gray-500">Total Repeat Orders</h3>
            <p className="mt-1 text-3xl font-semibold text-gray-900">{analytics.totalOrders}</p>
          </div>
          <div className="bg-green-100 p-3 rounded-full">
            <ShoppingCart className="h-6 w-6 text-green-600" />
          </div>
        </div>
        <div className="bg-white p-5 rounded-lg shadow flex items-center justify-between">
          <div>
            <h3 className="text-sm font-medium text-gray-500">Avg Orders / Customer</h3>
            <p className="mt-1 text-3xl font-semibold text-gray-900">{analytics.averageOrdersPerCustomer.toFixed(2)}</p>
          </div>
          <div className="bg-yellow-100 p-3 rounded-full">
            <BarChart2 className="h-6 w-6 text-yellow-600" />
          </div>
        </div>
        <div className="bg-white p-5 rounded-lg shadow flex items-center justify-between">
          <div>
            <h3 className="text-sm font-medium text-gray-500">Called / Not Called</h3>
            <p className="mt-1 text-3xl font-semibold text-gray-900">
              {analytics.callStatusBreakdown.Called} 
              <span className="text-gray-400 mx-1">/</span> 
              {analytics.callStatusBreakdown['Not Called']}
            </p>
          </div>
          <div className="bg-red-100 p-3 rounded-full">
            <Phone className="h-6 w-6 text-red-600" />
          </div>
        </div>
      </div>

      {/* Call Status & Error Messages */}
      {callStatus && (
        <div
          className={`mb-4 p-3 rounded-lg ${
            callStatusType === 'success'
              ? 'bg-green-50 text-green-700 border border-green-200'
              : callStatusType === 'error'
              ? 'bg-red-50 text-red-700 border border-red-200'
              : 'bg-blue-50 text-blue-700 border border-blue-200'
          }`}>
          {callStatus}
        </div>
      )}
      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 text-red-700 border border-red-200">
          {error}
        </div>
      )}

      <div className="bg-white rounded-lg shadow">
        <div className="p-4 border-b border-gray-200">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="text"
                name="search"
                placeholder="Search by email, phone, order..."
                value={filters.search}
                onChange={handleFilterChange}
                className="w-full p-2 pl-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 transition"
              />
            </div>
            <select
              name="callStatus"
              value={filters.callStatus}
              onChange={handleFilterChange}
              className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 transition"
              aria-label="Filter by call status"
            >
              <option value="">All Call Statuses</option>
              <option value="Called">Called</option>
              <option value="Busy">Busy</option>
              <option value="Cancelled">Cancelled</option>
              <option value="No Response">No Response</option>
              <option value="Wrong Number">Wrong Number</option>
              <option value="Invalid Number">Invalid Number</option>
              <option value="">Not Called</option>
            </select>
            <div className="grid grid-cols-2 gap-2">
              <input type="date" name="start" value={filters.dateRange.start} onChange={(e) => handleDateRangeChange(e, 'start')} className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 transition" aria-label="Start date" />
              <input type="date" name="end" value={filters.dateRange.end} onChange={(e) => handleDateRangeChange(e, 'end')} className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 transition" aria-label="End date" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input type="number" name="min" placeholder="Min Orders" value={filters.orderCount.min} onChange={(e) => handleOrderCountChange(e, 'min')} className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 transition" aria-label="Minimum orders" />
              <input type="number" name="max" placeholder="Max Orders" value={filters.orderCount.max} onChange={(e) => handleOrderCountChange(e, 'max')} className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 transition" aria-label="Maximum orders" />
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left text-gray-500">
            <thead className="text-xs text-gray-700 uppercase bg-gray-50 hidden lg:table-header-group">
              <tr>
                <th scope="col" className="px-6 py-3 w-1/3">Customer</th>
                <th scope="col" className="px-6 py-3 w-1/12">Status</th>
                <th scope="col" className="px-6 py-3 w-1/3">Order Info</th>
                <th scope="col" className="px-6 py-3 w-1/6">Date Range</th>
                <th scope="col" className="px-6 py-3 w-auto text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr className="bg-white">
                  <td colSpan={5} className="py-8 text-center text-gray-500">Loading customers...</td>
                </tr>
              ) : paginatedOrders.length > 0 ? (
                paginatedOrders.map((order) => (
                  <tr key={order.email} className="bg-white border-b hover:bg-gray-50 block lg:table-row">
                    <td className="px-6 py-4 font-medium text-gray-900 block lg:table-cell" data-label="Customer">
                      <div className="font-bold">{order.email}</div>
                      <div>{order.phone}</div>
                    </td>
                    <td className="px-6 py-4 block lg:table-cell" data-label="Status">
                      <span
                        className={`px-2.5 py-0.5 text-xs font-medium rounded-full ${
                          order.call_status === 'Called'
                            ? 'bg-green-100 text-green-800'
                            : order.call_status === 'No Response'
                            ? 'bg-yellow-100 text-yellow-800'
                            : order.call_status
                            ? 'bg-red-100 text-red-800'
                            : 'bg-gray-100 text-gray-800'
                        }`}>
                        {order.call_status || 'Not Called'}
                      </span>
                    </td>
                    <td className="px-6 py-4 block lg:table-cell" data-label="Order Info">
                      <div>{order.order_count} orders</div>
                      <div className="text-xs text-gray-600 break-words">IDs: {order.order_ids.join(', ')}</div>
                    </td>
                    <td className="px-6 py-4 block lg:table-cell" data-label="Date Range">
                      <div>First: {formatDate(order.first_order)}</div>
                      <div>Last: {formatDate(order.last_order)}</div>
                    </td>
                    <td className="px-6 py-4 block lg:table-cell text-center" data-label="Actions">
                      <div className="flex items-center justify-center gap-2">
                        <button onClick={() => handleCall(order.phone)} className="font-medium text-indigo-600 hover:text-indigo-800 p-2 rounded-md hover:bg-indigo-50 transition-colors">Call</button>
                        <button
                          onClick={() => {
                            if (order.order_numbers && order.order_numbers.length > 0) {
                              setSelectedOrderNumber(order.order_numbers[0]);
                              setIsDialogOpen(true);
                            }
                          }}
                          className="font-medium text-indigo-600 hover:text-indigo-800 p-2 rounded-md hover:bg-indigo-50 transition-colors"
                        >
                          View Details
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr className="bg-white">
                  <td colSpan={5} className="py-8 text-center text-gray-500">No repeat orders found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between p-4 border-t border-gray-200 flex-wrap gap-4">
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-700">Rows per page:</span>
              <select
                value={itemsPerPage}
                onChange={(e) => {
                  setItemsPerPage(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="p-1 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 transition-colors"
                aria-label="Rows per page"
              >
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>
            <nav aria-label="Pagination">
              <ul className="inline-flex items-center -space-x-px">
                <li>
                  <button onClick={() => setCurrentPage(1)} disabled={currentPage === 1} className="px-3 py-2 ml-0 leading-tight text-gray-500 bg-white border border-gray-300 rounded-l-lg hover:bg-gray-100 hover:text-gray-700 disabled:opacity-50" aria-label="Go to first page">
                    <ChevronsLeft className="w-4 h-4" />
                  </button>
                </li>
                <li>
                  <button onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))} disabled={currentPage === 1} className="px-3 py-2 leading-tight text-gray-500 bg-white border border-gray-300 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-50" aria-label="Go to previous page">
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                </li>
                <li>
                  <span className="px-3 py-2 leading-tight text-gray-500 bg-white border border-gray-300">Page {currentPage} of {totalPages}</span>
                </li>
                <li>
                  <button onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))} disabled={currentPage === totalPages} className="px-3 py-2 leading-tight text-gray-500 bg-white border border-gray-300 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-50" aria-label="Go to next page">
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </li>
                <li>
                  <button onClick={() => setCurrentPage(totalPages)} disabled={currentPage === totalPages} className="px-3 py-2 leading-tight text-gray-500 bg-white border border-gray-300 rounded-r-lg hover:bg-gray-100 hover:text-gray-700 disabled:opacity-50" aria-label="Go to last page">
                    <ChevronsRight className="w-4 h-4" />
                  </button>
                </li>
              </ul>
            </nav>
          </div>
        )}
      </div>

      {/* Order Details Dialog */}
      <OrderDetailsDialog
        isOpen={isDialogOpen}
        onClose={() => setIsDialogOpen(false)}
        orderNumber={selectedOrderNumber}
      />
    </div>
  );
}
