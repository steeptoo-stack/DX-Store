import React from 'react';
import { useStore } from '../context/StoreContext';
import { 
  CheckCircle, 
  MessageCircle, 
  Truck, 
  Clock, 
  Printer, 
  ShieldCheck, 
  ArrowRight,
  PhoneCall
} from 'lucide-react';

interface OrderSuccessModalProps {
  orderId: string | null;
  onClose: () => void;
  onTrackOrder: (orderId: string) => void;
  onPrintInvoice: (orderId: string) => void;
}

export const OrderSuccessModal: React.FC<OrderSuccessModalProps> = ({
  orderId,
  onClose,
  onTrackOrder,
  onPrintInvoice
}) => {
  const { orders, settings } = useStore();

  if (!orderId) return null;

  const order = orders.find(o => o.id === orderId);
  if (!order) return null;

  const currency = settings.store?.currencySymbol || '৳';
  const whatsappNumber = settings.contact.whatsapp || '01761861680';
  const cleanWhatsApp = whatsappNumber.replace(/[^0-9]/g, '');
  const advancePaid =
    order.advanceAmount ?? (order.paymentMethod === 'cod' ? 0 : order.deliveryCharge);
  const codRemaining =
    order.remainingCodAmount ?? Math.max(0, order.total - advancePaid);

  const methodNames: Record<string, string> = {
    nagad: 'Nagad',
    rocket: 'Rocket',
    upay: 'Upay',
    bkash: 'bKash',
    cod: 'Cash on Delivery',
  };
  const methodLabel = methodNames[order.paymentMethod] || order.paymentMethod.toUpperCase();

  const waMessage = `Hello DX Security BD! 
I have placed Order #${order.id}.
Customer: ${order.customerName}
Phone: ${order.phone}
Product Price: ${currency}${order.subtotal}
Advance Delivery Paid: ${currency}${advancePaid}
Remaining COD Due: ${currency}${codRemaining}
Payment Method: ${methodLabel}${
    order.transactionId ? ` (TrxID: ${order.transactionId})` : ''
  }${order.paymentScreenshotUrl ? ' [Payment Screenshot Uploaded]' : ''}
Please confirm and arrange dispatch!`;

  const waUrl = `https://wa.me/88${cleanWhatsApp.startsWith('88') ? cleanWhatsApp.slice(2) : cleanWhatsApp}?text=${encodeURIComponent(
    waMessage
  )}`;

  const methodStyleMap: Record<string, { box: string; badge: string; sub: string }> = {
    nagad: {
      box: 'bg-orange-950/40 border-orange-800/80 text-orange-200',
      badge: 'bg-orange-900 text-orange-300',
      sub: 'text-orange-300',
    },
    rocket: {
      box: 'bg-purple-950/40 border-purple-800/80 text-purple-200',
      badge: 'bg-purple-900 text-purple-300',
      sub: 'text-purple-300',
    },
    upay: {
      box: 'bg-teal-950/40 border-teal-800/80 text-teal-200',
      badge: 'bg-teal-900 text-teal-300',
      sub: 'text-teal-300',
    },
    bkash: {
      box: 'bg-pink-950/40 border-pink-800/80 text-pink-200',
      badge: 'bg-pink-900 text-pink-300',
      sub: 'text-pink-300',
    },
  };
  const activeStyle = methodStyleMap[order.paymentMethod];

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-200">
      <div 
        className="relative w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden p-6 sm:p-8 space-y-6 text-center"
        onClick={e => e.stopPropagation()}
      >
        {/* Success Icon */}
        <div className="mx-auto w-16 h-16 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
          <CheckCircle className="w-9 h-9" />
        </div>

        <div>
          <span className="text-xs uppercase font-mono font-bold tracking-widest text-cyan-400 bg-cyan-950 px-3 py-1 rounded-full border border-cyan-800">
            Order Submitted Successfully
          </span>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-white mt-3">
            Thank you, {order.customerName}!
          </h2>
          <p className="text-sm text-slate-300 mt-1">
            Your order has been received and queued for verification.
          </p>
        </div>

        {/* Order Card Overview */}
        <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 sm:p-5 text-left space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-800 gap-2">
            <div>
              <p className="text-xs text-slate-400">Order Reference ID</p>
              <p className="text-xl font-black font-mono text-cyan-400">{order.id}</p>
            </div>
            <div className="sm:text-right">
              <p className="text-xs text-slate-400">Remaining COD on Delivery</p>
              <p className="text-xl font-bold font-mono text-amber-300">
                {currency}{codRemaining.toLocaleString()}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 p-2.5 rounded-xl bg-slate-900/70 border border-slate-800 text-xs">
            <div>
              <span className="text-[11px] text-slate-400 block">Product Price</span>
              <span className="font-mono font-bold text-white">{currency}{order.subtotal.toLocaleString()}</span>
            </div>
            <div>
              <span className="text-[11px] text-slate-400 block">Delivery Charge</span>
              <span className="font-mono font-bold text-white">{currency}{order.deliveryCharge.toLocaleString()}</span>
            </div>
            <div>
              <span className="text-[11px] text-emerald-400 block">Advance Paid</span>
              <span className="font-mono font-bold text-emerald-300">{currency}{advancePaid.toLocaleString()}</span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div>
              <span className="text-slate-400">Recipient Phone:</span>
              <p className="font-mono text-slate-200 font-semibold">{order.phone}</p>
            </div>
            <div>
              <span className="text-slate-400">Delivery Address:</span>
              <p className="text-slate-200">{order.address}, {order.thana}, {order.district}</p>
            </div>
          </div>

          {/* Payment Status Notice */}
          <div className="pt-2 border-t border-slate-800">
            {order.paymentMethod !== 'cod' && activeStyle ? (
              <div className={`p-3 rounded-xl border text-xs space-y-1 ${activeStyle.box}`}>
                <div className="flex items-center justify-between font-bold gap-2">
                  <span>{methodLabel} Send Money Proof</span>
                  <span className={`px-2 py-0.5 rounded font-mono text-[10px] ${activeStyle.badge}`}>
                    Status: Pending Verification
                  </span>
                </div>
                <p className={`text-[11px] ${activeStyle.sub}`}>
                  {order.transactionId ? (
                    <>
                      TrxID: <span className="font-mono font-bold text-white">{order.transactionId}</span>
                    </>
                  ) : (
                    <span>TrxID: Optional (not entered)</span>
                  )}
                  {order.paymentScreenshotUrl && (
                    <>
                      {' '}• <span className="font-semibold text-emerald-300">Payment Screenshot Uploaded ✓</span>
                    </>
                  )}
                  {order.paymentPhoneNumber && (
                    <>
                      {' '}• Sender: <span className="font-mono font-bold text-white">{order.paymentPhoneNumber}</span>
                    </>
                  )}
                </p>
                <p className="text-[10px] text-slate-300">
                  *Only the delivery charge ({currency}{advancePaid.toLocaleString()}) is paid in advance. Remaining {currency}{codRemaining.toLocaleString()} is payable in cash upon delivery.
                </p>
              </div>
            ) : (
              <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-300 flex items-center gap-2">
                <Truck className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Cash on Delivery: Please keep {currency}{codRemaining.toLocaleString()} ready for the courier.</span>
              </div>
            )}
          </div>
        </div>

        {/* Action CTAs */}
        <div className="space-y-3">
          {/* Direct WhatsApp Confirmation Button */}
          <a
            href={waUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full py-3.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm tracking-wide shadow-xl shadow-emerald-600/30 flex items-center justify-center gap-2 transition-all hover:scale-102"
          >
            <MessageCircle className="w-5 h-5 fill-current" />
            <span>Send Order Info to WhatsApp ({whatsappNumber})</span>
          </a>

          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => {
                onClose();
                onTrackOrder(order.id);
              }}
              className="py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-colors flex items-center justify-center gap-2"
            >
              <Truck className="w-4 h-4 text-cyan-400" />
              <span>Track Live Status</span>
            </button>

            <button
              onClick={() => onPrintInvoice(order.id)}
              className="py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-colors flex items-center justify-center gap-2"
            >
              <Printer className="w-4 h-4 text-emerald-400" />
              <span>Print Official Invoice</span>
            </button>
          </div>
        </div>

        <div>
          <button
            onClick={onClose}
            className="text-xs text-slate-400 hover:text-cyan-400 transition-colors underline"
          >
            Return to Store & Continue Shopping
          </button>
        </div>

      </div>
    </div>
  );
};
