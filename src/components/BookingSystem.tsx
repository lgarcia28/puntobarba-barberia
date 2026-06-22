import React, { useState, useEffect, Component, useRef } from 'react';
import {
  collection,
  query,
  where,
  onSnapshot,
  addDoc,
  Timestamp,
  runTransaction,
  doc,
  getDoc,
  getDocs,
  updateDoc,
  orderBy,
  writeBatch,
  deleteDoc
} from 'firebase/firestore';
import { db, auth } from '../firebase';
import { BARBERS as INITIAL_BARBERS, SERVICES as DEFAULT_SERVICES, handleFirestoreError, OperationType, clearAppointments, addBarber, deleteBarber, updateBarber, getShopSettings, updateShopSettings, DEFAULT_SCHEDULE, seedBarbers, seedServices, addProduct, deleteProduct, DEFAULT_PRODUCTS, seedDrinks, addDrink, updateDrink, deleteDrink, updateProduct } from '../lib/firestore';
import { format, addMinutes, startOfDay, endOfDay, isBefore, isAfter, parseISO, setHours, setMinutes, eachMinuteOfInterval, isSameDay, eachDayOfInterval, getDay, startOfWeek, endOfWeek, addDays, addMonths, startOfMonth, endOfMonth } from 'date-fns';
import { es } from 'date-fns/locale';
import { motion, AnimatePresence } from 'framer-motion';
import { Calendar as CalendarIcon, Clock, User, Scissors, CheckCircle2, AlertCircle, ChevronLeft, ChevronRight, LogIn, LogOut, Trash2, RefreshCcw, Database, Edit2, Phone, DollarSign, ShoppingBag, UserPlus, Coffee, Plus, X } from 'lucide-react';
import { signInWithPopup, GoogleAuthProvider, signOut } from 'firebase/auth';
import toast from 'react-hot-toast';

// --- Types ---
interface Barber {
  id: string;
  name: string;
  email: string;
  photo: string;
  role: string;
  bio?: string;
  schedule?: any;
}

export const addMinutesToTimeStr = (timeStr: string, minutes: number): string => {
  const [h, m] = timeStr.split(':').map(Number);
  const totalMinutes = h * 60 + m + minutes;
  const newH = Math.floor(totalMinutes / 60) % 24;
  const newM = totalMinutes % 60;
  return `${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}`;
};

export const normalizePhone = (phone: string): string => {
  let clean = phone.replace(/\D/g, "");
  if (clean.startsWith("00")) {
    clean = clean.substring(2);
  }
  if (clean.startsWith("0") && clean.length > 5) {
    clean = clean.substring(1);
  }

  // Spain handling (mobile numbers starting with 6 or 7)
  if (clean.startsWith("34") && clean.length === 11) {
    return clean;
  }
  if (clean.length === 9 && (clean.startsWith("6") || clean.startsWith("7"))) {
    return "34" + clean;
  }

  // Argentina handling
  if (clean.length === 10) {
    return "549" + clean;
  }
  if (clean.startsWith("54") && !clean.startsWith("549") && clean.length === 12) {
    return "549" + clean.substring(2);
  }
  if (clean.startsWith("549") && clean.length === 13) {
    return clean;
  }

  // Other countries
  if (clean.length >= 10) {
    return clean;
  }
  return clean;
};

export const getPhoneVariations = (phone: string): string[] => {
  const clean = phone.replace(/\D/g, "");
  const variations = new Set<string>();

  if (!clean) return [];

  // 1. Raw clean digits
  variations.add(clean);

  // 2. Fully normalized phone
  const normalized = normalizePhone(phone);
  variations.add(normalized);

  // 3. If normalized starts with "549" and has 13 digits
  if (normalized.startsWith("549") && normalized.length === 13) {
    const local = normalized.substring(3); // 10 digits
    variations.add(local);
    variations.add("0" + local); // e.g. 03416055274
    if (local.startsWith("341")) {
      variations.add("34115" + local.substring(3)); // e.g. 341156055274
    }
  }

  // 4. If normalized starts with "34" (Spain) and has 11 digits
  if (normalized.startsWith("34") && normalized.length === 11) {
    variations.add(normalized.substring(2)); // 9 digits
  }

  // 5. Raw input trimmed
  variations.add(phone.trim());

  return Array.from(variations).filter(Boolean);
};

interface BookingSystemProps {
  bookingTab?: 'agendar' | 'mis-turnos';
  setBookingTab?: (tab: 'agendar' | 'mis-turnos') => void;
  onClose?: () => void;
  forceClientFlow?: boolean;
  initialServiceName?: string | null;
}

const SERVICE_DESCRIPTIONS: Record<string, string> = {
  'corte-cabello': 'Corte clásico o moderno con asesoramiento de estilo y peinado.',
  'corte-tijera': 'Corte artesanal completo utilizando únicamente tijeras para una caída natural.',
  'barba-express': 'Recorte de barba y perfilado con máquina.',
  'barba-moderna': 'Diseño de barba con afeitado de contorno a navaja, toallas calientes, masajes y nutrición con óleo.',
  'afeitado-clasico': 'Ritual tradicional con toallas calientes, espuma templada, masajes y afeitado a navaja.',
  'ritual-facial': 'Tratamiento de hidratación y exfoliación facial para renovar la piel.',
  'corte-perfilado-cejas': 'Combo de corte más diseño y perfilado de cejas detallado.',
  'corte-b-express': 'Corte combinado con un recorte rápido de barba.',
  'corte-b-moderna': 'Corte combinado con diseño de barba y afeitado a navaja.',
  'corte-a-clasico': 'Combo definitivo: corte y el ritual completo de afeitado clásico.',
  'corte-r-facial': 'Corte combinado con un relajante tratamiento facial hidratante.',
  'servicio-vip': 'Experiencia VIP de 4 horas: Corte, barba completa, cejas, ritual facial y cortesía.'
};

const getServiceCategory = (service: any) => {
  const id = service.id || '';
  if (id === 'servicio-vip') return 'vip';
  if (id.startsWith('corte-b-') || id.startsWith('corte-a-') || id.startsWith('corte-r-') || id === 'corte-perfilado-cejas') return 'combos';
  if (id.startsWith('corte-')) return 'cortes';
  if (id.startsWith('barba-') || id === 'afeitado-clasico') return 'barba';
  if (id.includes('facial')) return 'facial';
  return 'otros';
};

// --- Booking System Component ---
export const BookingSystem = ({ bookingTab: propBookingTab, setBookingTab: propSetBookingTab, onClose, forceClientFlow = false, initialServiceName = null }: BookingSystemProps = {}) => {
  const [step, setStep] = useState(1);
  const [selectedBarber, setSelectedBarber] = useState<Barber | null>(null);
  const [selectedService, setSelectedService] = useState<any>(null);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [selectedTimesForBlocking, setSelectedTimesForBlocking] = useState<string[]>([]);
  const [customerInfo, setCustomerInfo] = useState({ name: '', phone: '', birthdate: '' });
  const [isBirthdateAutocompleted, setIsBirthdateAutocompleted] = useState(false);
  const [selectedCourtesy, setSelectedCourtesy] = useState<string | null>(null);
  const [activeServiceCategory, setActiveServiceCategory] = useState<'Todos' | 'Cortes' | 'Barba' | 'Facial' | 'Combos'>('Todos');
  const [isFixedAppointment, setIsFixedAppointment] = useState(false);
  const [fixedInterval, setFixedInterval] = useState<'weekly' | 'biweekly'>('weekly');
  const [appointments, setAppointments] = useState<any[]>([]);
  const [reschedulingApptId, setReschedulingApptId] = useState<string | null>(null);
  const [fixedCancelAppt, setFixedCancelAppt] = useState<any | null>(null);
  const [fixedRescheduleAppt, setFixedRescheduleAppt] = useState<any | null>(null);
  const [rescheduleOption, setRescheduleOption] = useState<'single' | 'series' | null>(null);
  const [blocks, setBlocks] = useState<any[]>([]);

  // Admin Panel Specific State
  const [adminDate, setAdminDate] = useState(new Date());
  const [blockingEndDate, setBlockingEndDate] = useState<Date | null>(null);
  const [isRangeMode, setIsRangeMode] = useState(false);
  const [adminViewMode, setAdminViewMode] = useState<'daily' | 'weekly'>('daily');
  const [adminAppts, setAdminAppts] = useState<any[]>([]);
  const [adminBlocks, setAdminBlocks] = useState<any[]>([]);

  const adminDateInputRef = useRef<HTMLInputElement>(null);
  const blockingEndDateInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const horariosRef = useRef<HTMLDivElement>(null);

  const scrollToHorarios = () => {
    setTimeout(() => {
      horariosRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
  };

  // Autocomplete customer name and birthday from previous appointments
  useEffect(() => {
    const phone = customerInfo.phone;
    const normalized = normalizePhone(phone);
    
    // We only query if the normalized phone has a minimum reasonable length (e.g., 8 digits)
    if (normalized.length < 8) {
      setIsBirthdateAutocompleted(false);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const variations = getPhoneVariations(phone);
        if (variations.length === 0) return;
        const q = query(
          collection(db, 'appointments'),
          where('customerPhone', 'in', variations)
        );
        const querySnapshot = await getDocs(q);
        if (!querySnapshot.empty) {
          // Sort by startTime descending in memory to get the most recent appointment
          const appts = querySnapshot.docs.map(doc => doc.data());
          appts.sort((a, b) => (b.startTime?.toMillis?.() || 0) - (a.startTime?.toMillis?.() || 0));
          const latestApptOverall = appts[0];
          const latestApptWithBirthdate = appts.find(a => a.customerBirthdate);
          
          if (latestApptOverall || latestApptWithBirthdate) {
            setCustomerInfo(prev => {
              // Auto-fill name if it is currently empty or just placeholder
              const newName = prev.name.trim() === '' ? ((latestApptOverall?.customerName) || '') : prev.name;
              
              // If there's a birthdate, autocomplete it and set isBirthdateAutocompleted to true
              let newBirthdate = prev.birthdate;
              if (latestApptWithBirthdate && latestApptWithBirthdate.customerBirthdate) {
                newBirthdate = latestApptWithBirthdate.customerBirthdate;
                setIsBirthdateAutocompleted(true);
              }
              return {
                ...prev,
                name: newName,
                birthdate: newBirthdate
              };
            });
          }
        } else {
          // If no previous appointments found, reset autocompleted state
          setIsBirthdateAutocompleted(false);
        }
      } catch (error) {
        console.error("Error fetching previous appointments for autocomplete:", error);
      }
    }, 600); // 600ms debounce

    return () => clearTimeout(timer);
  }, [customerInfo.phone]);

  const isFirstMount = useRef(true);

  // Scroll to top on step change
  useEffect(() => {
    if (isFirstMount.current) {
      isFirstMount.current = false;
      return;
    }
    if (containerRef.current) {
      containerRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [step]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Barber Admin State
  const [user, setUser] = useState<any>(null);
  const [isBarberAdmin, setIsBarberAdmin] = useState(false);
  const [isIvan, setIsIvan] = useState(false);
  const [barbers, setBarbers] = useState<Barber[]>([]);
  const [activeAdminTab, setActiveAdminTab] = useState<'agenda' | 'barberos' | 'horarios' | 'agendar' | 'finanzas' | 'precios' | 'catalogo' | 'cortesia'>('agenda');
  const [newBarber, setNewBarber] = useState({ name: '', email: '', photo: '', role: 'barber' });
  const [editingBarberId, setEditingBarberId] = useState<string | null>(null);
  const [isAddingBarber, setIsAddingBarber] = useState(false);
  const [isServiceModalOpen, setIsServiceModalOpen] = useState(false);
  const [editingServiceId, setEditingServiceId] = useState<string | null>(null);
  const [editingServiceForm, setEditingServiceForm] = useState({ name: '', duration: 30, price: '', desc: '' });
  const [newService, setNewService] = useState({ name: '', duration: 30, price: '', desc: '' });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [shopSettings, setShopSettings] = useState<any>({ schedule: DEFAULT_SCHEDULE });
  const [scheduleTargetId, setScheduleTargetId] = useState<string>('general');
  const [editingSchedule, setEditingSchedule] = useState<any>(DEFAULT_SCHEDULE);
  const [useGeneralScheduleForBarber, setUseGeneralScheduleForBarber] = useState<boolean>(true);
  const [services, setServices] = useState<any[]>(DEFAULT_SERVICES);

  useEffect(() => {
    if (initialServiceName && services.length > 0) {
      const foundService = services.find(
        (s: any) => s.name.toLowerCase() === initialServiceName.toLowerCase() || s.id === initialServiceName
      );
      if (foundService) {
        setSelectedService(foundService);
      }
    }
  }, [initialServiceName, services]);
  const [savingPrices, setSavingPrices] = useState(false);

  // Product catalog states and handlers
  const [products, setProducts] = useState<any[]>([]);
  const [newProduct, setNewProduct] = useState({ name: '', desc: '', price: '', tag: '', img: '' });
  const [catalogLoading, setCatalogLoading] = useState(false);
  const productFileInputRef = useRef<HTMLInputElement>(null);
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [editingProductForm, setEditingProductForm] = useState({ name: '', desc: '', price: '', tag: '', img: '' });

  useEffect(() => {
    if (!isBarberAdmin) return;
    const q = query(collection(db, 'products'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const prodsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setProducts(prodsData);
    });
    return unsubscribe;
  }, [isBarberAdmin]);

  // Courtesy drinks states and handlers
  const [drinks, setDrinks] = useState<any[]>([]);
  const [newDrink, setNewDrink] = useState({ name: '', category: 'cafeteria', available: true });
  const [drinksLoading, setDrinksLoading] = useState(false);
  const [editingDrinkId, setEditingDrinkId] = useState<string | null>(null);
  const [editingDrinkForm, setEditingDrinkForm] = useState({ name: '', category: 'cafeteria', available: true });
  const [isDrinkModalOpen, setIsDrinkModalOpen] = useState(false);

  useEffect(() => {
    const q = query(collection(db, 'drinks'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const drinksData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setDrinks(drinksData);
    });
    return unsubscribe;
  }, []);

  const handleProductFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const img = new window.Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_WIDTH = 1000;
          const MAX_HEIGHT = 1000;
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > MAX_WIDTH) {
              height *= MAX_WIDTH / width;
              width = MAX_WIDTH;
            }
          } else {
            if (height > MAX_HEIGHT) {
              width *= MAX_HEIGHT / height;
              height = MAX_HEIGHT;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(img, 0, 0, width, height);
            
            // Compress to JPEG at 85% quality
            const compressedBase64 = canvas.toDataURL('image/jpeg', 0.85);
            if (editingProductId) {
              setEditingProductForm(prev => ({ ...prev, img: compressedBase64 }));
            } else {
              setNewProduct(prev => ({ ...prev, img: compressedBase64 }));
            }
          } else {
            if (editingProductId) {
              setEditingProductForm(prev => ({ ...prev, img: reader.result as string }));
            } else {
              setNewProduct(prev => ({ ...prev, img: reader.result as string }));
            }
          }
        };
        img.src = reader.result as string;
      };
      reader.readAsDataURL(file);
    }
  };

  const handleNewProductSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCatalogLoading(true);
    try {
      await addProduct(newProduct);
      toast.success('Producto agregado al catálogo');
      setNewProduct({ name: '', desc: '', price: '', tag: '', img: '' });
      if (productFileInputRef.current) productFileInputRef.current.value = '';
      setIsProductModalOpen(false);
    } catch (err) {
      console.error(err);
      toast.error('Error al agregar producto');
    } finally {
      setCatalogLoading(false);
    }
  };

  const handleProductDelete = async (id: string) => {
    if (!window.confirm('¿Estás seguro de eliminar este producto?')) return;
    try {
      await deleteProduct(id);
      toast.success('Producto eliminado');
    } catch (err) {
      console.error(err);
      toast.error('Error al eliminar producto');
    }
  };

  const handleEditProductSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProductId) return;
    setCatalogLoading(true);
    try {
      await updateProduct(editingProductId, editingProductForm);
      toast.success('Producto actualizado');
      setEditingProductId(null);
      setEditingProductForm({ name: '', desc: '', price: '', tag: '', img: '' });
      if (productFileInputRef.current) productFileInputRef.current.value = '';
      setIsProductModalOpen(false);
    } catch (err) {
      console.error(err);
      toast.error('Error al actualizar producto');
    } finally {
      setCatalogLoading(false);
    }
  };

  const handleNewDrinkSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setDrinksLoading(true);
    try {
      await addDrink(newDrink);
      toast.success('Bebida agregada al catálogo de cortesías');
      setNewDrink({ name: '', category: 'cafeteria', available: true });
      setIsDrinkModalOpen(false);
    } catch (err) {
      console.error(err);
      toast.error('Error al agregar bebida');
    } finally {
      setDrinksLoading(false);
    }
  };

  const handleDrinkDelete = async (id: string) => {
    if (!window.confirm('¿Estás seguro de eliminar esta bebida?')) return;
    try {
      await deleteDrink(id);
      toast.success('Bebida eliminada');
    } catch (err) {
      console.error(err);
      toast.error('Error al eliminar bebida');
    }
  };

  const handleDrinkToggleAvailability = async (id: string, currentAvailable: boolean) => {
    try {
      await updateDrink(id, { available: !currentAvailable });
      toast.success('Disponibilidad actualizada');
    } catch (err) {
      console.error(err);
      toast.error('Error al actualizar disponibilidad');
    }
  };

  const handleEditDrinkSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingDrinkId) return;
    setDrinksLoading(true);
    try {
      await updateDrink(editingDrinkId, editingDrinkForm);
      toast.success('Bebida actualizada');
      setEditingDrinkId(null);
      setIsDrinkModalOpen(false);
    } catch (err) {
      console.error(err);
      toast.error('Error al actualizar bebida');
    } finally {
      setDrinksLoading(false);
    }
  };

  const getBarberDaySchedule = (barber: Barber | null, dayOfWeek: number) => {
    if (barber && barber.schedule && barber.schedule[dayOfWeek]) {
      return barber.schedule[dayOfWeek];
    }
    return shopSettings?.schedule?.[dayOfWeek] || DEFAULT_SCHEDULE[dayOfWeek as keyof typeof DEFAULT_SCHEDULE];
  };

  // Mis Turnos State
  const [localBookingTab, setLocalBookingTab] = useState<'agendar' | 'mis-turnos'>('agendar');
  const bookingTab = propBookingTab !== undefined ? propBookingTab : localBookingTab;
  const setBookingTab = propSetBookingTab !== undefined ? propSetBookingTab : setLocalBookingTab;
  const [searchPhone, setSearchPhone] = useState('');
  const [myAppointments, setMyAppointments] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Edit Appointment Modal State
  const [editingAppt, setEditingAppt] = useState<any | null>(null);
  const [editForm, setEditForm] = useState({ customerName: '', customerPhone: '', service: '', customPrice: '', customerBirthdate: '' });

  // Finanzas State
  const [finanzasDate, setFinanzasDate] = useState(new Date());
  const [finanzasAppts, setFinanzasAppts] = useState<any[]>([]);
  const [finanzasViewMode, setFinanzasViewMode] = useState<'daily' | 'weekly' | 'monthly'>('daily');
  const [selectedFinanzasBarberId, setSelectedFinanzasBarberId] = useState<string | null>(null);
  const finanzasDatePickerRef = useRef<HTMLInputElement>(null);

  // Registro Rápido (Walk-in) y Cobro de Turnos State
  const [showQuickLog, setShowQuickLog] = useState(false);
  const [quickLogService, setQuickLogService] = useState<any>(null);
  const [quickLogPrice, setQuickLogPrice] = useState('');
  const [quickLogClientName, setQuickLogClientName] = useState('');
  const [completingAppt, setCompletingAppt] = useState<any | null>(null);
  const [completingPrice, setCompletingPrice] = useState('');

  useEffect(() => {
    getShopSettings().then((settings: any) => {
      setShopSettings(settings);
      setEditingSchedule(settings?.schedule || DEFAULT_SCHEDULE);
      if (settings?.services) {
        setServices(settings.services);
      }
    });
  }, []);

  // Trigger pending WhatsApp reminders check in background on load
  useEffect(() => {
    fetch('/api/cron-reminders')
      .then(res => res.json())
      .then(data => {
        if (data.success && data.sent && data.sent.length > 0) {
          console.log(`[Reminders Cron] Automatically processed and sent ${data.sent.length} reminders.`);
        }
      })
      .catch(err => console.error('[Reminders Cron] Error processing background reminders:', err));
  }, []);

  // Reset selected time when barber or service changes to prevent stale booking hours
  useEffect(() => {
    setSelectedTime(null);
  }, [selectedBarber, selectedService]);

  // Fetch Barbers from Firestore
  useEffect(() => {
    const q = query(collection(db, 'barbers'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const adminEmails = ['leoneldariogarcia@gmail.com', 'puntobarba.barber@gmail.com', 'puntobarbabarberia@gmail.com'];
      const barbersData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Barber));

      // Sort: Admin (Ivan) first, then others by name
      const sortedBarbers = barbersData.sort((a, b) => {
        const aName = a.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const bName = b.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

        if (adminEmails.includes(a.email)) return -1;
        if (adminEmails.includes(b.email)) return 1;

        // Fallback to name if email doesn't match
        if (aName.includes('ivan')) return -1;
        if (bName.includes('ivan')) return 1;

        return a.name.localeCompare(b.name);
      });

      setBarbers(sortedBarbers);

      // If no barbers in DB, use initial ones
      if (sortedBarbers.length === 0) {
        setBarbers(INITIAL_BARBERS as Barber[]);
      }
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((u) => {
      setUser(u);
      if (u) {
        const adminEmails = ['leoneldariogarcia@gmail.com', 'puntobarba.barber@gmail.com', 'puntobarbabarberia@gmail.com'];
        const isIvanUser = adminEmails.includes(u.email || '');
        setIsIvan(isIvanUser && !forceClientFlow);

        // Check if user is a barber in the dynamic list
        const barber = barbers.find(b => b.email === u.email);
        if ((barber || isIvanUser) && !forceClientFlow) {
          setIsBarberAdmin(true);
          // If not Ivan, auto-select the barber
          if (!isIvanUser && barber && !selectedBarber) {
            setSelectedBarber(barber);
          }
        } else {
          setIsBarberAdmin(false);
        }
      } else {
        setIsBarberAdmin(false);
        setIsIvan(false);
      }
    });
    return unsubscribe;
  }, [barbers, forceClientFlow]);

  useEffect(() => {
    if (isBarberAdmin) {
      seedBarbers();
      seedServices();
      seedDrinks();
    }
  }, [isBarberAdmin]);

  useEffect(() => {
    if (!selectedBarber) return;

    setAppointments([]);
    setBlocks([]);

    const start = startOfDay(selectedDate);
    const end = endOfDay(selectedDate);

    const qAppts = query(
      collection(db, 'appointments'),
      where('barberId', '==', selectedBarber.id),
      where('startTime', '>=', Timestamp.fromDate(start)),
      where('startTime', '<=', Timestamp.fromDate(end)),
      where('status', '==', 'confirmed')
    );

    const qBlocks = query(
      collection(db, 'blocks'),
      where('barberId', '==', selectedBarber.id),
      where('startTime', '>=', Timestamp.fromDate(start)),
      where('startTime', '<=', Timestamp.fromDate(end))
    );

    const unsubAppts = onSnapshot(qAppts, (snapshot) => {
      setAppointments(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'appointments'));

    const unsubBlocks = onSnapshot(qBlocks, (snapshot) => {
      setBlocks(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'blocks'));

    return () => {
      unsubAppts();
      unsubBlocks();
    };
  }, [selectedBarber, selectedDate]);

  // Admin Data Fetching
  useEffect(() => {
    if (!selectedBarber || !isBarberAdmin) return;
    
    let start, end;
    if (adminViewMode === 'weekly') {
      start = startOfWeek(adminDate, { weekStartsOn: 1 });
      end = endOfWeek(adminDate, { weekStartsOn: 1 });
    } else {
      start = startOfDay(adminDate);
      end = endOfDay(adminDate);
    }

    const qAppts = query(
      collection(db, 'appointments'),
      where('barberId', '==', selectedBarber.id),
      where('startTime', '>=', Timestamp.fromDate(start)),
      where('startTime', '<=', Timestamp.fromDate(end)),
      where('status', '==', 'confirmed')
    );
    const qBlocks = query(
      collection(db, 'blocks'),
      where('barberId', '==', selectedBarber.id),
      where('startTime', '>=', Timestamp.fromDate(start)),
      where('startTime', '<=', Timestamp.fromDate(end))
    );

    const unsubAppts = onSnapshot(qAppts, (snapshot) => {
      setAdminAppts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'appointments'));

    const unsubBlocks = onSnapshot(qBlocks, (snapshot) => {
      setAdminBlocks(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'blocks'));

    return () => { unsubAppts(); unsubBlocks(); };
  }, [selectedBarber, adminDate, isBarberAdmin, adminViewMode]);

  // Finanzas Data Fetching
  useEffect(() => {
    if (!isIvan || activeAdminTab !== 'finanzas') return;
    
    let start, end;
    if (finanzasViewMode === 'monthly') {
      start = startOfMonth(finanzasDate);
      end = endOfMonth(finanzasDate);
    } else if (finanzasViewMode === 'weekly') {
      start = startOfWeek(finanzasDate, { weekStartsOn: 1 });
      end = endOfWeek(finanzasDate, { weekStartsOn: 1 });
    } else {
      start = startOfDay(finanzasDate);
      end = endOfDay(finanzasDate);
    }

    const qAppts = query(
      collection(db, 'appointments'),
      where('startTime', '>=', Timestamp.fromDate(start)),
      where('startTime', '<=', Timestamp.fromDate(end)),
      where('status', '==', 'confirmed')
    );

    const unsubAppts = onSnapshot(qAppts, (snapshot) => {
      setFinanzasAppts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'appointments'));

    return () => unsubAppts();
  }, [finanzasDate, isIvan, activeAdminTab, finanzasViewMode]);

  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (err: any) {
      console.error('Login error:', err);
      if (err.code === 'auth/popup-blocked') {
        toast.error('El navegador bloqueó la ventana emergente. Por favor, permite las ventanas emergentes para este sitio.');
      } else if (err.code === 'auth/unauthorized-domain') {
        toast.error('Este dominio no está autorizado en la consola de Firebase. Por favor, añade ' + window.location.hostname + ' a la lista de dominios autorizados en Firebase Auth.');
      } else {
        toast.error('Error al iniciar sesión: ' + (err.message || 'Error desconocido'));
      }
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
  };

  const getAvailableDays = () => {
    const days = [];
    const today = startOfDay(new Date());
    
    // We check the next 60 days to find enough open days
    for (let i = 0; i < 60; i++) {
      const date = addDays(today, i);
      const dayOfWeek = getDay(date);
      const daySchedule = getBarberDaySchedule(selectedBarber, dayOfWeek);
      if (daySchedule.isOpen) {
        days.push(date);
      }
      if (days.length >= 24) {
        break;
      }
    }
    return days;
  };

  const isSundayEnabled = () => {
    const sundaySchedule = getBarberDaySchedule(selectedBarber, 0);
    return !!(sundaySchedule && sundaySchedule.isOpen);
  };

  const getCalendarDays = () => {
    const days = [];
    const today = startOfDay(new Date());
    const currentDayOfWeek = getDay(today);
    const daysToSubtract = currentDayOfWeek === 0 ? 6 : currentDayOfWeek - 1;
    const startMonday = addDays(today, -daysToSubtract);
    
    let current = startMonday;
    const showSunday = isSundayEnabled();
    const targetLength = showSunday ? 35 : 30;
    
    while (days.length < targetLength) {
      if (showSunday || getDay(current) !== 0) {
        days.push(current);
      }
      current = addDays(current, 1);
    }
    return days;
  };

  const getAvailableSlots = () => {
    if (!selectedBarber || !selectedService) return [];

    const dayOfWeek = getDay(selectedDate);
    const daySchedule = getBarberDaySchedule(selectedBarber, dayOfWeek);
    if (!daySchedule.isOpen) return [];

    const slots = [];
    const [startH, startM] = daySchedule.start.split(':').map(Number);
    const [endH, endM] = daySchedule.end.split(':').map(Number);

    const startTime = setMinutes(setHours(startOfDay(selectedDate), startH), startM);
    const endTime = setMinutes(setHours(startOfDay(selectedDate), endH), endM);

    const interval = eachMinuteOfInterval({
      start: startTime,
      end: endTime
    }, { step: 60 });

    for (const time of interval) {
      const slotStart = time;
      const slotEnd = addMinutes(time, selectedService.duration);

      if (isBefore(slotStart, new Date())) continue;

      const slotStartStr = format(slotStart, 'HH:mm');
      const slotEndStr = addMinutesToTimeStr(slotStartStr, selectedService.duration);

      // El turno no puede terminar después del horario de cierre configurado
      if (slotEndStr > daySchedule.end) continue;

      // Check if slot is occupied by appointment or block
      const isOccupied = appointments.some(appt => {
        if (appt.completed) return false; // Ignorar turnos ya cobrados/completados
        const apptStart = appt.startTime.toDate();
        const apptEnd = appt.endTime.toDate();
        return (isBefore(slotStart, apptEnd) && isAfter(slotEnd, apptStart));
      }) || blocks.some(block => {
        const blockStart = block.startTime.toDate();
        const blockEnd = block.endTime.toDate();
        return (isBefore(slotStart, blockEnd) && isAfter(slotEnd, blockStart));
      });

      if (!isOccupied) {
        slots.push(slotStartStr);
      }
    }

    return slots;
  };

  const handleSearchAppointments = async (e?: any) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!searchPhone) return;
    setIsSearching(true);
    try {
      const variations = getPhoneVariations(searchPhone);
      const q = query(
        collection(db, 'appointments'),
        where('customerPhone', 'in', variations),
        where('startTime', '>=', Timestamp.now())
      );
      const snapshot = await getDocs(q);
      // Sort manually since we need an index for multiple fields
      const appts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() as any }))
        .filter(a => a.status === 'confirmed')
        .sort((a, b) => a.startTime.toMillis() - b.startTime.toMillis());
      setMyAppointments(appts);
      if (appts.length === 0) {
        toast.error('No se encontraron turnos próximos para este teléfono.');
      }
    } catch (err) {
      console.error(err);
      toast.error('Error al buscar turnos.');
    } finally {
      setIsSearching(false);
    }
  };

  const handleBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBarber || !selectedService || !selectedTime || !customerInfo.name || !customerInfo.phone || !customerInfo.birthdate) return;

    setLoading(true);
    setError(null);

    const dayOfWeek = getDay(selectedDate);
    const daySchedule = getBarberDaySchedule(selectedBarber, dayOfWeek);
    if (!daySchedule.isOpen) {
      setError('La barbería está cerrada este día.');
      setLoading(false);
      return;
    }

    const slotEndStr = addMinutesToTimeStr(selectedTime, selectedService.duration);
    if (slotEndStr > daySchedule.end) {
      setError(`No es posible agendar este servicio a las ${selectedTime} ya que supera el horario de cierre de la barbería (${daySchedule.end}).`);
      setLoading(false);
      return;
    }

    const [hours, minutes] = selectedTime.split(':').map(Number);
    const baseStartTime = setMinutes(setHours(startOfDay(selectedDate), hours), minutes);
    const baseEndTime = addMinutes(baseStartTime, selectedService.duration);

    try {
      if (isFixedAppointment) {
        const batch = writeBatch(db);
        const endDate = addMonths(baseStartTime, 1);
        const groupId = `fixed_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        let booksCount = 0;
        let lastDateBooked = baseStartTime;

        // Si estamos reprogramando, liberamos sus slots y cancelamos el turno anterior
        if (reschedulingApptId) {
          const oldDocRef = doc(db, 'appointments', reschedulingApptId);
          const oldSnapshot = await getDoc(oldDocRef);
          if (oldSnapshot.exists()) {
            const oldApptData = oldSnapshot.data() as any;
            if (oldApptData && oldApptData.status === 'confirmed') {
              if (rescheduleOption === 'series' && oldApptData.isFixed && oldApptData.groupId) {
                // Cancelar toda la serie de turnos futuros
                const q = query(
                  collection(db, 'appointments'),
                  where('groupId', '==', oldApptData.groupId)
                );
                const seriesSnapshot = await getDocs(q);
                const targetTimeSeconds = oldApptData.startTime.seconds;
                seriesSnapshot.docs.forEach(d => {
                  const data = d.data() as any;
                  if (data.startTime && data.startTime.seconds >= targetTimeSeconds) {
                    batch.update(d.ref, { status: 'cancelled' });
                    
                    if (data.status === 'confirmed') {
                      const start = data.startTime.toDate();
                      const end = data.endTime.toDate();
                      const durationMin = Math.round((end.getTime() - start.getTime()) / (60 * 1000));
                      const intervalsCount = Math.ceil(durationMin / 30);
                      const slotDateStr = format(start, 'yyyy-MM-dd');
                      for (let i = 0; i < intervalsCount; i++) {
                        const slotTime = addMinutes(start, i * 30);
                        const timeStr = format(slotTime, 'HH:mm');
                        const slotId = `${data.barberId}_${slotDateStr}_${timeStr}`;
                        batch.delete(doc(db, 'slots', slotId));
                      }
                    }
                  }
                });
              } else {
                // Cancelar solo el turno individual anterior
                const oldStart = oldApptData.startTime.toDate();
                const oldEnd = oldApptData.endTime.toDate();
                const oldBarberId = oldApptData.barberId;
                const oldDuration = Math.round((oldEnd.getTime() - oldStart.getTime()) / (60 * 1000));
                const oldIntervalsCount = Math.ceil(oldDuration / 30);
                const oldSlotDateStr = format(oldStart, 'yyyy-MM-dd');
                for (let i = 0; i < oldIntervalsCount; i++) {
                  const slotTime = addMinutes(oldStart, i * 30);
                  const timeStr = format(slotTime, 'HH:mm');
                  const slotId = `${oldBarberId}_${oldSlotDateStr}_${timeStr}`;
                  batch.delete(doc(db, 'slots', slotId));
                }
                batch.update(oldDocRef, { status: 'cancelled' });
              }
            }
          }
        }

        let currentStartTime = baseStartTime;
        let currentEndTime = baseEndTime;
        const intervalDays = fixedInterval === 'weekly' ? 7 : 14;

        while (isBefore(currentStartTime, endDate) || isSameDay(currentStartTime, endDate)) {
          // Check availability (both appointments and blocks)
          const qAppts = query(
            collection(db, 'appointments'),
            where('barberId', '==', selectedBarber.id),
            where('startTime', '>=', Timestamp.fromDate(startOfDay(currentStartTime))),
            where('startTime', '<=', Timestamp.fromDate(endOfDay(currentStartTime))),
            where('status', '==', 'confirmed')
          );
          const qBlocks = query(
            collection(db, 'blocks'),
            where('barberId', '==', selectedBarber.id),
            where('startTime', '>=', Timestamp.fromDate(startOfDay(currentStartTime))),
            where('startTime', '<=', Timestamp.fromDate(endOfDay(currentStartTime)))
          );

          const [snapAppts, snapBlocks] = await Promise.all([
            getDocs(qAppts),
            getDocs(qBlocks)
          ]);

          const existingAppts = snapAppts.docs.map(d => d.data());
          const existingBlocks = snapBlocks.docs.map(d => d.data());
          
          const isOccupied = existingAppts.some(appt => {
            if ((appt as any).completed) return false; // Ignorar turnos ya cobrados/completados
            const apptStart = (appt as any).startTime.toDate();
            const apptEnd = (appt as any).endTime.toDate();
            return (isBefore(currentStartTime, apptEnd) && isAfter(currentEndTime, apptStart));
          }) || existingBlocks.some(block => {
            const blockStart = (block as any).startTime.toDate();
            const blockEnd = (block as any).endTime.toDate();
            return (isBefore(currentStartTime, blockEnd) && isAfter(currentEndTime, blockStart));
          });

          if (!isOccupied) {
            const apptRef = doc(collection(db, 'appointments'));
            batch.set(apptRef, {
              barberId: selectedBarber.id,
              customerName: customerInfo.name,
              customerPhone: normalizePhone(customerInfo.phone),
              customerBirthdate: customerInfo.birthdate,
              service: selectedService.name,
              startTime: Timestamp.fromDate(currentStartTime),
              endTime: Timestamp.fromDate(currentEndTime),
              status: 'confirmed',
              createdAt: Timestamp.now(),
              isFixed: true,
              groupId: groupId,
              courtesy: selectedCourtesy || 'Ninguna'
            });

            // Escribir los slots para el turno fijo
            const durationMin = selectedService.duration;
            const intervalsCount = Math.ceil(durationMin / 30);
            const slotDateStr = format(currentStartTime, 'yyyy-MM-dd');
            for (let i = 0; i < intervalsCount; i++) {
              const slotTime = addMinutes(currentStartTime, i * 30);
              const timeStr = format(slotTime, 'HH:mm');
              const slotId = `${selectedBarber.id}_${slotDateStr}_${timeStr}`;
              batch.set(doc(db, 'slots', slotId), {
                barberId: selectedBarber.id,
                startTime: Timestamp.fromDate(slotTime),
                appointmentId: apptRef.id
              });
            }

            booksCount++;
            lastDateBooked = currentStartTime;
          }
          
          currentStartTime = addDays(currentStartTime, intervalDays);
          currentEndTime = addDays(currentEndTime, intervalDays);
        }

        if (booksCount === 0) {
           throw new Error('Todos los turnos de las próximas semanas están ocupados.');
        }

        await batch.commit();

        try {
          await fetch('/api/send-whatsapp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              phone: customerInfo.phone,
              customerName: customerInfo.name,
              service: selectedService.name,
              barber: selectedBarber.name,
              date: format(selectedDate, 'dd/MM/yyyy'),
              time: selectedTime,
              dayOfWeek: format(selectedDate, 'EEEE', { locale: es }) + (['sábado', 'domingo'].includes(format(selectedDate, 'EEEE', { locale: es })) ? 's' : ''),
              isFixed: true,
              lastDate: format(lastDateBooked, 'dd/MM/yyyy'),
              interval: fixedInterval,
              action: reschedulingApptId ? 'reschedule' : 'book'
            })
          });
        } catch (waErr) {
          console.error('Error al enviar WhatsApp automático:', waErr);
        }

      } else {
        await runTransaction(db, async (transaction) => {
          // Calcular los slots de 30 minutos requeridos por el servicio
          const durationMin = selectedService.duration;
          const intervalsCount = Math.ceil(durationMin / 30);
          const slotTimeKeys: string[] = [];
          const blockKeys: string[] = [];
          const slotDateStr = format(baseStartTime, 'yyyy-MM-dd');

          for (let i = 0; i < intervalsCount; i++) {
            const slotTime = addMinutes(baseStartTime, i * 30);
            const timeStr = format(slotTime, 'HH:mm');
            slotTimeKeys.push(`${selectedBarber.id}_${slotDateStr}_${timeStr}`);
            blockKeys.push(`block_${selectedBarber.id}_${slotTime.getTime()}`);
          }

          // Si estamos reprogramando, calculamos los slots del turno anterior para permitirlos
          const oldSlotsToFree: string[] = [];
          if (reschedulingApptId) {
            const oldSnapshot = await transaction.get(doc(db, 'appointments', reschedulingApptId));
            if (oldSnapshot.exists()) {
              const oldApptData = oldSnapshot.data();
              if (oldApptData && oldApptData.status === 'confirmed') {
                const oldStart = oldApptData.startTime.toDate();
                const oldEnd = oldApptData.endTime.toDate();
                const oldBarberId = oldApptData.barberId;
                const oldDuration = Math.round((oldEnd.getTime() - oldStart.getTime()) / (60 * 1000));
                const oldIntervalsCount = Math.ceil(oldDuration / 30);
                const oldSlotDateStr = format(oldStart, 'yyyy-MM-dd');
                for (let i = 0; i < oldIntervalsCount; i++) {
                  const slotTime = addMinutes(oldStart, i * 30);
                  const timeStr = format(slotTime, 'HH:mm');
                  oldSlotsToFree.push(`${oldBarberId}_${oldSlotDateStr}_${timeStr}`);
                }
              }
            }
          }

          // Comprobar la disponibilidad real e indiscutible leyendo los slots y bloques en la transacción
          const slotDocRefs = slotTimeKeys.map(key => doc(db, 'slots', key));
          const blockDocRefs = blockKeys.map(key => doc(db, 'blocks', key));
          
          const slotSnapshots = await Promise.all(slotDocRefs.map(ref => transaction.get(ref)));
          const blockSnapshots = await Promise.all(blockDocRefs.map(ref => transaction.get(ref)));

          // Para cada slot que existe en Firestore, verificar si su turno asociado sigue activo y confirmado
          let isOccupied = false;
          for (let idx = 0; idx < slotSnapshots.length; idx++) {
            const snap = slotSnapshots[idx];
            if (!snap.exists()) continue;
            
            const key = slotTimeKeys[idx];
            if (oldSlotsToFree.includes(key)) continue;
            
            const slotData = snap.data();
            const appointmentId = slotData?.appointmentId;
            
            if (appointmentId) {
              const apptSnap = await transaction.get(doc(db, 'appointments', appointmentId));
              if (apptSnap.exists()) {
                const apptData = apptSnap.data();
                if (apptData?.status === 'confirmed') {
                  isOccupied = true;
                  break;
                } else {
                  // El turno no está confirmado (ej: cancelado), podemos limpiar el slot huérfano
                  transaction.delete(slotDocRefs[idx]);
                }
              } else {
                // El turno asociado ya no existe en la BD, limpiamos el slot huérfano
                transaction.delete(slotDocRefs[idx]);
              }
            } else {
              // Si no tiene id de turno por alguna razón, se considera ocupado por seguridad
              isOccupied = true;
              break;
            }
          }

          if (isOccupied || blockSnapshots.some(snap => snap.exists())) {
            throw new Error('Turno ya ocupado o bloqueado. Por favor elige otro horario.');
          }

          // Crear el documento del turno
          const apptRef = doc(collection(db, 'appointments'));
          transaction.set(apptRef, {
            barberId: selectedBarber.id,
            customerName: customerInfo.name,
            customerPhone: normalizePhone(customerInfo.phone),
            customerBirthdate: customerInfo.birthdate,
            service: selectedService.name,
            startTime: Timestamp.fromDate(baseStartTime),
            endTime: Timestamp.fromDate(baseEndTime),
            status: 'confirmed',
            createdAt: Timestamp.now(),
            courtesy: selectedCourtesy || 'Ninguna'
          });

          // Escribir los slots individuales ocupados en Firestore
          slotDocRefs.forEach((ref, idx) => {
            transaction.set(ref, {
              barberId: selectedBarber.id,
              startTime: Timestamp.fromDate(addMinutes(baseStartTime, idx * 30)),
              appointmentId: apptRef.id
            });
          });

          // Si estamos reprogramando, liberamos sus slots y cancelamos el turno anterior
          if (reschedulingApptId) {
            oldSlotsToFree.forEach(key => {
              transaction.delete(doc(db, 'slots', key));
            });
            transaction.update(doc(db, 'appointments', reschedulingApptId), { status: 'cancelled' });
          }
        });

        // Enviar WhatsApp de confirmación automático
        try {
          await fetch('/api/send-whatsapp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              phone: customerInfo.phone,
              customerName: customerInfo.name,
              service: selectedService.name,
              barber: selectedBarber.name,
              date: format(selectedDate, 'dd/MM/yyyy'),
              time: selectedTime,
              dayOfWeek: format(selectedDate, 'EEEE', { locale: es }) + (['sábado', 'domingo'].includes(format(selectedDate, 'EEEE', { locale: es })) ? 's' : ''),
              isFixed: false,
              action: reschedulingApptId ? 'reschedule' : 'book'
            })
          });
        } catch (waErr) {
          console.error('Error al enviar WhatsApp automático:', waErr);
        }
      }

      setSuccess(true);
      setStep(7);
      setReschedulingApptId(null);
    } catch (err: any) {
      setError(err.message || 'Error al agendar el turno.');
      handleFirestoreError(err, OperationType.WRITE, 'appointments');
    } finally {
      setLoading(false);
    }
  };

  const executeCancelSeries = async (appt: any) => {
    try {
      setLoading(true);
      const q = query(
        collection(db, 'appointments'),
        where('groupId', '==', appt.groupId)
      );
      const snapshot = await getDocs(q);
      const batch = writeBatch(db);
      const targetTimeSeconds = appt.startTime.seconds;
      snapshot.docs.forEach(d => {
         const data = d.data() as any;
         if (data.startTime && data.startTime.seconds >= targetTimeSeconds) {
           batch.update(d.ref, { status: 'cancelled' });

           // Liberar los slots para cada turno de la serie cancelado
           if (data.status === 'confirmed') {
             const start = data.startTime.toDate();
             const end = data.endTime.toDate();
             const durationMin = Math.round((end.getTime() - start.getTime()) / (60 * 1000));
             const intervalsCount = Math.ceil(durationMin / 30);
             const slotDateStr = format(start, 'yyyy-MM-dd');

             for (let i = 0; i < intervalsCount; i++) {
               const slotTime = addMinutes(start, i * 30);
               const timeStr = format(slotTime, 'HH:mm');
               const slotId = `${data.barberId}_${slotDateStr}_${timeStr}`;
               batch.delete(doc(db, 'slots', slotId));
             }
           }
         }
      });
      await batch.commit();
      toast.success('Serie de turnos cancelada correctamente.');
      
      try {
        await fetch('/api/send-whatsapp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phone: appt.customerPhone,
            customerName: appt.customerName,
            service: appt.service,
            barber: barbers.find(b => b.id === appt.barberId)?.name || 'Barbero',
            date: format(appt.startTime.toDate(), 'dd/MM/yyyy'),
            time: format(appt.startTime.toDate(), 'HH:mm'),
            dayOfWeek: format(appt.startTime.toDate(), 'EEEE', { locale: es }) + (['sábado', 'domingo'].includes(format(appt.startTime.toDate(), 'EEEE', { locale: es })) ? 's' : ''),
            isFixed: true,
            action: 'cancel_series'
          })
        });
      } catch (waErr) {
        console.error('Error al enviar WhatsApp de cancelación:', waErr);
      }

      if (searchPhone) {
        const e = new Event('submit') as any;
        handleSearchAppointments(e);
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, 'appointments');
    } finally {
      setLoading(false);
    }
  };

  const executeCancelSingle = async (appt: any) => {
    try {
      setLoading(true);
      await runTransaction(db, async (transaction) => {
        const apptRef = doc(db, 'appointments', appt.id);
        transaction.update(apptRef, { status: 'cancelled' });

        // Liberar slots ocupados
        const start = appt.startTime.toDate();
        const end = appt.endTime.toDate();
        const durationMin = Math.round((end.getTime() - start.getTime()) / (60 * 1000));
        const intervalsCount = Math.ceil(durationMin / 30);
        const slotDateStr = format(start, 'yyyy-MM-dd');

        for (let i = 0; i < intervalsCount; i++) {
          const slotTime = addMinutes(start, i * 30);
          const timeStr = format(slotTime, 'HH:mm');
          const slotId = `${appt.barberId}_${slotDateStr}_${timeStr}`;
          transaction.delete(doc(db, 'slots', slotId));
        }
      });
      toast.success('Turno cancelado correctamente.');
      
      try {
        await fetch('/api/send-whatsapp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phone: appt.customerPhone,
            customerName: appt.customerName,
            service: appt.service,
            barber: barbers.find(b => b.id === appt.barberId)?.name || 'Barbero',
            date: format(appt.startTime.toDate(), 'dd/MM/yyyy'),
            time: format(appt.startTime.toDate(), 'HH:mm'),
            isFixed: appt.isFixed || false,
            action: 'cancel_single'
          })
        });
      } catch (waErr) {
        console.error('Error al enviar WhatsApp de cancelación:', waErr);
      }

      if (searchPhone) {
        const e = new Event('submit') as any;
        handleSearchAppointments(e);
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, 'appointments');
    } finally {
      setLoading(false);
    }
  };

  const handleCancelAppointment = async (appt: any) => {
    if (!isBarberAdmin) {
      const timeDiff = appt.startTime.toDate().getTime() - new Date().getTime();
      if (timeDiff <= 2 * 60 * 60 * 1000) {
        toast.error('No se puede cancelar o reprogramar un turno con menos de 2 horas de anticipación.');
        return;
      }
    }

    if (appt.isFixed && appt.groupId) {
      setFixedCancelAppt(appt);
    } else {
      if (!window.confirm('¿Estás seguro de que deseas cancelar este turno?')) return;
      await executeCancelSingle(appt);
    }
  };

  const handleUpdateDuration = async (appt: any, newDuration: number) => {
    try {
      const newEndTime = addMinutes(appt.startTime.toDate(), newDuration);
      const apptRef = doc(db, 'appointments', appt.id);
      await updateDoc(apptRef, { endTime: Timestamp.fromDate(newEndTime) });
      toast.success('Duración actualizada correctamente.');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, 'appointments');
    }
  };

  const handleRescheduleClick = (appt: any) => {
    if (!isBarberAdmin) {
      const timeDiff = appt.startTime.toDate().getTime() - new Date().getTime();
      if (timeDiff <= 2 * 60 * 60 * 1000) {
        toast.error('No se puede cancelar o reprogramar un turno con menos de 2 horas de anticipación.');
        return;
      }
    }

    if (appt.isFixed && appt.groupId) {
      setFixedRescheduleAppt(appt);
    } else {
      if (window.confirm('Para reprogramar, elige tu nuevo horario. El turno actual se cancelará automáticamente cuando confirmes el nuevo. ¿Continuar?')) {
        const b = barbers.find(barber => barber.id === appt.barberId);
        setSelectedBarber(b || null);
        setSelectedService(services.find(s => s.name === appt.service) || null);
        setCustomerInfo({ name: appt.customerName, phone: appt.customerPhone, birthdate: appt.customerBirthdate || '' });
        setReschedulingApptId(appt.id);
        setRescheduleOption('single');
        setIsFixedAppointment(false);
        setSelectedDate(startOfDay(new Date()));
        setSelectedTime(null);
        setStep(3); // Go to date selection
        setBookingTab('agendar');
      }
    }
  };

  const handleSaveEditAppointment = async () => {
    if (!editingAppt) return;
    try {
      const apptRef = doc(db, 'appointments', editingAppt.id);
      const updates: any = {
        customerName: editForm.customerName.trim(),
        customerPhone: normalizePhone(editForm.customerPhone.trim()),
        customerBirthdate: editForm.customerBirthdate || '',
        service: editForm.service,
      };
      if (editForm.customPrice !== '') {
        updates.customPrice = Number(editForm.customPrice);
      } else {
        updates.customPrice = null;
      }
      // If service changed, update endTime based on new duration
      const svcDurations: Record<string, number> = { 'Corte': 30, 'Corte y Barba': 60, 'Barba': 30 };
      const newDuration = svcDurations[editForm.service];
      if (newDuration) {
        updates.endTime = Timestamp.fromDate(addMinutes(editingAppt.startTime.toDate(), newDuration));
      }
      await updateDoc(apptRef, updates);
      toast.success('Turno actualizado correctamente.');
      setEditingAppt(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, 'appointments');
    }
  };

  const handleSaveQuickCut = async () => {
    if (!selectedBarber) {
      toast.error('Por favor selecciona un barbero primero.');
      return;
    }
    if (!quickLogService) {
      toast.error('Por favor selecciona un servicio.');
      return;
    }

    setLoading(true);
    try {
      const price = quickLogPrice !== '' ? Number(quickLogPrice) : quickLogService.price;
      const walkInDate = new Date(adminDate);
      const now = new Date();
      walkInDate.setHours(now.getHours());
      walkInDate.setMinutes(now.getMinutes());
      walkInDate.setSeconds(now.getSeconds());
      walkInDate.setMilliseconds(now.getMilliseconds());

      const endTime = addMinutes(walkInDate, quickLogService.duration);

      await addDoc(collection(db, 'appointments'), {
        barberId: selectedBarber.id,
        customerName: quickLogClientName.trim() || 'Cliente al paso',
        customerPhone: '',
        service: quickLogService.name,
        startTime: Timestamp.fromDate(walkInDate),
        endTime: Timestamp.fromDate(endTime),
        status: 'confirmed',
        completed: true,
        isWalkIn: true,
        customPrice: price,
        createdAt: Timestamp.now(),
        courtesy: 'Ninguna'
      });

      toast.success('Corte rápido registrado con éxito.');
      
      // Reset form
      setQuickLogService(null);
      setQuickLogPrice('');
      setQuickLogClientName('');
      setShowQuickLog(false);
    } catch (err: any) {
      console.error(err);
      toast.error('Error al registrar el corte rápido.');
      handleFirestoreError(err, OperationType.CREATE, 'appointments');
    } finally {
      setLoading(false);
    }
  };

  const handleCompleteAppointment = async () => {
    if (!completingAppt) return;
    setLoading(true);
    try {
      const price = completingPrice !== '' ? Number(completingPrice) : null;
      const batch = writeBatch(db);
      const apptRef = doc(db, 'appointments', completingAppt.id);
      
      batch.update(apptRef, {
        completed: true,
        customPrice: price
      });

      // Liberar slots correspondientes al turno completado en la colección 'slots'
      if (completingAppt.startTime && completingAppt.endTime && completingAppt.barberId) {
        const start = completingAppt.startTime.toDate();
        const end = completingAppt.endTime.toDate();
        const durationMin = Math.round((end.getTime() - start.getTime()) / 60000);
        const intervalsCount = Math.ceil(durationMin / 30);
        const slotDateStr = format(start, 'yyyy-MM-dd');
        for (let i = 0; i < intervalsCount; i++) {
          const slotTime = addMinutes(start, i * 30);
          const timeStr = format(slotTime, 'HH:mm');
          const slotId = `${completingAppt.barberId}_${slotDateStr}_${timeStr}`;
          batch.delete(doc(db, 'slots', slotId));
        }
      }

      await batch.commit();

      toast.success('Turno cobrado y completado con éxito.');
      setCompletingAppt(null);
      setCompletingPrice('');
    } catch (err: any) {
      console.error(err);
      toast.error('Error al registrar el cobro del turno.');
      handleFirestoreError(err, OperationType.UPDATE, 'appointments');
    } finally {
      setLoading(false);
    }
  };

  const handleCompleteAllAppointments = async () => {
    if (!isIvan) return;
    const dailyPending = adminAppts.filter((appt: any) => 
      isSameDay(appt.startTime.toDate(), adminDate) && !appt.completed
    );

    if (dailyPending.length === 0) {
      toast.error('No hay turnos pendientes para cobrar en este día.');
      return;
    }

    if (!window.confirm(`¿Estás seguro que deseas cobrar los ${dailyPending.length} turnos pendientes de este día?`)) {
      return;
    }

    setLoading(true);
    try {
      const batch = writeBatch(db);

      for (const appt of dailyPending) {
        const apptRef = doc(db, 'appointments', appt.id);
        const price = appt.customPrice != null ? appt.customPrice : (services.find((s: any) => s.name === appt.service)?.price || 0);
        
        batch.update(apptRef, {
          completed: true,
          customPrice: price
        });

        if (appt.startTime && appt.endTime && appt.barberId) {
          const start = appt.startTime.toDate();
          const end = appt.endTime.toDate();
          const durationMin = Math.round((end.getTime() - start.getTime()) / 60000);
          const intervalsCount = Math.ceil(durationMin / 30);
          const slotDateStr = format(start, 'yyyy-MM-dd');
          for (let i = 0; i < intervalsCount; i++) {
            const slotTime = addMinutes(start, i * 30);
            const timeStr = format(slotTime, 'HH:mm');
            const slotId = `${appt.barberId}_${slotDateStr}_${timeStr}`;
            batch.delete(doc(db, 'slots', slotId));
          }
        }
      }

      await batch.commit();
      toast.success(`Se cobraron ${dailyPending.length} turnos con éxito.`);
    } catch (err: any) {
      console.error(err);
      toast.error('Error al registrar el cobro masivo.');
      handleFirestoreError(err, OperationType.UPDATE, 'appointments');
    } finally {
      setLoading(false);
    }
  };



  const handleNewServiceSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newService.name || !newService.price) {
      toast.error('Por favor completa el nombre y el precio.');
      return;
    }
    setSavingPrices(true);
    try {
      const newSvcObj = {
        id: newService.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''),
        name: newService.name,
        duration: Number(newService.duration) || 30,
        price: Number(newService.price),
        desc: newService.desc || ''
      };

      if (services.some(s => s.id === newSvcObj.id)) {
        toast.error('Ya existe un servicio con ese nombre.');
        return;
      }

      const updatedServices = [...services, newSvcObj];
      await updateShopSettings({ services: updatedServices });
      setServices(updatedServices);
      setIsServiceModalOpen(false);
      setNewService({ name: '', duration: 30, price: '', desc: '' });
      toast.success('Servicio agregado correctamente.');
    } catch (err) {
      console.error(err);
      toast.error('Error al agregar el servicio.');
    } finally {
      setSavingPrices(false);
    }
  };

  const handleDeleteService = async (svcId: string) => {
    if (window.confirm('¿Estás seguro de eliminar este servicio? Esto podría afectar turnos agendados.')) {
      setSavingPrices(true);
      try {
        const updatedServices = services.filter(s => s.id !== svcId);
        await updateShopSettings({ services: updatedServices });
        setServices(updatedServices);
        toast.success('Servicio eliminado.');
      } catch (err) {
        console.error(err);
        toast.error('Error al eliminar el servicio.');
      } finally {
        setSavingPrices(false);
      }
    }
  };

  const handleEditServiceSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingServiceId) return;
    if (!editingServiceForm.name || !editingServiceForm.price) {
      toast.error('Por favor completa el nombre y el precio.');
      return;
    }
    setSavingPrices(true);
    try {
      const updatedServices = services.map(svc => {
        if (svc.id === editingServiceId) {
          return {
            ...svc,
            name: editingServiceForm.name,
            duration: Number(editingServiceForm.duration) || 30,
            price: Number(editingServiceForm.price),
            desc: editingServiceForm.desc || ''
          };
        }
        return svc;
      });

      await updateShopSettings({ services: updatedServices });
      setServices(updatedServices);
      setEditingServiceId(null);
      setIsServiceModalOpen(false);
      toast.success('Servicio actualizado correctamente.');
    } catch (err) {
      console.error('Error al guardar servicio:', err);
      toast.error('Error al guardar el servicio.');
    } finally {
      setSavingPrices(false);
    }
  };

  const handleUnblockTime = async () => {
    if (!selectedBarber) return;
    if (!isRangeMode && selectedTimesForBlocking.length === 0) return;
    if (isRangeMode && !blockingEndDate) {
      alert('Por favor selecciona una fecha de fin (Hasta) para el desbloqueo de rango.');
      return;
    }

    setLoading(true);
    try {
      const batch = writeBatch(db);
      const datesToUnblock = isRangeMode && blockingEndDate
        ? eachDayOfInterval({ start: startOfDay(adminDate), end: startOfDay(blockingEndDate) })
        : [adminDate];

      for (const date of datesToUnblock) {
        const start = startOfDay(date);
        const end = endOfDay(date);
        
        let timesToUnblock = selectedTimesForBlocking;
        
        if (isRangeMode && selectedTimesForBlocking.length === 0) {
          const dayOfWeek = getDay(date);
          const daySchedule = getBarberDaySchedule(selectedBarber, dayOfWeek);
          
          if (!daySchedule.isOpen) continue;
          
          const [startH, startM] = daySchedule.start.split(':').map(Number);
          const [endH, endM] = daySchedule.end.split(':').map(Number);
          
          timesToUnblock = eachMinuteOfInterval({
            start: setMinutes(setHours(startOfDay(date), startH), startM),
            end: setMinutes(setHours(startOfDay(date), endH), endM)
          }, { step: 30 }).map(t => format(t, 'HH:mm'));
        }

        // Fetch all blocks for this date to find matches
        const q = query(
          collection(db, 'blocks'),
          where('barberId', '==', selectedBarber.id),
          where('startTime', '>=', Timestamp.fromDate(start)),
          where('startTime', '<=', Timestamp.fromDate(end))
        );
        const snapshot = await getDocs(q);
        const dayBlocks = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));

        for (const timeStr of timesToUnblock) {
          const [hours, minutes] = timeStr.split(':').map(Number);
          const startTime = setMinutes(setHours(startOfDay(date), hours), minutes);
          const tStr = format(startTime, 'HH:mm');

          const blocksToDelete = dayBlocks.filter(b => format((b as any).startTime.toDate(), 'HH:mm') === tStr);
          blocksToDelete.forEach(b => {
            batch.delete(doc(db, 'blocks', b.id));
          });
        }
      }

      await batch.commit();
      alert('Horarios desbloqueados correctamente.');
      setSelectedTimesForBlocking([]);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, 'blocks');
    } finally {
      setLoading(false);
    }
  };

  const handleBlockTime = async () => {
    if (!selectedBarber) return;
    if (!isRangeMode && selectedTimesForBlocking.length === 0) return;
    if (isRangeMode && !blockingEndDate) {
      alert('Por favor selecciona una fecha de fin (Hasta) para el bloqueo de rango.');
      return;
    }

    setLoading(true);
    try {
      const datesToBlock = isRangeMode && blockingEndDate
        ? eachDayOfInterval({ start: startOfDay(adminDate), end: startOfDay(blockingEndDate) })
        : [adminDate];

      // Pre-check for confirmed appointments to prevent accidental cancellation
      const confirmedApptsToCancel: any[] = [];
      for (const date of datesToBlock) {
        const start = startOfDay(date);
        const end = endOfDay(date);
        let timesToBlock = selectedTimesForBlocking;
        
        if (isRangeMode && selectedTimesForBlocking.length === 0) {
          const dayOfWeek = getDay(date);
          const daySchedule = getBarberDaySchedule(selectedBarber, dayOfWeek);
          if (!daySchedule.isOpen) continue;
          const [startH, startM] = daySchedule.start.split(':').map(Number);
          const [endH, endM] = daySchedule.end.split(':').map(Number);
          timesToBlock = eachMinuteOfInterval({
            start: setMinutes(setHours(startOfDay(date), startH), startM),
            end: setMinutes(setHours(startOfDay(date), endH), endM)
          }, { step: 30 }).map(t => format(t, 'HH:mm'));
        }

        // Query confirmed appointments for this day
        const q = query(
          collection(db, 'appointments'),
          where('barberId', '==', selectedBarber.id),
          where('startTime', '>=', Timestamp.fromDate(start)),
          where('startTime', '<=', Timestamp.fromDate(end)),
          where('status', '==', 'confirmed')
        );
        const snapshot = await getDocs(q);
        const dayAppts = snapshot.docs.map(d => ({ id: d.id, ...d.data() as any }));

        for (const timeStr of timesToBlock) {
          const [hours, minutes] = timeStr.split(':').map(Number);
          const startTime = setMinutes(setHours(startOfDay(date), hours), minutes);
          const endTime = addMinutes(startTime, 30);
          
          const appt = dayAppts.find(appt => {
            const apptStart = appt.startTime.toDate();
            const apptEnd = appt.endTime.toDate();
            return (isBefore(startTime, apptEnd) && isAfter(endTime, apptStart));
          });
          
          if (appt && !confirmedApptsToCancel.some(a => a.id === appt.id)) {
            confirmedApptsToCancel.push(appt);
          }
        }
      }

      if (confirmedApptsToCancel.length > 0) {
        const namesList = confirmedApptsToCancel.map(a => `${a.customerName} (${format(a.startTime.toDate(), 'HH:mm')} HS)`).join(', ');
        const confirmProceed = window.confirm(
          `⚠️ ¡ATENCIÓN! Al bloquear estos horarios, se CANCELARÁN automáticamente los siguientes turnos confirmados:\n\n${namesList}\n\n¿Estás seguro de que deseas proceder con el bloqueo y cancelar estos turnos?`
        );
        if (!confirmProceed) {
          setLoading(false);
          return;
        }
      }

      const batch = writeBatch(db);
      const cancelledAppointments: any[] = [];

      for (const date of datesToBlock) {
        const start = startOfDay(date);
        const end = endOfDay(date);
        
        let timesToBlock = selectedTimesForBlocking;
        
        if (isRangeMode && selectedTimesForBlocking.length === 0) {
          const dayOfWeek = getDay(date);
          const daySchedule = getBarberDaySchedule(selectedBarber, dayOfWeek);
          
          if (!daySchedule.isOpen) continue;
          
          const [startH, startM] = daySchedule.start.split(':').map(Number);
          const [endH, endM] = daySchedule.end.split(':').map(Number);
          
          timesToBlock = eachMinuteOfInterval({
            start: setMinutes(setHours(startOfDay(date), startH), startM),
            end: setMinutes(setHours(startOfDay(date), endH), endM)
          }, { step: 30 }).map(t => format(t, 'HH:mm'));
        }

        // Fetch appointments for this date to check for cancellations
        const q = query(
          collection(db, 'appointments'),
          where('barberId', '==', selectedBarber.id),
          where('startTime', '>=', Timestamp.fromDate(start)),
          where('startTime', '<=', Timestamp.fromDate(end)),
          where('status', '==', 'confirmed')
        );
        const snapshot = await getDocs(q);
        const dayAppts = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));

        for (const timeStr of timesToBlock) {
          const [hours, minutes] = timeStr.split(':').map(Number);
          const startTime = setMinutes(setHours(startOfDay(date), hours), minutes);
          const endTime = addMinutes(startTime, 30);

          // Check if there's an appointment to cancel
          const apptToCancel = dayAppts.find(appt => {
            const apptStart = (appt as any).startTime.toDate();
            const apptEnd = (appt as any).endTime.toDate();
            return (isBefore(startTime, apptEnd) && isAfter(endTime, apptStart));
          });

          if (apptToCancel) {
            const apptRef = doc(db, 'appointments', apptToCancel.id);
            batch.update(apptRef, { status: 'cancelled' });
            cancelledAppointments.push(apptToCancel);

            // Liberar slots ocupados por el turno cancelado debido al bloqueo
            const start = (apptToCancel as any).startTime.toDate();
            const end = (apptToCancel as any).endTime.toDate();
            const durationMin = Math.round((end.getTime() - start.getTime()) / (60 * 1000));
            const intervalsCount = Math.ceil(durationMin / 30);
            const slotDateStr = format(start, 'yyyy-MM-dd');

            for (let i = 0; i < intervalsCount; i++) {
              const slotTime = addMinutes(start, i * 30);
              const timeStr = format(slotTime, 'HH:mm');
              const slotId = `${(apptToCancel as any).barberId}_${slotDateStr}_${timeStr}`;
              batch.delete(doc(db, 'slots', slotId));
            }
          }

          // Use deterministic ID to avoid duplicates
          const blockId = `block_${selectedBarber.id}_${startTime.getTime()}`;
          const blockRef = doc(db, 'blocks', blockId);
          batch.set(blockRef, {
            barberId: selectedBarber.id,
            startTime: Timestamp.fromDate(startTime),
            endTime: Timestamp.fromDate(endTime),
            reason: 'Bloqueo manual'
          });
        }
      }

      await batch.commit();

      // Enviar WhatsApp de cancelación real a los clientes afectados
      if (cancelledAppointments.length > 0) {
        const messages: string[] = [];
        for (const appt of cancelledAppointments) {
          const dateStr = format(appt.startTime.toDate(), 'dd/MM/yyyy');
          const timeStr = format(appt.startTime.toDate(), 'HH:mm');
          
          try {
            await fetch('/api/send-whatsapp', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                phone: appt.customerPhone,
                customerName: appt.customerName,
                service: appt.service,
                barber: selectedBarber.name,
                date: dateStr,
                time: timeStr,
                action: 'cancel_single'
              })
            });
            messages.push(`Notificación enviada a ${appt.customerName} (${appt.customerPhone}) para su turno de las ${timeStr} HS.`);
          } catch (waErr) {
            console.error('Error al enviar WhatsApp de cancelación por bloqueo:', waErr);
            messages.push(`Error al notificar a ${appt.customerName} (${appt.customerPhone}).`);
          }
        }
        alert(`Se han bloqueado los horarios y cancelado ${cancelledAppointments.length} turnos confirmados.\n\n${messages.join('\n')}`);
      } else {
        alert('Horarios bloqueados correctamente.');
      }

      setSelectedTimesForBlocking([]);
      setIsRangeMode(false);
      setBlockingEndDate(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'blocks');
    } finally {
      setLoading(false);
    }
  };

  const isModal = onClose !== undefined;

  return (
    <>
    <div 
      ref={containerRef} 
      className={
        isModal 
          ? "w-full mx-auto" 
          : "max-w-7xl mx-auto bg-zinc-900/50 border border-white/5 p-6 md:p-10 rounded-sm concrete-texture shadow-2xl"
      }
    >
      <div className={`flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3 mb-8 ${isModal ? 'pr-10 sm:pr-0' : ''}`}>
        <h2 className="text-3xl md:text-5xl font-display font-black uppercase tracking-normal text-light-gray leading-none">
          {isBarberAdmin ? 'Panel de Gestión' : 'Reserva tu Turno'}
        </h2>
        {user ? (
          <button onClick={handleLogout} className="text-charcoal hover:text-gold transition-colors flex items-center gap-2 text-xs uppercase font-bold tracking-widest cursor-pointer mt-1">
            <LogOut className="w-4 h-4" /> Salir
          </button>
        ) : (
          <button onClick={handleLogin} className="text-charcoal hover:text-gold transition-colors flex items-center gap-2 text-xs uppercase font-bold tracking-widest cursor-pointer mt-1">
            <LogIn className="w-4 h-4" /> Barber Login
          </button>
        )}
      </div>

       {isBarberAdmin && (
        <div className="space-y-8 mb-8">
          {isIvan ? (
            <div className="flex flex-wrap gap-4 border-b border-white/5 pb-4">
              <button
                onClick={() => setActiveAdminTab('agenda')}
                className={`text-xs font-bold uppercase tracking-widest ${activeAdminTab === 'agenda' ? 'text-gold' : 'text-charcoal'}`}
              >
                Agenda y Bloqueos
              </button>
              <button
                onClick={() => setActiveAdminTab('barberos')}
                className={`text-xs font-bold uppercase tracking-widest ${activeAdminTab === 'barberos' ? 'text-gold' : 'text-charcoal'}`}
              >
                Gestión de Barberos
              </button>
              <button
                onClick={() => setActiveAdminTab('horarios')}
                className={`text-xs font-bold uppercase tracking-widest ${activeAdminTab === 'horarios' ? 'text-gold' : 'text-charcoal'}`}
              >
                Horarios de Atención
              </button>
              <button
                onClick={() => setActiveAdminTab('agendar')}
                className={`text-xs font-bold uppercase tracking-widest ${activeAdminTab === 'agendar' ? 'text-gold' : 'text-charcoal'}`}
              >
                Agendar Turno
              </button>
              <button
                onClick={() => setActiveAdminTab('finanzas')}
                className={`text-xs font-bold uppercase tracking-widest ${activeAdminTab === 'finanzas' ? 'text-gold' : 'text-charcoal'}`}
              >
                Finanzas
              </button>
              <button
                onClick={() => setActiveAdminTab('precios')}
                className={`text-xs font-bold uppercase tracking-widest ${activeAdminTab === 'precios' ? 'text-gold' : 'text-charcoal'}`}
              >
                Servicios & Precios
              </button>
              <button
                onClick={() => setActiveAdminTab('catalogo')}
                className={`text-xs font-bold uppercase tracking-widest ${activeAdminTab === 'catalogo' ? 'text-gold' : 'text-charcoal'}`}
              >
                Catálogo
              </button>
              <button
                onClick={() => setActiveAdminTab('cortesia')}
                className={`text-xs font-bold uppercase tracking-widest ${activeAdminTab === 'cortesia' ? 'text-gold' : 'text-charcoal'}`}
              >
                Cortesías
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap gap-4 border-b border-white/5 pb-4">
              <button
                onClick={() => setActiveAdminTab('agenda')}
                className={`text-xs font-bold uppercase tracking-widest ${activeAdminTab === 'agenda' ? 'text-gold' : 'text-charcoal'}`}
              >
                Agenda y Bloqueos
              </button>
              <button
                onClick={() => setActiveAdminTab('agendar')}
                className={`text-xs font-bold uppercase tracking-widest ${activeAdminTab === 'agendar' ? 'text-gold' : 'text-charcoal'}`}
              >
                Agendar Turno
              </button>
            </div>
          )}
        </div>
      )}

      {isBarberAdmin && activeAdminTab === 'agenda' && (
        <div className="space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {barbers
                  .filter(b => isIvan || b.email === user?.email)
                  .map(b => (
                    <button
                      key={b.id}
                      onClick={() => setSelectedBarber(b)}
                      className={`p-4 border ${selectedBarber?.id === b.id ? 'border-gold bg-gold/10' : 'border-white/5 bg-black'} transition-all text-left flex items-center gap-4`}
                    >
                      <img src={b.photo} alt={b.name} className="w-12 h-12 rounded-full grayscale object-cover" referrerPolicy="no-referrer" />
                      <span className="font-display font-bold uppercase text-sm">{b.name}</span>
                    </button>
                  ))}
              </div>

              {selectedBarber && (
                <div className="space-y-8">
                  {/* Panel de Registro Rápido (Walk-in) */}
                  <div className="bg-zinc-950 border border-white/5 p-6 rounded-sm">
                    <button
                      onClick={() => setShowQuickLog(!showQuickLog)}
                      className="w-full flex justify-between items-center text-sm font-bold uppercase tracking-widest text-light-gray hover:text-gold transition-colors"
                    >
                      <span className="flex items-center gap-2">
                        <Scissors className="w-4 h-4 text-gold" /> Registrar Venta Rápida (Sin Turno / Walk-in)
                      </span>
                      <span className="text-xl">{showQuickLog ? '−' : '+'}</span>
                    </button>

                    <AnimatePresence>
                      {showQuickLog && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="overflow-hidden mt-6 space-y-4"
                        >
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            {/* Cliente */}
                            <div>
                              <label className="block text-[9px] font-black uppercase text-charcoal mb-1">Nombre del Cliente (Opcional)</label>
                              <input
                                type="text"
                                placeholder="Cliente al paso"
                                value={quickLogClientName}
                                onChange={(e) => setQuickLogClientName(e.target.value)}
                                className="w-full bg-black border border-white/10 px-3 py-2.5 text-xs text-light-gray focus:border-gold outline-none transition-colors"
                              />
                            </div>

                            {/* Servicio */}
                            <div>
                              <label className="block text-[9px] font-black uppercase text-charcoal mb-1">Seleccionar Servicio</label>
                              <div className="grid grid-cols-3 gap-1">
                                {services.map(svc => (
                                  <button
                                    key={svc.id}
                                    type="button"
                                    onClick={() => {
                                      setQuickLogService(svc);
                                      setQuickLogPrice(String(svc.price));
                                    }}
                                    className={`py-2 px-1 text-[9px] font-black uppercase border transition-all ${
                                      quickLogService?.id === svc.id
                                        ? 'bg-gold border-gold text-white'
                                        : 'bg-black border-white/10 text-charcoal hover:border-white/30'
                                    }`}
                                  >
                                    {svc.name.replace('de pelo', '')}
                                  </button>
                                ))}
                              </div>
                            </div>

                            {/* Precio Cobrado */}
                            <div>
                              <label className="block text-[9px] font-black uppercase text-charcoal mb-1">Precio Cobrado ($)</label>
                              <div className="flex gap-2">
                                <div className="relative flex-1">
                                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-charcoal font-bold text-xs">$</span>
                                  <input
                                    type="number"
                                    value={quickLogPrice}
                                    onChange={(e) => setQuickLogPrice(e.target.value)}
                                    placeholder="0"
                                    className="w-full bg-black border border-white/10 pl-6 pr-3 py-2 text-xs text-light-gray focus:border-gold outline-none transition-colors"
                                  />
                                </div>
                                <button
                                  onClick={handleSaveQuickCut}
                                  disabled={loading || !quickLogService}
                                  className="bg-gold text-white px-5 py-2 text-[10px] font-black uppercase tracking-widest hover:bg-gold/80 transition-all disabled:opacity-40"
                                >
                                  Registrar
                                </button>
                              </div>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  {/* Analytics Dashboard */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-black p-6 border border-white/5 flex flex-col justify-center">
                      <p className="text-charcoal font-bold uppercase tracking-widest text-xs mb-2">Turnos Programados</p>
                      <p className="font-display font-black text-4xl text-light-gray">{adminAppts.length}</p>
                    </div>
                    <div className="bg-black p-6 border border-white/5 flex flex-col justify-center">
                      <p className="text-charcoal font-bold uppercase tracking-widest text-xs mb-2">Ingresos Estimados</p>
                      <p className="font-display font-black text-4xl text-gold">
                        ${adminAppts.reduce((acc, appt) => {
                          const price = appt.customPrice != null ? appt.customPrice : (services.find(s => s.name === appt.service)?.price || 0);
                          return acc + price;
                        }, 0).toLocaleString('es-AR')}
                      </p>
                    </div>
                  </div>

                  <div className="bg-black p-6 border border-white/5">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
                      <div className="flex flex-col gap-4">
                        <div className="flex flex-col gap-3">

                          {/* Date label — label activates input on mobile; showPicker() handles desktop Chrome */}
                          <label
                            className="font-display font-bold uppercase flex items-center gap-2 hover:text-gold transition-colors text-xl bg-zinc-900 border border-white/10 px-4 py-2 cursor-pointer select-none"
                            onClick={() => {
                              try { adminDateInputRef.current?.showPicker(); } catch (_) {/* fallback: label activates input natively */}
                            }}
                          >
                            <CalendarIcon className="w-6 h-6 text-gold flex-shrink-0 pointer-events-none" />
                            <span className="pointer-events-none">{format(adminDate, 'EEEE dd/MM/yyyy', { locale: es })}</span>
                            <input
                              ref={adminDateInputRef}
                              type="date"
                              value={format(adminDate, 'yyyy-MM-dd')}
                              onChange={(e) => {
                                if (e.target.value) {
                                  setAdminDate(new Date(e.target.value + 'T00:00:00'));
                                  setSelectedTimesForBlocking([]);
                                }
                              }}
                              className="sr-only"
                            />
                          </label>

                          {/* Navigation buttons — completely separate from the date input */}
                          <div className="flex gap-2 items-center">
                            <button
                              type="button"
                              onClick={() => { setAdminDate(addMinutes(adminDate, -1440)); setSelectedTimesForBlocking([]); }}
                              className="p-2 bg-zinc-800 hover:bg-gold transition-colors"
                              title="Día Anterior"
                            >
                              <ChevronLeft />
                            </button>
                            <button
                              type="button"
                              onClick={() => { setAdminDate(addMinutes(adminDate, 1440)); setSelectedTimesForBlocking([]); }}
                              className="p-2 bg-zinc-800 hover:bg-gold transition-colors"
                              title="Siguiente Día"
                            >
                              <ChevronRight />
                            </button>
                            <button
                              type="button"
                              onClick={() => { setAdminDate(startOfDay(new Date())); setSelectedTimesForBlocking([]); }}
                              className="ml-auto px-5 py-2.5 bg-zinc-800 hover:bg-white hover:text-black transition-all text-xs font-black uppercase tracking-widest"
                            >
                              Hoy
                            </button>
                          </div>
                        </div>

                        {isRangeMode && (
                          <label
                            className="font-display font-bold uppercase flex items-center gap-2 hover:text-gold transition-colors text-xl bg-zinc-900 border border-white/10 px-4 py-2 cursor-pointer select-none"
                            onClick={() => {
                              try { blockingEndDateInputRef.current?.showPicker(); } catch (_) {}
                            }}
                          >
                            <CalendarIcon className="w-6 h-6 text-gold flex-shrink-0 pointer-events-none" />
                            <span className="pointer-events-none">Hasta: {blockingEndDate ? format(blockingEndDate, 'dd/MM/yyyy') : 'Seleccionar...'}</span>
                            <input
                              ref={blockingEndDateInputRef}
                              type="date"
                              min={format(adminDate, 'yyyy-MM-dd')}
                              value={blockingEndDate ? format(blockingEndDate, 'yyyy-MM-dd') : ''}
                              onChange={(e) => {
                                if (e.target.value) {
                                  setBlockingEndDate(new Date(e.target.value + 'T00:00:00'));
                                }
                              }}
                              className="sr-only"
                            />
                          </label>
                        )}
                      </div>

                      <div className="flex flex-col gap-4">
                        <label className="flex items-center gap-2 text-xs font-bold uppercase cursor-pointer hover:text-gold">
                          <input
                            type="checkbox"
                            checked={isRangeMode}
                            onChange={(e) => setIsRangeMode(e.target.checked)}
                            className="accent-gold"
                          />
                          Rango de días
                        </label>
                        <label className="flex items-center gap-2 text-xs font-bold uppercase cursor-pointer hover:text-gold">
                          <input
                            type="checkbox"
                            checked={adminViewMode === 'weekly'}
                            onChange={(e) => setAdminViewMode(e.target.checked ? 'weekly' : 'daily')}
                            className="accent-gold"
                          />
                          Vista Semanal
                        </label>
                      </div>

                      <button
                        onClick={() => {
                          const dayOfWeek = getDay(adminDate);
                          const daySchedule = getBarberDaySchedule(selectedBarber, dayOfWeek);
                          if (!daySchedule.isOpen) return;
                          const [startH, startM] = daySchedule.start.split(':').map(Number);
                          const [endH, endM] = daySchedule.end.split(':').map(Number);
                          const allSlots = eachMinuteOfInterval({
                            start: setMinutes(setHours(startOfDay(adminDate), startH), startM),
                            end: setMinutes(setHours(startOfDay(adminDate), endH), endM)
                          }, { step: 30 }).map(t => format(t, 'HH:mm'));

                          if (selectedTimesForBlocking.length === allSlots.length) {
                            setSelectedTimesForBlocking([]);
                          } else {
                            setSelectedTimesForBlocking(allSlots);
                          }
                        }}
                        className="text-[10px] font-bold uppercase border border-white/10 px-3 py-2 hover:bg-white hover:text-black transition-all"
                      >
                        {(() => {
                          const dayOfWeek = getDay(adminDate);
                          const daySchedule = getBarberDaySchedule(selectedBarber, dayOfWeek);
                          if (!daySchedule.isOpen) return 'Deseleccionar Todo';
                          const [startH, startM] = daySchedule.start.split(':').map(Number);
                          const [endH, endM] = daySchedule.end.split(':').map(Number);
                          const allSlots = eachMinuteOfInterval({
                            start: setMinutes(setHours(startOfDay(adminDate), startH), startM),
                            end: setMinutes(setHours(startOfDay(adminDate), endH), endM)
                          }, { step: 30 }).map(t => format(t, 'HH:mm'));
                          return selectedTimesForBlocking.length === allSlots.length ? 'Deseleccionar Todo' : 'Seleccionar Todo';
                        })()}
                      </button>
                    </div>

                    {adminViewMode === 'daily' ? (
                      <>
                        <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-3 mb-8">
                        {(() => {
                          const dayOfWeek = getDay(adminDate);
                          const daySchedule = getBarberDaySchedule(selectedBarber, dayOfWeek);
                          
                          // Get all appointments for this day that are NOT in the normal grid
                          const [startH, startM] = daySchedule.isOpen ? daySchedule.start.split(':').map(Number) : [0, 0];
                          const [endH, endM] = daySchedule.isOpen ? daySchedule.end.split(':').map(Number) : [23, 59];
                          
                          const gridStart = setMinutes(setHours(startOfDay(adminDate), startH), startM);
                          const gridEnd = setMinutes(setHours(startOfDay(adminDate), endH), endM);
                          
                          const outOfHoursAppts = adminAppts.filter((a: any) => {
                            const t = a.startTime.toDate();
                            return isSameDay(t, adminDate) && (isBefore(t, gridStart) || isAfter(t, gridEnd));
                          });

                          if (!daySchedule.isOpen && outOfHoursAppts.length === 0) {
                            return <div className="col-span-full py-8 text-center text-charcoal">Cerrado este día</div>;
                          }

                          return (
                            <>
                              {outOfHoursAppts.length > 0 && (
                                <div className="col-span-full mb-6 p-4 bg-gold/10 border border-gold/30">
                                  <h5 className="text-gold font-bold text-xs uppercase mb-3 flex items-center gap-2">
                                    <AlertCircle className="w-4 h-4" /> Turnos fuera de horario configurado
                                  </h5>
                                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                                    {outOfHoursAppts.map(appt => (
                                      <div key={appt.id} className="bg-gold/20 border border-gold p-3 flex flex-col items-center gap-1">
                                        <span className="text-sm font-bold">{format(appt.startTime.toDate(), 'HH:mm')} HS</span>
                                        <span className="uppercase text-[9px] font-black truncate w-full text-center">{appt.customerName}</span>
                                        <span className="text-[8px] font-bold">{appt.customerPhone}</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                              
                              {daySchedule.isOpen && eachMinuteOfInterval({
                                start: gridStart,
                                end: gridEnd
                              }, { step: 30 }).map(time => {
                            const tStr = format(time, 'HH:mm');
                            const slotStart = time;
                            const slotEnd = addMinutes(time, 30);
                            
                            const block = adminBlocks.find(b => {
                              const bStart = b.startTime.toDate();
                              const bEnd = b.endTime.toDate();
                              return isBefore(slotStart, bEnd) && isAfter(slotEnd, bStart);
                            });
                            const slotAppts = adminAppts.filter(a => {
                              if (a.isWalkIn) return false; // Excluir cortes rápidos (walk-ins) de las celdas horarias
                              
                              const aStart = a.startTime.toDate();
                              const aEnd = a.endTime.toDate();
                              
                              // Calcular minutos de coincidencia para evitar que turnos no alineados
                              // (como los cortes rápidos registrados al minuto actual) se desborden en celdas adyacentes.
                              const overlapStart = aStart > slotStart ? aStart : slotStart;
                              const overlapEnd = aEnd < slotEnd ? aEnd : slotEnd;
                              
                              if (overlapStart < overlapEnd) {
                                const overlapMinutes = Math.round((overlapEnd.getTime() - overlapStart.getTime()) / 60000);
                                return overlapMinutes > 10;
                              }
                              return false;
                            });
                            slotAppts.sort((a, b) => {
                              if (a.completed && !b.completed) return 1;
                              if (!a.completed && b.completed) return -1;
                              return a.startTime.toMillis() - b.startTime.toMillis();
                            });
                            const hasPending = slotAppts.some(a => !a.completed);
                            const hasCompleted = slotAppts.some(a => a.completed);
                            const isSelected = selectedTimesForBlocking.includes(tStr);

                            return (
                               <div
                                 key={tStr}
                                 onClick={() => {
                                   if (isSelected) {
                                     setSelectedTimesForBlocking(selectedTimesForBlocking.filter(t => t !== tStr));
                                   } else {
                                     setSelectedTimesForBlocking([...selectedTimesForBlocking, tStr]);
                                   }
                                 }}
                                 className={`p-4 text-xs font-bold border transition-all flex flex-col items-center gap-1.5 min-h-[90px] justify-center relative cursor-pointer ${isSelected ? 'scale-105 z-10 shadow-2xl' : ''
                                   } ${isSelected
                                     ? 'bg-white text-black border-white'
                                     : hasPending
                                       ? 'bg-gold/20 border-gold text-gold hover:bg-gold/30'
                                       : hasCompleted
                                         ? 'bg-emerald-950/20 border-emerald-500/30 text-emerald-400'
                                         : block
                                           ? 'bg-zinc-800 border-zinc-700 text-zinc-500'
                                           : 'border-white/5 hover:border-white/20'
                                   }`}
                               >
                                 <span className="text-sm">{tStr}</span>
                                 {slotAppts.length > 0 && (
                                   <div className="flex flex-col items-center w-full overflow-hidden px-1 gap-1">
                                     {slotAppts.map((a, idx) => (
                                       <div key={a.id || idx} className="flex flex-col items-center w-full border-t border-white/5 first:border-0 pt-1 first:pt-0">
                                         <span 
                                           onClick={(e) => {
                                             if (!a.completed) {
                                               e.stopPropagation();
                                               setCompletingAppt(a);
                                               setCompletingPrice(String(a.customPrice != null ? a.customPrice : (services.find(s => s.name === a.service)?.price || 0)));
                                             }
                                           }}
                                           title={!a.completed ? "Hacer clic para cobrar" : undefined}
                                           className={`uppercase text-[9px] font-black truncate w-full text-center ${a.completed ? 'text-zinc-500 line-through' : 'text-gold hover:underline cursor-pointer'}`}
                                         >
                                           {a.customerName}
                                         </span>
                                         <span className="text-[8px] text-charcoal font-bold">{a.customerPhone || 'Walk-in'}</span>
                                       </div>
                                     ))}
                                   </div>
                                 )}
                                {block && slotAppts.length === 0 && <span className="uppercase text-[9px] font-black">Bloqueado</span>}
                                {slotAppts.length === 0 && !block && <span className="uppercase text-[9px] font-black opacity-30">Libre</span>}
                              </div>
                            );
                              })}
                            </>
                          );
                        })()}
                      </div>

                      {/* Botones de Bloquear/Desbloquear */}
                      <div className="flex flex-col md:flex-row gap-4 my-8">
                        <button
                          onClick={handleBlockTime}
                          disabled={(!isRangeMode && selectedTimesForBlocking.length === 0) || loading}
                          className="flex-1 bg-gold py-4 font-display font-bold uppercase tracking-widest disabled:opacity-50 flex items-center justify-center gap-2 hover:bg-gold/80 transition-all"
                        >
                          {loading ? <RefreshCcw className="w-4 h-4 animate-spin" /> : null}
                          {isRangeMode && selectedTimesForBlocking.length === 0 ? 'Bloquear Rango Completo' : `Bloquear / Cancelar Seleccionados (${selectedTimesForBlocking.length})`}
                        </button>

                        {(selectedTimesForBlocking.length > 0 || isRangeMode) && (
                          <button
                            onClick={handleUnblockTime}
                            disabled={loading}
                            className="bg-white text-black px-8 py-4 font-display font-bold uppercase tracking-widest hover:bg-zinc-200 transition-all disabled:opacity-50"
                          >
                            {isRangeMode && selectedTimesForBlocking.length === 0 ? 'Desbloquear Rango Completo' : 'Desbloquear Seleccionados'}
                          </button>
                        )}
                      </div>

                      {/* Agenda detallada del día */}
                      <div className="mt-8 border-t border-white/5 pt-8">
                        <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
                          <h4 className="font-display font-bold uppercase text-gold flex items-center gap-2">
                            <Database className="w-4 h-4" /> Agenda de {format(adminDate, 'EEEE dd/MM', { locale: es })}
                          </h4>
                          {isIvan && (
                            <button
                              onClick={handleCompleteAllAppointments}
                              disabled={loading || adminAppts.filter((appt: any) => isSameDay(appt.startTime.toDate(), adminDate) && !appt.completed).length === 0}
                              className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 text-[10px] font-black uppercase tracking-widest transition-all rounded-sm shadow-md shadow-emerald-950/20 flex items-center gap-1.5 disabled:opacity-50 disabled:bg-zinc-800 disabled:text-zinc-500 disabled:shadow-none"
                              title="Cobrar todos los turnos pendientes del día"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" /> Cobrar Todos
                            </button>
                          )}
                        </div>
                        <div className="space-y-2">
                          {adminAppts.filter((a: any) => isSameDay(a.startTime.toDate(), adminDate))
                            .sort((a: any, b: any) => a.startTime.toMillis() - b.startTime.toMillis())
                            .map((appt: any) => (
                              <div key={appt.id} className="flex flex-col md:flex-row md:items-center justify-between bg-zinc-900/40 hover:bg-zinc-900/60 p-5 border border-white/5 rounded-md gap-5 transition-all">
                                {/* Left Section: Details */}
                                <div className="space-y-3 flex-1 w-full text-left">
                                  {/* Time, Duration & Badges */}
                                  <div className="flex flex-wrap items-center gap-2">
                                    <div className="bg-zinc-800/80 px-2.5 py-1 rounded-sm border border-white/5 flex items-center gap-1.5">
                                      <Clock className="w-3.5 h-3.5 text-gold" />
                                      <span className="font-display font-black text-sm tracking-wide text-light-gray">{format(appt.startTime.toDate(), 'HH:mm')} HS</span>
                                    </div>
                                    <span className="text-[9px] text-charcoal font-black uppercase tracking-wider bg-white/5 px-2 py-1 rounded-sm">
                                      {Math.round((appt.endTime.toDate() - appt.startTime.toDate()) / 60000)} MIN
                                    </span>
                                    {appt.isWalkIn && (
                                      <span className="bg-amber-950/40 border border-amber-500/20 text-amber-400 px-2 py-0.5 text-[8px] font-black uppercase tracking-wider rounded-sm">
                                        Walk-in
                                      </span>
                                    )}
                                    {appt.isFixed && (
                                      <span className="bg-indigo-950/40 border border-indigo-500/20 text-indigo-400 px-2 py-0.5 text-[8px] font-black uppercase tracking-wider rounded-sm">
                                        Fijo
                                      </span>
                                    )}
                                  </div>

                                  {/* Client Details */}
                                  <div className="space-y-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <h4 className="font-bold text-sm uppercase text-light-gray tracking-wide">{appt.customerName}</h4>
                                      {appt.completed ? (
                                        <span className="bg-emerald-950/60 border border-emerald-500/30 text-emerald-400 px-2 py-0.5 text-[8px] font-black uppercase tracking-wider rounded-sm flex items-center gap-1">
                                          <CheckCircle2 className="w-2.5 h-2.5 text-emerald-400" /> Cobrado (${(appt.customPrice != null ? appt.customPrice : (services.find(s => s.name === appt.service)?.price || 0)).toLocaleString('es-AR')})
                                        </span>
                                      ) : (
                                        <span className="bg-zinc-800/60 border border-white/5 text-charcoal px-2 py-0.5 text-[8px] font-black uppercase tracking-wider rounded-sm">
                                          Pendiente
                                        </span>
                                      )}
                                    </div>
                                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-charcoal font-bold uppercase">
                                      <span>{appt.service}</span>
                                      {appt.courtesy && appt.courtesy !== 'Ninguna' && (
                                        <span className="bg-gold/15 border border-gold/30 text-gold px-2 py-0.5 text-[8px] font-black uppercase tracking-wider rounded-sm">
                                          Cortesía: {appt.courtesy}
                                        </span>
                                      )}
                                      {appt.customerPhone && (
                                        <a 
                                          href={`https://wa.me/${appt.customerPhone.replace(/\D/g, '')}`} 
                                          target="_blank" 
                                          rel="noopener noreferrer" 
                                          className="text-gold hover:underline flex items-center gap-1"
                                        >
                                          <Phone className="w-3 h-3" /> {appt.customerPhone}
                                        </a>
                                      )}
                                    </div>
                                  </div>
                                </div>

                                {/* Right Section: Action Buttons */}
                                <div className="flex flex-wrap items-center gap-2 border-t md:border-t-0 border-white/5 pt-3 md:pt-0 justify-end w-full md:w-auto">
                                  {Math.round((appt.endTime.toDate() - appt.startTime.toDate()) / 60000) > 30 ? (
                                    <button
                                      onClick={() => handleUpdateDuration(appt, 30)}
                                      className="flex-1 md:flex-none text-[9px] font-bold uppercase border border-white/10 px-2.5 py-1.5 hover:border-gold hover:text-gold transition-all text-light-gray bg-zinc-950 rounded-sm text-center"
                                      title="Reducir a 30 minutos para liberar espacio"
                                    >
                                      Acortar a 30m
                                    </button>
                                  ) : (
                                    appt.service === 'Corte y Barba' && (
                                      <button
                                        onClick={() => handleUpdateDuration(appt, 60)}
                                        className="flex-1 md:flex-none text-[9px] font-bold uppercase border border-white/10 px-2.5 py-1.5 hover:border-gold hover:text-gold transition-all text-light-gray bg-zinc-950 rounded-sm text-center"
                                        title="Volver a 60 minutos"
                                      >
                                        Deshacer
                                      </button>
                                    )
                                  )}
                                  <button
                                    onClick={() => {
                                      setEditingAppt(appt);
                                      setEditForm({
                                        customerName: appt.customerName,
                                        customerPhone: appt.customerPhone,
                                        service: appt.service,
                                        customPrice: appt.customPrice != null ? String(appt.customPrice) : '',
                                        customerBirthdate: appt.customerBirthdate || ''
                                      });
                                    }}
                                    className="text-charcoal hover:text-white p-2 hover:bg-white/10 transition-colors border border-white/10 rounded-sm flex items-center justify-center"
                                    title="Editar turno"
                                  >
                                    <Edit2 className="w-4 h-4" />
                                  </button>
                                  {!appt.completed && (
                                    <button
                                      onClick={() => {
                                        setCompletingAppt(appt);
                                        setCompletingPrice(String(appt.customPrice != null ? appt.customPrice : (services.find(s => s.name === appt.service)?.price || 0)));
                                      }}
                                      className="flex-1 md:flex-none bg-gold border border-gold hover:bg-gold/80 text-white px-3.5 py-1.5 text-[9px] font-black uppercase tracking-widest transition-all rounded-sm shadow-md shadow-gold/10 text-center"
                                      title="Registrar cobro de este corte"
                                    >
                                      Cobrar
                                    </button>
                                  )}
                                  <button 
                                    onClick={() => handleCancelAppointment(appt)} 
                                    className="text-gold hover:bg-gold/10 p-2 border border-white/10 transition-colors rounded-sm flex items-center justify-center"
                                    title="Eliminar turno"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              </div>
                            ))}
                          {adminAppts.filter(a => isSameDay(a.startTime.toDate(), adminDate)).length === 0 && (
                            <p className="text-charcoal text-xs uppercase font-bold text-center py-4">Sin turnos para este día</p>
                          )}
                        </div>
                      </div>
                    </>
                    ) : (
                      <>
                        <div className="space-y-4 mb-8">
                        {(() => {
                          const days = eachDayOfInterval({
                            start: startOfWeek(adminDate, { weekStartsOn: 1 }),
                            end: endOfWeek(adminDate, { weekStartsOn: 1 })
                          });
                          return days.map(day => {
                            const dayAppts = adminAppts.filter(a => isSameDay((a as any).startTime.toDate(), day));
                            dayAppts.sort((a, b) => (a as any).startTime.toMillis() - (b as any).startTime.toMillis());
                            
                            return (
                              <div key={day.toString()} className="bg-zinc-900 border border-white/5 p-4">
                                <h4 className="font-display font-bold uppercase text-gold mb-3">{format(day, 'EEEE dd/MM/yyyy', { locale: es })}</h4>
                                {dayAppts.length === 0 ? (
                                  <p className="text-charcoal text-xs uppercase font-bold">Sin turnos</p>
                                ) : (
                                  <div className="space-y-2">
                                    {dayAppts.map(appt => (
                                      <div key={appt.id} className="flex flex-col md:flex-row md:items-center justify-between bg-zinc-900/40 hover:bg-zinc-900/60 p-5 border border-white/5 rounded-md gap-5 transition-all">
                                        {/* Left Section: Details */}
                                        <div className="space-y-3 flex-1 w-full text-left">
                                          {/* Time, Duration & Badges */}
                                          <div className="flex flex-wrap items-center gap-2">
                                            <div className="bg-zinc-800/80 px-2.5 py-1 rounded-sm border border-white/5 flex items-center gap-1.5">
                                              <Clock className="w-3.5 h-3.5 text-gold" />
                                              <span className="font-display font-black text-sm tracking-wide text-light-gray">{format(appt.startTime.toDate(), 'HH:mm')} HS</span>
                                            </div>
                                            <span className="text-[9px] text-charcoal font-black uppercase tracking-wider bg-white/5 px-2 py-1 rounded-sm">
                                              {Math.round((appt.endTime.toDate() - appt.startTime.toDate()) / 60000)} MIN
                                            </span>
                                            {appt.isWalkIn && (
                                              <span className="bg-amber-950/40 border border-amber-500/20 text-amber-400 px-2 py-0.5 text-[8px] font-black uppercase tracking-wider rounded-sm">
                                                Walk-in
                                              </span>
                                            )}
                                            {appt.isFixed && (
                                              <span className="bg-indigo-950/40 border border-indigo-500/20 text-indigo-400 px-2 py-0.5 text-[8px] font-black uppercase tracking-wider rounded-sm">
                                                Fijo
                                              </span>
                                            )}
                                          </div>

                                          {/* Client Details */}
                                          <div className="space-y-1">
                                            <div className="flex flex-wrap items-center gap-2">
                                              <h4 className="font-bold text-sm uppercase text-light-gray tracking-wide">{appt.customerName}</h4>
                                              {appt.completed ? (
                                                <span className="bg-emerald-950/60 border border-emerald-500/30 text-emerald-400 px-2 py-0.5 text-[8px] font-black uppercase tracking-wider rounded-sm flex items-center gap-1">
                                                  <CheckCircle2 className="w-2.5 h-2.5 text-emerald-400" /> Cobrado (${(appt.customPrice != null ? appt.customPrice : (services.find(s => s.name === appt.service)?.price || 0)).toLocaleString('es-AR')})
                                                </span>
                                              ) : (
                                                <span className="bg-zinc-800/60 border border-white/5 text-charcoal px-2 py-0.5 text-[8px] font-black uppercase tracking-wider rounded-sm">
                                                  Pendiente
                                                </span>
                                              )}
                                            </div>
                                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-charcoal font-bold uppercase">
                                              <span>{appt.service}</span>
                                              {appt.courtesy && appt.courtesy !== 'Ninguna' && (
                                                <span className="bg-gold/15 border border-gold/30 text-gold px-2 py-0.5 text-[8px] font-black uppercase tracking-wider rounded-sm">
                                                  Cortesía: {appt.courtesy}
                                                </span>
                                              )}
                                              {appt.customerPhone && (
                                                <a 
                                                  href={`https://wa.me/${appt.customerPhone.replace(/\D/g, '')}`} 
                                                  target="_blank" 
                                                  rel="noopener noreferrer" 
                                                  className="text-gold hover:underline flex items-center gap-1"
                                                >
                                                  <Phone className="w-3 h-3" /> {appt.customerPhone}
                                                </a>
                                              )}
                                            </div>
                                          </div>
                                        </div>

                                        {/* Right Section: Action Buttons */}
                                        <div className="flex flex-wrap items-center gap-2 border-t md:border-t-0 border-white/5 pt-3 md:pt-0 justify-end w-full md:w-auto">
                                          {Math.round((appt.endTime.toDate() - appt.startTime.toDate()) / 60000) > 30 ? (
                                            <button
                                              onClick={() => handleUpdateDuration(appt, 30)}
                                              className="flex-1 md:flex-none text-[9px] font-bold uppercase border border-white/10 px-2.5 py-1.5 hover:border-gold hover:text-gold transition-all text-light-gray bg-zinc-950 rounded-sm text-center"
                                              title="Reducir a 30 minutos para liberar espacio"
                                            >
                                              Acortar a 30m
                                            </button>
                                          ) : (
                                            appt.service === 'Corte y Barba' && (
                                              <button
                                                onClick={() => handleUpdateDuration(appt, 60)}
                                                className="flex-1 md:flex-none text-[9px] font-bold uppercase border border-white/10 px-2.5 py-1.5 hover:border-gold hover:text-gold transition-all text-light-gray bg-zinc-950 rounded-sm text-center"
                                                title="Volver a 60 minutos"
                                              >
                                                Deshacer
                                              </button>
                                            )
                                          )}
                                          <button
                                            onClick={() => {
                                              setEditingAppt(appt);
                                              setEditForm({
                                                customerName: appt.customerName,
                                                customerPhone: appt.customerPhone,
                                                service: appt.service,
                                                customPrice: appt.customPrice != null ? String(appt.customPrice) : '',
                                                customerBirthdate: appt.customerBirthdate || ''
                                              });
                                            }}
                                            className="text-charcoal hover:text-white p-2 hover:bg-white/10 transition-colors border border-white/10 rounded-sm flex items-center justify-center"
                                            title="Editar turno"
                                          >
                                            <Edit2 className="w-4 h-4" />
                                          </button>
                                          {!appt.completed && (
                                            <button
                                              onClick={() => {
                                                setCompletingAppt(appt);
                                                setCompletingPrice(String(appt.customPrice != null ? appt.customPrice : (services.find(s => s.name === appt.service)?.price || 0)));
                                              }}
                                              className="flex-1 md:flex-none bg-gold border border-gold hover:bg-gold/80 text-white px-3.5 py-1.5 text-[9px] font-black uppercase tracking-widest transition-all rounded-sm shadow-md shadow-gold/10 text-center"
                                              title="Registrar cobro de este corte"
                                            >
                                              Cobrar
                                            </button>
                                          )}
                                          <button 
                                            onClick={() => handleCancelAppointment(appt)} 
                                            className="text-gold hover:bg-gold/10 p-2 border border-white/10 transition-colors rounded-sm flex items-center justify-center"
                                            title="Eliminar turno"
                                          >
                                            <Trash2 className="w-4 h-4" />
                                          </button>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            );
                          });
                        })()}
                      </div>
                      
                      {/* Botones de Bloquear/Desbloquear para modo rango en vista semanal */}
                      <div className="flex flex-col md:flex-row gap-4 mt-8">
                        <button
                          onClick={handleBlockTime}
                          disabled={(!isRangeMode && selectedTimesForBlocking.length === 0) || loading}
                          className="flex-1 bg-gold py-4 font-display font-bold uppercase tracking-widest disabled:opacity-50 flex items-center justify-center gap-2 hover:bg-gold/80 transition-all"
                        >
                          {loading ? <RefreshCcw className="w-4 h-4 animate-spin" /> : null}
                          {isRangeMode && selectedTimesForBlocking.length === 0 ? 'Bloquear Rango Completo' : `Bloquear / Cancelar Seleccionados (${selectedTimesForBlocking.length})`}
                        </button>

                        {(selectedTimesForBlocking.length > 0 || isRangeMode) && (
                          <button
                            onClick={handleUnblockTime}
                            disabled={loading}
                            className="bg-white text-black px-8 py-4 font-display font-bold uppercase tracking-widest hover:bg-zinc-200 transition-all disabled:opacity-50"
                          >
                            {isRangeMode && selectedTimesForBlocking.length === 0 ? 'Desbloquear Rango Completo' : 'Desbloquear Seleccionados'}
                          </button>
                        )}
                      </div>
                    </>
                  )}
                  </div>
                </div>
              )}
        </div>
      )}

      {isBarberAdmin && activeAdminTab === 'barberos' && (
        <div className="space-y-6">
          {!isAddingBarber && !editingBarberId ? (
            <button
              onClick={() => setIsAddingBarber(true)}
              className="w-full bg-gold text-zinc-950 py-4.5 font-display font-bold uppercase tracking-widest hover:bg-gold/90 transition-all shadow-lg shadow-gold/15 flex items-center justify-center gap-2 cursor-pointer rounded-sm"
            >
              <UserPlus className="w-4 h-4" /> Agregar Barbero
            </button>
          ) : (
            <div className="bg-black p-6 border border-white/5">
              <h3 className="font-display font-bold uppercase mb-6 flex items-center gap-2">
                <User className="w-5 h-5 text-gold" /> {editingBarberId ? 'Editar Barbero' : 'Agregar Nuevo Barbero'}
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                <input
                  type="text"
                  placeholder="Nombre del Barbero"
                  value={newBarber.name}
                  onChange={(e) => setNewBarber({ ...newBarber, name: e.target.value })}
                  className="bg-zinc-900 border border-white/10 p-3 text-sm focus:border-gold outline-none"
                />
                <input
                  type="email"
                  placeholder="Email (para login)"
                  value={newBarber.email}
                  onChange={(e) => setNewBarber({ ...newBarber, email: e.target.value })}
                  className="bg-zinc-900 border border-white/10 p-3 text-sm focus:border-gold outline-none"
                />
                <div className="md:col-span-2">
                  <label className="block text-xs font-bold uppercase mb-2 text-charcoal">Foto del Perfil</label>
                  <div className="flex items-center gap-4">
                    {newBarber.photo && (
                      <img src={newBarber.photo} alt="Preview" className="w-16 h-16 rounded-full object-cover border border-white/10" />
                    )}
                    <input
                      type="file"
                      ref={fileInputRef}
                      accept="image/*"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          const reader = new FileReader();
                          reader.onloadend = () => {
                            setNewBarber({ ...newBarber, photo: reader.result as string });
                          };
                          reader.readAsDataURL(file);
                        }
                      }}
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="bg-gold text-white px-4 py-3 text-xs font-bold uppercase tracking-widest hover:bg-gold/80 transition-all flex-1 text-left flex items-center justify-between shadow-lg shadow-gold/20 cursor-pointer"
                    >
                      <span>{newBarber.photo ? 'Cambiar Foto' : 'Seleccionar Foto'}</span>
                      <RefreshCcw className="w-3 h-3 opacity-50" />
                    </button>
                  </div>
                </div>
              </div>
              <div className="flex gap-4">
                <button
                  onClick={async () => {
                    if (!newBarber.name || !newBarber.email || !newBarber.photo) {
                      toast.error('Por favor completa todos los campos y sube una foto.');
                      return;
                    }
                    setLoading(true);
                    try {
                      if (editingBarberId) {
                        await updateBarber(editingBarberId, newBarber);
                        toast.success('Barbero actualizado correctamente.');
                      } else {
                        await addBarber(newBarber);
                        toast.success('Barbero agregado correctamente.');
                      }
                      setNewBarber({ name: '', email: '', photo: '', role: 'barber' });
                      setEditingBarberId(null);
                      setIsAddingBarber(false);
                    } catch (err) {
                      toast.error('Error al guardar barbero.');
                    } finally {
                      setLoading(false);
                    }
                  }}
                  disabled={loading}
                  className="flex-1 bg-white text-black py-3 font-display font-bold uppercase tracking-widest hover:bg-gold hover:text-white transition-all disabled:opacity-50 cursor-pointer"
                >
                  {loading ? 'Guardando...' : editingBarberId ? 'Actualizar Barbero' : 'Guardar Barbero'}
                </button>
                <button
                  onClick={() => {
                    setEditingBarberId(null);
                    setNewBarber({ name: '', email: '', photo: '', role: 'barber' });
                    setIsAddingBarber(false);
                  }}
                  className="px-6 bg-zinc-800 text-white py-3 font-display font-bold uppercase tracking-widest hover:bg-zinc-700 transition-all cursor-pointer"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}

          <div className="bg-black p-6 border border-white/5">
            <h3 className="font-display font-bold uppercase mb-6 flex items-center gap-2">
              <Database className="w-5 h-5 text-gold" /> Barberos Actuales
            </h3>
            <div className="space-y-4">
              {barbers.map(b => (
                <div key={b.id} className="flex items-center justify-between p-4 bg-zinc-900 border border-white/5">
                  <div className="flex items-center gap-4">
                    <img src={b.photo} alt={b.name} className="w-12 h-12 rounded-full object-cover grayscale border border-white/5" referrerPolicy="no-referrer" />
                    <div>
                      <p className="font-bold uppercase text-sm">{b.name}</p>
                      <p className="text-xs text-charcoal">{b.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        setEditingBarberId(b.id);
                        setNewBarber({
                          name: b.name,
                          email: b.email,
                          photo: b.photo,
                          role: b.role || 'barber'
                        });
                        setIsAddingBarber(true);
                        containerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                      }}
                      className="text-charcoal hover:text-white p-2 transition-colors cursor-pointer"
                      title="Editar Barbero"
                    >
                      <Edit2 className="w-5 h-5" />
                    </button>
                    {b.email !== auth.currentUser?.email && (
                      <button
                        onClick={async () => {
                          if (window.confirm(`¿Estás seguro de eliminar a ${b.name}?`)) {
                            try {
                              await deleteBarber(b.id);
                              toast.success('Barbero eliminado.');
                            } catch (err) {
                              toast.error('Error al eliminar barbero.');
                            }
                          }
                        }}
                        className="text-charcoal hover:text-gold p-2 transition-colors cursor-pointer"
                        title="Eliminar Barbero"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {isBarberAdmin && activeAdminTab === 'horarios' && (
        <div className="space-y-6">
          <div className="bg-black p-6 border border-white/5">
            <h3 className="font-display font-bold uppercase mb-6 flex items-center gap-2">
              <Clock className="w-5 h-5 text-gold" /> Configuración de Horarios
            </h3>

            {/* Selector of Target: General vs Barbers */}
            <div className="mb-6">
              <label className="block text-xs uppercase font-bold text-zinc-400 mb-2">Configurar horarios para:</label>
              <select
                value={scheduleTargetId}
                onChange={(e) => {
                  const val = e.target.value;
                  setScheduleTargetId(val);
                  if (val === 'general') {
                    setEditingSchedule(shopSettings?.schedule || DEFAULT_SCHEDULE);
                    setUseGeneralScheduleForBarber(true);
                  } else {
                    const selectedB = barbers.find(b => b.id === val);
                    if (selectedB?.schedule) {
                      setEditingSchedule(selectedB.schedule);
                      setUseGeneralScheduleForBarber(false);
                    } else {
                      setEditingSchedule(shopSettings?.schedule || DEFAULT_SCHEDULE);
                      setUseGeneralScheduleForBarber(true);
                    }
                  }
                }}
                className="w-full bg-zinc-900 border border-white/10 p-3 text-sm rounded text-white focus:outline-none focus:border-gold transition-colors"
              >
                <option value="general">Generales de la Barbería</option>
                {barbers.map(b => (
                  <option key={b.id} value={b.id}>Barbero: {b.name}</option>
                ))}
              </select>
            </div>

            {/* If it's a barber, show the option to use General Schedules or Custom Schedules */}
            {scheduleTargetId !== 'general' && (
              <div className="mb-6 p-4 bg-zinc-900/40 border border-white/5 rounded space-y-3">
                <label className="flex items-center gap-3 text-sm cursor-pointer text-zinc-300 select-none hover:text-white transition-colors">
                  <input
                    type="checkbox"
                    checked={useGeneralScheduleForBarber}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setUseGeneralScheduleForBarber(checked);
                      if (checked) {
                        setEditingSchedule(shopSettings?.schedule || DEFAULT_SCHEDULE);
                      } else {
                        const selectedB = barbers.find(b => b.id === scheduleTargetId);
                        setEditingSchedule(selectedB?.schedule || shopSettings?.schedule || DEFAULT_SCHEDULE);
                      }
                    }}
                    className="w-4 h-4 accent-gold rounded border-white/10"
                  />
                  <span className="font-display font-medium uppercase text-xs tracking-wider">Usar los horarios generales de la barbería</span>
                </label>
                <p className="text-zinc-400 text-xs leading-relaxed">
                  Si está activado, este barbero usará automáticamente los horarios generales. Desactívalo para configurar un horario personalizado exclusivo para este barbero.
                </p>
              </div>
            )}

            {/* Render the Schedule Grid */}
            {(!useGeneralScheduleForBarber || scheduleTargetId === 'general') && (
              <div className="space-y-4 mb-6 animate-fadeIn">
                {['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'].map((dayName, index) => {
                  const daySchedule = editingSchedule?.[index] || DEFAULT_SCHEDULE[index as keyof typeof DEFAULT_SCHEDULE];
                  return (
                    <div key={index} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 bg-zinc-900 border border-white/5 rounded hover:border-white/10 transition-colors">
                      <div className="w-32 font-bold uppercase text-sm text-zinc-200">{dayName}</div>
                      <div className="flex flex-wrap items-center gap-6">
                        <label className="flex items-center gap-2 text-xs uppercase cursor-pointer text-zinc-300 hover:text-white select-none transition-colors">
                          <input
                            type="checkbox"
                            checked={daySchedule.isOpen}
                            onChange={(e) => {
                              const newSchedule = { ...editingSchedule };
                              newSchedule[index] = { ...daySchedule, isOpen: e.target.checked };
                              setEditingSchedule(newSchedule);
                            }}
                            className="accent-gold w-4 h-4"
                          />
                          Abierto
                        </label>
                        {daySchedule.isOpen && (
                          <div className="flex items-center gap-2 text-zinc-300">
                            <input
                              type="time"
                              value={daySchedule.start}
                              onChange={(e) => {
                                const newSchedule = { ...editingSchedule };
                                newSchedule[index] = { ...daySchedule, start: e.target.value };
                                setEditingSchedule(newSchedule);
                              }}
                              className="bg-black border border-white/10 p-2 text-xs rounded text-white focus:outline-none focus:border-gold transition-colors"
                            />
                            <span>a</span>
                            <input
                              type="time"
                              value={daySchedule.end}
                              onChange={(e) => {
                                const newSchedule = { ...editingSchedule };
                                newSchedule[index] = { ...daySchedule, end: e.target.value };
                                setEditingSchedule(newSchedule);
                              }}
                              className="bg-black border border-white/10 p-2 text-xs rounded text-white focus:outline-none focus:border-gold transition-colors"
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <button
              onClick={async () => {
                setLoading(true);
                try {
                  if (scheduleTargetId === 'general') {
                    await updateShopSettings({ schedule: editingSchedule });
                    setShopSettings({ ...shopSettings, schedule: editingSchedule });
                    toast.success('Horarios generales guardados correctamente.');
                  } else {
                    const barberData: any = {};
                    if (useGeneralScheduleForBarber) {
                      barberData.schedule = null;
                    } else {
                      barberData.schedule = editingSchedule;
                    }
                    await updateBarber(scheduleTargetId, barberData);
                    toast.success('Horarios del barbero guardados correctamente.');
                  }
                } catch (err) {
                  toast.error('Error al guardar los horarios.');
                } finally {
                  setLoading(false);
                }
              }}
              disabled={loading}
              className="w-full bg-gold py-4 font-display font-bold uppercase tracking-widest text-lg hover:bg-gold/80 transition-all disabled:opacity-50 text-white rounded"
            >
              {loading ? 'Guardando...' : 'Guardar Horarios'}
            </button>
          </div>
        </div>
      )}

      {isBarberAdmin && isIvan && activeAdminTab === 'finanzas' && (
        <div className="space-y-8">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-black p-6 border border-white/5 gap-4">
            <h3 className="font-display font-black uppercase text-2xl text-light-gray flex items-center gap-3">
              <Database className="w-6 h-6 text-gold" /> {finanzasViewMode === 'daily' ? 'Libro Diario' : finanzasViewMode === 'weekly' ? 'Detalle Semanal' : 'Detalle Mensual'}
            </h3>
            
            <div className="flex flex-col gap-4 w-full md:w-auto mt-2 md:mt-0">
              {/* Controles Superiores: Diario/Mensual y Hoy */}
              <div className="flex justify-between items-center w-full gap-2">
                <div className="flex bg-zinc-800 rounded-sm overflow-hidden border border-white/10 shrink-0">
                  <button 
                    onClick={() => setFinanzasViewMode('daily')}
                    className={`px-3 md:px-4 py-2 text-[10px] font-black uppercase transition-all ${finanzasViewMode === 'daily' ? 'bg-gold text-white' : 'text-charcoal hover:text-white'}`}
                  >
                    Diario
                  </button>
                  <button 
                    onClick={() => setFinanzasViewMode('weekly')}
                    className={`px-3 md:px-4 py-2 text-[10px] font-black uppercase transition-all ${finanzasViewMode === 'weekly' ? 'bg-gold text-white' : 'text-charcoal hover:text-white'}`}
                  >
                    Semanal
                  </button>
                  <button 
                    onClick={() => setFinanzasViewMode('monthly')}
                    className={`px-3 md:px-4 py-2 text-[10px] font-black uppercase transition-all ${finanzasViewMode === 'monthly' ? 'bg-gold text-white' : 'text-charcoal hover:text-white'}`}
                  >
                    Mensual
                  </button>
                </div>
                <button onClick={() => setFinanzasDate(new Date())} className="px-4 py-2 bg-zinc-800 hover:bg-white hover:text-black transition-all text-xs font-black uppercase shrink-0">
                  Hoy
                </button>
              </div>

              {/* Controles de Fecha: Flechas y Calendario */}
              <div className="flex items-center justify-between gap-2 w-full">
                <button onClick={() => setFinanzasDate(finanzasViewMode === 'daily' ? addDays(finanzasDate, -1) : finanzasViewMode === 'weekly' ? addDays(finanzasDate, -7) : addMonths(finanzasDate, -1))} className="p-3 bg-zinc-800 hover:bg-gold transition-colors shrink-0 rounded-sm">
                  <ChevronLeft className="w-4 h-4" />
                </button>
                
                <div 
                  className="relative flex items-center justify-center flex-1 bg-zinc-800/50 py-3 px-3 rounded-sm cursor-pointer hover:bg-zinc-800 transition-colors"
                >
                  <CalendarIcon className="w-4 h-4 text-charcoal mr-2 shrink-0" />
                  <span className="font-bold uppercase tracking-widest text-[10px] md:text-xs text-center capitalize line-clamp-1">
                    {format(finanzasDate, finanzasViewMode === 'daily' ? "EEEE dd/MM/yyyy" : finanzasViewMode === 'weekly' ? "'Sem.' dd/MM/yyyy" : "MMMM yyyy", { locale: es })}
                  </span>
                  <input 
                    ref={finanzasDatePickerRef}
                    type={finanzasViewMode === 'monthly' ? 'month' : 'date'}
                    value={format(finanzasDate, finanzasViewMode === 'monthly' ? 'yyyy-MM' : 'yyyy-MM-dd')}
                    onChange={(e) => {
                      if (e.target.value) {
                        setFinanzasDate(parseISO(finanzasViewMode === 'monthly' ? e.target.value + '-01' : e.target.value));
                      }
                    }}
                    onClick={(e) => {
                      try {
                        if (typeof e.currentTarget.showPicker === 'function') {
                          e.currentTarget.showPicker();
                        }
                      } catch (err) {
                        // Ignorar: navegadores móviles usan su propio evento click nativo
                      }
                    }}
                    className="absolute inset-0 opacity-0 cursor-pointer w-full h-full z-10"
                  />
                </div>

                <button onClick={() => setFinanzasDate(finanzasViewMode === 'daily' ? addDays(finanzasDate, 1) : finanzasViewMode === 'weekly' ? addDays(finanzasDate, 7) : addMonths(finanzasDate, 1))} className="p-3 bg-zinc-800 hover:bg-gold transition-colors shrink-0 rounded-sm">
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          <div className="bg-zinc-900 border border-white/5 p-6">
            <div className="space-y-4">
              {(() => {
                let totalIvanCuts = 0;
                let totalOthersCuts = 0;
                
                let totalIvanPending = 0;
                let totalOthersPending = 0;

                const processedAppts = finanzasAppts.map(appt => {
                  const barber = barbers.find(b => b.id === appt.barberId);
                  const isIvanCut = barber?.id === 'ivan-nunez' || barber?.email === 'puntobarba.barber@gmail.com' || barber?.email === 'leoneldariogarcia@gmail.com' || barber?.email === 'puntobarbabarberia@gmail.com' || (barber?.name && barber.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes('ivan'));
                  const svcPrice = appt.customPrice != null ? appt.customPrice : (services.find(s => s.name === appt.service)?.price || 0);
                  
                  let ivanShare = 0;
                  let barberShare = 0;

                  if (appt.completed) {
                    if (isIvanCut) {
                      ivanShare = svcPrice;
                      totalIvanCuts += svcPrice;
                    } else {
                      ivanShare = svcPrice * 0.5;
                      barberShare = svcPrice * 0.5;
                      totalOthersCuts += svcPrice;
                    }
                  } else {
                    if (isIvanCut) {
                      totalIvanPending += svcPrice;
                    } else {
                      totalOthersPending += svcPrice;
                    }
                  }

                  return { ...appt, barberName: barber?.name || 'Desconocido', isIvanCut, svcPrice, ivanShare, barberShare };
                }).sort((a, b) => a.startTime.toMillis() - b.startTime.toMillis());

                const totalRevenuePaid = totalIvanCuts + totalOthersCuts;
                const totalIvanEarnsPaid = totalIvanCuts + (totalOthersCuts * 0.5);
                const totalOthersEarnsPaid = totalOthersCuts * 0.5;

                const totalPendingRevenue = totalIvanPending + totalOthersPending;
                const totalEstimatedRevenue = totalRevenuePaid + totalPendingRevenue;

                // Desglose individual por barbero (solo cobrados/completados)
                const barberStats = barbers.map(barber => {
                  const barberAppts = processedAppts.filter(a => a.barberId === barber.id);
                  const completedAppts = barberAppts.filter(a => a.completed);
                  const pendingAppts = barberAppts.filter(a => !a.completed);

                  const isIvanBarber = barber.id === 'ivan-nunez' || barber.email === 'puntobarba.barber@gmail.com' || barber.email === 'leoneldariogarcia@gmail.com' || barber.email === 'puntobarbabarberia@gmail.com' || (barber.name && barber.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes('ivan'));

                  const totalEarnedVal = completedAppts.reduce((sum, a) => sum + a.svcPrice, 0);
                  const commissionVal = isIvanBarber ? totalEarnedVal : totalEarnedVal * 0.5;

                  return {
                    id: barber.id,
                    name: barber.name,
                    photo: barber.photo,
                    isIvanBarber,
                    cutsCount: completedAppts.length,
                    pendingCount: pendingAppts.length,
                    totalEarned: totalEarnedVal,
                    commission: commissionVal
                  };
                });

                return (
                  <>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                      <div className="bg-black p-6 border border-white/5">
                        <p className="text-charcoal font-bold uppercase tracking-widest text-xs mb-2">Recaudación Cobrada</p>
                        <p className="font-display font-black text-3xl text-light-gray">${totalRevenuePaid.toLocaleString('es-AR')}</p>
                        <p className="text-[9px] text-zinc-500 mt-2 font-bold uppercase">
                          Pendiente: ${totalPendingRevenue.toLocaleString('es-AR')} | Total Est.: ${totalEstimatedRevenue.toLocaleString('es-AR')}
                        </p>
                      </div>
                      <div className="bg-black p-6 border border-gold/50">
                        <p className="text-gold font-bold uppercase tracking-widest text-xs mb-2">Cierre Caja Iván</p>
                        <p className="font-display font-black text-3xl text-gold">${totalIvanEarnsPaid.toLocaleString('es-AR')}</p>
                        <p className="text-[9px] text-zinc-500 mt-2 font-bold uppercase">100% cortes propios + 50% otros</p>
                      </div>
                      <div className="bg-black p-6 border border-white/5">
                        <p className="text-charcoal font-bold uppercase tracking-widest text-xs mb-2">Comisión Otros Barberos</p>
                        <p className="font-display font-black text-3xl text-zinc-400">${totalOthersEarnsPaid.toLocaleString('es-AR')}</p>
                        <p className="text-[9px] text-zinc-500 mt-2 font-bold uppercase">50% de comisión acumulada</p>
                      </div>
                    </div>

                    {/* Desglose por Barbero */}
                    <div className="mb-8 border-t border-white/5 pt-6">
                      <h4 className="font-display font-bold uppercase text-gold text-xs mb-4 tracking-widest flex items-center gap-2">
                        <User className="w-4 h-4" /> Desglose por Barbero
                        {selectedFinanzasBarberId && (
                          <span className="text-[9px] text-zinc-500 font-normal normal-case italic">
                            (Haz clic en el barbero activo para limpiar el filtro)
                          </span>
                        )}
                      </h4>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {barberStats.map(b => (
                          <button
                            key={b.id}
                            onClick={() => setSelectedFinanzasBarberId(selectedFinanzasBarberId === b.id ? null : b.id)}
                            className={`p-5 border transition-all text-left flex items-center justify-between cursor-pointer select-none rounded-sm ${
                              selectedFinanzasBarberId === b.id 
                                ? 'bg-gold/10 border-gold shadow-md shadow-gold/5' 
                                : selectedFinanzasBarberId !== null
                                  ? 'bg-black/40 border-white/5 opacity-40 hover:opacity-80 hover:border-white/10'
                                  : 'bg-black border-white/5 hover:border-white/15'
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <img src={b.photo} alt={b.name} className="w-10 h-10 rounded-full grayscale object-cover" referrerPolicy="no-referrer" />
                              <div>
                                <p className="font-display font-bold uppercase text-xs text-light-gray">{b.name}</p>
                                <p className="text-[10px] text-charcoal uppercase font-bold">
                                  {b.cutsCount} cortes cobrados {b.pendingCount > 0 ? `(${b.pendingCount} pend.)` : ''}
                                </p>
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="text-[9px] text-charcoal font-bold uppercase">{b.isIvanBarber ? 'Dueño (100%)' : 'Comisión (50%)'}</p>
                              <p className="font-display font-black text-lg text-light-gray">
                                ${b.commission.toLocaleString('es-AR')}
                              </p>
                              <p className="text-[8px] text-zinc-500 font-bold uppercase">Caja Bruta: ${b.totalEarned.toLocaleString('es-AR')}</p>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>

                    {(() => {
                      const filteredAppts = selectedFinanzasBarberId 
                        ? processedAppts.filter(appt => appt.barberId === selectedFinanzasBarberId)
                        : processedAppts;

                      const filteredRevenue = filteredAppts.reduce((sum, a) => sum + (a.completed ? a.svcPrice : 0), 0);
                      const filteredIvanShare = filteredAppts.reduce((sum, a) => sum + (a.completed ? a.ivanShare : 0), 0);
                      const filteredBarberShare = filteredAppts.reduce((sum, a) => sum + (a.completed ? (a.isIvanCut ? 0 : a.barberShare) : 0), 0);

                      // Cómputo de lo que cobra cada barbero en el listado actual
                      const individualBarberEarnings = barbers.map(barber => {
                        const barberCompletedAppts = filteredAppts.filter(a => a.barberId === barber.id && a.completed);
                        const totalEarnedVal = barberCompletedAppts.reduce((sum, a) => sum + a.svcPrice, 0);
                        const isIvanBarber = barber.id === 'ivan-nunez' || barber.email === 'puntobarba.barber@gmail.com' || barber.email === 'leoneldariogarcia@gmail.com' || barber.email === 'puntobarbabarberia@gmail.com' || (barber.name && barber.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes('ivan'));
                        const commissionVal = isIvanBarber ? totalEarnedVal : totalEarnedVal * 0.5;
                        return {
                          name: barber.name,
                          commission: commissionVal
                        };
                      }).filter(b => b.commission > 0);
                      
                      return (
                        <>
                          <div className="overflow-x-auto border-t border-white/5 pt-6">
                            <h4 className="font-display font-bold uppercase text-gold text-xs mb-4 tracking-widest flex items-center justify-between w-full">
                              <span className="flex items-center gap-2">
                                <Database className="w-4 h-4" /> Detalle de Transacciones
                                {selectedFinanzasBarberId && (
                                  <span className="text-[10px] bg-gold/20 text-gold border border-gold/30 px-2 py-0.5 font-bold uppercase tracking-wider rounded-sm ml-2">
                                    Filtrado por: {barbers.find(barb => barb.id === selectedFinanzasBarberId)?.name}
                                  </span>
                                )}
                              </span>
                              {selectedFinanzasBarberId && (
                                <button 
                                  onClick={() => setSelectedFinanzasBarberId(null)}
                                  className="text-[9px] font-bold uppercase border border-white/10 px-2.5 py-1 hover:bg-white hover:text-black transition-colors rounded-sm"
                                >
                                  Ver Todos
                                </button>
                              )}
                            </h4>
                            <table className="w-full text-left text-sm">
                              <thead className="bg-black border-b border-white/10 uppercase text-[10px] text-charcoal font-bold">
                                <tr>
                                  <th className="p-3">Hora</th>
                                  <th className="p-3">Cliente</th>
                                  <th className="p-3">Barbero</th>
                                  <th className="p-3">Servicio</th>
                                  <th className="p-3">Estado</th>
                                  <th className="p-3 text-right">Precio</th>
                                  <th className="p-3 text-right">Para Iván</th>
                                  <th className="p-3 text-right">Para Barbero</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-white/5">
                                {filteredAppts.map(appt => (
                                  <tr key={appt.id} className="hover:bg-white/5 transition-colors">
                                    <td className="p-3 font-display font-bold">{format(appt.startTime.toDate(), 'HH:mm')}</td>
                                    <td className="p-3 uppercase font-bold text-xs">
                                      {appt.customerName} {appt.isWalkIn && <span className="text-[8px] bg-gold/20 text-gold border border-gold/30 px-1 font-black uppercase tracking-wider ml-1 rounded-sm">Walk-in</span>}
                                    </td>
                                    <td className="p-3 text-xs text-zinc-400">{appt.barberName}</td>
                                    <td className="p-3 text-[10px] text-charcoal">{appt.service}</td>
                                    <td className="p-3">
                                      {appt.completed ? (
                                        <span className="text-emerald-400 font-bold uppercase text-[9px] flex items-center gap-1">
                                          <CheckCircle2 className="w-3 h-3" /> Cobrado
                                        </span>
                                      ) : (
                                        <span className="text-charcoal font-bold uppercase text-[9px]">
                                          Pendiente
                                        </span>
                                      )}
                                    </td>
                                    <td className="p-3 text-right font-bold">${appt.svcPrice.toLocaleString('es-AR')}</td>
                                    <td className="p-3 text-right text-gold font-bold">
                                      {appt.completed ? `$${appt.ivanShare.toLocaleString('es-AR')}` : '-'}
                                    </td>
                                    <td className="p-3 text-right text-zinc-400 font-bold">
                                      {appt.completed ? (appt.isIvanCut ? '-' : `$${appt.barberShare.toLocaleString('es-AR')}`) : '-'}
                                    </td>
                                  </tr>
                                ))}
                                {filteredAppts.length === 0 && (
                                  <tr>
                                    <td colSpan={8} className="p-6 text-center text-charcoal text-xs uppercase font-bold">No hay turnos registrados para este barbero</td>
                                  </tr>
                                )}
                              </tbody>
                            </table>
                          </div>

                          {/* Resumen del Listado Filtrado */}
                          <div className="bg-black/60 border border-white/5 p-5 mt-4 rounded-sm space-y-4">
                            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-white/5 pb-3 gap-2">
                              <h5 className="font-display font-bold text-xs tracking-widest text-gold uppercase">Resumen de Listado</h5>
                              <p className="text-xs text-charcoal font-bold uppercase">
                                Total Cobrado en Turnos Listados: <span className="text-light-gray font-black">${filteredRevenue.toLocaleString('es-AR')}</span>
                              </p>
                            </div>
                            
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 text-xs">
                              {individualBarberEarnings.map(b => (
                                <div key={b.name} className="bg-zinc-950 p-3 border border-white/5 flex justify-between items-center rounded-sm">
                                  <span className="text-charcoal font-bold uppercase">{b.name}</span>
                                  <span className="font-display font-black text-lg text-light-gray">${b.commission.toLocaleString('es-AR')}</span>
                                </div>
                              ))}
                              {individualBarberEarnings.length === 0 && (
                                <p className="col-span-full text-center text-charcoal italic text-[11px] py-2 uppercase font-bold">Sin ganancias cobradas en este listado</p>
                              )}
                            </div>
                          </div>
                        </>
                      );
                    })()}
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {isBarberAdmin && isIvan && activeAdminTab === 'precios' && (
        <div className="space-y-8">
          <div className="bg-zinc-900 border border-white/5 p-6 rounded-sm">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-white/5 pb-4 mb-6 gap-4">
              <div className="flex items-center gap-3">
                <Scissors className="w-6 h-6 text-gold" />
                <div>
                  <h3 className="font-display font-black text-2xl uppercase tracking-wider text-light-gray">
                    Gestión de Servicios
                  </h3>
                  <p className="text-xs text-charcoal font-bold uppercase">
                    Agrega, edita o elimina los servicios ofrecidos en la barbería
                  </p>
                </div>
              </div>
              
              <button
                onClick={() => {
                  setEditingServiceId(null);
                  setNewService({ name: '', duration: 30, price: '', desc: '' });
                  setIsServiceModalOpen(true);
                }}
                className="bg-gold hover:bg-gold-hover text-neutral-900 px-5 py-3 font-display font-bold uppercase tracking-widest text-[11px] shadow-md shadow-gold/10 transition-all duration-300 flex items-center gap-2 cursor-pointer rounded-sm"
              >
                <Plus className="w-4 h-4" /> Agregar Servicio
              </button>
            </div>

            <div className="space-y-3">
              {services.map(svc => (
                <div key={svc.id} className="bg-black/30 border border-white/5 p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 rounded-sm">
                  <div className="flex-1">
                    <h4 className="font-display font-black text-lg uppercase tracking-wide text-light-gray">{svc.name}</h4>
                    <p className="text-[10px] text-charcoal font-bold uppercase mt-1 tracking-wider">
                      Duración estimada: {svc.duration} minutos
                    </p>
                    {svc.desc && <p className="text-xs text-zinc-500 mt-1.5 normal-case">{svc.desc}</p>}
                  </div>
                  
                  <div className="flex items-center justify-between md:justify-end gap-6 w-full md:w-auto border-t md:border-t-0 border-white/5 pt-3 md:pt-0">
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-[10px] text-charcoal font-bold uppercase tracking-wider">Precio:</span>
                      <span className="font-display font-black text-xl text-white">${svc.price.toLocaleString('es-AR')}</span>
                    </div>

                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => {
                          setEditingServiceId(svc.id);
                          setEditingServiceForm({ name: svc.name, duration: svc.duration, price: String(svc.price), desc: svc.desc || '' });
                          setIsServiceModalOpen(true);
                        }}
                        className="bg-zinc-800/80 hover:bg-zinc-700 text-light-gray p-2 transition-colors cursor-pointer rounded-sm border border-white/5 flex items-center justify-center"
                        title="Editar Servicio"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteService(svc.id)}
                        className="text-zinc-600 hover:text-red-500 p-2 transition-colors cursor-pointer flex items-center justify-center"
                        title="Eliminar Servicio"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}

              {services.length === 0 && (
                <div className="py-8 text-center text-charcoal uppercase font-bold text-xs">
                  No hay servicios registrados en la base de datos.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {isBarberAdmin && isIvan && activeAdminTab === 'catalogo' && (
        <div className="space-y-8">
          <div className="bg-zinc-900 border border-white/5 p-6 rounded-sm">
            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 border-b border-white/5 pb-4 mb-6">
              <div className="flex items-center gap-3">
                <ShoppingBag className="w-6 h-6 text-gold" />
                <div>
                  <h3 className="font-display font-black text-2xl uppercase tracking-wider text-light-gray">
                    Catálogo de Productos
                  </h3>
                  <p className="text-xs text-charcoal font-bold uppercase">
                    Agrega, edita y elimina los productos disponibles en la botica
                  </p>
                </div>
              </div>
              <div>
                <button
                  onClick={() => {
                    setNewProduct({ name: '', desc: '', price: '', tag: '', img: '' });
                    if (productFileInputRef.current) productFileInputRef.current.value = '';
                    setIsProductModalOpen(true);
                  }}
                  className="rounded-full bg-gold hover:bg-gold-hover text-neutral-900 px-6 py-3 font-display font-bold uppercase tracking-widest text-xs shadow-md shadow-gold/10 transition-all duration-300 flex items-center gap-2 cursor-pointer"
                >
                  <Plus className="w-4 h-4" /> Agregar Nuevo Producto
                </button>
              </div>
            </div>

            {/* List of current products */}
            <div className="space-y-4">
              <h4 className="font-display font-bold text-lg uppercase text-light-gray border-b border-white/5 pb-2">Productos Registrados</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {products.map((prod) => (
                  <div key={prod.id} className="bg-black/40 border border-white/5 p-4 flex gap-4 justify-between items-start rounded-sm">
                    <div className="flex gap-4">
                      {prod.img ? (
                        <img src={prod.img} alt={prod.name} className="w-16 h-16 object-cover border border-white/5 shrink-0" />
                      ) : (
                        <div className="w-16 h-16 bg-zinc-950 border border-white/5 flex items-center justify-center text-[10px] text-charcoal shrink-0 font-bold uppercase">No Foto</div>
                      )}
                      <div>
                        <span className="text-[8px] bg-gold/10 text-gold border border-gold/20 px-2 py-0.5 font-sans font-bold uppercase tracking-wider rounded">{prod.tag}</span>
                        <h5 className="font-display font-bold text-base uppercase text-light-gray mt-1.5">{prod.name}</h5>
                        <p className="text-zinc-500 font-display font-bold text-sm">{prod.price}</p>
                      </div>
                    </div>
                    
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          setEditingProductId(prod.id);
                          setEditingProductForm({
                            name: prod.name || '',
                            desc: prod.desc || '',
                            price: prod.price || '',
                            tag: prod.tag || '',
                            img: prod.img || ''
                          });
                          setIsProductModalOpen(true);
                        }}
                        className="bg-zinc-800/80 hover:bg-zinc-700 text-light-gray p-2 transition-colors cursor-pointer rounded-sm border border-white/5 flex items-center justify-center"
                        title="Editar Producto"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleProductDelete(prod.id)}
                        className="text-zinc-600 hover:text-red-500 p-2 transition-colors cursor-pointer flex items-center justify-center"
                        title="Eliminar Producto"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
                {products.length === 0 && (
                  <div className="col-span-full py-8 text-center text-charcoal uppercase font-bold text-xs">
                    No hay productos en el catálogo.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {isBarberAdmin && isIvan && activeAdminTab === 'cortesia' && (
        <div className="space-y-8">
          <div className="bg-zinc-900 border border-white/5 p-6 rounded-sm">
            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 border-b border-white/5 pb-4 mb-6">
              <div className="flex items-center gap-3">
                <Coffee className="w-6 h-6 text-gold" />
                <div>
                  <h3 className="font-display font-black text-2xl uppercase tracking-wider text-light-gray">
                    Cortesías de la Casa
                  </h3>
                  <p className="text-xs text-charcoal font-bold uppercase">
                    Agrega, edita y elimina las bebidas disponibles para los clientes
                  </p>
                </div>
              </div>
              <div>
                <button
                  onClick={() => {
                    setEditingDrinkId(null);
                    setNewDrink({ name: '', category: 'cafeteria', available: true });
                    setIsDrinkModalOpen(true);
                  }}
                  className="rounded-full bg-gold hover:bg-gold-hover text-neutral-900 px-6 py-3 font-display font-bold uppercase tracking-widest text-xs shadow-md shadow-gold/10 transition-all duration-300 flex items-center gap-2 cursor-pointer"
                >
                  <Plus className="w-4 h-4" /> Agregar Nueva Bebida
                </button>
              </div>
            </div>

            {/* List of current drinks */}
            <div className="space-y-4">
              <h4 className="font-display font-bold text-lg uppercase text-light-gray border-b border-white/5 pb-2">Bebidas Registradas</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {drinks.map((drink) => (
                  <div key={drink.id} className="bg-black/40 border border-white/5 p-4 flex flex-col justify-between gap-4 rounded-sm">
                    <div className="flex justify-between items-start gap-4">
                      <div>
                        <span className="text-[8px] bg-gold/10 text-gold border border-gold/20 px-2 py-0.5 font-sans font-bold uppercase tracking-wider rounded">
                          {drink.category === 'cafeteria' ? 'Cafetería' : drink.category === 'alcohol' ? 'Con Alcohol' : 'Sin Alcohol'}
                        </span>
                        <h5 className="font-display font-bold text-base uppercase text-light-gray mt-2">{drink.name}</h5>
                      </div>
                      
                      <button
                        onClick={() => handleDrinkToggleAvailability(drink.id, drink.available)}
                        className={`text-[8px] font-bold uppercase tracking-widest border px-2 py-1 rounded transition-colors cursor-pointer ${
                          drink.available 
                            ? 'border-green-500/25 text-green-400 bg-green-500/5 hover:bg-green-500/10' 
                            : 'border-red-500/25 text-red-400 bg-red-500/5 hover:bg-red-500/10'
                        }`}
                      >
                        {drink.available ? 'Disponible' : 'Sin Stock'}
                      </button>
                    </div>

                    <div className="flex justify-end gap-2 border-t border-white/5 pt-3">
                      <button
                        onClick={() => {
                          setEditingDrinkId(drink.id);
                          setEditingDrinkForm({ name: drink.name, category: drink.category, available: drink.available });
                          setIsDrinkModalOpen(true);
                        }}
                        className="text-[9px] font-bold uppercase tracking-widest text-zinc-400 hover:text-white transition-colors border border-white/10 px-3 py-1.5 rounded-full hover:bg-white/5 cursor-pointer"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => handleDrinkDelete(drink.id)}
                        className="text-[9px] font-bold uppercase tracking-widest text-red-400 hover:text-red-300 transition-colors border border-red-500/20 px-3 py-1.5 rounded-full hover:bg-red-500/5 cursor-pointer"
                      >
                        Eliminar
                      </button>
                    </div>
                  </div>
                ))}
                {drinks.length === 0 && (
                  <div className="col-span-full py-8 text-center text-charcoal uppercase font-bold text-xs">
                    No hay bebidas en el catálogo de cortesía.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {(!isBarberAdmin || (isBarberAdmin && activeAdminTab === 'agendar')) && (
        <div className="space-y-8">
            <div className="flex gap-3 border-b border-white/5 pb-6 mb-8">
              <button
                onClick={() => setBookingTab('agendar')}
                className={`px-6 py-2.5 rounded-full font-display font-bold text-xs uppercase tracking-widest transition-all border cursor-pointer ${
                  bookingTab === 'agendar'
                    ? 'bg-gold border-gold text-neutral-900 shadow-lg shadow-gold/15'
                    : 'bg-black/50 border-white/10 text-charcoal hover:border-white/25 hover:text-white'
                }`}
              >
                Reservar Turno
              </button>
              <button
                onClick={() => setBookingTab('mis-turnos')}
                className={`px-6 py-2.5 rounded-full font-display font-bold text-xs uppercase tracking-widest transition-all border cursor-pointer ${
                  bookingTab === 'mis-turnos'
                    ? 'bg-gold border-gold text-neutral-900 shadow-lg shadow-gold/15'
                    : 'bg-black/50 border-white/10 text-charcoal hover:border-white/25 hover:text-white'
                }`}
              >
                Mis Turnos
              </button>
            </div>

          {bookingTab === 'mis-turnos' ? (
            <div className="bg-black p-6 border border-white/5">
              <h3 className="text-xl font-display font-bold uppercase mb-6 flex items-center gap-3">
                <CalendarIcon className="text-gold" /> Consultar Mis Turnos
              </h3>
              <form onSubmit={handleSearchAppointments} className="flex gap-3 mb-8">
                <input
                  type="tel"
                  placeholder="Tu número de teléfono"
                  value={searchPhone}
                  onChange={(e) => setSearchPhone(e.target.value)}
                  className="flex-1 bg-zinc-900 border border-white/10 px-6 py-3.5 rounded-full text-white font-display uppercase tracking-widest text-xs focus:outline-none focus:border-gold/50"
                />
                <button
                  type="submit"
                  disabled={isSearching}
                  className="bg-gold px-8 rounded-full font-display font-bold uppercase text-neutral-900 hover:bg-gold-hover transition-all duration-300 disabled:opacity-50 cursor-pointer text-xs tracking-wider"
                >
                  {isSearching ? '...' : 'Buscar'}
                </button>
              </form>

              {myAppointments.length > 0 && (
                <div className="space-y-4">
                  {myAppointments.map(appt => {
                    const b = barbers.find(b => b.id === appt.barberId);
                    return (
                      <div key={appt.id} className="p-4 border border-white/5 bg-zinc-900 flex flex-col md:flex-row justify-between items-start md:items-center gap-2 md:gap-4">
                        <div>
                          <p className="font-display font-bold uppercase text-lg">{appt.service}</p>
                          <p className="text-charcoal text-sm">con {b ? b.name : 'Barbero'}</p>
                          {appt.isFixed && <p className="text-xs text-gold font-bold uppercase mt-1">Turno Fijo</p>}
                        </div>
                        <div className="text-left md:text-right w-full md:w-auto flex flex-col items-start md:items-end">
                          <div>
                            <p className="font-display font-bold text-gold capitalize whitespace-nowrap">{format(appt.startTime.toDate(), 'EEEE dd/MM/yyyy', { locale: es })}</p>
                            <p className="font-bold text-lg">{format(appt.startTime.toDate(), 'HH:mm')} HS</p>
                          </div>
                          <div className="flex gap-2 mt-3 md:mt-2 w-full md:w-auto justify-start md:justify-end">
                             {(() => {
                               const timeDiff = appt.startTime.toDate().getTime() - new Date().getTime();
                               const canCancel = isBarberAdmin || timeDiff > 2 * 60 * 60 * 1000;
                               
                               if (!canCancel) {
                                 return (
                                   <span className="text-[10px] font-bold uppercase text-charcoal tracking-widest px-3 py-2 border border-white/5 whitespace-nowrap">
                                     No cancelable (&lt; 2hs)
                                   </span>
                                 );
                               }

                               return (
                                 <>
                                   <button
                                     onClick={() => handleCancelAppointment(appt)}
                                     className="text-[9px] sm:text-[10px] rounded-full font-display font-bold uppercase tracking-widest border border-white/15 px-4 py-1.5 hover:border-gold hover:text-gold transition-all cursor-pointer"
                                   >
                                     Cancelar
                                   </button>
                                   <button
                                     onClick={() => handleRescheduleClick(appt)}
                                     className="text-[9px] sm:text-[10px] rounded-full font-display font-bold uppercase tracking-widest bg-gold text-neutral-900 px-4 py-1.5 hover:bg-gold-hover transition-all cursor-pointer"
                                   >
                                     Reprogramar
                                   </button>
                                 </>
                               );
                             })()}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <>
              {/* Steps Indicator */}
              {step <= 6 && (
                <div className="flex justify-between mb-12 relative">
                  <div className="absolute top-1/2 left-0 w-full h-px bg-charcoal/30 -z-10" />
                  {[1, 2, 3, 4, 5, 6].map(s => (
                    <div
                      key={s}
                      className={`w-10 h-10 rounded-full flex items-center justify-center font-display font-bold border-2 transition-all ${step >= s ? 'bg-gold border-gold text-white' : 'bg-black border-charcoal/30 text-charcoal'}`}
                    >
                      {s}
                    </div>
                  ))}
                </div>
              )}

              <AnimatePresence mode="wait">
                {step === 1 && (
                  <motion.div
                    key="step1"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    className="space-y-4"
                  >
                    <h3 className="text-xl sm:text-2xl md:text-3xl font-display font-black uppercase flex items-center gap-3">
                      <User className="text-gold w-5 h-5" /> Selecciona tu Barbero
                    </h3>
                    <div className="grid grid-cols-3 gap-3 md:gap-6">
                      {barbers.filter(b => b.email !== 'leoneldariogarcia@gmail.com').map(barber => (
                        <button
                          key={barber.id}
                          onClick={() => { setSelectedBarber(barber); if (selectedService) { setStep(3); } else { setStep(2); } }}
                          className="group relative aspect-square overflow-hidden border border-white/5 hover:border-gold transition-all cursor-pointer"
                        >
                          <img src={barber.photo} alt={barber.name} className="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all duration-500" referrerPolicy="no-referrer" />
                          <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent opacity-80" />
                          <div className="absolute bottom-2 left-2 md:bottom-4 md:left-4 text-left">
                            <p className="font-display font-black uppercase text-sm sm:text-xl md:text-2xl leading-tight">{barber.name}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  </motion.div>
                )}

                {step === 2 && (
                  <motion.div
                    key="step2"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    className="space-y-4"
                  >
                    <button onClick={() => setStep(1)} className="text-charcoal hover:text-gold flex items-center gap-2 text-xs uppercase font-bold tracking-widest mb-2 cursor-pointer">
                      <ChevronLeft className="w-4 h-4" /> Volver
                    </button>
                    <h3 className="text-xl sm:text-2xl md:text-3xl font-display font-black uppercase flex items-center gap-3">
                      <Scissors className="text-gold w-5 h-5" /> Elige el Servicio
                    </h3>

                    <div className="space-y-6 max-h-[55vh] overflow-y-auto pr-1.5">
                      {/* Cortes & Estilo */}
                      {services.some(s => getServiceCategory(s) === 'cortes') && (
                        <div className="space-y-3">
                          <h4 className="text-xs font-bold uppercase tracking-widest text-gold border-b border-white/5 pb-2">
                            ✂️ Cortes & Estilo
                          </h4>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {services.filter(s => getServiceCategory(s) === 'cortes').map(service => {
                              const desc = service.desc || SERVICE_DESCRIPTIONS[service.id];
                              return (
                                <button
                                  key={service.id}
                                  onClick={() => { setSelectedService(service); setStep(3); }}
                                  className="p-5 bg-black border border-white/5 hover:border-gold transition-all duration-300 flex justify-between items-start gap-4 group cursor-pointer text-left rounded-sm hover:shadow-lg hover:shadow-gold/5"
                                >
                                  <div className="space-y-1.5 flex-1">
                                    <p className="font-display font-black uppercase text-lg sm:text-xl md:text-2xl group-hover:text-gold transition-colors leading-none">{service.name}</p>
                                    <span className="inline-block text-[9px] text-gold font-sans font-bold uppercase tracking-widest bg-gold/15 px-2 py-0.5 rounded-sm">
                                      {service.duration} MINUTOS
                                    </span>
                                    {desc && (
                                      <p className="text-charcoal text-[11px] font-sans tracking-wide leading-relaxed mt-1 group-hover:text-light-gray/80 transition-colors">
                                        {desc}
                                      </p>
                                    )}
                                  </div>
                                  <p className="text-lg sm:text-xl md:text-2xl font-display font-bold text-light-gray shrink-0 pt-0.5">${service.price.toLocaleString('es-AR')}</p>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Barba & Afeitado */}
                      {services.some(s => getServiceCategory(s) === 'barba') && (
                        <div className="space-y-3">
                          <h4 className="text-xs font-bold uppercase tracking-widest text-gold border-b border-white/5 pb-2">
                            🧔 Barba & Afeitado
                          </h4>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {services.filter(s => getServiceCategory(s) === 'barba').map(service => {
                              const desc = service.desc || SERVICE_DESCRIPTIONS[service.id];
                              return (
                                <button
                                  key={service.id}
                                  onClick={() => { setSelectedService(service); setStep(3); }}
                                  className="p-5 bg-black border border-white/5 hover:border-gold transition-all duration-300 flex justify-between items-start gap-4 group cursor-pointer text-left rounded-sm hover:shadow-lg hover:shadow-gold/5"
                                >
                                  <div className="space-y-1.5 flex-1">
                                    <p className="font-display font-black uppercase text-lg sm:text-xl md:text-2xl group-hover:text-gold transition-colors leading-none">{service.name}</p>
                                    <span className="inline-block text-[9px] text-gold font-sans font-bold uppercase tracking-widest bg-gold/15 px-2 py-0.5 rounded-sm">
                                      {service.duration} MINUTOS
                                    </span>
                                    {desc && (
                                      <p className="text-charcoal text-[11px] font-sans tracking-wide leading-relaxed mt-1 group-hover:text-light-gray/80 transition-colors">
                                        {desc}
                                      </p>
                                    )}
                                  </div>
                                  <p className="text-lg sm:text-xl md:text-2xl font-display font-bold text-light-gray shrink-0 pt-0.5">${service.price.toLocaleString('es-AR')}</p>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Cuidado Facial */}
                      {services.some(s => getServiceCategory(s) === 'facial') && (
                        <div className="space-y-3">
                          <h4 className="text-xs font-bold uppercase tracking-widest text-gold border-b border-white/5 pb-2">
                            ✨ Cuidado Facial
                          </h4>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {services.filter(s => getServiceCategory(s) === 'facial').map(service => {
                              const desc = service.desc || SERVICE_DESCRIPTIONS[service.id];
                              return (
                                <button
                                  key={service.id}
                                  onClick={() => { setSelectedService(service); setStep(3); }}
                                  className="p-5 bg-black border border-white/5 hover:border-gold transition-all duration-300 flex justify-between items-start gap-4 group cursor-pointer text-left rounded-sm hover:shadow-lg hover:shadow-gold/5"
                                >
                                  <div className="space-y-1.5 flex-1">
                                    <p className="font-display font-black uppercase text-lg sm:text-xl md:text-2xl group-hover:text-gold transition-colors leading-none">{service.name}</p>
                                    <span className="inline-block text-[9px] text-gold font-sans font-bold uppercase tracking-widest bg-gold/15 px-2 py-0.5 rounded-sm">
                                      {service.duration} MINUTOS
                                    </span>
                                    {desc && (
                                      <p className="text-charcoal text-[11px] font-sans tracking-wide leading-relaxed mt-1 group-hover:text-light-gray/80 transition-colors">
                                        {desc}
                                      </p>
                                    )}
                                  </div>
                                  <p className="text-lg sm:text-xl md:text-2xl font-display font-bold text-light-gray shrink-0 pt-0.5">${service.price.toLocaleString('es-AR')}</p>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Combos de Autor & VIP */}
                      {services.some(s => getServiceCategory(s) === 'combos' || getServiceCategory(s) === 'vip') && (
                        <div className="space-y-3">
                          <h4 className="text-xs font-bold uppercase tracking-widest text-gold border-b border-white/5 pb-2">
                            👑 Combos de Autor & VIP
                          </h4>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {services.filter(s => getServiceCategory(s) === 'combos' || getServiceCategory(s) === 'vip').map(service => {
                              const desc = service.desc || SERVICE_DESCRIPTIONS[service.id];
                              return (
                                <button
                                  key={service.id}
                                  onClick={() => { setSelectedService(service); setStep(3); }}
                                  className="p-5 bg-black border border-white/5 hover:border-gold transition-all duration-300 flex justify-between items-start gap-4 group cursor-pointer text-left rounded-sm hover:shadow-lg hover:shadow-gold/5"
                                >
                                  <div className="space-y-1.5 flex-1">
                                    <p className="font-display font-black uppercase text-lg sm:text-xl md:text-2xl group-hover:text-gold transition-colors leading-none">{service.name}</p>
                                    <span className="inline-block text-[9px] text-gold font-sans font-bold uppercase tracking-widest bg-gold/15 px-2 py-0.5 rounded-sm">
                                      {service.duration} MINUTOS
                                    </span>
                                    {desc && (
                                      <p className="text-charcoal text-[11px] font-sans tracking-wide leading-relaxed mt-1 group-hover:text-light-gray/80 transition-colors">
                                        {desc}
                                      </p>
                                    )}
                                  </div>
                                  <p className="text-lg sm:text-xl md:text-2xl font-display font-bold text-light-gray shrink-0 pt-0.5">${service.price.toLocaleString('es-AR')}</p>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Otros Servicios */}
                      {services.some(s => getServiceCategory(s) === 'otros') && (
                        <div className="space-y-3">
                          <h4 className="text-xs font-bold uppercase tracking-widest text-gold border-b border-white/5 pb-2">
                            ➕ Otros Servicios
                          </h4>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {services.filter(s => getServiceCategory(s) === 'otros').map(service => {
                              const desc = service.desc || SERVICE_DESCRIPTIONS[service.id];
                              return (
                                <button
                                  key={service.id}
                                  onClick={() => { setSelectedService(service); setStep(3); }}
                                  className="p-5 bg-black border border-white/5 hover:border-gold transition-all duration-300 flex justify-between items-start gap-4 group cursor-pointer text-left rounded-sm hover:shadow-lg hover:shadow-gold/5"
                                >
                                  <div className="space-y-1.5 flex-1">
                                    <p className="font-display font-black uppercase text-lg sm:text-xl md:text-2xl group-hover:text-gold transition-colors leading-none">{service.name}</p>
                                    <span className="inline-block text-[9px] text-gold font-sans font-bold uppercase tracking-widest bg-gold/15 px-2 py-0.5 rounded-sm">
                                      {service.duration} MINUTOS
                                    </span>
                                    {desc && (
                                      <p className="text-charcoal text-[11px] font-sans tracking-wide leading-relaxed mt-1 group-hover:text-light-gray/80 transition-colors">
                                        {desc}
                                      </p>
                                    )}
                                  </div>
                                  <p className="text-lg sm:text-xl md:text-2xl font-display font-bold text-light-gray shrink-0 pt-0.5">${service.price.toLocaleString('es-AR')}</p>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}

                {step === 3 && (
                  <motion.div
                    key="step3"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    className="space-y-4"
                  >
                    <button onClick={() => setStep(2)} className="text-charcoal hover:text-gold flex items-center gap-2 text-xs uppercase font-bold tracking-widest mb-2 cursor-pointer">
                      <ChevronLeft className="w-4 h-4" /> Volver
                    </button>
                    <div className="flex justify-between items-center mb-3">
                      <h3 className="text-xl sm:text-2xl md:text-3xl font-display font-black uppercase flex items-center gap-3">
                        <CalendarIcon className="text-gold w-5 h-5" /> Selecciona el Día
                      </h3>
                      <div className="relative">
                        <button className="flex items-center gap-2 bg-zinc-900 border border-white/10 px-3 py-1.5 hover:border-gold transition-colors uppercase text-[10px] font-bold cursor-pointer">
                          <CalendarIcon className="w-3.5 h-3.5 text-gold" /> Elegir Día
                        </button>
                        <input
                          type="date"
                          min={format(new Date(), 'yyyy-MM-dd')}
                          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                          onClick={(e) => e.currentTarget.showPicker && e.currentTarget.showPicker()}
                          onChange={(e) => {
                            if (e.target.value) {
                              const d = new Date(e.target.value + 'T00:00:00');
                              if (isBefore(d, startOfDay(new Date()))) return;
                              setSelectedDate(d);
                              setSelectedTime(null);
                              setStep(4);
                            }
                          }}
                        />
                      </div>
                    </div>

                    {/* Column Headers (Lunes a Sábado o Domingo) */}
                    <div className={`grid ${isSundayEnabled() ? 'grid-cols-7' : 'grid-cols-6'} gap-1.5 sm:gap-2 text-center mb-1 border-b border-white/5 pb-2`}>
                      {(isSundayEnabled() 
                        ? ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
                        : ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
                      ).map(dayName => (
                        <span key={dayName} className="text-[9px] sm:text-xs font-bold uppercase tracking-widest text-charcoal">
                          {dayName}
                        </span>
                      ))}
                    </div>

                    <div className={`grid ${isSundayEnabled() ? 'grid-cols-7' : 'grid-cols-6'} gap-1.5 sm:gap-2 pb-2`}>
                      {getCalendarDays().map((date, i) => {
                        const today = startOfDay(new Date());
                        const isSelected = isSameDay(date, selectedDate);
                        const isToday = isSameDay(date, today);
                        
                        const isPast = isBefore(date, today);
                        const dayOfWeek = getDay(date);
                        const daySchedule = getBarberDaySchedule(selectedBarber, dayOfWeek);
                        const isDayOpen = daySchedule.isOpen;
                        
                        const isDisabled = isPast || !isDayOpen;

                        return (
                          <button
                            key={i}
                            disabled={isDisabled}
                            onClick={() => { setSelectedDate(date); setSelectedTime(null); setStep(4); }}
                            className={`py-2.5 sm:py-3.5 border flex flex-col items-center justify-center transition-all cursor-pointer rounded-sm ${
                              isDisabled
                                ? 'border-white/5 bg-black/40 text-charcoal/20 cursor-not-allowed opacity-25'
                                : isSelected
                                ? 'border-gold bg-gold text-white shadow-lg shadow-gold/20 scale-105 z-10'
                                : isToday
                                ? 'border-white bg-black text-white hover:bg-zinc-900'
                                : 'border-white/5 bg-black text-charcoal hover:border-white/20 hover:bg-zinc-900'
                            }`}
                          >
                            <span className="text-base sm:text-2xl md:text-3xl font-display font-black leading-none">{format(date, 'dd')}</span>
                            <span className="text-[8px] sm:text-[9px] text-charcoal/80 uppercase font-bold mt-1 leading-none">
                              {!isDayOpen && !isPast ? 'Cerrado' : format(date, 'MMM', { locale: es })}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </motion.div>
                )}

                {step === 4 && (
                  <motion.div
                    key="step4"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    className="space-y-2.5 md:space-y-4"
                  >
                    <button onClick={() => setStep(3)} className="text-charcoal hover:text-gold flex items-center gap-2 text-xs uppercase font-bold tracking-widest mb-1 cursor-pointer">
                      <ChevronLeft className="w-4 h-4" /> Volver
                    </button>
                    <div className="text-center py-2 bg-zinc-900 border border-white/5 rounded-sm mb-1.5">
                      <h4 className="font-display font-black text-xs sm:text-base md:text-xl uppercase text-white tracking-wide leading-none py-1">
                        {format(selectedDate, "EEEE d 'de' MMMM", { locale: es })}
                      </h4>
                    </div>

                    <div className="border-t border-white/5 pt-3">
                      <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-1.5 md:gap-3">
                        {getAvailableSlots().map(time => (
                          <button
                            key={time}
                            onClick={() => { setSelectedTime(time); setStep(5); }}
                            className={`py-2.5 sm:py-3.5 border font-display font-black text-sm sm:text-base md:text-lg transition-all cursor-pointer rounded-sm ${selectedTime === time ? 'border-white bg-white text-black' : 'border-white/5 bg-black text-charcoal hover:border-gold hover:text-gold'}`}
                          >
                            {time}
                          </button>
                        ))}
                        {getAvailableSlots().length === 0 && (
                          <p className="col-span-full text-center py-6 text-charcoal italic border border-dashed border-white/5 text-xs">
                            No hay horarios disponibles para este día.
                          </p>
                        )}
                      </div>
                    </div>
                  </motion.div>
                )}

                {step === 5 && (
                  <motion.div
                    key="step5"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    className="space-y-6"
                  >
                    <button onClick={() => setStep(4)} className="text-charcoal hover:text-gold flex items-center gap-2 text-xs uppercase font-bold tracking-widest mb-2 cursor-pointer">
                      <ChevronLeft className="w-4 h-4" /> Volver
                    </button>
                    
                    <div className="text-center py-2.5 bg-zinc-900 border border-white/5 rounded-sm mb-2">
                      <h3 className="font-display font-black text-lg sm:text-2xl uppercase text-white tracking-wide py-1">
                        Selección de cortesía
                      </h3>
                      <p className="text-[10px] sm:text-xs text-charcoal uppercase font-bold tracking-wider">
                        Elegí una cortesía de la casa para acompañar tu experiencia
                      </p>
                    </div>

                    <div className="space-y-6">
                      {[
                        { id: 'cafeteria', label: 'Cafetería', icon: '☕', list: drinks.filter(d => d.available && d.category === 'cafeteria') },
                        { id: 'alcohol', label: 'Bebida con Alcohol', icon: '🍺', list: drinks.filter(d => d.available && d.category === 'alcohol') },
                        { id: 'sin_alcohol', label: 'Bebida sin Alcohol', icon: '🥤', list: drinks.filter(d => d.available && d.category === 'sin_alcohol') }
                      ].filter(cat => cat.list.length > 0).map(cat => (
                        <div key={cat.id} className="space-y-3">
                          <h4 className="text-xs font-bold uppercase tracking-widest text-gold flex items-center gap-2">
                            {cat.icon} {cat.label}
                          </h4>
                          <div className="grid grid-cols-3 gap-2 sm:gap-3">
                            {cat.list.map(drink => (
                              <button
                                key={drink.id}
                                type="button"
                                onClick={() => setSelectedCourtesy(drink.name)}
                                className={`py-4 px-2 border font-display font-black text-xs sm:text-sm uppercase tracking-wider transition-all cursor-pointer rounded-sm ${selectedCourtesy === drink.name ? 'border-gold bg-gold/10 text-gold shadow-lg shadow-gold/10' : 'border-white/5 bg-black text-charcoal hover:border-white/20 hover:text-white'}`}
                              >
                                {drink.name}
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}

                      {drinks.filter(d => d.available).length === 0 && (
                        <div className="text-center py-8 text-charcoal uppercase font-bold text-xs border border-white/5 bg-black/20 rounded-sm">
                          No hay bebidas de cortesía disponibles en este momento.
                        </div>
                      )}

                      {/* Controls */}
                      <div className="pt-4 border-t border-white/5 flex gap-3 justify-end items-center">
                        <button
                          type="button"
                          onClick={() => { setSelectedCourtesy('Ninguna'); setStep(6); }}
                          className={`py-3 px-6 border font-display font-black text-xs uppercase tracking-widest transition-all cursor-pointer rounded-sm ${selectedCourtesy === 'Ninguna' ? 'border-gold bg-gold/10 text-gold' : 'border-white/5 bg-black text-charcoal hover:border-white/20 hover:text-white'}`}
                        >
                          Ninguna
                        </button>
                        
                        {selectedCourtesy && selectedCourtesy !== 'Ninguna' && (
                          <button
                            type="button"
                            onClick={() => setStep(6)}
                            className="rounded-full bg-gold hover:bg-gold-hover text-neutral-900 px-8 py-3.5 font-display font-bold uppercase tracking-widest text-xs transition-all duration-300 shadow-lg shadow-gold/10 hover:shadow-gold/25 cursor-pointer"
                          >
                            Continuar
                          </button>
                        )}
                      </div>
                    </div>
                  </motion.div>
                )}

                {step === 6 && (
                  <motion.div
                    key="step6"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    className="space-y-4"
                  >
                    <button onClick={() => setStep(5)} className="text-charcoal hover:text-gold flex items-center gap-2 text-xs uppercase font-bold tracking-widest mb-2 cursor-pointer">
                      <ChevronLeft className="w-4 h-4" /> Volver
                    </button>
                    <h3 className="text-xl sm:text-2xl md:text-3xl font-display font-black uppercase flex items-center gap-3">
                      <CheckCircle2 className="text-gold w-5 h-5" /> Confirmar Datos
                    </h3>

                    <form onSubmit={handleBooking} className="space-y-4">
                      <div className="bg-black p-4 md:p-6 border border-white/5 space-y-3 md:space-y-5">
                        <div className="flex justify-between border-b border-white/5 pb-3 md:pb-4">
                          <span className="text-charcoal uppercase text-xs font-bold tracking-widest">Servicio</span>
                          <span className="font-display font-bold uppercase text-base md:text-lg">{selectedService.name}</span>
                        </div>
                        <div className="flex justify-between border-b border-white/5 pb-3 md:pb-4">
                          <span className="text-charcoal uppercase text-xs font-bold tracking-widest">Barbero</span>
                          <span className="font-display font-bold uppercase text-base md:text-lg">{selectedBarber.name}</span>
                        </div>
                        <div className="flex justify-between border-b border-white/5 pb-3 md:pb-4">
                          <span className="text-charcoal uppercase text-xs font-bold tracking-widest">Fecha</span>
                          <span className="font-display font-bold uppercase text-base md:text-lg">{format(selectedDate, 'dd/MM/yyyy')} - {selectedTime} HS</span>
                        </div>
                        {selectedCourtesy && selectedCourtesy !== 'Ninguna' && (
                          <div className="flex justify-between border-b border-white/5 pb-3 md:pb-4">
                            <span className="text-charcoal uppercase text-xs font-bold tracking-widest">Cortesía</span>
                            <span className="font-display font-bold uppercase text-base md:text-lg text-gold">{selectedCourtesy}</span>
                          </div>
                        )}
                      </div>

                      <div className="space-y-3">
                        <input
                          type="text"
                          placeholder="NOMBRE COMPLETO"
                          required
                          value={customerInfo.name}
                          onChange={e => setCustomerInfo({ ...customerInfo, name: e.target.value })}
                          className="w-full bg-black border border-white/10 p-4 font-display font-bold uppercase tracking-widest focus:border-gold outline-none transition-colors text-base"
                        />
                        <input
                          type="tel"
                          placeholder="TELÉFONO DE CONTACTO (EJ: 3413143702)"
                          required
                          value={customerInfo.phone}
                          onChange={e => setCustomerInfo({ ...customerInfo, phone: e.target.value })}
                          className="w-full bg-black border border-white/10 p-4 font-display font-bold uppercase tracking-widest focus:border-gold outline-none transition-colors text-base"
                        />
                        <div className="space-y-1 text-left bg-black p-4 border border-white/10">
                          <div className="flex items-center justify-between">
                            <label className="block text-[10px] font-black uppercase text-charcoal tracking-widest mb-1 pl-1">Fecha de Nacimiento</label>
                            {isBirthdateAutocompleted && (
                              <span className="text-[9px] text-zinc-500 normal-case font-bold mb-1 pr-1">(Autocompletado de tu último turno)</span>
                            )}
                          </div>
                          <input
                            type="date"
                            required
                            value={customerInfo.birthdate}
                            onChange={e => {
                              setCustomerInfo({ ...customerInfo, birthdate: e.target.value });
                              setIsBirthdateAutocompleted(false);
                            }}
                            className={`w-full bg-black border border-white/5 p-2 font-display font-bold uppercase tracking-widest focus:border-gold outline-none transition-colors text-base ${isBirthdateAutocompleted ? 'text-zinc-500 border-zinc-800' : 'text-light-gray'}`}
                          />
                        </div>
                        {!reschedulingApptId && (
                          <div className="space-y-3">
                            <label className="flex items-center gap-3 text-sm font-bold uppercase cursor-pointer hover:text-gold bg-zinc-900 border border-white/10 p-4 transition-colors">
                              <input
                                type="checkbox"
                                checked={isFixedAppointment}
                                onChange={(e) => setIsFixedAppointment(e.target.checked)}
                                className="w-4.5 h-4.5 accent-gold"
                              />
                              Turno Fijo (Reservar varias fechas por 1 mes)
                            </label>

                            {isFixedAppointment && (
                              <div className="grid grid-cols-2 gap-3 ml-8 animate-in fade-in slide-in-from-left-2 duration-300">
                                <button
                                  type="button"
                                  onClick={() => setFixedInterval('weekly')}
                                  className={`p-3 border text-xs font-bold uppercase tracking-widest transition-all cursor-pointer ${fixedInterval === 'weekly' ? 'border-gold bg-gold/10 text-gold' : 'border-white/5 bg-black text-charcoal'}`}
                                >
                                  Semanal (Cada 7 días)
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setFixedInterval('biweekly')}
                                  className={`p-3 border text-xs font-bold uppercase tracking-widest transition-all cursor-pointer ${fixedInterval === 'biweekly' ? 'border-gold bg-gold/10 text-gold' : 'border-white/5 bg-black text-charcoal'}`}
                                >
                                  Quincenal (Cada 15 días)
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      {error && (
                        <div className="p-4 bg-gold/10 border border-gold text-gold text-sm font-bold uppercase flex items-center gap-3">
                          <AlertCircle className="w-4 h-4" /> {error}
                        </div>
                      )}

                      <button
                        type="submit"
                        disabled={loading}
                        className="w-full rounded-full bg-gold hover:bg-gold-hover text-neutral-900 py-4 md:py-5 font-display font-bold uppercase tracking-widest text-sm md:text-base shadow-xl shadow-gold/10 hover:shadow-gold/25 transition-all duration-300 active:scale-98 disabled:opacity-50 cursor-pointer"
                      >
                        {loading ? 'PROCESANDO...' : 'CONFIRMAR TURNO'}
                      </button>
                    </form>
                  </motion.div>
                )}

                {step === 7 && (
                  <motion.div
                    key="step7"
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="text-center py-12 space-y-6"
                  >
                    <div className="w-24 h-24 bg-gold rounded-full flex items-center justify-center mx-auto shadow-2xl shadow-gold/30">
                      <CheckCircle2 className="w-12 h-12 text-white" />
                    </div>
                    <h3 className="text-4xl md:text-6xl font-display font-black uppercase tracking-normal text-light-gray">¡Turno Confirmado!</h3>
                    <p className="text-charcoal text-lg md:text-xl font-display max-w-md mx-auto">
                      Te esperamos el <span className="text-white">{format(selectedDate, 'dd/MM')}</span> a las <span className="text-white">{selectedTime} HS</span> con <span className="text-white">{selectedBarber.name}</span>.
                    </p>
                    <button
                      onClick={() => {
                        setStep(1);
                        setSelectedBarber(null);
                        setSelectedService(null);
                        setSelectedTime(null);
                        setSelectedCourtesy(null);
                        setSuccess(false);
                        setIsFixedAppointment(false);
                        onClose?.();
                      }}
                      className="rounded-full bg-charcoal/20 border border-white/10 px-8 py-4 font-display font-bold uppercase tracking-widest hover:bg-charcoal/30 hover:text-white transition-all text-xs cursor-pointer"
                    >
                      Volver al Inicio
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </>
          )}
        </div>
      )}
    </div>

      {/* ── Edit Appointment Modal ── */}
      <AnimatePresence>
        {editingAppt && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
            onClick={(e) => { if (e.target === e.currentTarget) setEditingAppt(null); }}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="bg-zinc-900 border border-white/10 p-6 w-full max-w-md shadow-2xl"
            >
              <h3 className="font-display font-black uppercase text-xl mb-1 text-light-gray">Editar Turno</h3>
              <p className="text-charcoal text-xs uppercase font-bold mb-6">
                {editingAppt && format(editingAppt.startTime.toDate(), "EEEE dd/MM 'a las' HH:mm 'hs'", { locale: es })}
              </p>

              <div className="space-y-4">
                {/* Nombre */}
                <div>
                  <label className="block text-[10px] font-black uppercase text-charcoal mb-1">Nombre del Cliente</label>
                  <input
                    type="text"
                    value={editForm.customerName}
                    onChange={(e) => setEditForm({ ...editForm, customerName: e.target.value })}
                    className="w-full bg-black border border-white/10 px-3 py-2 text-sm text-light-gray focus:border-gold outline-none transition-colors"
                  />
                </div>

                {/* Teléfono */}
                <div>
                  <label className="block text-[10px] font-black uppercase text-charcoal mb-1">Teléfono</label>
                  <input
                    type="tel"
                    value={editForm.customerPhone}
                    onChange={(e) => setEditForm({ ...editForm, customerPhone: e.target.value })}
                    className="w-full bg-black border border-white/10 px-3 py-2 text-sm text-light-gray focus:border-gold outline-none transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-black uppercase text-charcoal mb-1">Fecha de Nacimiento</label>
                  <input
                    type="date"
                    value={editForm.customerBirthdate}
                    onChange={(e) => setEditForm({ ...editForm, customerBirthdate: e.target.value })}
                    className="w-full bg-black border border-white/10 px-3 py-2 text-sm text-light-gray focus:border-gold outline-none transition-colors"
                  />
                </div>

                {/* Servicio */}
                <div>
                  <label className="block text-[10px] font-black uppercase text-charcoal mb-1">Tipo de Servicio</label>
                  <div className="grid grid-cols-3 gap-2">
                    {['Corte', 'Corte y Barba', 'Barba'].map(svc => (
                      <button
                        key={svc}
                        type="button"
                        onClick={() => setEditForm({ ...editForm, service: svc })}
                        className={`py-2 px-2 text-[10px] font-black uppercase border transition-all ${
                          editForm.service === svc
                            ? 'bg-gold border-gold text-white'
                            : 'bg-black border-white/10 text-charcoal hover:border-white/30'
                        }`}
                      >
                        {svc}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Precio personalizado */}
                <div>
                  <label className="block text-[10px] font-black uppercase text-charcoal mb-1">
                    Precio Personalizado <span className="text-white/20 normal-case">(dejar vacío = precio estándar)</span>
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-charcoal font-bold text-sm">$</span>
                    <input
                      type="number"
                      min="0"
                      value={editForm.customPrice}
                      onChange={(e) => setEditForm({ ...editForm, customPrice: e.target.value })}
                      placeholder={String(services.find(s => s.name === editForm.service)?.price ?? '')}
                      className="w-full bg-black border border-white/10 pl-7 pr-3 py-2 text-sm text-light-gray focus:border-gold outline-none transition-colors"
                    />
                  </div>
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={handleSaveEditAppointment}
                  className="flex-1 bg-gold py-3 font-display font-bold uppercase tracking-widest text-sm hover:bg-gold/80 transition-all"
                >
                  Guardar Cambios
                </button>
                <button
                  onClick={() => setEditingAppt(null)}
                  className="px-6 py-3 border border-white/10 font-bold uppercase text-xs text-charcoal hover:border-white/30 hover:text-white transition-all"
                >
                  Cancelar
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {completingAppt && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
            onClick={(e) => { if (e.target === e.currentTarget) setCompletingAppt(null); }}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="bg-zinc-900 border border-white/10 p-6 w-full max-w-sm shadow-2xl"
            >
              <h3 className="font-display font-black uppercase text-xl mb-1 text-light-gray">Registrar Cobro</h3>
              <p className="text-charcoal text-xs uppercase font-bold mb-6">
                Turno de {completingAppt.customerName} a las {format(completingAppt.startTime.toDate(), "HH:mm 'hs'")}
              </p>

              <div className="space-y-4">
                <div>
                  <label className="block text-[10px] font-black uppercase text-charcoal mb-1">Precio Cobrado ($)</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-charcoal font-bold text-sm">$</span>
                    <input
                      type="number"
                      min="0"
                      value={completingPrice}
                      onChange={(e) => setCompletingPrice(e.target.value)}
                      placeholder="Ingrese el monto cobrado"
                      className="w-full bg-black border border-white/10 pl-7 pr-3 py-2 text-sm text-light-gray focus:border-gold outline-none transition-colors"
                    />
                  </div>
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={handleCompleteAppointment}
                  disabled={loading}
                  className="flex-1 bg-gold py-3 font-display font-bold uppercase tracking-widest text-sm hover:bg-gold/80 transition-all disabled:opacity-50"
                >
                  Confirmar Cobro
                </button>
                <button
                  onClick={() => setCompletingAppt(null)}
                  className="px-5 py-3 border border-white/10 font-bold uppercase text-xs text-charcoal hover:border-white/30 hover:text-white transition-all"
                >
                  Cancelar
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {fixedCancelAppt && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
            onClick={(e) => { if (e.target === e.currentTarget) setFixedCancelAppt(null); }}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="bg-zinc-900 border border-white/10 p-6 w-full max-w-md shadow-2xl rounded-md"
            >
              <h3 className="font-display font-black uppercase text-xl mb-2 text-light-gray">Cancelar Turno Fijo</h3>
              <p className="text-charcoal text-xs uppercase font-bold mb-6">
                Turno de {fixedCancelAppt.customerName} - {format(fixedCancelAppt.startTime.toDate(), "EEEE dd/MM 'a las' HH:mm 'hs'", { locale: es })}
              </p>

              <div className="space-y-3">
                <button
                  onClick={async () => {
                    const appt = fixedCancelAppt;
                    setFixedCancelAppt(null);
                    await executeCancelSingle(appt);
                  }}
                  className="w-full rounded-full bg-zinc-800 hover:bg-zinc-700 text-white font-display font-bold uppercase tracking-widest text-[10px] py-3.5 border border-white/10 transition-all text-center cursor-pointer hover:scale-[1.01] active:scale-95"
                >
                  Cancelar solo este turno (esta semana)
                </button>
                <button
                  onClick={async () => {
                    const appt = fixedCancelAppt;
                    setFixedCancelAppt(null);
                    await executeCancelSeries(appt);
                  }}
                  className="w-full rounded-full bg-gold hover:bg-gold-hover text-neutral-900 font-display font-bold uppercase tracking-widest text-[10px] py-3.5 transition-all text-center cursor-pointer hover:scale-[1.01] active:scale-95 shadow-md shadow-gold/10"
                >
                  Cancelar toda la serie (futuros)
                </button>
                <button
                  onClick={() => setFixedCancelAppt(null)}
                  className="w-full rounded-full bg-transparent hover:bg-white/5 text-charcoal hover:text-white font-display font-bold uppercase tracking-widest text-[10px] py-3.5 border border-white/10 transition-all text-center cursor-pointer active:scale-95"
                >
                  Volver / No cancelar
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {fixedRescheduleAppt && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
            onClick={(e) => { if (e.target === e.currentTarget) setFixedRescheduleAppt(null); }}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="bg-zinc-900 border border-white/10 p-6 w-full max-w-md shadow-2xl rounded-md"
            >
              <h3 className="font-display font-black uppercase text-xl mb-2 text-light-gray">Reprogramar Turno Fijo</h3>
              <p className="text-charcoal text-xs uppercase font-bold mb-6">
                Turno de {fixedRescheduleAppt.customerName} - {format(fixedRescheduleAppt.startTime.toDate(), "EEEE dd/MM 'a las' HH:mm 'hs'", { locale: es })}
              </p>

              <div className="space-y-3">
                <button
                  onClick={() => {
                    const appt = fixedRescheduleAppt;
                    setFixedRescheduleAppt(null);
                    
                    const b = barbers.find(barber => barber.id === appt.barberId);
                    setSelectedBarber(b || null);
                    setSelectedService(services.find(s => s.name === appt.service) || null);
                    setCustomerInfo({ name: appt.customerName, phone: appt.customerPhone, birthdate: appt.customerBirthdate || '' });
                    setReschedulingApptId(appt.id);
                    setRescheduleOption('single');
                    setIsFixedAppointment(false); // only rescheduling this single week instance
                    setSelectedDate(startOfDay(new Date()));
                    setSelectedTime(null);
                    setStep(3); // Go to date selection
                    setBookingTab('agendar');
                  }}
                  className="w-full rounded-full bg-zinc-800 hover:bg-zinc-700 text-white font-display font-bold uppercase tracking-widest text-[10px] py-3.5 border border-white/10 transition-all text-center cursor-pointer hover:scale-[1.01] active:scale-95"
                >
                  Reprogramar solo este turno (esta semana)
                </button>
                <button
                  onClick={() => {
                    const appt = fixedRescheduleAppt;
                    setFixedRescheduleAppt(null);
                    
                    const b = barbers.find(barber => barber.id === appt.barberId);
                    setSelectedBarber(b || null);
                    setSelectedService(services.find(s => s.name === appt.service) || null);
                    setCustomerInfo({ name: appt.customerName, phone: appt.customerPhone, birthdate: appt.customerBirthdate || '' });
                    setReschedulingApptId(appt.id);
                    setRescheduleOption('series');
                    setIsFixedAppointment(true); // rescheduling the entire series
                    setFixedInterval('weekly'); // default or we can keep weekly/biweekly if known
                    setSelectedDate(startOfDay(new Date()));
                    setSelectedTime(null);
                    setStep(3); // Go to date selection
                    setBookingTab('agendar');
                  }}
                  className="w-full rounded-full bg-gold hover:bg-gold-hover text-neutral-900 font-display font-bold uppercase tracking-widest text-[10px] py-3.5 transition-all text-center cursor-pointer hover:scale-[1.01] active:scale-95 shadow-md shadow-gold/10"
                >
                  Reprogramar toda la serie (futuros)
                </button>
                <button
                  onClick={() => setFixedRescheduleAppt(null)}
                  className="w-full rounded-full bg-transparent hover:bg-white/5 text-charcoal hover:text-white font-display font-bold uppercase tracking-widest text-[10px] py-3.5 border border-white/10 transition-all text-center cursor-pointer active:scale-95"
                >
                  Volver / No reprogramar
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {/* ── Courtesy Drink Modal ── */}
        {isDrinkModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
            onClick={(e) => { if (e.target === e.currentTarget) { setIsDrinkModalOpen(false); setEditingDrinkId(null); } }}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="bg-zinc-900 border border-white/10 p-6 w-full max-w-md shadow-2xl relative rounded-md"
            >
              <button
                onClick={() => { setIsDrinkModalOpen(false); setEditingDrinkId(null); }}
                className="absolute top-4 right-4 text-charcoal hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>

              <h3 className="font-display font-black uppercase text-xl mb-4 text-light-gray">
                {editingDrinkId ? 'Editar Bebida' : 'Agregar Nueva Bebida'}
              </h3>

              <form 
                onSubmit={editingDrinkId ? handleEditDrinkSubmit : handleNewDrinkSubmit} 
                className="space-y-4"
              >
                <div className="space-y-2">
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-charcoal">Nombre de la Bebida</label>
                  <input
                    type="text"
                    required
                    value={editingDrinkId ? editingDrinkForm.name : newDrink.name}
                    onChange={(e) => {
                      if (editingDrinkId) {
                        setEditingDrinkForm({ ...editingDrinkForm, name: e.target.value });
                      } else {
                        setNewDrink({ ...newDrink, name: e.target.value });
                      }
                    }}
                    className="w-full bg-zinc-950 border border-white/10 px-4 py-3 text-light-gray font-display font-bold uppercase focus:outline-none focus:border-gold"
                    placeholder="Ej. CERVEZA CORONA, CAFE, COLA..."
                  />
                </div>
                
                <div className="space-y-2">
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-charcoal">Categoría</label>
                  <select
                    value={editingDrinkId ? editingDrinkForm.category : newDrink.category}
                    onChange={(e) => {
                      if (editingDrinkId) {
                        setEditingDrinkForm({ ...editingDrinkForm, category: e.target.value as any });
                      } else {
                        setNewDrink({ ...newDrink, category: e.target.value as any });
                      }
                    }}
                    className="w-full bg-zinc-950 border border-white/10 px-4 py-3 text-light-gray font-display font-bold focus:outline-none focus:border-gold"
                  >
                    <option value="cafeteria">☕ Cafetería</option>
                    <option value="alcohol">🍺 Bebida con Alcohol</option>
                    <option value="sin_alcohol">🥤 Bebida sin Alcohol</option>
                  </select>
                </div>

                <div className="flex gap-3 pt-4 border-t border-white/5">
                  <button
                    type="submit"
                    disabled={drinksLoading}
                    className="w-full rounded-full bg-gold hover:bg-gold-hover text-neutral-900 py-3 font-display font-bold uppercase tracking-widest text-xs shadow-md shadow-gold/10 transition-all duration-300 disabled:opacity-50 cursor-pointer"
                  >
                    {drinksLoading ? 'Guardando...' : editingDrinkId ? 'Guardar Cambios' : 'Guardar Bebida'}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}

        {/* ── Services Modal ── */}
        {isServiceModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
            onClick={(e) => { if (e.target === e.currentTarget) { setIsServiceModalOpen(false); setEditingServiceId(null); } }}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="bg-zinc-900 border border-white/10 p-6 w-full max-w-md shadow-2xl relative rounded-md"
            >
              <button
                onClick={() => { setIsServiceModalOpen(false); setEditingServiceId(null); }}
                className="absolute top-4 right-4 text-charcoal hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>

              <h3 className="font-display font-black uppercase text-xl mb-4 text-light-gray">
                {editingServiceId ? 'Editar Servicio' : 'Agregar Nuevo Servicio'}
              </h3>

              <form 
                onSubmit={editingServiceId ? handleEditServiceSubmit : handleNewServiceSubmit} 
                className="space-y-4"
              >
                <div className="space-y-2">
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-charcoal">Nombre del Servicio</label>
                  <input
                    type="text"
                    required
                    value={editingServiceId ? editingServiceForm.name : newService.name}
                    onChange={(e) => {
                      if (editingServiceId) {
                        setEditingServiceForm({ ...editingServiceForm, name: e.target.value });
                      } else {
                        setNewService({ ...newService, name: e.target.value });
                      }
                    }}
                    className="w-full bg-zinc-950 border border-white/10 px-4 py-3 text-light-gray font-display font-bold uppercase focus:outline-none focus:border-gold"
                    placeholder="Ej. Corte de Pelo, Perfilado de Barba..."
                  />
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-charcoal">Duración (minutos)</label>
                    <input
                      type="number"
                      required
                      min="1"
                      value={editingServiceId ? editingServiceForm.duration : newService.duration}
                      onChange={(e) => {
                        if (editingServiceId) {
                          setEditingServiceForm({ ...editingServiceForm, duration: Number(e.target.value) });
                        } else {
                          setNewService({ ...newService, duration: Number(e.target.value) });
                        }
                      }}
                      className="w-full bg-zinc-950 border border-white/10 px-4 py-3 text-light-gray font-display font-bold focus:outline-none focus:border-gold"
                      placeholder="30"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-charcoal">Precio ($)</label>
                    <input
                      type="number"
                      required
                      min="0"
                      value={editingServiceId ? editingServiceForm.price : newService.price}
                      onChange={(e) => {
                        if (editingServiceId) {
                          setEditingServiceForm({ ...editingServiceForm, price: e.target.value });
                        } else {
                          setNewService({ ...newService, price: e.target.value });
                        }
                      }}
                      className="w-full bg-zinc-950 border border-white/10 px-4 py-3 text-gold font-display font-bold focus:outline-none focus:border-gold"
                      placeholder="8000"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-charcoal">Descripción (Opcional)</label>
                  <textarea
                    value={editingServiceId ? editingServiceForm.desc : newService.desc}
                    onChange={(e) => {
                      if (editingServiceId) {
                        setEditingServiceForm({ ...editingServiceForm, desc: e.target.value });
                      } else {
                        setNewService({ ...newService, desc: e.target.value });
                      }
                    }}
                    className="w-full bg-zinc-950 border border-white/10 px-4 py-3 text-light-gray font-display font-bold focus:outline-none focus:border-gold resize-none"
                    placeholder="Detalles sobre lo que incluye el servicio..."
                    rows={3}
                  />
                </div>

                <div className="flex gap-3 pt-4 border-t border-white/5">
                  <button
                    type="submit"
                    disabled={savingPrices}
                    className="w-full rounded-full bg-gold hover:bg-gold-hover text-neutral-900 py-3 font-display font-bold uppercase tracking-widest text-xs shadow-md shadow-gold/10 transition-all duration-300 disabled:opacity-50 cursor-pointer"
                  >
                    {savingPrices ? 'Guardando...' : editingServiceId ? 'Guardar Cambios' : 'Agregar Servicio'}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}

        {/* ── Product Catalog Modal ── */}
        {isProductModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
            onClick={(e) => { if (e.target === e.currentTarget) { setIsProductModalOpen(false); setEditingProductId(null); } }}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="bg-zinc-900 border border-white/10 p-6 w-full max-w-md shadow-2xl relative rounded-md"
            >
              <button
                onClick={() => { setIsProductModalOpen(false); setEditingProductId(null); }}
                className="absolute top-4 right-4 text-charcoal hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>

              <h3 className="font-display font-black uppercase text-xl mb-4 text-light-gray">
                {editingProductId ? 'Editar Producto' : 'Agregar Nuevo Producto'}
              </h3>

              <form onSubmit={editingProductId ? handleEditProductSubmit : handleNewProductSubmit} className="space-y-4">
                <div className="space-y-2">
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-charcoal">Nombre del Producto</label>
                  <input
                    type="text"
                    required
                    value={editingProductId ? editingProductForm.name : newProduct.name}
                    onChange={(e) => {
                      if (editingProductId) {
                        setEditingProductForm({ ...editingProductForm, name: e.target.value });
                      } else {
                        setNewProduct({ ...newProduct, name: e.target.value });
                      }
                    }}
                    className="w-full bg-zinc-950 border border-white/10 px-4 py-3 text-light-gray font-display font-bold uppercase focus:outline-none focus:border-gold"
                    placeholder="Ej. CERA MATTE CLAY"
                  />
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-charcoal">Precio (Con símbolo)</label>
                    <input
                      type="text"
                      required
                      value={editingProductId ? editingProductForm.price : newProduct.price}
                      onChange={(e) => {
                        if (editingProductId) {
                          setEditingProductForm({ ...editingProductForm, price: e.target.value });
                        } else {
                          setNewProduct({ ...newProduct, price: e.target.value });
                        }
                      }}
                      className="w-full bg-zinc-950 border border-white/10 px-4 py-3 text-light-gray font-display font-bold focus:outline-none focus:border-gold"
                      placeholder="Ej. $12.000"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-charcoal">Etiqueta / Tag</label>
                    <input
                      type="text"
                      required
                      value={editingProductId ? editingProductForm.tag : newProduct.tag}
                      onChange={(e) => {
                        if (editingProductId) {
                          setEditingProductForm({ ...editingProductForm, tag: e.target.value });
                        } else {
                          setNewProduct({ ...newProduct, tag: e.target.value });
                        }
                      }}
                      className="w-full bg-zinc-950 border border-white/10 px-4 py-3 text-light-gray font-display font-bold uppercase focus:outline-none focus:border-gold"
                      placeholder="Ej. [ FIX ], [ SHINE ]"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-charcoal">Foto del Producto</label>
                  <div className="flex gap-4 items-center">
                    <button
                      type="button"
                      onClick={() => productFileInputRef.current?.click()}
                      className="px-4 py-3 bg-zinc-950 hover:bg-zinc-800 text-charcoal hover:text-white border border-white/10 transition-colors text-xs font-bold uppercase tracking-widest cursor-pointer w-full text-left"
                    >
                      {editingProductId 
                        ? (editingProductForm.img ? '✓ Foto Seleccionada' : 'Seleccionar Archivo...')
                        : (newProduct.img ? '✓ Foto Seleccionada' : 'Seleccionar Archivo...')}
                    </button>
                    <input
                      type="file"
                      ref={productFileInputRef}
                      accept="image/*"
                      onChange={handleProductFileChange}
                      className="hidden"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-charcoal">Descripción Corta</label>
                  <textarea
                    required
                    rows={2}
                    value={editingProductId ? editingProductForm.desc : newProduct.desc}
                    onChange={(e) => {
                      if (editingProductId) {
                        setEditingProductForm({ ...editingProductForm, desc: e.target.value });
                      } else {
                        setNewProduct({ ...newProduct, desc: e.target.value });
                      }
                    }}
                    className="w-full bg-zinc-950 border border-white/10 px-4 py-3 text-light-gray font-sans focus:outline-none focus:border-gold resize-none"
                    placeholder="Ej. Fijación fuerte con acabado mate natural..."
                  />
                </div>

                {((editingProductId && editingProductForm.img) || (!editingProductId && newProduct.img)) && (
                  <div className="mt-2 flex items-center gap-3 bg-black/20 p-2 border border-white/5 rounded-sm">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-charcoal">Vista previa:</p>
                    <img 
                      src={editingProductId ? editingProductForm.img : newProduct.img} 
                      alt="Preview" 
                      className="h-12 w-auto object-contain border border-white/10" 
                    />
                  </div>
                )}

                <div className="flex gap-3 pt-4 border-t border-white/5">
                  <button
                    type="submit"
                    disabled={catalogLoading}
                    className="w-full rounded-full bg-gold hover:bg-gold-hover text-neutral-900 py-3 font-display font-bold uppercase tracking-widest text-xs shadow-md shadow-gold/10 transition-all duration-300 disabled:opacity-50 cursor-pointer"
                  >
                    {catalogLoading ? 'Guardando...' : editingProductId ? 'Guardar Cambios' : 'Guardar Producto'}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};
