import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  StoreSettings,
  Product,
  Category,
  Order,
  Customer,
  CartItem,
  OrderStatus,
  PaymentStatus,
  PaymentMethod,
} from '../types';
import {
  initialStoreSettings,
  initialCategories,
  initialProducts,
  initialOrders,
  initialCustomers,
} from '../data/initialData';
import {
  supabase,
  isSupabaseConfigured,
  SUPABASE_STORAGE_BUCKET,
} from '../lib/supabase';

interface AdminUser {
  email: string;
  role: string;
  id?: string;
}

interface StoreContextType {
  settings: StoreSettings;
  products: Product[];
  categories: Category[];
  orders: Order[];
  customers: Customer[];
  cart: CartItem[];
  isAdminAuthenticated: boolean;
  adminUser: AdminUser | null;
  adminToken: string | null;
  activeView: string;
  selectedCategory: string;
  selectedProductId: string | null;
  trackingOrderId: string | null;
  notification: { message: string; type: 'success' | 'error' | 'info' } | null;

  // Navigation & UI
  setActiveView: (view: string) => void;
  setSelectedCategory: (category: string) => void;
  setSelectedProductId: (id: string | null) => void;
  setTrackingOrderId: (id: string | null) => void;
  showNotification: (message: string, type?: 'success' | 'error' | 'info') => void;

  // Cart Actions
  addToCart: (product: Product, quantity?: number) => void;
  removeFromCart: (productId: string) => void;
  updateCartQuantity: (productId: string, quantity: number) => void;
  clearCart: () => void;
  cartTotal: number;
  cartSubtotal: number;
  cartCount: number;

  // Checkout & Order Actions
  placeOrder: (orderData: {
    customerName: string;
    phone: string;
    email: string;
    address: string;
    district: string;
    thana: string;
    notes?: string;
    paymentMethod: PaymentMethod;
    paymentPhoneNumber?: string;
    transactionId?: string;
  }) => Promise<Order>;
  trackOrderByQuery: (query: string) => Promise<Order | null>;

  // Admin Actions
  loginAdmin: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logoutAdmin: () => Promise<void>;
  changeAdminPassword: (
    currentPassword: string,
    newPassword: string,
    confirmNewPassword: string
  ) => Promise<{ success: boolean; error?: string }>;
  uploadProductImage: (file: File) => Promise<{ url: string }>;
  updateSettings: (newSettings: Partial<StoreSettings>) => Promise<void>;

  // Products
  addProduct: (product: Omit<Product, 'id'>) => Promise<void>;
  updateProduct: (id: string, product: Partial<Product>) => Promise<void>;
  deleteProduct: (id: string) => Promise<void>;
  duplicateProduct: (id: string) => Promise<void>;

  // Categories
  addCategory: (category: Omit<Category, 'id'>) => Promise<void>;
  updateCategory: (id: string, category: Partial<Category>) => Promise<void>;
  deleteCategory: (id: string) => Promise<void>;

  // Orders
  updateOrderStatus: (orderId: string, status: OrderStatus, note?: string) => Promise<void>;
  updatePaymentStatus: (orderId: string, status: PaymentStatus, note?: string) => Promise<void>;

  // Factory Reset
  resetToDefaults: () => Promise<void>;
}

const StoreContext = createContext<StoreContextType | undefined>(undefined);

const LOCAL_STORAGE_KEY = 'dx_security_store_state_v1';
const TOKEN_KEY = 'dx_admin_token';

const slugify = (text: string) =>
  text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');

const mergeStoreSettings = (remote?: Partial<StoreSettings> | null): StoreSettings => {
  if (!remote || typeof remote !== 'object') return initialStoreSettings;
  return {
    store: { ...initialStoreSettings.store, ...(remote.store || {}) },
    contact: { ...initialStoreSettings.contact, ...(remote.contact || {}) },
    payment: { ...initialStoreSettings.payment, ...(remote.payment || {}) },
    delivery: { ...initialStoreSettings.delivery, ...(remote.delivery || {}) },
    homepage: { ...initialStoreSettings.homepage, ...(remote.homepage || {}) },
    website: { ...initialStoreSettings.website, ...(remote.website || {}) },
    social: { ...initialStoreSettings.social, ...(remote.social || {}) },
    about: {
      ...initialStoreSettings.about,
      ...(remote.about || {}),
      whyChooseUs: Array.isArray(remote.about?.whyChooseUs)
        ? remote.about.whyChooseUs
        : initialStoreSettings.about.whyChooseUs,
    },
    policies: { ...initialStoreSettings.policies, ...(remote.policies || {}) },
  };
};

const mapRowToCategory = (row: any): Category => ({
  id: String(row.id),
  name: row.name || '',
  slug: row.slug || slugify(row.name || ''),
  description: row.description || '',
  image: row.image || '',
  isEnabled: row.is_enabled ?? true,
});

const mapCategoryToRow = (cat: Category) => ({
  id: cat.id,
  name: cat.name,
  slug: cat.slug,
  description: cat.description || '',
  image: cat.image || '',
  is_enabled: cat.isEnabled ?? true,
});

const mapRowToProduct = (row: any): Product => ({
  id: String(row.id),
  name: row.name || '',
  slug: row.slug || '',
  category: row.category || '',
  brand: row.brand || undefined,
  price: Number(row.price) || 0,
  discountPrice:
    row.discount_price !== null && row.discount_price !== undefined
      ? Number(row.discount_price)
      : null,
  stock: Number(row.stock) || 0,
  sku: row.sku || '',
  images: Array.isArray(row.images) ? row.images : [],
  mainImage: row.main_image || (Array.isArray(row.images) && row.images[0]) || '',
  status: row.status || 'active',
  isFeatured: Boolean(row.is_featured),
  isNewArrival: Boolean(row.is_new_arrival),
  isVisible: row.is_visible ?? true,
  shortDescription: row.short_description || '',
  description: row.description || '',
  specifications: Array.isArray(row.specifications) ? row.specifications : [],
  features: Array.isArray(row.features) ? row.features : [],
  warranty: row.warranty || '',
  createdAt: row.created_at || undefined,
});

const mapProductToRow = (product: Product) => ({
  id: product.id,
  name: product.name,
  slug: product.slug,
  category: product.category,
  brand: product.brand?.trim() || null,
  price: Number(product.price) || 0,
  discount_price:
    product.discountPrice !== null &&
    product.discountPrice !== undefined &&
    Number(product.discountPrice) > 0
      ? Number(product.discountPrice)
      : null,
  stock: Math.max(0, Math.floor(Number(product.stock) || 0)),
  sku: product.sku || '',
  images: Array.isArray(product.images) ? product.images : [],
  main_image: product.mainImage || (Array.isArray(product.images) && product.images[0]) || '',
  status: product.status || 'active',
  is_featured: Boolean(product.isFeatured),
  is_new_arrival: Boolean(product.isNewArrival),
  is_visible: product.isVisible ?? true,
  short_description: product.shortDescription || '',
  description: product.description || '',
  specifications: Array.isArray(product.specifications) ? product.specifications : [],
  features: Array.isArray(product.features) ? product.features : [],
  warranty: product.warranty || '',
  created_at: product.createdAt || new Date().toISOString(),
});

const mapRowToOrder = (row: any): Order => ({
  id: String(row.id),
  customerName: row.customer_name || '',
  phone: row.phone || '',
  email: row.email || '',
  address: row.address || '',
  district: row.district || '',
  thana: row.thana || '',
  notes: row.notes || undefined,
  items: Array.isArray(row.items) ? row.items : [],
  subtotal: Number(row.subtotal) || 0,
  deliveryCharge: Number(row.delivery_charge) || 0,
  total: Number(row.total) || 0,
  paymentMethod: row.payment_method || 'cod',
  paymentStatus: row.payment_status || 'Pending',
  paymentPhoneNumber: row.payment_phone_number || undefined,
  transactionId: row.transaction_id || undefined,
  orderStatus: row.order_status || 'Pending',
  createdAt: row.created_at || new Date().toISOString(),
  updatedAt: row.updated_at || new Date().toISOString(),
  timeline: Array.isArray(row.timeline) ? row.timeline : [],
});

const mapOrderToRow = (order: Order) => ({
  id: order.id,
  customer_name: order.customerName,
  phone: order.phone,
  email: order.email || '',
  address: order.address,
  district: order.district,
  thana: order.thana || '',
  notes: order.notes || null,
  items: order.items,
  subtotal: order.subtotal,
  delivery_charge: order.deliveryCharge,
  total: order.total,
  payment_method: order.paymentMethod,
  payment_status: order.paymentStatus,
  payment_phone_number: order.paymentPhoneNumber || null,
  transaction_id: order.transactionId || null,
  order_status: order.orderStatus,
  timeline: order.timeline,
  created_at: order.createdAt,
  updated_at: order.updatedAt,
});

const deriveCustomersFromOrders = (ordersList: Order[]): Customer[] => {
  const byPhone = new Map<string, Customer>();
  for (const ord of ordersList) {
    const key = ord.phone || ord.id;
    const existing = byPhone.get(key);
    if (existing) {
      existing.ordersCount += 1;
      existing.totalSpent += ord.total;
      if (ord.createdAt > existing.lastOrderDate) {
        existing.lastOrderDate = ord.createdAt;
        existing.address = ord.address || existing.address;
      }
    } else {
      byPhone.set(key, {
        id: `cust-${key}`,
        name: ord.customerName,
        phone: ord.phone,
        email: ord.email || '',
        address: ord.address,
        district: ord.district,
        ordersCount: 1,
        totalSpent: ord.total,
        lastOrderDate: ord.createdAt,
      });
    }
  }
  return Array.from(byPhone.values());
};

export const StoreProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // When Supabase is configured, do not load stale localStorage products/categories.
  // They load directly from Supabase on every device.
  const [settings, setSettings] = useState<StoreSettings>(() => {
    if (isSupabaseConfigured) return initialStoreSettings;
    try {
      const saved = localStorage.getItem(`${LOCAL_STORAGE_KEY}_settings`);
      return saved ? mergeStoreSettings(JSON.parse(saved)) : initialStoreSettings;
    } catch {
      return initialStoreSettings;
    }
  });

  const [products, setProducts] = useState<Product[]>(() => {
    if (isSupabaseConfigured) return [];
    try {
      const saved = localStorage.getItem(`${LOCAL_STORAGE_KEY}_products`);
      return saved ? JSON.parse(saved) : initialProducts;
    } catch {
      return initialProducts;
    }
  });

  const [categories, setCategories] = useState<Category[]>(() => {
    if (isSupabaseConfigured) return [];
    try {
      const saved = localStorage.getItem(`${LOCAL_STORAGE_KEY}_categories`);
      return saved ? JSON.parse(saved) : initialCategories;
    } catch {
      return initialCategories;
    }
  });

  const [orders, setOrders] = useState<Order[]>(() => {
    if (isSupabaseConfigured) return [];
    try {
      const saved = localStorage.getItem(`${LOCAL_STORAGE_KEY}_orders`);
      return saved ? JSON.parse(saved) : initialOrders;
    } catch {
      return initialOrders;
    }
  });

  const [customers, setCustomers] = useState<Customer[]>(() => {
    if (isSupabaseConfigured) return [];
    try {
      const saved = localStorage.getItem(`${LOCAL_STORAGE_KEY}_customers`);
      return saved ? JSON.parse(saved) : initialCustomers;
    } catch {
      return initialCustomers;
    }
  });

  const [cart, setCart] = useState<CartItem[]>(() => {
    try {
      const saved = localStorage.getItem(`${LOCAL_STORAGE_KEY}_cart`);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [adminToken, setAdminToken] = useState<string | null>(() => {
    if (isSupabaseConfigured) return null;
    try {
      return sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY) || null;
    } catch {
      return null;
    }
  });

  const [adminUser, setAdminUser] = useState<AdminUser | null>(null);
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState<boolean>(() => {
    if (isSupabaseConfigured) return false;
    try {
      return Boolean(sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY));
    } catch {
      return false;
    }
  });

  const [activeView, setActiveView] = useState<string>('home');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [trackingOrderId, setTrackingOrderId] = useState<string | null>(null);
  const [notification, setNotification] = useState<{
    message: string;
    type: 'success' | 'error' | 'info';
  } | null>(null);

  const showNotification = useCallback(
    (message: string, type: 'success' | 'error' | 'info' = 'success') => {
      setNotification({ message, type });
      setTimeout(() => {
        setNotification(null);
      }, 4000);
    },
    []
  );

  // Load storefront data (products, categories, store_settings) from Supabase
  const loadSupabaseStorefront = useCallback(async () => {
    if (!isSupabaseConfigured || !supabase) return;

    try {
      const [settingsRes, categoriesRes, productsRes] = await Promise.all([
        supabase
          .from('store_settings')
          .select('settings')
          .eq('id', 'default')
          .maybeSingle(),
        supabase
          .from('categories')
          .select('*')
          .order('created_at', { ascending: true }),
        supabase
          .from('products')
          .select('*')
          .order('created_at', { ascending: false }),
      ]);

      if (settingsRes.error) {
        console.error('Supabase store_settings load error:', settingsRes.error);
      } else if (settingsRes.data?.settings) {
        setSettings(mergeStoreSettings(settingsRes.data.settings));
      }

      if (categoriesRes.error) {
        console.error('Supabase categories load error:', categoriesRes.error);
      } else if (Array.isArray(categoriesRes.data)) {
        setCategories(categoriesRes.data.map(mapRowToCategory));
      }

      if (productsRes.error) {
        console.error('Supabase products load error:', productsRes.error);
        const msg =
          productsRes.error.code === '42501'
            ? 'Supabase table permissions missing (42501). Run the GRANT SQL in Supabase SQL Editor.'
            : `Failed to load products: ${productsRes.error.message}`;
        showNotification(msg, 'error');
      } else if (Array.isArray(productsRes.data)) {
        setProducts(productsRes.data.map(mapRowToProduct));
      }
    } catch (err) {
      console.error('Failed to load storefront data from Supabase:', err);
    }
  }, [showNotification]);

  const loadSupabaseAdminOrders = useCallback(async () => {
    if (!isSupabaseConfigured || !supabase) return;
    try {
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Supabase admin orders load error:', error);
        showNotification(`Failed to load orders: ${error.message}`, 'error');
        return;
      }

      if (Array.isArray(data)) {
        const mappedOrders = data.map(mapRowToOrder);
        setOrders(mappedOrders);
        setCustomers(deriveCustomersFromOrders(mappedOrders));
      }
    } catch (err) {
      console.error('Failed to load orders from Supabase:', err);
    }
  }, [showNotification]);

  const checkAdminMembership = useCallback(
    async (
      userId: string,
      email?: string,
      accessToken?: string
    ): Promise<{ isAdmin: boolean; error?: string }> => {
      if (!supabase) return { isAdmin: false, error: 'Supabase is not configured.' };
      try {
        const { data, error } = await supabase
          .from('admin_users')
          .select('user_id, email, role')
          .eq('user_id', userId)
          .maybeSingle();

        if (error) {
          console.error('Supabase admin_users check error:', error);
          setIsAdminAuthenticated(false);
          setAdminToken(null);
          setAdminUser(null);
          const msg =
            error.code === '42501'
              ? 'Database permission denied for table admin_users (42501). Run the GRANT SQL in Supabase SQL Editor.'
              : error.message;
          return { isAdmin: false, error: msg };
        }

        if (data) {
          setIsAdminAuthenticated(true);
          setAdminToken(accessToken || null);
          setAdminUser({
            id: data.user_id,
            email: data.email || email || '',
            role: data.role || 'admin',
          });
          await Promise.all([loadSupabaseStorefront(), loadSupabaseAdminOrders()]);
          return { isAdmin: true };
        }
      } catch (err: any) {
        console.error('Admin verification failed:', err);
        setIsAdminAuthenticated(false);
        setAdminToken(null);
        setAdminUser(null);
        return { isAdmin: false, error: err?.message || 'Admin verification failed.' };
      }

      setIsAdminAuthenticated(false);
      setAdminToken(null);
      setAdminUser(null);
      return { isAdmin: false };
    },
    [loadSupabaseStorefront, loadSupabaseAdminOrders]
  );

  // Sync on mount: Supabase when configured, otherwise Express /api fallback
  useEffect(() => {
    if (isSupabaseConfigured && supabase) {
      loadSupabaseStorefront();

      supabase.auth.getSession().then(({ data }) => {
        const session = data?.session;
        if (session?.user) {
          checkAdminMembership(session.user.id, session.user.email, session.access_token);
        } else {
          setIsAdminAuthenticated(false);
          setAdminToken(null);
          setAdminUser(null);
        }
      });

      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange((_event, session) => {
        if (session?.user) {
          checkAdminMembership(session.user.id, session.user.email, session.access_token);
        } else {
          setIsAdminAuthenticated(false);
          setAdminToken(null);
          setAdminUser(null);
          setOrders([]);
          setCustomers([]);
          loadSupabaseStorefront();
        }
      });

      return () => {
        subscription.unsubscribe();
      };
    }

    // Legacy local Express backend sync when Supabase is not configured
    const fetchData = async () => {
      try {
        const res = await fetch('/api/data');
        if (res.ok && res.headers.get('content-type')?.includes('application/json')) {
          const data = await res.json();
          if (data.settings) setSettings(mergeStoreSettings(data.settings));
          if (data.products) setProducts(data.products);
          if (data.categories) setCategories(data.categories);
          if (data.orders) setOrders(data.orders);
          if (data.customers) setCustomers(data.customers);
        }
      } catch {
        // Fallback to initial/local data
      }
    };

    const verifySession = async () => {
      const token = sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY);
      if (!token) {
        setIsAdminAuthenticated(false);
        setAdminUser(null);
        return;
      }

      try {
        const res = await fetch('/api/auth/verify', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok && res.headers.get('content-type')?.includes('application/json')) {
          const data = await res.json();
          setIsAdminAuthenticated(true);
          setAdminToken(token);
          setAdminUser(data.user);
        } else {
          sessionStorage.removeItem(TOKEN_KEY);
          localStorage.removeItem(TOKEN_KEY);
          setIsAdminAuthenticated(false);
          setAdminToken(null);
          setAdminUser(null);
        }
      } catch {
        setIsAdminAuthenticated(false);
        setAdminToken(null);
        setAdminUser(null);
      }
    };

    fetchData();
    verifySession();
  }, [loadSupabaseStorefront, checkAdminMembership]);

  // Persist local fallback state only when Supabase is NOT configured
  useEffect(() => {
    if (isSupabaseConfigured) return;
    try {
      localStorage.setItem(`${LOCAL_STORAGE_KEY}_settings`, JSON.stringify(settings));
    } catch (e) {
      console.error(e);
    }
  }, [settings]);

  useEffect(() => {
    if (isSupabaseConfigured) return;
    try {
      localStorage.setItem(`${LOCAL_STORAGE_KEY}_products`, JSON.stringify(products));
    } catch (e) {
      console.error(e);
    }
  }, [products]);

  useEffect(() => {
    if (isSupabaseConfigured) return;
    try {
      localStorage.setItem(`${LOCAL_STORAGE_KEY}_categories`, JSON.stringify(categories));
    } catch (e) {
      console.error(e);
    }
  }, [categories]);

  useEffect(() => {
    if (isSupabaseConfigured) return;
    try {
      localStorage.setItem(`${LOCAL_STORAGE_KEY}_orders`, JSON.stringify(orders));
    } catch (e) {
      console.error(e);
    }
  }, [orders]);

  useEffect(() => {
    if (isSupabaseConfigured) return;
    try {
      localStorage.setItem(`${LOCAL_STORAGE_KEY}_customers`, JSON.stringify(customers));
    } catch (e) {
      console.error(e);
    }
  }, [customers]);

  // Shopping cart stays local per device
  useEffect(() => {
    try {
      localStorage.setItem(`${LOCAL_STORAGE_KEY}_cart`, JSON.stringify(cart));
    } catch (e) {
      console.error(e);
    }
  }, [cart]);

  // Update dynamic document title from settings
  useEffect(() => {
    if (settings.website?.siteTitle) {
      document.title = settings.website.siteTitle;
    }
  }, [settings.website?.siteTitle]);

  // Cart operations
  const addToCart = (product: Product, quantity = 1) => {
    setCart(prev => {
      const existing = prev.find(item => item.product.id === product.id);
      if (existing) {
        return prev.map(item =>
          item.product.id === product.id
            ? { ...item, quantity: item.quantity + quantity }
            : item
        );
      }
      return [...prev, { product, quantity }];
    });
    showNotification(`Added ${product.name.slice(0, 30)}... to Cart`, 'success');
  };

  const removeFromCart = (productId: string) => {
    setCart(prev => prev.filter(item => item.product.id !== productId));
    showNotification('Item removed from cart', 'info');
  };

  const updateCartQuantity = (productId: string, quantity: number) => {
    if (quantity <= 0) {
      removeFromCart(productId);
      return;
    }
    setCart(prev =>
      prev.map(item =>
        item.product.id === productId ? { ...item, quantity } : item
      )
    );
  };

  const clearCart = () => {
    setCart([]);
  };

  const cartSubtotal = cart.reduce((sum, item) => {
    const itemPrice = item.product.discountPrice ?? item.product.price;
    return sum + itemPrice * item.quantity;
  }, 0);

  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const cartTotal = cartSubtotal;

  // ====================================================
  // SECURE ADMIN AUTHENTICATION (SUPABASE AUTH)
  // ====================================================

  const loginAdmin = async (
    email: string,
    password: string
  ): Promise<{ success: boolean; error?: string }> => {
    if (isSupabaseConfigured && supabase) {
      try {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });

        if (error || !data.user || !data.session) {
          const msg = error?.message || 'Invalid email or password.';
          showNotification(msg, 'error');
          return { success: false, error: msg };
        }

        const membership = await checkAdminMembership(
          data.user.id,
          data.user.email,
          data.session.access_token
        );

        if (!membership.isAdmin) {
          await supabase.auth.signOut();
          const msg = membership.error || 'This account does not have admin privileges.';
          showNotification(msg, 'error');
          return { success: false, error: msg };
        }

        showNotification('Signed in to Admin Portal', 'success');
        return { success: true };
      } catch (err: any) {
        const msg = err?.message || 'Authentication failed.';
        showNotification(msg, 'error');
        return { success: false, error: msg };
      }
    }

    // Local Express backend fallback when Supabase env vars are not configured
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      if (res.ok) {
        const data = await res.json();
        setAdminToken(data.token);
        setAdminUser(data.user);
        setIsAdminAuthenticated(true);
        try {
          sessionStorage.setItem(TOKEN_KEY, data.token);
        } catch {}
        showNotification('Welcome to DX Security Admin Portal', 'success');
        return { success: true };
      }

      if (res.status === 401 || res.status === 429) {
        const data = await res.json().catch(() => ({}));
        const err = data.error || 'Invalid email or password.';
        showNotification(err, 'error');
        return { success: false, error: err };
      }

      const msg =
        'Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.';
      showNotification(msg, 'error');
      return { success: false, error: msg };
    } catch {
      const msg =
        'Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.';
      showNotification(msg, 'error');
      return { success: false, error: msg };
    }
  };

  const logoutAdmin = async () => {
    if (isSupabaseConfigured && supabase) {
      await supabase.auth.signOut();
    } else {
      const token = adminToken || sessionStorage.getItem(TOKEN_KEY);
      if (token) {
        try {
          await fetch('/api/auth/logout', {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
          });
        } catch {}
      }
      try {
        sessionStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(TOKEN_KEY);
      } catch {}
    }

    setAdminToken(null);
    setAdminUser(null);
    setIsAdminAuthenticated(false);
    setActiveView('admin-login');
    showNotification('Logged out from Admin Portal', 'info');
  };

  const changeAdminPassword = async (
    currentPassword: string,
    newPassword: string,
    confirmNewPassword: string
  ): Promise<{ success: boolean; error?: string }> => {
    if (newPassword.length < 8) {
      return { success: false, error: 'New password must be at least 8 characters long.' };
    }
    if (newPassword !== confirmNewPassword) {
      return { success: false, error: 'New passwords do not match.' };
    }

    if (isSupabaseConfigured && supabase) {
      if (!isAdminAuthenticated || !adminUser?.email) {
        return { success: false, error: 'Unauthorized. Please log in.' };
      }

      const { error: verifyErr } = await supabase.auth.signInWithPassword({
        email: adminUser.email,
        password: currentPassword,
      });

      if (verifyErr) {
        const msg = 'Current password is incorrect.';
        showNotification(msg, 'error');
        return { success: false, error: msg };
      }

      const { error: updateErr } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (updateErr) {
        const msg = updateErr.message || 'Failed to update password.';
        showNotification(msg, 'error');
        return { success: false, error: msg };
      }

      showNotification('Password changed successfully.', 'success');
      return { success: true };
    }

    const token = adminToken || sessionStorage.getItem(TOKEN_KEY);
    if (!token) {
      return { success: false, error: 'Unauthorized. Please log in.' };
    }

    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ currentPassword, newPassword, confirmNewPassword }),
      });

      if (res.ok) {
        showNotification('Password changed successfully.', 'success');
        return { success: true };
      }

      const data = await res.json().catch(() => ({}));
      const err = data.error || 'Failed to change password.';
      showNotification(err, 'error');
      return { success: false, error: err };
    } catch (err: any) {
      const msg = err.message || 'Failed to update password.';
      showNotification(msg, 'error');
      return { success: false, error: msg };
    }
  };

  // ====================================================
  // PRODUCT IMAGE UPLOAD (SUPABASE STORAGE)
  // ====================================================

  const uploadProductImage = async (file: File): Promise<{ url: string }> => {
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type.toLowerCase())) {
      throw new Error('Please select a JPG, PNG or WEBP image.');
    }
    if (file.size > 5 * 1024 * 1024) {
      throw new Error('Image size must be less than 5MB.');
    }

    if (isSupabaseConfigured && supabase) {
      if (!isAdminAuthenticated) {
        throw new Error('Please sign in as an admin to upload product images.');
      }

      const rawExt = file.name.split('.').pop()?.toLowerCase() || '';
      const ext = ['jpg', 'jpeg', 'png', 'webp'].includes(rawExt) ? rawExt : 'jpg';
      const uniquePath = `products/${Date.now()}_${Math.random().toString(36).slice(2, 10)}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from(SUPABASE_STORAGE_BUCKET)
        .upload(uniquePath, file, {
          cacheControl: '3600',
          upsert: false,
          contentType: file.type,
        });

      if (uploadError) {
        throw new Error(uploadError.message || 'Failed to upload image to Supabase Storage.');
      }

      const { data: publicUrlData } = supabase.storage
        .from(SUPABASE_STORAGE_BUCKET)
        .getPublicUrl(uniquePath);

      if (!publicUrlData?.publicUrl) {
        throw new Error('Could not generate public URL for uploaded image.');
      }

      return { url: publicUrlData.publicUrl };
    }

    // Legacy local Express upload fallback
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const token = adminToken || sessionStorage.getItem(TOKEN_KEY);
          const res = await fetch('/api/upload', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              fileName: file.name,
              fileType: file.type,
              fileData: reader.result,
            }),
          });

          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error(data.error || 'Image upload failed. Please try again.');
          }

          const data = await res.json();
          resolve({ url: data.url });
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = () => reject(new Error('Failed to read image file.'));
      reader.readAsDataURL(file);
    });
  };

  // ====================================================
  // STORE SETTINGS
  // ====================================================

  const updateSettings = async (newSettings: Partial<StoreSettings>) => {
    const merged = mergeStoreSettings({ ...settings, ...newSettings });

    if (isSupabaseConfigured && supabase) {
      if (!isAdminAuthenticated) {
        showNotification('Admin login required to save settings.', 'error');
        return;
      }

      const { error } = await supabase
        .from('store_settings')
        .upsert(
          {
            id: 'default',
            settings: merged,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'id' }
        );

      if (error) {
        showNotification(`Failed to save settings: ${error.message}`, 'error');
        return;
      }

      setSettings(merged);
      showNotification('Settings saved to Supabase!', 'success');
      return;
    }

    setSettings(merged);
    try {
      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newSettings),
      });
    } catch {}
    showNotification('Settings successfully updated!', 'success');
  };

  // ====================================================
  // CATEGORIES & PRODUCTS
  // ====================================================

  const ensureCategoryExists = async (categoryName?: string): Promise<string> => {
    const trimmed = (categoryName || '').trim();
    if (!trimmed) return 'Uncategorized';

    const existing = categories.find(
      c => c.name.trim().toLowerCase() === trimmed.toLowerCase()
    );
    if (existing) return existing.name;

    const baseSlug = slugify(trimmed) || `cat-${Date.now()}`;
    const slugTaken = categories.some(c => c.slug === baseSlug);
    const newCat: Category = {
      id: `cat-${Date.now()}`,
      name: trimmed,
      slug: slugTaken ? `${baseSlug}-${Date.now().toString().slice(-4)}` : baseSlug,
      description: '',
      image: '',
      isEnabled: true,
    };

    if (isSupabaseConfigured && supabase) {
      const { data: existingRemote } = await supabase
        .from('categories')
        .select('*')
        .ilike('name', trimmed)
        .maybeSingle();

      if (existingRemote) {
        const mapped = mapRowToCategory(existingRemote);
        setCategories(prev =>
          prev.some(c => c.id === mapped.id) ? prev : [...prev, mapped]
        );
        return mapped.name;
      }

      const { data, error } = await supabase
        .from('categories')
        .insert(mapCategoryToRow(newCat))
        .select()
        .single();

      if (error) {
        throw new Error(error.message || 'Failed to save category');
      }

      const savedCat = mapRowToCategory(data);
      setCategories(prev => [...prev, savedCat]);
      return savedCat.name;
    }

    setCategories(prev => {
      const already = prev.some(c => c.name.trim().toLowerCase() === trimmed.toLowerCase());
      return already ? prev : [...prev, newCat];
    });

    try {
      await fetch('/api/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newCat),
      });
    } catch {}

    return newCat.name;
  };

  const addProduct = async (productData: Omit<Product, 'id'>) => {
    try {
      const resolvedCategory = await ensureCategoryExists(productData.category);
      const status = productData.status || 'active';
      const isVisible =
        productData.isVisible !== undefined
          ? productData.isVisible && status !== 'inactive' && status !== 'draft'
          : status !== 'inactive' && status !== 'draft';

      const newProduct: Product = {
        ...productData,
        id: `prod-${Date.now()}`,
        category: resolvedCategory,
        brand: productData.brand?.trim() || undefined,
        slug: productData.slug?.trim() || `${slugify(productData.name || 'product')}-${Date.now()}`,
        sku: productData.sku?.trim() || `DX-${Math.floor(1000 + Math.random() * 9000)}`,
        status,
        isVisible,
        images: Array.isArray(productData.images) ? productData.images : [],
        mainImage: productData.mainImage || (productData.images && productData.images[0]) || '',
        shortDescription: productData.shortDescription ?? '',
        description: productData.description ?? '',
        specifications: Array.isArray(productData.specifications) ? productData.specifications : [],
        features: Array.isArray(productData.features) ? productData.features : [],
        warranty: productData.warranty ?? '',
        createdAt: new Date().toISOString(),
      };

      if (isSupabaseConfigured && supabase) {
        if (!isAdminAuthenticated) {
          showNotification('Admin login required to add products.', 'error');
          return;
        }

        const { data, error } = await supabase
          .from('products')
          .insert(mapProductToRow(newProduct))
          .select()
          .single();

        if (error) {
          showNotification(`Failed to save product: ${error.message}`, 'error');
          return;
        }

        const saved = mapRowToProduct(data);
        setProducts(prev => [saved, ...prev]);
        showNotification(`Product "${saved.name}" saved to Supabase`, 'success');
        return;
      }

      setProducts(prev => [newProduct, ...prev]);
      try {
        await fetch('/api/products', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newProduct),
        });
      } catch {}
      showNotification(`Product "${newProduct.name}" created`, 'success');
    } catch (err: any) {
      showNotification(err?.message || 'Failed to add product', 'error');
    }
  };

  const updateProduct = async (id: string, updatedFields: Partial<Product>) => {
    try {
      const fieldsToSave: Partial<Product> = { ...updatedFields };
      if (fieldsToSave.category !== undefined) {
        fieldsToSave.category = await ensureCategoryExists(fieldsToSave.category);
      }
      if (fieldsToSave.brand !== undefined) {
        fieldsToSave.brand = fieldsToSave.brand.trim() || undefined;
      }

      if (isSupabaseConfigured && supabase) {
        if (!isAdminAuthenticated) {
          showNotification('Admin login required to edit products.', 'error');
          return;
        }

        const dbPatch: Record<string, any> = {};
        if (fieldsToSave.name !== undefined) dbPatch.name = fieldsToSave.name;
        if (fieldsToSave.slug !== undefined) dbPatch.slug = fieldsToSave.slug;
        if (fieldsToSave.category !== undefined) dbPatch.category = fieldsToSave.category;
        if (fieldsToSave.brand !== undefined) dbPatch.brand = fieldsToSave.brand || null;
        if (fieldsToSave.price !== undefined) dbPatch.price = Number(fieldsToSave.price) || 0;
        if (fieldsToSave.discountPrice !== undefined) {
          dbPatch.discount_price =
            fieldsToSave.discountPrice && Number(fieldsToSave.discountPrice) > 0
              ? Number(fieldsToSave.discountPrice)
              : null;
        }
        if (fieldsToSave.stock !== undefined) dbPatch.stock = Math.max(0, Math.floor(Number(fieldsToSave.stock) || 0));
        if (fieldsToSave.sku !== undefined) dbPatch.sku = fieldsToSave.sku;
        if (fieldsToSave.images !== undefined) dbPatch.images = fieldsToSave.images;
        if (fieldsToSave.mainImage !== undefined) dbPatch.main_image = fieldsToSave.mainImage;
        if (fieldsToSave.status !== undefined) dbPatch.status = fieldsToSave.status;
        if (fieldsToSave.isFeatured !== undefined) dbPatch.is_featured = fieldsToSave.isFeatured;
        if (fieldsToSave.isNewArrival !== undefined) dbPatch.is_new_arrival = fieldsToSave.isNewArrival;
        if (fieldsToSave.isVisible !== undefined) dbPatch.is_visible = fieldsToSave.isVisible;
        if (fieldsToSave.shortDescription !== undefined) dbPatch.short_description = fieldsToSave.shortDescription;
        if (fieldsToSave.description !== undefined) dbPatch.description = fieldsToSave.description;
        if (fieldsToSave.specifications !== undefined) dbPatch.specifications = fieldsToSave.specifications;
        if (fieldsToSave.features !== undefined) dbPatch.features = fieldsToSave.features;
        if (fieldsToSave.warranty !== undefined) dbPatch.warranty = fieldsToSave.warranty;

        const { data, error } = await supabase
          .from('products')
          .update(dbPatch)
          .eq('id', id)
          .select()
          .single();

        if (error) {
          showNotification(`Failed to update product: ${error.message}`, 'error');
          return;
        }

        const updatedProduct = mapRowToProduct(data);
        setProducts(prev => prev.map(p => (p.id === id ? updatedProduct : p)));
        showNotification('Product updated in Supabase', 'success');
        return;
      }

      setProducts(prev => prev.map(p => (p.id === id ? { ...p, ...fieldsToSave } : p)));
      try {
        await fetch(`/api/products/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(fieldsToSave),
        });
      } catch {}
      showNotification('Product details updated', 'success');
    } catch (err: any) {
      showNotification(err?.message || 'Failed to update product', 'error');
    }
  };

  const deleteProduct = async (id: string) => {
    if (isSupabaseConfigured && supabase) {
      if (!isAdminAuthenticated) {
        showNotification('Admin login required to delete products.', 'error');
        return;
      }

      const { error } = await supabase.from('products').delete().eq('id', id);
      if (error) {
        showNotification(`Failed to delete product: ${error.message}`, 'error');
        return;
      }

      setProducts(prev => prev.filter(p => p.id !== id));
      showNotification('Product deleted from Supabase', 'info');
      return;
    }

    setProducts(prev => prev.filter(p => p.id !== id));
    try {
      await fetch(`/api/products/${id}`, { method: 'DELETE' });
    } catch {}
    showNotification('Product deleted', 'info');
  };

  const duplicateProduct = async (id: string) => {
    const source = products.find(p => p.id === id);
    if (!source) return;

    const suffix = Date.now().toString().slice(-5);
    const duplicated: Product = {
      ...source,
      id: `prod-${Date.now()}`,
      name: `${source.name} (Copy)`,
      slug: `${source.slug || slugify(source.name)}-copy-${suffix}`,
      sku: `${source.sku || 'DX'}-COPY-${suffix}`,
      images: [...(source.images || [])],
      mainImage: source.mainImage,
      createdAt: new Date().toISOString(),
    };

    if (isSupabaseConfigured && supabase) {
      if (!isAdminAuthenticated) {
        showNotification('Admin login required to duplicate products.', 'error');
        return;
      }

      const { data, error } = await supabase
        .from('products')
        .insert(mapProductToRow(duplicated))
        .select()
        .single();

      if (error) {
        showNotification(`Failed to duplicate product: ${error.message}`, 'error');
        return;
      }

      const saved = mapRowToProduct(data);
      setProducts(prev => [saved, ...prev]);
      showNotification(`Duplicated product saved: ${saved.name}`, 'success');
      return;
    }

    setProducts(prev => [duplicated, ...prev]);
    try {
      await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(duplicated),
      });
    } catch {}
    showNotification(`Duplicated product created: ${duplicated.name}`, 'success');
  };

  // Category Management
  const addCategory = async (catData: Omit<Category, 'id'>) => {
    const trimmedName = catData.name.trim();
    const existing = categories.find(
      c => c.name.trim().toLowerCase() === trimmedName.toLowerCase()
    );
    if (existing) {
      showNotification(`Category "${existing.name}" already exists`, 'info');
      return;
    }

    const baseSlug = catData.slug?.trim() || slugify(trimmedName) || `cat-${Date.now()}`;
    const slugTaken = categories.some(c => c.slug === baseSlug);
    const newCat: Category = {
      ...catData,
      name: trimmedName,
      slug: slugTaken ? `${baseSlug}-${Date.now().toString().slice(-4)}` : baseSlug,
      id: `cat-${Date.now()}`,
      description: catData.description || '',
      image: catData.image || '',
      isEnabled: catData.isEnabled ?? true,
    };

    if (isSupabaseConfigured && supabase) {
      if (!isAdminAuthenticated) {
        showNotification('Admin login required to add categories.', 'error');
        return;
      }

      const { data, error } = await supabase
        .from('categories')
        .insert(mapCategoryToRow(newCat))
        .select()
        .single();

      if (error) {
        showNotification(`Failed to add category: ${error.message}`, 'error');
        return;
      }

      const saved = mapRowToCategory(data);
      setCategories(prev => [...prev, saved]);
      showNotification(`Category "${saved.name}" saved to Supabase`, 'success');
      return;
    }

    setCategories(prev => [...prev, newCat]);
    try {
      await fetch('/api/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newCat),
      });
    } catch {}
    showNotification(`Category "${newCat.name}" added`, 'success');
  };

  const updateCategory = async (id: string, updatedFields: Partial<Category>) => {
    const targetCategory = categories.find(c => c.id === id);
    const oldName = targetCategory?.name;
    const newName = updatedFields.name?.trim();
    const cleanFields: Partial<Category> = {
      ...updatedFields,
      ...(newName ? { name: newName, slug: updatedFields.slug?.trim() || slugify(newName) } : {}),
    };

    if (isSupabaseConfigured && supabase) {
      if (!isAdminAuthenticated) {
        showNotification('Admin login required to edit categories.', 'error');
        return;
      }

      const dbPatch: Record<string, any> = {};
      if (cleanFields.name !== undefined) dbPatch.name = cleanFields.name;
      if (cleanFields.slug !== undefined) dbPatch.slug = cleanFields.slug;
      if (cleanFields.description !== undefined) dbPatch.description = cleanFields.description;
      if (cleanFields.image !== undefined) dbPatch.image = cleanFields.image;
      if (cleanFields.isEnabled !== undefined) dbPatch.is_enabled = cleanFields.isEnabled;

      const { data, error } = await supabase
        .from('categories')
        .update(dbPatch)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        showNotification(`Failed to update category: ${error.message}`, 'error');
        return;
      }

      const updatedCat = mapRowToCategory(data);
      setCategories(prev => prev.map(c => (c.id === id ? updatedCat : c)));

      if (oldName && newName && oldName !== newName) {
        const { error: prodSyncErr } = await supabase
          .from('products')
          .update({ category: newName })
          .eq('category', oldName);

        if (prodSyncErr) {
          showNotification(
            `Category renamed, but failed to sync products: ${prodSyncErr.message}`,
            'error'
          );
          return;
        }

        setProducts(prev =>
          prev.map(p => (p.category === oldName ? { ...p, category: newName } : p))
        );
        if (selectedCategory === oldName) {
          setSelectedCategory(newName);
        }
      }

      showNotification('Category updated in Supabase', 'success');
      return;
    }

    setCategories(prev => prev.map(c => (c.id === id ? { ...c, ...cleanFields } : c)));

    if (oldName && newName && oldName !== newName) {
      const affectedProducts = products.filter(p => p.category === oldName);
      setProducts(prev =>
        prev.map(p => (p.category === oldName ? { ...p, category: newName } : p))
      );
      if (selectedCategory === oldName) {
        setSelectedCategory(newName);
      }
      for (const prod of affectedProducts) {
        try {
          await fetch(`/api/products/${prod.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ category: newName }),
          });
        } catch {}
      }
    }

    try {
      await fetch(`/api/categories/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cleanFields),
      });
    } catch {}
    showNotification('Category updated', 'success');
  };

  const deleteCategory = async (id: string) => {
    const target = categories.find(c => c.id === id);

    if (isSupabaseConfigured && supabase) {
      if (!isAdminAuthenticated) {
        showNotification('Admin login required to delete categories.', 'error');
        return;
      }

      const { error } = await supabase.from('categories').delete().eq('id', id);
      if (error) {
        showNotification(`Failed to delete category: ${error.message}`, 'error');
        return;
      }
    } else {
      try {
        await fetch(`/api/categories/${id}`, { method: 'DELETE' });
      } catch {}
    }

    setCategories(prev => prev.filter(c => c.id !== id));
    if (target && selectedCategory === target.name) {
      setSelectedCategory('ALL');
    }
    showNotification('Category deleted', 'info');
  };

  // ====================================================
  // ORDERS & TRACKING
  // ====================================================

  const placeOrder = async (orderData: {
    customerName: string;
    phone: string;
    email: string;
    address: string;
    district: string;
    thana: string;
    notes?: string;
    paymentMethod: PaymentMethod;
    paymentPhoneNumber?: string;
    transactionId?: string;
  }): Promise<Order> => {
    const prefix = settings.store?.orderPrefix || 'DXS';
    const randomSuffix = Math.floor(10000 + Math.random() * 90000);
    const orderId = `${prefix}-${randomSuffix}`;

    const isInsideDhaka = orderData.district.toLowerCase().includes('dhaka');
    let deliveryFee = isInsideDhaka
      ? settings.delivery.insideDhakaCharge
      : settings.delivery.outsideDhakaCharge;

    if (
      settings.delivery.freeDeliveryThreshold > 0 &&
      cartSubtotal >= settings.delivery.freeDeliveryThreshold
    ) {
      deliveryFee = 0;
    }

    if (orderData.paymentMethod === 'cod' && settings.payment.codCharge > 0) {
      deliveryFee += settings.payment.codCharge;
    }

    const grandTotal = cartSubtotal + deliveryFee;

    const newOrder: Order = {
      id: orderId,
      customerName: orderData.customerName,
      phone: orderData.phone,
      email: orderData.email,
      address: orderData.address,
      district: orderData.district,
      thana: orderData.thana,
      notes: orderData.notes,
      items: cart.map(item => ({
        productId: item.product.id,
        name: item.product.name,
        price: item.product.discountPrice ?? item.product.price,
        quantity: item.quantity,
        image:
          item.product.mainImage ||
          (item.product.images && item.product.images[0]) ||
          './placeholder-product.svg',
        sku: item.product.sku,
      })),
      subtotal: cartSubtotal,
      deliveryCharge: deliveryFee,
      total: grandTotal,
      paymentMethod: orderData.paymentMethod,
      paymentStatus: 'Pending',
      paymentPhoneNumber: orderData.paymentPhoneNumber,
      transactionId: orderData.transactionId,
      orderStatus: 'Pending',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      timeline: [
        {
          status: 'Order Placed',
          timestamp: new Date().toISOString(),
          note: `Order submitted via website. Payment method: ${orderData.paymentMethod.toUpperCase()}${
            orderData.transactionId ? ` (TrxID: ${orderData.transactionId})` : ''
          }`,
        },
      ],
    };

    if (isSupabaseConfigured && supabase) {
      const { error } = await supabase.from('orders').insert(mapOrderToRow(newOrder));
      if (error) {
        console.error('Supabase order insert error:', error);
        throw new Error(error.message || 'Failed to submit order to database.');
      }
    } else {
      try {
        await fetch('/api/orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newOrder),
        });
      } catch {}
    }

    setOrders(prev => [newOrder, ...prev]);

    setCustomers(prev => {
      const idx = prev.findIndex(c => c.phone === newOrder.phone);
      if (idx >= 0) {
        const updated = [...prev];
        updated[idx] = {
          ...updated[idx],
          ordersCount: updated[idx].ordersCount + 1,
          totalSpent: updated[idx].totalSpent + newOrder.total,
          lastOrderDate: newOrder.createdAt,
          address: newOrder.address,
        };
        return updated;
      }
      return [
        {
          id: `cust-${Date.now()}`,
          name: newOrder.customerName,
          phone: newOrder.phone,
          email: newOrder.email,
          address: newOrder.address,
          district: newOrder.district,
          ordersCount: 1,
          totalSpent: newOrder.total,
          lastOrderDate: newOrder.createdAt,
        },
        ...prev,
      ];
    });

    setProducts(prevProducts =>
      prevProducts.map(p => {
        const orderedItem = newOrder.items.find(item => item.productId === p.id);
        if (orderedItem) {
          const newStock = Math.max(0, p.stock - orderedItem.quantity);
          return {
            ...p,
            stock: newStock,
            status: newStock === 0 ? 'out_of_stock' : p.status,
          };
        }
        return p;
      })
    );

    clearCart();
    return newOrder;
  };

  const trackOrderByQuery = async (query: string): Promise<Order | null> => {
    const raw = query.trim();
    const clean = raw.toLowerCase();
    if (!clean) return null;

    if (isSupabaseConfigured && supabase) {
      try {
        const { data, error } = await supabase.rpc('track_order', { p_query: raw });
        if (error) {
          console.error('Supabase track_order RPC error:', error);
        } else if (Array.isArray(data) && data.length > 0) {
          return mapRowToOrder(data[0]);
        } else if (!isAdminAuthenticated) {
          return null;
        }
      } catch (err) {
        console.error('Supabase track_order lookup failed:', err);
      }
    }

    const cleanDigits = clean.replace(/[^0-9]/g, '');
    const localMatch = orders.find(
      o =>
        o.id.toLowerCase() === clean ||
        (cleanDigits.length >= 6 && o.phone.replace(/[^0-9]/g, '') === cleanDigits)
    );
    return localMatch || null;
  };

  const updateOrderStatus = async (orderId: string, status: OrderStatus, note?: string) => {
    const timestamp = new Date().toISOString();
    const target = orders.find(o => o.id === orderId);
    const updatedTimeline = [
      ...(target?.timeline || []),
      {
        status: `Status changed to ${status}`,
        timestamp,
        note: note || `Order updated to ${status} by admin.`,
      },
    ];

    if (isSupabaseConfigured && supabase) {
      if (!isAdminAuthenticated) {
        showNotification('Admin login required to update orders.', 'error');
        return;
      }

      const { error } = await supabase
        .from('orders')
        .update({
          order_status: status,
          timeline: updatedTimeline,
          updated_at: timestamp,
        })
        .eq('id', orderId);

      if (error) {
        showNotification(`Failed to update order: ${error.message}`, 'error');
        return;
      }
    } else {
      try {
        await fetch(`/api/orders/${orderId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderStatus: status }),
        });
      } catch {}
    }

    setOrders(prev =>
      prev.map(ord =>
        ord.id === orderId
          ? {
              ...ord,
              orderStatus: status,
              updatedAt: timestamp,
              timeline: updatedTimeline,
            }
          : ord
      )
    );
    showNotification(`Order ${orderId} marked as ${status}`, 'success');
  };

  const updatePaymentStatus = async (orderId: string, status: PaymentStatus, note?: string) => {
    const timestamp = new Date().toISOString();
    const target = orders.find(o => o.id === orderId);
    const updatedTimeline = [
      ...(target?.timeline || []),
      {
        status: `Payment ${status}`,
        timestamp,
        note: note || `Payment verification changed to ${status} by admin verification desk.`,
      },
    ];

    if (isSupabaseConfigured && supabase) {
      if (!isAdminAuthenticated) {
        showNotification('Admin login required to verify payments.', 'error');
        return;
      }

      const { error } = await supabase
        .from('orders')
        .update({
          payment_status: status,
          timeline: updatedTimeline,
          updated_at: timestamp,
        })
        .eq('id', orderId);

      if (error) {
        showNotification(`Failed to update payment status: ${error.message}`, 'error');
        return;
      }
    } else {
      try {
        await fetch(`/api/orders/${orderId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ paymentStatus: status }),
        });
      } catch {}
    }

    setOrders(prev =>
      prev.map(ord =>
        ord.id === orderId
          ? {
              ...ord,
              paymentStatus: status,
              updatedAt: timestamp,
              timeline: updatedTimeline,
            }
          : ord
      )
    );
    showNotification(`Payment for ${orderId} updated to ${status}`, 'success');
  };

  const resetToDefaults = async () => {
    if (isSupabaseConfigured && supabase) {
      if (!isAdminAuthenticated) {
        showNotification('Admin login required to reset store defaults.', 'error');
        return;
      }

      const { error: settingsErr } = await supabase
        .from('store_settings')
        .upsert({ id: 'default', settings: initialStoreSettings }, { onConflict: 'id' });

      if (settingsErr) {
        showNotification(`Reset failed: ${settingsErr.message}`, 'error');
        return;
      }

      setSettings(initialStoreSettings);
      showNotification('Store settings reset to default configurations', 'info');
      return;
    }

    setSettings(initialStoreSettings);
    setProducts(initialProducts);
    setCategories(initialCategories);
    setOrders(initialOrders);
    setCustomers(initialCustomers);

    try {
      await fetch('/api/reset', { method: 'POST' });
    } catch {}

    showNotification('System reset to default configurations', 'info');
  };

  return (
    <StoreContext.Provider
      value={{
        settings,
        products,
        categories,
        orders,
        customers,
        cart,
        isAdminAuthenticated,
        adminUser,
        adminToken,
        activeView,
        selectedCategory,
        selectedProductId,
        trackingOrderId,
        notification,
        setActiveView,
        setSelectedCategory,
        setSelectedProductId,
        setTrackingOrderId,
        showNotification,
        addToCart,
        removeFromCart,
        updateCartQuantity,
        clearCart,
        cartTotal,
        cartSubtotal,
        cartCount,
        placeOrder,
        trackOrderByQuery,
        loginAdmin,
        logoutAdmin,
        changeAdminPassword,
        uploadProductImage,
        updateSettings,
        addProduct,
        updateProduct,
        deleteProduct,
        duplicateProduct,
        addCategory,
        updateCategory,
        deleteCategory,
        updateOrderStatus,
        updatePaymentStatus,
        resetToDefaults,
      }}
    >
      {children}
    </StoreContext.Provider>
  );
};

export const useStore = () => {
  const context = useContext(StoreContext);
  if (!context) {
    throw new Error('useStore must be used within a StoreProvider');
  }
  return context;
};
