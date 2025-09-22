import { X } from 'lucide-react';
import RepeatCampaign from './RepeatCampaign';

interface OrderDetailsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  orderNumber: string;
}

export default function OrderDetailsDialog({ isOpen, onClose, orderNumber }: OrderDetailsDialogProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-6xl max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center p-4 border-b">
          <h2 className="text-xl font-semibold">Order Details: #{orderNumber}</h2>
          <button 
            onClick={onClose}
            className="p-1 rounded-full hover:bg-gray-200 transition-colors"
            aria-label="Close dialog"
          >
            <X size={24} />
          </button>
        </div>
        
        <div className="p-4">
          <RepeatCampaign initialOrderNumber={orderNumber} />
        </div>
      </div>
    </div>
  );
}
