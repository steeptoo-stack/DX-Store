import React, { useState, useEffect, useRef } from 'react';
import { useStore } from '../context/StoreContext';
import { PaymentMethod } from '../types';
import {
  X,
  ShieldCheck,
  Copy,
  Check,
  AlertCircle,
  Lock,
  Info,
  Upload,
  Image as ImageIcon,
  Trash2,
  RefreshCw,
} from 'lucide-react';

interface CheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOrderPlaced: (orderId: string) => void;
}

interface MobileMethodConfig {
  id: Exclude<PaymentMethod, 'cod'>;
  label: string;
  enabled: boolean;
  number: string;
  typeLabel: string;
  instructions: string;
  accentBorder: string;
  accentBg: string;
  accentText: string;
  badgeClass: string;
  ringClass: string;
  placeholderTrx: string;
}

export const CheckoutModal: React.FC<CheckoutModalProps> = ({
  isOpen,
  onClose,
  onOrderPlaced,
}) => {
  const { cart, cartSubtotal, settings, placeOrder, showNotification } = useStore();

  const [customerName, setCustomerName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [district, setDistrict] = useState<'Dhaka' | 'Outside Dhaka'>('Dhaka');
  const [thana, setThana] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');

  const p = settings.payment;

  const mobileMethods: MobileMethodConfig[] = [
    {
      id: 'nagad',
      label: 'Nagad',
      enabled: p.nagadEnabled,
      number: p.nagadNumber || '01721216545',
      typeLabel: p.nagadType || 'Send Money',
      instructions: p.nagadInstructions,
      accentBorder: 'border-orange-500',
      accentBg: 'bg-orange-950/40',
      accentText: 'text-orange-300',
      badgeClass: 'bg-orange-900/60 text-orange-200 border-orange-700/60',
      ringClass: 'focus:ring-orange-500',
      placeholderTrx: 'e.g. NG89X201...',
    },
    {
      id: 'rocket',
      label: 'Rocket',
      enabled: p.rocketEnabled,
      number: p.rocketNumber || '01721216545',
      typeLabel: p.rocketType || 'Send Money',
      instructions: p.rocketInstructions,
      accentBorder: 'border-purple-500',
      accentBg: 'bg-purple-950/40',
      accentText: 'text-purple-300',
      badgeClass: 'bg-purple-900/60 text-purple-200 border-purple-700/60',
      ringClass: 'focus:ring-purple-500',
      placeholderTrx: 'e.g. RK74A102...',
    },
    {
      id: 'upay',
      label: 'Upay',
      enabled: p.upayEnabled,
      number: p.upayNumber || '01721216545',
      typeLabel: p.upayType || 'Send Money',
      instructions: p.upayInstructions,
      accentBorder: 'border-sky-500',
      accentBg: 'bg-sky-950/40',
      accentText: 'text-sky-300',
      badgeClass: 'bg-sky-900/60 text-sky-200 border-sky-700/60',
      ringClass: 'focus:ring-sky-500',
      placeholderTrx: 'e.g. UP92M310...',
    },
    {
      id: 'bkash',
      label: 'bKash',
      enabled: p.bkashEnabled,
      number: p.bkashNumber || '01721216545',
      typeLabel: p.bkashType || 'Send Money',
      instructions: p.bkashInstructions,
      accentBorder: 'border-pink-500',
      accentBg: 'bg-pink-950/40',
      accentText: 'text-pink-300',
      badgeClass: 'bg-pink-900/60 text-pink-200 border-pink-700/60',
      ringClass: 'focus:ring-pink-500',
      placeholderTrx: 'e.g. BK9X8291...',
    },
  ];

  const enabledMobileMethods = mobileMethods.filter(m => m.enabled);

  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(() => {
    const first = enabledMobileMethods.find(
      m => m.number && m.number !== 'Not configured'
    ) || enabledMobileMethods[0];
    return first ? first.id : 'nagad';
  });

  // Payment proof states
  const [paymentPhoneNumber, setPaymentPhoneNumber] = useState('');
  const [transactionId, setTransactionId] = useState('');
  const [screenshotFile, setScreenshotFile] = useState<File | null>(null);
  const [screenshotPreviewUrl, setScreenshotPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Copied & submission state
  const [copiedNumber, setCopiedNumber] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formErrors, setFormErrors] = useState<{ [key: string]: string }>({});

  // Sync selected method if admin toggles payment methods or loads settings from Supabase
  useEffect(() => {
    const current = enabledMobileMethods.find(m => m.id === paymentMethod);
    if (!current && enabledMobileMethods.length > 0) {
      const configured = enabledMobileMethods.find(
        m => m.number && m.number !== 'Not configured'
      );
      setPaymentMethod((configured || enabledMobileMethods[0]).id);
    }
  }, [
    p.nagadEnabled,
    p.rocketEnabled,
    p.upayEnabled,
    p.bkashEnabled,
    p.nagadNumber,
    p.rocketNumber,
    p.upayNumber,
    p.bkashNumber,
  ]);

  // Clean up object URLs
  useEffect(() => {
    return () => {
      if (screenshotPreviewUrl) {
        URL.revokeObjectURL(screenshotPreviewUrl);
      }
    };
  }, [screenshotPreviewUrl]);

  if (!isOpen) return null;

  const currency = settings.store?.currencySymbol || '৳';
  const isInsideDhaka = district === 'Dhaka';
  let deliveryFee = isInsideDhaka
    ? settings.delivery.insideDhakaCharge
    : settings.delivery.outsideDhakaCharge;

  if (
    settings.delivery.freeDeliveryThreshold > 0 &&
    cartSubtotal >= settings.delivery.freeDeliveryThreshold
  ) {
    deliveryFee = 0;
  }

  // Payment Policy: Only Delivery Charge in advance; Remaining Product Price as COD
  const advanceAmount = deliveryFee;
  const remainingCodAmount = cartSubtotal;
  const grandTotal = cartSubtotal + deliveryFee;

  const activeMethod =
    enabledMobileMethods.find(m => m.id === paymentMethod) ||
    enabledMobileMethods[0] ||
    mobileMethods[0];

  const isMethodConfigured =
    Boolean(activeMethod?.number?.trim()) && activeMethod.number !== 'Not configured';

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedNumber(label);
    showNotification(`Copied ${text} to clipboard`, 'success');
    setTimeout(() => setCopiedNumber(null), 2500);
  };

  const handleScreenshotSelect = (file?: File | null) => {
    if (!file) return;
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    const validExt = /\.(jpg|jpeg|png|webp)$/i.test(file.name);
    if (!allowedTypes.includes(file.type.toLowerCase()) && !validExt) {
      setFormErrors(prev => ({
        ...prev,
        paymentProof: 'Please select a valid JPG, JPEG, PNG, or WEBP screenshot.',
      }));
      showNotification('Only JPG, JPEG, PNG, and WEBP formats are supported.', 'error');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setFormErrors(prev => ({
        ...prev,
        paymentProof: 'Screenshot file size must be less than 5MB.',
      }));
      showNotification('Screenshot file size must be less than 5MB.', 'error');
      return;
    }

    if (screenshotPreviewUrl) {
      URL.revokeObjectURL(screenshotPreviewUrl);
    }
    const preview = URL.createObjectURL(file);
    setScreenshotFile(file);
    setScreenshotPreviewUrl(preview);
    setFormErrors(prev => {
      const next = { ...prev };
      delete next.paymentProof;
      return next;
    });
  };

  const handleRemoveScreenshot = () => {
    if (screenshotPreviewUrl) {
      URL.revokeObjectURL(screenshotPreviewUrl);
    }
    setScreenshotFile(null);
    setScreenshotPreviewUrl(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const validate = () => {
    const errors: { [key: string]: string } = {};

    if (!customerName.trim()) {
      errors.customerName = 'Please enter your full name';
    }

    if (!phone.trim()) {
      errors.phone = 'Mobile phone number is required';
    } else {
      const cleanPhone = phone.replace(/[^0-9]/g, '');
      if (cleanPhone.length < 11) {
        errors.phone = 'Please enter a valid 11-digit Bangladesh phone number (e.g. 017xxxxxxxx)';
      }
    }

    if (!address.trim()) {
      errors.address = 'Detailed delivery address is required';
    }

    if (!thana.trim()) {
      errors.thana = 'Thana / Upazila is required';
    }

    if (enabledMobileMethods.length === 0) {
      errors.paymentMethod = 'No mobile banking payment method is currently enabled.';
    } else if (!isMethodConfigured) {
      errors.paymentMethod = `${activeMethod.label} number is not configured yet. Please select another method.`;
    }

    // Important Rule: Either Transaction ID OR Payment Screenshot is required (not both)
    const hasTrxId = transactionId.trim().length > 0;
    const hasScreenshot = Boolean(screenshotFile);
    if (!hasTrxId && !hasScreenshot) {
      errors.paymentProof =
        'আপনার পেমেন্ট নিশ্চিত করতে Transaction ID অথবা Payment Screenshot যেকোনো একটি প্রদান করুন।';
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) {
      showNotification('Please complete required delivery & payment proof details', 'error');
      return;
    }

    if (cart.length === 0) {
      showNotification('Your cart is empty', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      const order = await placeOrder({
        customerName: customerName.trim(),
        phone: phone.trim(),
        email: email.trim(),
        address: address.trim(),
        district,
        thana: thana.trim(),
        notes: notes.trim(),
        paymentMethod: activeMethod.id,
        paymentPhoneNumber: paymentPhoneNumber.trim() || undefined,
        transactionId: transactionId.trim().toUpperCase() || undefined,
        paymentScreenshotFile: screenshotFile,
      });

      handleRemoveScreenshot();
      setTransactionId('');
      setPaymentPhoneNumber('');
      setFormErrors({});
      onClose();
      onOrderPlaced(order.id);
    } catch (err: any) {
      showNotification(err?.message || 'Failed to submit order. Please try again.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 animate-in fade-in duration-200">
      <div
        className="relative w-full max-w-4xl bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between p-4 sm:p-6 border-b border-slate-800 bg-slate-950/70">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-cyan-500/20 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white">
                Complete Your Order
              </h2>
              <p className="text-xs text-slate-400">
                Advance Delivery Charge Only — Pay Product Price on Delivery (COD)
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors"
            aria-label="Close checkout"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="overflow-y-auto p-4 sm:p-6 space-y-6 flex-1">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* Left Column: Customer & Shipping Details */}
            <div className="lg:col-span-6 space-y-5">
              <div className="border-b border-slate-800 pb-2">
                <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-cyan-500 text-slate-950 text-xs font-bold flex items-center justify-center">
                    1
                  </span>
                  <span>Delivery Information</span>
                </h3>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Full Name <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={customerName}
                    onChange={e => setCustomerName(e.target.value)}
                    placeholder="e.g. Engr. Tanvir Ahmed"
                    className={`w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500 ${
                      formErrors.customerName ? 'border-red-500' : 'border-slate-800'
                    }`}
                  />
                  {formErrors.customerName && (
                    <p className="text-[11px] text-red-400 mt-1">{formErrors.customerName}</p>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Phone Number (BD) <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="tel"
                      value={phone}
                      onChange={e => setPhone(e.target.value)}
                      placeholder="017xxxxxxxx"
                      className={`w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500 font-mono ${
                        formErrors.phone ? 'border-red-500' : 'border-slate-800'
                      }`}
                    />
                    {formErrors.phone && (
                      <p className="text-[11px] text-red-400 mt-1">{formErrors.phone}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Email Address <span className="text-slate-500">(Optional)</span>
                    </label>
                    <input
                      type="email"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      placeholder="name@example.com"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Delivery Region <span className="text-red-400">*</span>
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setDistrict('Dhaka')}
                      className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                        district === 'Dhaka'
                          ? 'bg-cyan-950/60 border-cyan-500 text-cyan-300 shadow-md shadow-cyan-950/40'
                          : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                      }`}
                    >
                      <p className="font-semibold text-xs">Inside Dhaka</p>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Fee: {currency}{settings.delivery.insideDhakaCharge}
                      </p>
                      <p className="text-[10px] text-cyan-400 mt-0.5 font-mono">
                        {settings.delivery.estimatedDeliveryInside}
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => setDistrict('Outside Dhaka')}
                      className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                        district === 'Outside Dhaka'
                          ? 'bg-cyan-950/60 border-cyan-500 text-cyan-300 shadow-md shadow-cyan-950/40'
                          : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                      }`}
                    >
                      <p className="font-semibold text-xs">Outside Dhaka (All 64 Dist.)</p>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Fee: {currency}{settings.delivery.outsideDhakaCharge}
                      </p>
                      <p className="text-[10px] text-cyan-400 mt-0.5 font-mono">
                        {settings.delivery.estimatedDeliveryOutside}
                      </p>
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Thana / Upazila <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={thana}
                    onChange={e => setThana(e.target.value)}
                    placeholder="e.g. Dhanmondi, Uttara, Panchlaish, Bogura Sadar"
                    className={`w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500 ${
                      formErrors.thana ? 'border-red-500' : 'border-slate-800'
                    }`}
                  />
                  {formErrors.thana && (
                    <p className="text-[11px] text-red-400 mt-1">{formErrors.thana}</p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Detailed Delivery Address <span className="text-red-400">*</span>
                  </label>
                  <textarea
                    rows={2}
                    value={address}
                    onChange={e => setAddress(e.target.value)}
                    placeholder="House / Flat / Road / Sector / Landmark"
                    className={`w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500 ${
                      formErrors.address ? 'border-red-500' : 'border-slate-800'
                    }`}
                  />
                  {formErrors.address && (
                    <p className="text-[11px] text-red-400 mt-1">{formErrors.address}</p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">
                    Order / Delivery Notes (Optional)
                  </label>
                  <input
                    type="text"
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    placeholder="e.g. Call before delivery, preferred delivery time"
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  />
                </div>
              </div>

              {/* Items in Order */}
              <div className="p-3.5 bg-slate-950/80 border border-slate-800 rounded-2xl space-y-2.5">
                <div className="flex items-center justify-between text-xs font-bold text-slate-300">
                  <span className="uppercase tracking-wider">Order Items ({cart.length})</span>
                  <span className="text-cyan-400 font-mono">
                    {currency}{cartSubtotal.toLocaleString()}
                  </span>
                </div>
                <div className="space-y-2 max-h-36 overflow-y-auto pr-1">
                  {cart.map(({ product, quantity }) => (
                    <div
                      key={product.id}
                      className="flex items-center gap-2.5 text-xs bg-slate-900/50 p-2 rounded-xl border border-slate-800/80"
                    >
                      <img
                        src={
                          product.mainImage ||
                          (product.images && product.images[0]) ||
                          './placeholder-product.svg'
                        }
                        alt={product.name}
                        className="w-10 h-10 object-cover rounded-lg border border-slate-800 shrink-0"
                        onError={e => {
                          (e.target as HTMLImageElement).src = './placeholder-product.svg';
                        }}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-white truncate text-xs">{product.name}</p>
                        <p className="text-[11px] text-slate-400">
                          Qty: {quantity} × {currency}
                          {(product.discountPrice ?? product.price).toLocaleString()}
                        </p>
                      </div>
                      <span className="font-mono text-cyan-400 font-bold shrink-0">
                        {currency}
                        {((product.discountPrice ?? product.price) * quantity).toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Right Column: Payment Policy, Mobile Banking, Proof & Totals */}
            <div className="lg:col-span-6 space-y-5">
              <div className="border-b border-slate-800 pb-2">
                <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-cyan-500 text-slate-950 text-xs font-bold flex items-center justify-center">
                    2
                  </span>
                  <span>Advance Delivery Payment (Send Money)</span>
                </h3>
              </div>

              {/* Mandatory Cash on Delivery Policy Notice */}
              <div className="p-3.5 rounded-2xl bg-amber-950/40 border border-amber-500/40 flex items-start gap-2.5 text-xs text-amber-100 leading-relaxed">
                <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <p className="font-medium">
                  অর্ডার কনফার্ম করতে শুধুমাত্র ডেলিভারি চার্জ অগ্রিম Send Money করতে হবে। বাকি টাকা পণ্য হাতে পাওয়ার পর ক্যাশ অন ডেলিভারিতে পরিশোধ করতে হবে।
                </p>
              </div>

              {/* Order Calculation Summary (Separate Breakdown) */}
              <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2 text-xs">
                <div className="flex justify-between text-slate-300">
                  <span>Product Price ({cart.length} items)</span>
                  <span className="font-mono text-white font-semibold">
                    {currency}{cartSubtotal.toLocaleString()}
                  </span>
                </div>

                <div className="flex justify-between text-slate-300">
                  <span>Delivery Charge ({district})</span>
                  <span className="font-mono text-slate-200 font-semibold">
                    {deliveryFee === 0 ? (
                      <span className="text-emerald-400">FREE ({currency}0)</span>
                    ) : (
                      `${currency}${deliveryFee.toLocaleString()}`
                    )}
                  </span>
                </div>

                <div className="pt-2 border-t border-slate-800/80 flex justify-between items-center text-cyan-300 font-bold">
                  <span>Advance Payment (Send Money Now)</span>
                  <span className="text-base font-mono text-cyan-400">
                    {currency}{advanceAmount.toLocaleString()}
                  </span>
                </div>

                <div className="flex justify-between items-center text-emerald-300 font-bold">
                  <span>Remaining COD Amount (Pay on Delivery)</span>
                  <span className="text-base font-mono text-emerald-400">
                    {currency}{remainingCodAmount.toLocaleString()}
                  </span>
                </div>

                <div className="pt-2 border-t border-slate-800 flex justify-between items-baseline text-xs text-slate-400">
                  <span>Total Order Value</span>
                  <span className="font-mono text-white font-semibold">
                    {currency}{grandTotal.toLocaleString()}
                  </span>
                </div>
              </div>

              {/* Mobile Banking Payment Method Selection */}
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-slate-300">
                  Select Mobile Banking Method <span className="text-red-400">*</span>
                </label>

                {enabledMobileMethods.length === 0 ? (
                  <div className="p-3 bg-red-950/40 border border-red-800 rounded-xl text-xs text-red-300 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>No payment method is currently enabled by the store admin.</span>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {enabledMobileMethods.map(method => {
                      const isSelected = activeMethod?.id === method.id;
                      const configured =
                        Boolean(method.number?.trim()) && method.number !== 'Not configured';

                      return (
                        <label
                          key={method.id}
                          className={`flex items-start gap-2.5 p-3 rounded-2xl border cursor-pointer transition-all ${
                            isSelected
                              ? `${method.accentBg} ${method.accentBorder} text-white shadow-lg`
                              : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                          }`}
                        >
                          <input
                            type="radio"
                            name="paymentMethod"
                            value={method.id}
                            checked={isSelected}
                            onChange={() => {
                              setPaymentMethod(method.id);
                              setFormErrors(prev => {
                                const next = { ...prev };
                                delete next.paymentMethod;
                                return next;
                              });
                            }}
                            className="mt-1 text-cyan-500 focus:ring-cyan-500"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-1.5 flex-wrap">
                              <span className={`font-bold text-xs sm:text-sm ${method.accentText}`}>
                                {method.label}
                              </span>
                              <span
                                className={`text-[10px] px-1.5 py-0.5 rounded border font-mono ${method.badgeClass}`}
                              >
                                {method.typeLabel || 'Send Money'}
                              </span>
                            </div>
                            <p className="text-[11px] font-mono text-slate-200 mt-1">
                              {configured ? method.number : 'Not configured'}
                            </p>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                )}

                {formErrors.paymentMethod && (
                  <p className="text-[11px] text-red-400">{formErrors.paymentMethod}</p>
                )}
              </div>

              {/* Selected Method Payment Number + Send Money Instructions */}
              {activeMethod && (
                <div
                  className={`p-4 rounded-2xl ${activeMethod.accentBg} border ${activeMethod.accentBorder}/50 space-y-3.5 animate-in fade-in`}
                >
                  {!isMethodConfigured ? (
                    <div className="p-3 bg-amber-950/40 border border-amber-800 rounded-xl text-xs text-amber-300 flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>
                        {activeMethod.label} number is not configured yet. Please select another
                        payment method.
                      </span>
                    </div>
                  ) : (
                    <>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p
                            className={`text-[11px] font-bold uppercase tracking-wide ${activeMethod.accentText}`}
                          >
                            {activeMethod.label} Send Money Number
                          </p>
                          <p className="text-lg sm:text-xl font-extrabold font-mono text-white mt-0.5">
                            {activeMethod.number}
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={() => copyToClipboard(activeMethod.number, activeMethod.id)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold border flex items-center gap-1.5 transition-colors cursor-pointer ${activeMethod.badgeClass}`}
                        >
                          {copiedNumber === activeMethod.id ? (
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                          <span>{copiedNumber === activeMethod.id ? 'Copied!' : 'Copy Number'}</span>
                        </button>
                      </div>

                      <div className="p-2.5 rounded-xl bg-slate-950/85 border border-slate-800 text-[11px] text-slate-200 space-y-1.5">
                        <p className="font-semibold text-cyan-300">
                          Send Money Instruction: Please Send Money{' '}
                          <span className="font-mono text-white">
                            {currency}{advanceAmount.toLocaleString()}
                          </span>{' '}
                          (Advance Delivery Charge) to{' '}
                          <span className="font-mono text-white">{activeMethod.number}</span>.
                        </p>
                        {activeMethod.instructions && (
                          <p className="text-slate-300 whitespace-pre-line leading-relaxed">
                            {activeMethod.instructions}
                          </p>
                        )}
                      </div>

                      {/* Sender Number (Optional) */}
                      <div>
                        <label className="block text-xs font-semibold text-slate-200 mb-1">
                          Sender {activeMethod.label} Number{' '}
                          <span className="text-slate-400 font-normal">(Optional)</span>
                        </label>
                        <input
                          type="tel"
                          value={paymentPhoneNumber}
                          onChange={e => setPaymentPhoneNumber(e.target.value)}
                          placeholder="01xxxxxxxxx"
                          className={`w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-500 font-mono focus:outline-none focus:ring-1 ${activeMethod.ringClass}`}
                        />
                      </div>

                      {/* Payment Proof Verification Section */}
                      <div
                        className={`p-3.5 rounded-xl bg-slate-950/90 border space-y-3 ${
                          formErrors.paymentProof ? 'border-red-500' : 'border-slate-800'
                        }`}
                      >
                        <div className="flex items-start gap-2 text-xs text-cyan-200">
                          <Info className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
                          <p className="font-medium leading-relaxed">
                            আপনার পেমেন্ট নিশ্চিত করতে Transaction ID অথবা Payment Screenshot যেকোনো একটি প্রদান করুন।
                          </p>
                        </div>

                        {/* Option A: Transaction ID (Optional) */}
                        <div>
                          <label className="block text-xs font-semibold text-slate-200 mb-1">
                            Option A: Transaction ID (TrxID){' '}
                            <span className="text-slate-400 font-normal">(Optional)</span>
                          </label>
                          <input
                            type="text"
                            value={transactionId}
                            onChange={e => {
                              setTransactionId(e.target.value.toUpperCase());
                              if (e.target.value.trim()) {
                                setFormErrors(prev => {
                                  const next = { ...prev };
                                  delete next.paymentProof;
                                  return next;
                                });
                              }
                            }}
                            placeholder={activeMethod.placeholderTrx}
                            className={`w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white placeholder-slate-500 font-mono uppercase focus:outline-none focus:ring-1 ${activeMethod.ringClass}`}
                          />
                        </div>

                        {/* Divider OR */}
                        <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest text-slate-500">
                          <div className="h-px bg-slate-800 flex-1" />
                          <span>OR</span>
                          <div className="h-px bg-slate-800 flex-1" />
                        </div>

                        {/* Option B: Payment Screenshot Upload */}
                        <div className="space-y-2">
                          <label className="block text-xs font-semibold text-slate-200">
                            Option B: Payment Screenshot{' '}
                            <span className="text-slate-400 font-normal">
                              (JPG, JPEG, PNG, WEBP)
                            </span>
                          </label>

                          <input
                            ref={fileInputRef}
                            type="file"
                            accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                            onChange={e => handleScreenshotSelect(e.target.files?.[0] || null)}
                            className="hidden"
                            id="payment-screenshot-upload"
                          />

                          {!screenshotPreviewUrl ? (
                            <label
                              htmlFor="payment-screenshot-upload"
                              className="flex flex-col items-center justify-center gap-1.5 p-4 rounded-xl border border-dashed border-slate-700 hover:border-cyan-500/70 bg-slate-900/60 hover:bg-slate-900 text-slate-300 cursor-pointer transition-colors text-center"
                            >
                              <Upload className="w-5 h-5 text-cyan-400" />
                              <span className="text-xs font-semibold">
                                Click to upload payment screenshot
                              </span>
                              <span className="text-[10px] text-slate-400">
                                Supports JPG, JPEG, PNG, WEBP (Max 5MB)
                              </span>
                            </label>
                          ) : (
                            <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-700 space-y-2.5">
                              <div className="relative rounded-lg overflow-hidden bg-slate-950 border border-slate-800 max-h-48 flex items-center justify-center">
                                <img
                                  src={screenshotPreviewUrl}
                                  alt="Payment Screenshot Preview"
                                  className="max-h-48 w-auto object-contain"
                                />
                              </div>

                              <div className="flex items-center justify-between gap-2 text-[11px]">
                                <div className="flex items-center gap-1.5 text-slate-300 min-w-0">
                                  <ImageIcon className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                                  <span className="truncate">{screenshotFile?.name}</span>
                                </div>
                                <div className="flex items-center gap-1.5 shrink-0">
                                  <label
                                    htmlFor="payment-screenshot-upload"
                                    className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-300 font-semibold flex items-center gap-1 cursor-pointer"
                                  >
                                    <RefreshCw className="w-3 h-3" />
                                    <span>Replace</span>
                                  </label>
                                  <button
                                    type="button"
                                    onClick={handleRemoveScreenshot}
                                    className="px-2.5 py-1 rounded-lg bg-red-950/80 hover:bg-red-900 text-red-300 font-semibold flex items-center gap-1 cursor-pointer"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                    <span>Remove</span>
                                  </button>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>

                        {formErrors.paymentProof && (
                          <div className="p-2.5 rounded-lg bg-red-950/70 border border-red-700/80 text-[11px] text-red-200 flex items-start gap-1.5">
                            <AlertCircle className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
                            <span>{formErrors.paymentProof}</span>
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Submit CTA */}
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-4 rounded-xl bg-gradient-to-r from-cyan-500 via-cyan-400 to-blue-500 hover:from-cyan-400 hover:to-blue-400 text-slate-950 font-bold text-sm tracking-wide shadow-xl shadow-cyan-500/25 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {isSubmitting ? (
                  <span>Processing Order...</span>
                ) : (
                  <>
                    <Lock className="w-4 h-4" />
                    <span>
                      Confirm Order (Advance: {currency}{advanceAmount.toLocaleString()} | COD:{' '}
                      {currency}{remainingCodAmount.toLocaleString()})
                    </span>
                  </>
                )}
              </button>

              <p className="text-[11px] text-slate-500 text-center">
                By placing an order, you agree to {settings.store.name || 'DX Security'}'s Terms,
                Return & Delivery Policies.
              </p>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
