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
  getDocs,
  updateDoc,
  orderBy,
  writeBatch,
  deleteDoc
} from 'firebase/firestore';
import { db, auth } from '../firebase';
import { BARBERS as INITIAL_BARBERS, SERVICES, handleFirestoreError, OperationType, clearAppointments, addBarber, deleteBarber, updateBarber, getShopSettings, updateShopSettings, DEFAULT_SCHEDULE } from '../lib/firestore';
import { format, addMinutes, startOfDay, endOfDay, isBefore, isAfter, parseISO, setHours, setMinutes, eachMinuteOfInterval, isSameDay, eachDayOfInterval, getDay, startOfWeek, endOfWeek, addDays, addMonths, startOfMonth, endOfMonth } from 'date-fns';
import { es } from 'date-fns/locale';
import { motion, AnimatePresence } from 'framer-motion';
import { Calendar as CalendarIcon, Clock, User, Scissors, CheckCircle2, AlertCircle, ChevronLeft, ChevronRight, LogIn, LogOut, Trash2, RefreshCcw, Database, Edit2, Phone } from 'lucide-react';
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
}

// --- Booking System Component ---
export const BookingSystem = () => {
  const [step, setStep] = useState(1);
  const [selectedBarber, setSelectedBarber] = useState<Barber | null>(null);
  const [selectedService, setSelectedService] = useState<any>(null);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [selectedTimesForBlocking, setSelectedTimesForBlocking] = useState<string[]>([]);
  const [customerInfo, setCustomerInfo] = useState({ name: '', phone: '' });
  const [isFixedAppointment, setIsFixedAppointment] = useState(false);
  const [fixedInterval, setFixedInterval] = useState<'weekly' | 'biweekly'>('weekly');
  const [appointments, setAppointments] = useState<any[]>([]);
  const [reschedulingApptId, setReschedulingApptId] = useState<string | null>(null);
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
  const [isJose, setIsJose] = useState(false);
  const [barbers, setBarbers] = useState<Barber[]>([]);
  const [activeAdminTab, setActiveAdminTab] = useState<'agenda' | 'barberos' | 'horarios' | 'agendar' | 'finanzas'>('agenda');
  const [newBarber, setNewBarber] = useState({ name: '', email: '', photo: '', role: 'barber' });
  const [editingBarberId, setEditingBarberId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [shopSettings, setShopSettings] = useState<any>({ schedule: DEFAULT_SCHEDULE });

  // Mis Turnos State
  const [bookingTab, setBookingTab] = useState<'agendar' | 'mis-turnos'>('agendar');
  const [searchPhone, setSearchPhone] = useState('');
  const [myAppointments, setMyAppointments] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Edit Appointment Modal State
  const [editingAppt, setEditingAppt] = useState<any | null>(null);
  const [editForm, setEditForm] = useState({ customerName: '', customerPhone: '', service: '', customPrice: '' });

  // Finanzas State
  const [finanzasDate, setFinanzasDate] = useState(new Date());
  const [finanzasAppts, setFinanzasAppts] = useState<any[]>([]);
  const [finanzasViewMode, setFinanzasViewMode] = useState<'daily' | 'weekly' | 'monthly'>('daily');
  const finanzasDatePickerRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getShopSettings().then((settings: any) => {
      setShopSettings(settings);
    });
  }, []);

  // Fetch Barbers from Firestore
  useEffect(() => {
    const q = query(collection(db, 'barbers'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const adminEmails = ['leoneldariogarcia@gmail.com', 'jhbarber87@gmail.com', 'resetart.barber@gmail.com'];
      const barbersData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Barber));

      // Sort: Admin (Jose) first, then others by name
      const sortedBarbers = barbersData.sort((a, b) => {
        const aName = a.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const bName = b.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

        if (adminEmails.includes(a.email)) return -1;
        if (adminEmails.includes(b.email)) return 1;

        // Fallback to name if email doesn't match
        if (aName.includes('jose')) return -1;
        if (bName.includes('jose')) return 1;

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
        const adminEmails = ['leoneldariogarcia@gmail.com', 'jhbarber87@gmail.com', 'resetart.barber@gmail.com'];
        const isJoseUser = adminEmails.includes(u.email || '');
        setIsJose(isJoseUser);

        // Check if user is a barber in the dynamic list
        const barber = barbers.find(b => b.email === u.email);
        if (barber || isJoseUser) {
          setIsBarberAdmin(true);
          // If not Jose, auto-select the barber
          if (!isJoseUser && barber && !selectedBarber) {
            setSelectedBarber(barber);
          }
        } else {
          setIsBarberAdmin(false);
        }
      } else {
        setIsBarberAdmin(false);
        setIsJose(false);
      }
    });
    return unsubscribe;
  }, [barbers]);

  useEffect(() => {
    if (!selectedBarber) return;

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
    if (!isJose || activeAdminTab !== 'finanzas') return;
    
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
  }, [finanzasDate, isJose, activeAdminTab, finanzasViewMode]);

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

  const getAvailableSlots = () => {
    if (!selectedBarber || !selectedService) return [];

    const dayOfWeek = getDay(selectedDate);
    const daySchedule = shopSettings?.schedule?.[dayOfWeek] || DEFAULT_SCHEDULE[dayOfWeek as keyof typeof DEFAULT_SCHEDULE];
    if (!daySchedule.isOpen) return [];

    const slots = [];
    const [startH, startM] = daySchedule.start.split(':').map(Number);
    const [endH, endM] = daySchedule.end.split(':').map(Number);

    const startTime = setMinutes(setHours(startOfDay(selectedDate), startH), startM);
    const endTime = setMinutes(setHours(startOfDay(selectedDate), endH), endM);

    const interval = eachMinuteOfInterval({
      start: startTime,
      end: endTime
    }, { step: 30 });

    for (const time of interval) {
      const slotStart = time;
      const slotEnd = addMinutes(time, selectedService.duration);

      if (isBefore(slotStart, new Date())) continue;

      // Check if slot is occupied by appointment or block
      const isOccupied = appointments.some(appt => {
        const apptStart = appt.startTime.toDate();
        const apptEnd = appt.endTime.toDate();
        return (isBefore(slotStart, apptEnd) && isAfter(slotEnd, apptStart));
      }) || blocks.some(block => {
        const blockStart = block.startTime.toDate();
        const blockEnd = block.endTime.toDate();
        return (isBefore(slotStart, blockEnd) && isAfter(slotEnd, blockStart));
      });

      // Special validation for 60 min services: must have 2 consecutive 30 min slots
      if (selectedService.duration === 60) {
        const midPoint = addMinutes(slotStart, 30);
        const isMidOccupied = appointments.some(appt => {
          const apptStart = appt.startTime.toDate();
          const apptEnd = appt.endTime.toDate();
          return (isBefore(midPoint, apptEnd) && isAfter(addMinutes(midPoint, 30), apptStart));
        }) || blocks.some(block => {
          const blockStart = block.startTime.toDate();
          const blockEnd = block.endTime.toDate();
          return (isBefore(midPoint, blockEnd) && isAfter(addMinutes(midPoint, 30), blockStart));
        });

        if (!isOccupied && !isMidOccupied && isBefore(slotEnd, addMinutes(endTime, 1))) {
          slots.push(format(slotStart, 'HH:mm'));
        }
      } else {
        if (!isOccupied && isBefore(slotEnd, addMinutes(endTime, 1))) {
          slots.push(format(slotStart, 'HH:mm'));
        }
      }
    }

    return slots;
  };

  const handleSearchAppointments = async (e?: any) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!searchPhone) return;
    setIsSearching(true);
    try {
      const q = query(
        collection(db, 'appointments'),
        where('customerPhone', '==', searchPhone),
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
    if (!selectedBarber || !selectedService || !selectedTime || !customerInfo.name || !customerInfo.phone) return;

    setLoading(true);
    setError(null);

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

        // Si estamos reprogramando, cancelamos el turno anterior
        if (reschedulingApptId) {
          batch.update(doc(db, 'appointments', reschedulingApptId), { status: 'cancelled' });
        }

        let currentStartTime = baseStartTime;
        let currentEndTime = baseEndTime;
        const intervalDays = fixedInterval === 'weekly' ? 7 : 14;

        while (isBefore(currentStartTime, endDate) || isSameDay(currentStartTime, endDate)) {
          // Check availability
          const q = query(
            collection(db, 'appointments'),
            where('barberId', '==', selectedBarber.id),
            where('startTime', '>=', Timestamp.fromDate(startOfDay(currentStartTime))),
            where('startTime', '<=', Timestamp.fromDate(endOfDay(currentStartTime))),
            where('status', '==', 'confirmed')
          );
          const snapshot = await getDocs(q);
          const existingAppts = snapshot.docs.map(d => d.data());
          
          const isOccupied = existingAppts.some(appt => {
            const apptStart = (appt as any).startTime.toDate();
            const apptEnd = (appt as any).endTime.toDate();
            return (isBefore(currentStartTime, apptEnd) && isAfter(currentEndTime, apptStart));
          });

          if (!isOccupied) {
            const apptRef = doc(collection(db, 'appointments'));
            batch.set(apptRef, {
              barberId: selectedBarber.id,
              customerName: customerInfo.name,
              customerPhone: customerInfo.phone,
              service: selectedService.name,
              startTime: Timestamp.fromDate(currentStartTime),
              endTime: Timestamp.fromDate(currentEndTime),
              status: 'confirmed',
              createdAt: Timestamp.now(),
              isFixed: true,
              groupId: groupId
            });
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
          // Double check availability inside transaction for concurrency control
          const q = query(
            collection(db, 'appointments'),
            where('barberId', '==', selectedBarber.id),
            where('startTime', '>=', Timestamp.fromDate(startOfDay(selectedDate))),
            where('startTime', '<=', Timestamp.fromDate(endOfDay(selectedDate))),
            where('status', '==', 'confirmed')
          );
          const snapshot = await getDocs(q);
          const existingAppts = snapshot.docs.map(d => d.data());

          const isOccupied = existingAppts.some(appt => {
            const apptStart = (appt as any).startTime.toDate();
            const apptEnd = (appt as any).endTime.toDate();
            return (isBefore(baseStartTime, apptEnd) && isAfter(baseEndTime, apptStart));
          });

          if (isOccupied) {
            throw new Error('Turno ya ocupado. Por favor elige otro horario.');
          }

          const apptRef = doc(collection(db, 'appointments'));
          transaction.set(apptRef, {
            barberId: selectedBarber.id,
            customerName: customerInfo.name,
            customerPhone: customerInfo.phone,
            service: selectedService.name,
            startTime: Timestamp.fromDate(baseStartTime),
            endTime: Timestamp.fromDate(baseEndTime),
            status: 'confirmed',
            createdAt: Timestamp.now()
          });

          // Si estamos reprogramando, cancelamos el turno anterior
          if (reschedulingApptId) {
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
      setStep(5);
      setReschedulingApptId(null);
    } catch (err: any) {
      setError(err.message || 'Error al agendar el turno.');
      handleFirestoreError(err, OperationType.WRITE, 'appointments');
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
      const isSeries = window.confirm(
        'Este es un turno fijo semanal.\n\n¿Deseas cancelar TODA LA SERIE de turnos futuros?\n(Haz clic en Aceptar para cancelar todos, o Cancelar para la siguiente opción)'
      );
      if (isSeries) {
        try {
          setLoading(true);
          const q = query(
            collection(db, 'appointments'),
            where('groupId', '==', appt.groupId),
            where('startTime', '>=', appt.startTime)
          );
          const snapshot = await getDocs(q);
          const batch = writeBatch(db);
          snapshot.docs.forEach(d => {
             batch.update(d.ref, { status: 'cancelled' });
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
        return;
      } else {
        const isSingle = window.confirm('¿Deseas cancelar SOLO ESTE turno?');
        if (!isSingle) return;
      }
    } else {
      if (!window.confirm('¿Estás seguro de que deseas cancelar este turno?')) return;
    }

    try {
      const apptRef = doc(db, 'appointments', appt.id);
      await updateDoc(apptRef, { status: 'cancelled' });
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

      if (searchPhone && bookingTab === 'mis-turnos') {
        const e = new Event('submit') as any;
        handleSearchAppointments(e);
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, 'appointments');
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

  const handleSaveEditAppointment = async () => {
    if (!editingAppt) return;
    try {
      const apptRef = doc(db, 'appointments', editingAppt.id);
      const updates: any = {
        customerName: editForm.customerName.trim(),
        customerPhone: editForm.customerPhone.trim(),
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
          const daySchedule = shopSettings?.schedule?.[dayOfWeek] || DEFAULT_SCHEDULE[dayOfWeek as keyof typeof DEFAULT_SCHEDULE];
          
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
      const batch = writeBatch(db);
      const datesToBlock = isRangeMode && blockingEndDate
        ? eachDayOfInterval({ start: startOfDay(adminDate), end: startOfDay(blockingEndDate) })
        : [adminDate];

      const cancelledAppointments: any[] = [];

      for (const date of datesToBlock) {
        const start = startOfDay(date);
        const end = endOfDay(date);
        
        let timesToBlock = selectedTimesForBlocking;
        
        if (isRangeMode && selectedTimesForBlocking.length === 0) {
          const dayOfWeek = getDay(date);
          const daySchedule = shopSettings?.schedule?.[dayOfWeek] || DEFAULT_SCHEDULE[dayOfWeek as keyof typeof DEFAULT_SCHEDULE];
          
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

      // Simulate sending messages
      if (cancelledAppointments.length > 0) {
        const messages = cancelledAppointments.map(appt => {
          const dateStr = format(appt.startTime.toDate(), "eeee d 'de' MMMM", { locale: es });
          const timeStr = format(appt.startTime.toDate(), 'HH:mm');
          return `Mensaje enviado a ${appt.customerName} (${appt.customerPhone}):\n"Hola ${appt.customerName}, lamentamos informarte que tu turno del día ${dateStr} a las ${timeStr} ha sido cancelado por motivos de fuerza mayor. Puedes reprogramar tu turno aquí: ${window.location.origin}"`;
        });
        alert(`Se han bloqueado los horarios y cancelado ${cancelledAppointments.length} turnos.\n\n${messages.join('\n\n')}`);
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

  return (
    <>
    <div ref={containerRef} className="max-w-4xl mx-auto bg-zinc-900/50 border border-white/5 p-6 md:p-10 rounded-sm concrete-texture shadow-2xl">
      <div className="flex justify-between items-center mb-8">
        <h2 className="text-3xl md:text-5xl font-display font-black uppercase tracking-normal text-light-gray">
          {isBarberAdmin ? 'Panel de Gestión' : 'Reserva tu Turno'}
        </h2>
        {user ? (
          <button onClick={handleLogout} className="text-charcoal hover:text-crimson transition-colors flex items-center gap-2 text-xs uppercase font-bold tracking-widest">
            <LogOut className="w-4 h-4" /> Salir
          </button>
        ) : (
          <button onClick={handleLogin} className="text-charcoal hover:text-crimson transition-colors flex items-center gap-2 text-xs uppercase font-bold tracking-widest">
            <LogIn className="w-4 h-4" /> Barber Login
          </button>
        )}
      </div>

      {isBarberAdmin && (
        <div className="space-y-8 mb-8">
          {isJose ? (
            <div className="flex flex-wrap gap-4 border-b border-white/5 pb-4">
              <button
                onClick={() => setActiveAdminTab('agenda')}
                className={`text-xs font-bold uppercase tracking-widest ${activeAdminTab === 'agenda' ? 'text-crimson' : 'text-charcoal'}`}
              >
                Agenda y Bloqueos
              </button>
              <button
                onClick={() => setActiveAdminTab('barberos')}
                className={`text-xs font-bold uppercase tracking-widest ${activeAdminTab === 'barberos' ? 'text-crimson' : 'text-charcoal'}`}
              >
                Gestión de Barberos
              </button>
              <button
                onClick={() => setActiveAdminTab('horarios')}
                className={`text-xs font-bold uppercase tracking-widest ${activeAdminTab === 'horarios' ? 'text-crimson' : 'text-charcoal'}`}
              >
                Horarios de Atención
              </button>
              <button
                onClick={() => setActiveAdminTab('agendar')}
                className={`text-xs font-bold uppercase tracking-widest ${activeAdminTab === 'agendar' ? 'text-crimson' : 'text-charcoal'}`}
              >
                Agendar Turno
              </button>
              <button
                onClick={() => setActiveAdminTab('finanzas')}
                className={`text-xs font-bold uppercase tracking-widest ${activeAdminTab === 'finanzas' ? 'text-crimson' : 'text-charcoal'}`}
              >
                Finanzas
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap gap-4 border-b border-white/5 pb-4">
              <button
                onClick={() => setActiveAdminTab('agenda')}
                className={`text-xs font-bold uppercase tracking-widest ${activeAdminTab === 'agenda' ? 'text-crimson' : 'text-charcoal'}`}
              >
                Agenda y Bloqueos
              </button>
              <button
                onClick={() => setActiveAdminTab('agendar')}
                className={`text-xs font-bold uppercase tracking-widest ${activeAdminTab === 'agendar' ? 'text-crimson' : 'text-charcoal'}`}
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
                  .filter(b => isJose || b.email === user?.email)
                  .map(b => (
                    <button
                      key={b.id}
                      onClick={() => setSelectedBarber(b)}
                      className={`p-4 border ${selectedBarber?.id === b.id ? 'border-crimson bg-crimson/10' : 'border-white/5 bg-black'} transition-all text-left flex items-center gap-4`}
                    >
                      <img src={b.photo} alt={b.name} className="w-12 h-12 rounded-full grayscale object-cover" referrerPolicy="no-referrer" />
                      <span className="font-display font-bold uppercase text-sm">{b.name}</span>
                    </button>
                  ))}
              </div>

              {selectedBarber && (
                <div className="space-y-8">
                  {/* Analytics Dashboard */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-black p-6 border border-white/5 flex flex-col justify-center">
                      <p className="text-charcoal font-bold uppercase tracking-widest text-xs mb-2">Turnos Programados</p>
                      <p className="font-display font-black text-4xl text-light-gray">{adminAppts.length}</p>
                    </div>
                    <div className="bg-black p-6 border border-white/5 flex flex-col justify-center">
                      <p className="text-charcoal font-bold uppercase tracking-widest text-xs mb-2">Ingresos Estimados</p>
                      <p className="font-display font-black text-4xl text-crimson">
                        ${adminAppts.reduce((acc, appt) => {
                          const svc = SERVICES.find(s => s.name === appt.service);
                          return acc + (svc ? svc.price : 0);
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
                            className="font-display font-bold uppercase flex items-center gap-2 hover:text-crimson transition-colors text-xl bg-zinc-900 border border-white/10 px-4 py-2 cursor-pointer select-none"
                            onClick={() => {
                              try { adminDateInputRef.current?.showPicker(); } catch (_) {/* fallback: label activates input natively */}
                            }}
                          >
                            <CalendarIcon className="w-6 h-6 text-crimson flex-shrink-0 pointer-events-none" />
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
                              className="p-2 bg-zinc-800 hover:bg-crimson transition-colors"
                              title="Día Anterior"
                            >
                              <ChevronLeft />
                            </button>
                            <button
                              type="button"
                              onClick={() => { setAdminDate(addMinutes(adminDate, 1440)); setSelectedTimesForBlocking([]); }}
                              className="p-2 bg-zinc-800 hover:bg-crimson transition-colors"
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
                            className="font-display font-bold uppercase flex items-center gap-2 hover:text-crimson transition-colors text-xl bg-zinc-900 border border-white/10 px-4 py-2 cursor-pointer select-none"
                            onClick={() => {
                              try { blockingEndDateInputRef.current?.showPicker(); } catch (_) {}
                            }}
                          >
                            <CalendarIcon className="w-6 h-6 text-crimson flex-shrink-0 pointer-events-none" />
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
                        <label className="flex items-center gap-2 text-xs font-bold uppercase cursor-pointer hover:text-crimson">
                          <input
                            type="checkbox"
                            checked={isRangeMode}
                            onChange={(e) => setIsRangeMode(e.target.checked)}
                            className="accent-crimson"
                          />
                          Rango de días
                        </label>
                        <label className="flex items-center gap-2 text-xs font-bold uppercase cursor-pointer hover:text-crimson">
                          <input
                            type="checkbox"
                            checked={adminViewMode === 'weekly'}
                            onChange={(e) => setAdminViewMode(e.target.checked ? 'weekly' : 'daily')}
                            className="accent-crimson"
                          />
                          Vista Semanal
                        </label>
                      </div>

                      <button
                        onClick={() => {
                          const dayOfWeek = getDay(adminDate);
                          const daySchedule = shopSettings?.schedule?.[dayOfWeek] || DEFAULT_SCHEDULE[dayOfWeek as keyof typeof DEFAULT_SCHEDULE];
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
                          const daySchedule = shopSettings?.schedule?.[dayOfWeek] || DEFAULT_SCHEDULE[dayOfWeek as keyof typeof DEFAULT_SCHEDULE];
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
                          const daySchedule = shopSettings?.schedule?.[dayOfWeek] || DEFAULT_SCHEDULE[dayOfWeek as keyof typeof DEFAULT_SCHEDULE];
                          
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
                                <div className="col-span-full mb-6 p-4 bg-crimson/10 border border-crimson/30">
                                  <h5 className="text-crimson font-bold text-xs uppercase mb-3 flex items-center gap-2">
                                    <AlertCircle className="w-4 h-4" /> Turnos fuera de horario configurado
                                  </h5>
                                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                                    {outOfHoursAppts.map(appt => (
                                      <div key={appt.id} className="bg-crimson/20 border border-crimson p-3 flex flex-col items-center gap-1">
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
                            const appt = adminAppts.find(a => {
                              const aStart = a.startTime.toDate();
                              const aEnd = a.endTime.toDate();
                              return isBefore(slotStart, aEnd) && isAfter(slotEnd, aStart);
                            });
                            const isSelected = selectedTimesForBlocking.includes(tStr);

                            return (
                              <button
                                key={tStr}
                                onClick={() => {
                                  if (isSelected) {
                                    setSelectedTimesForBlocking(selectedTimesForBlocking.filter(t => t !== tStr));
                                  } else {
                                    setSelectedTimesForBlocking([...selectedTimesForBlocking, tStr]);
                                  }
                                }}
                                className={`p-4 text-xs font-bold border transition-all flex flex-col items-center gap-1 min-h-[80px] justify-center relative ${isSelected ? 'scale-105 z-10 shadow-2xl' : ''
                                  } ${isSelected
                                    ? 'bg-white text-black border-white'
                                    : appt
                                      ? 'bg-crimson/20 border-crimson text-crimson'
                                      : block
                                        ? 'bg-zinc-800 border-zinc-700 text-zinc-500'
                                        : 'border-white/5 hover:border-white/20'
                                  }`}
                              >
                                <span className="text-sm">{tStr}</span>
                                {appt && (
                                   <div className="flex flex-col items-center w-full overflow-hidden px-1">
                                     <span className="uppercase text-[9px] font-black truncate w-full text-center">{appt.customerName}</span>
                                     <span className="text-[8px] text-charcoal font-bold">{appt.customerPhone}</span>
                                   </div>
                                 )}
                                {block && <span className="uppercase text-[9px] font-black">Bloqueado</span>}
                                {!appt && !block && <span className="uppercase text-[9px] font-black opacity-30">Libre</span>}
                              </button>
                            );
                              })}
                            </>
                          );
                        })()}
                      </div>

                      {/* Agenda detallada del día */}
                      <div className="mt-8 border-t border-white/5 pt-8">
                        <h4 className="font-display font-bold uppercase text-crimson mb-4 flex items-center gap-2">
                          <Database className="w-4 h-4" /> Agenda de {format(adminDate, 'EEEE dd/MM', { locale: es })}
                        </h4>
                        <div className="space-y-2">
                          {adminAppts.filter((a: any) => isSameDay(a.startTime.toDate(), adminDate))
                            .sort((a: any, b: any) => a.startTime.toMillis() - b.startTime.toMillis())
                            .map((appt: any) => (
                              <div key={appt.id} className="flex justify-between items-center bg-zinc-900/50 p-3 border border-white/5">
                                <div>
                                  <p className="font-bold uppercase text-sm">{appt.customerName}</p>
                                  <p className="text-[10px] text-charcoal">{appt.service}</p>
                                  <a href={`https://wa.me/${appt.customerPhone.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" className="text-[10px] text-crimson font-bold hover:underline">
                                    {appt.customerPhone}
                                  </a>
                                </div>
                                <div className="text-right flex items-center gap-4">
                                  <div className="text-right">
                                    <p className="font-display font-bold text-sm">{format(appt.startTime.toDate(), 'HH:mm')} HS</p>
                                    <p className="text-[10px] text-charcoal uppercase">{Math.round((appt.endTime.toDate() - appt.startTime.toDate()) / 60000)} min</p>
                                  </div>
                                  {Math.round((appt.endTime.toDate() - appt.startTime.toDate()) / 60000) > 30 ? (
                                    <button
                                      onClick={() => handleUpdateDuration(appt, 30)}
                                      className="text-[9px] font-bold uppercase border border-white/5 px-2 py-1 hover:border-crimson hover:text-crimson transition-all"
                                      title="Reducir a 30 minutos para liberar espacio"
                                    >
                                      Acortar a 30m
                                    </button>
                                  ) : (
                                    appt.service === 'Corte y Barba' && (
                                      <button
                                        onClick={() => handleUpdateDuration(appt, 60)}
                                        className="text-[9px] font-bold uppercase border border-white/5 px-2 py-1 hover:border-crimson hover:text-crimson transition-all"
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
                                         customPrice: appt.customPrice != null ? String(appt.customPrice) : ''
                                       });
                                     }}
                                     className="text-charcoal hover:text-white p-2 hover:bg-white/10 transition-colors"
                                     title="Editar turno"
                                   >
                                     <Edit2 className="w-4 h-4" />
                                   </button>
                                   <button onClick={() => handleCancelAppointment(appt)} className="text-crimson p-2 hover:bg-crimson/10 transition-colors">
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
                                <h4 className="font-display font-bold uppercase text-crimson mb-3">{format(day, 'EEEE dd/MM/yyyy', { locale: es })}</h4>
                                {dayAppts.length === 0 ? (
                                  <p className="text-charcoal text-xs uppercase font-bold">Sin turnos</p>
                                ) : (
                                  <div className="space-y-2">
                                    {dayAppts.map(appt => (
                                      <div key={appt.id} className="flex justify-between items-center bg-black p-3 border border-white/5">
                                        <div>
                                          <p className="font-bold uppercase text-sm">{appt.customerName}</p>
                                          <p className="text-xs text-charcoal">{appt.service} {appt.isFixed ? '(FIJO)' : ''}</p>
                                          <a 
                                            href={`https://wa.me/${appt.customerPhone.replace(/\D/g, '')}`} 
                                            target="_blank" 
                                            rel="noopener noreferrer"
                                            className="text-xs text-crimson font-bold hover:underline flex items-center gap-1 mt-1"
                                          >
                                            <Phone className="w-3 h-3" /> {appt.customerPhone}
                                          </a>
                                        </div>
                                        <div className="flex items-center gap-4">
                                          <div className="text-right">
                                            <p className="font-display font-bold text-light-gray">{format(appt.startTime.toDate(), 'HH:mm')} HS</p>
                                            <p className="text-[10px] text-charcoal font-bold uppercase">
                                              {Math.round((appt.endTime.toDate() - appt.startTime.toDate()) / 60000)} min
                                            </p>
                                          </div>
                                          {Math.round((appt.endTime.toDate() - appt.startTime.toDate()) / 60000) > 30 ? (
                                            <button
                                              onClick={() => handleUpdateDuration(appt, 30)}
                                              className="text-[9px] font-bold uppercase border border-white/5 px-2 py-1 hover:border-crimson hover:text-crimson transition-all"
                                              title="Reducir a 30 minutos para liberar espacio"
                                            >
                                              Acortar a 30m
                                            </button>
                                          ) : (
                                            appt.service === 'Corte y Barba' && (
                                              <button
                                                onClick={() => handleUpdateDuration(appt, 60)}
                                                className="text-[9px] font-bold uppercase border border-white/5 px-2 py-1 hover:border-crimson hover:text-crimson transition-all"
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
                                                customPrice: appt.customPrice != null ? String(appt.customPrice) : ''
                                              });
                                            }}
                                            className="text-charcoal hover:text-white p-2 transition-colors border border-white/5 hover:border-white/30"
                                            title="Editar Turno"
                                          >
                                            <Edit2 className="w-4 h-4" />
                                          </button>
                                          <button
                                            onClick={() => handleCancelAppointment(appt)}
                                            className="text-crimson hover:text-white p-2 transition-colors border border-white/5 hover:border-crimson"
                                            title="Cancelar Turno"
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
                    </>
                  )}

                  <div className="flex flex-col md:flex-row gap-4">

                    <button
                        onClick={handleBlockTime}
                        disabled={(!isRangeMode && selectedTimesForBlocking.length === 0) || loading}
                        className="flex-1 bg-crimson py-4 font-display font-bold uppercase tracking-widest disabled:opacity-50 flex items-center justify-center gap-2 hover:bg-crimson/80 transition-all"
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
                  </div>
                </div>
              )}
        </div>
      )}

      {isBarberAdmin && activeAdminTab === 'barberos' && (
        <div className="space-y-6">
              <div className="bg-black p-6 border border-white/5">
                <h3 className="font-display font-bold uppercase mb-6 flex items-center gap-2">
                  <User className="w-5 h-5 text-crimson" /> {editingBarberId ? 'Editar Barbero' : 'Agregar Nuevo Barbero'}
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                  <input
                    type="text"
                    placeholder="Nombre del Barbero"
                    value={newBarber.name}
                    onChange={(e) => setNewBarber({ ...newBarber, name: e.target.value })}
                    className="bg-zinc-900 border border-white/10 p-3 text-sm focus:border-crimson outline-none"
                  />
                  <input
                    type="email"
                    placeholder="Email (para login)"
                    value={newBarber.email}
                    onChange={(e) => setNewBarber({ ...newBarber, email: e.target.value })}
                    className="bg-zinc-900 border border-white/10 p-3 text-sm focus:border-crimson outline-none"
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
                        className="bg-crimson text-white px-4 py-3 text-xs font-bold uppercase tracking-widest hover:bg-crimson/80 transition-all flex-1 text-left flex items-center justify-between shadow-lg shadow-crimson/20"
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
                      } catch (err) {
                        toast.error('Error al guardar barbero.');
                      } finally {
                        setLoading(false);
                      }
                    }}
                    disabled={loading}
                    className="flex-1 bg-white text-black py-3 font-display font-bold uppercase tracking-widest hover:bg-crimson hover:text-white transition-all disabled:opacity-50"
                  >
                    {loading ? 'Guardando...' : editingBarberId ? 'Actualizar Barbero' : 'Guardar Barbero'}
                  </button>
                  {editingBarberId && (
                    <button
                      onClick={() => {
                        setEditingBarberId(null);
                        setNewBarber({ name: '', email: '', photo: '', role: 'barber' });
                      }}
                      className="px-6 bg-zinc-800 text-white py-3 font-display font-bold uppercase tracking-widest hover:bg-zinc-700 transition-all"
                    >
                      Cancelar
                    </button>
                  )}
                </div>
              </div>

              <div className="bg-black p-6 border border-white/5">
                <h3 className="font-display font-bold uppercase mb-6 flex items-center gap-2">
                  <Database className="w-5 h-5 text-crimson" /> Barberos Actuales
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
                            containerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                          }}
                          className="text-charcoal hover:text-white p-2 transition-colors"
                          title="Editar Barbero"
                        >
                          <Edit2 className="w-5 h-5" />
                        </button>
                        {!['leoneldariogarcia@gmail.com', 'jhbarber87@gmail.com', 'resetart.barber@gmail.com'].includes(b.email) && (
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
                            className="text-charcoal hover:text-crimson p-2 transition-colors"
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
                  <Clock className="w-5 h-5 text-crimson" /> Horarios de Atención Generales
                </h3>
                <div className="space-y-4">
                  {['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'].map((dayName, index) => {
                    const daySchedule = shopSettings?.schedule?.[index] || DEFAULT_SCHEDULE[index as keyof typeof DEFAULT_SCHEDULE];
                    return (
                      <div key={index} className="flex items-center gap-4 p-4 bg-zinc-900 border border-white/5">
                        <div className="w-32 font-bold uppercase text-sm">{dayName}</div>
                        <label className="flex items-center gap-2 text-xs uppercase cursor-pointer">
                          <input
                            type="checkbox"
                            checked={daySchedule.isOpen}
                            onChange={(e) => {
                              const newSchedule = { ...shopSettings.schedule };
                              newSchedule[index] = { ...daySchedule, isOpen: e.target.checked };
                              setShopSettings({ ...shopSettings, schedule: newSchedule });
                            }}
                            className="accent-crimson"
                          />
                          Abierto
                        </label>
                        {daySchedule.isOpen && (
                          <div className="flex items-center gap-2">
                            <input
                              type="time"
                              value={daySchedule.start}
                              onChange={(e) => {
                                const newSchedule = { ...shopSettings.schedule };
                                newSchedule[index] = { ...daySchedule, start: e.target.value };
                                setShopSettings({ ...shopSettings, schedule: newSchedule });
                              }}
                              className="bg-black border border-white/10 p-2 text-xs"
                            />
                            <span>a</span>
                            <input
                              type="time"
                              value={daySchedule.end}
                              onChange={(e) => {
                                const newSchedule = { ...shopSettings.schedule };
                                newSchedule[index] = { ...daySchedule, end: e.target.value };
                                setShopSettings({ ...shopSettings, schedule: newSchedule });
                              }}
                              className="bg-black border border-white/10 p-2 text-xs"
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                <button
                  onClick={async () => {
                    setLoading(true);
                    try {
                      await updateShopSettings(shopSettings);
                      toast.success('Horarios guardados correctamente.');
                    } catch (err) {
                      toast.error('Error al guardar los horarios.');
                    } finally {
                      setLoading(false);
                    }
                  }}
                  disabled={loading}
                  className="w-full mt-6 bg-crimson py-4 font-display font-bold uppercase tracking-widest text-lg hover:bg-crimson/80 transition-all disabled:opacity-50"
                >
                  {loading ? 'Guardando...' : 'Guardar Horarios'}
                </button>
              </div>
            </div>
          )}

      {isBarberAdmin && isJose && activeAdminTab === 'finanzas' && (
        <div className="space-y-8">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-black p-6 border border-white/5 gap-4">
            <h3 className="font-display font-black uppercase text-2xl text-light-gray flex items-center gap-3">
              <Database className="w-6 h-6 text-crimson" /> {finanzasViewMode === 'daily' ? 'Libro Diario' : finanzasViewMode === 'weekly' ? 'Detalle Semanal' : 'Detalle Mensual'}
            </h3>
            
            <div className="flex flex-col gap-4 w-full md:w-auto mt-2 md:mt-0">
              {/* Controles Superiores: Diario/Mensual y Hoy */}
              <div className="flex justify-between items-center w-full gap-2">
                <div className="flex bg-zinc-800 rounded-sm overflow-hidden border border-white/10 shrink-0">
                  <button 
                    onClick={() => setFinanzasViewMode('daily')}
                    className={`px-3 md:px-4 py-2 text-[10px] font-black uppercase transition-all ${finanzasViewMode === 'daily' ? 'bg-crimson text-white' : 'text-charcoal hover:text-white'}`}
                  >
                    Diario
                  </button>
                  <button 
                    onClick={() => setFinanzasViewMode('weekly')}
                    className={`px-3 md:px-4 py-2 text-[10px] font-black uppercase transition-all ${finanzasViewMode === 'weekly' ? 'bg-crimson text-white' : 'text-charcoal hover:text-white'}`}
                  >
                    Semanal
                  </button>
                  <button 
                    onClick={() => setFinanzasViewMode('monthly')}
                    className={`px-3 md:px-4 py-2 text-[10px] font-black uppercase transition-all ${finanzasViewMode === 'monthly' ? 'bg-crimson text-white' : 'text-charcoal hover:text-white'}`}
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
                <button onClick={() => setFinanzasDate(finanzasViewMode === 'daily' ? addDays(finanzasDate, -1) : finanzasViewMode === 'weekly' ? addDays(finanzasDate, -7) : addMonths(finanzasDate, -1))} className="p-3 bg-zinc-800 hover:bg-crimson transition-colors shrink-0 rounded-sm">
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

                <button onClick={() => setFinanzasDate(finanzasViewMode === 'daily' ? addDays(finanzasDate, 1) : finanzasViewMode === 'weekly' ? addDays(finanzasDate, 7) : addMonths(finanzasDate, 1))} className="p-3 bg-zinc-800 hover:bg-crimson transition-colors shrink-0 rounded-sm">
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          <div className="bg-zinc-900 border border-white/5 p-6">
            <div className="space-y-4">
              {(() => {
                let totalJoseCuts = 0;
                let totalOthersCuts = 0;

                const processedAppts = finanzasAppts.map(appt => {
                  const barber = barbers.find(b => b.id === appt.barberId);
                  const isJoseCut = barber?.id === 'jose-hernandez' || barber?.email === 'jhbarber87@gmail.com' || barber?.email === 'resetart.barber@gmail.com' || barber?.email === 'leoneldariogarcia@gmail.com' || (barber?.name && barber.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes('jose'));
                  const svcPrice = appt.customPrice != null ? appt.customPrice : (SERVICES.find(s => s.name === appt.service)?.price || 0);
                  
                  let joseShare = 0;
                  let barberShare = 0;

                  if (isJoseCut) {
                    joseShare = svcPrice;
                    totalJoseCuts += svcPrice;
                  } else {
                    joseShare = svcPrice * 0.5;
                    barberShare = svcPrice * 0.5;
                    totalOthersCuts += svcPrice;
                  }

                  return { ...appt, barberName: barber?.name || 'Desconocido', isJoseCut, svcPrice, joseShare, barberShare };
                }).sort((a, b) => a.startTime.toMillis() - b.startTime.toMillis());

                const totalRevenue = totalJoseCuts + totalOthersCuts;
                const totalJoseEarns = totalJoseCuts + (totalOthersCuts * 0.5);

                return (
                  <>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                      <div className="bg-black p-6 border border-white/5">
                        <p className="text-charcoal font-bold uppercase tracking-widest text-xs mb-2">Recaudación Total</p>
                        <p className="font-display font-black text-3xl text-light-gray">${totalRevenue.toLocaleString('es-AR')}</p>
                      </div>
                      <div className="bg-black p-6 border border-crimson/50">
                        <p className="text-crimson font-bold uppercase tracking-widest text-xs mb-2">Cierre Caja Jose</p>
                        <p className="font-display font-black text-3xl text-crimson">${totalJoseEarns.toLocaleString('es-AR')}</p>
                        <p className="text-[10px] text-zinc-500 mt-2 font-bold uppercase">100% cortes propios + 50% otros</p>
                      </div>
                      <div className="bg-black p-6 border border-white/5">
                        <p className="text-charcoal font-bold uppercase tracking-widest text-xs mb-2">Comisión Otros Barberos</p>
                        <p className="font-display font-black text-3xl text-zinc-400">${(totalOthersCuts * 0.5).toLocaleString('es-AR')}</p>
                      </div>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm">
                        <thead className="bg-black border-b border-white/10 uppercase text-[10px] text-charcoal font-bold">
                          <tr>
                            <th className="p-3">Hora</th>
                            <th className="p-3">Cliente</th>
                            <th className="p-3">Barbero</th>
                            <th className="p-3">Servicio</th>
                            <th className="p-3 text-right">Precio</th>
                            <th className="p-3 text-right">Para Jose</th>
                            <th className="p-3 text-right">Para Barbero</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                          {processedAppts.map(appt => (
                            <tr key={appt.id} className="hover:bg-white/5 transition-colors">
                              <td className="p-3 font-display font-bold">{format(appt.startTime.toDate(), 'HH:mm')}</td>
                              <td className="p-3 uppercase font-bold text-xs">{appt.customerName}</td>
                              <td className="p-3 text-xs text-zinc-400">{appt.barberName}</td>
                              <td className="p-3 text-[10px] text-charcoal">{appt.service}</td>
                              <td className="p-3 text-right font-bold">${appt.svcPrice.toLocaleString('es-AR')}</td>
                              <td className="p-3 text-right text-crimson font-bold">${appt.joseShare.toLocaleString('es-AR')}</td>
                              <td className="p-3 text-right text-zinc-400">${appt.barberShare.toLocaleString('es-AR')}</td>
                            </tr>
                          ))}
                          {processedAppts.length === 0 && (
                            <tr>
                              <td colSpan={7} className="p-6 text-center text-charcoal text-xs uppercase font-bold">No hay turnos registrados para este día</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {(!isBarberAdmin || (isBarberAdmin && activeAdminTab === 'agendar')) && (
        <div className="space-y-8">
          {!isBarberAdmin && (
            <div className="flex gap-4 border-b border-white/5 pb-4 mb-8">
              <button
                onClick={() => setBookingTab('agendar')}
                className={`text-xs font-bold uppercase tracking-widest ${bookingTab === 'agendar' ? 'text-crimson' : 'text-charcoal'}`}
              >
                Agendar Turno
              </button>
              <button
                onClick={() => setBookingTab('mis-turnos')}
                className={`text-xs font-bold uppercase tracking-widest ${bookingTab === 'mis-turnos' ? 'text-crimson' : 'text-charcoal'}`}
              >
                Mis Turnos
              </button>
            </div>
          )}

          {bookingTab === 'mis-turnos' ? (
            <div className="bg-black p-6 border border-white/5">
              <h3 className="text-xl font-display font-bold uppercase mb-6 flex items-center gap-3">
                <CalendarIcon className="text-crimson" /> Consultar Mis Turnos
              </h3>
              <form onSubmit={handleSearchAppointments} className="flex gap-4 mb-8">
                <input
                  type="tel"
                  placeholder="Tu número de teléfono"
                  value={searchPhone}
                  onChange={(e) => setSearchPhone(e.target.value)}
                  className="flex-1 bg-zinc-900 border border-white/10 p-4 text-white font-display uppercase tracking-widest"
                />
                <button
                  type="submit"
                  disabled={isSearching}
                  className="bg-crimson px-8 font-bold uppercase text-white hover:bg-crimson/80 disabled:opacity-50"
                >
                  {isSearching ? '...' : 'Buscar'}
                </button>
              </form>

              {myAppointments.length > 0 && (
                <div className="space-y-4">
                  {myAppointments.map(appt => {
                    const b = barbers.find(b => b.id === appt.barberId);
                    return (
                      <div key={appt.id} className="p-4 border border-white/5 bg-zinc-900 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                        <div>
                          <p className="font-display font-bold uppercase text-lg">{appt.service}</p>
                          <p className="text-charcoal text-sm">con {b ? b.name : 'Barbero'}</p>
                          {appt.isFixed && <p className="text-xs text-crimson font-bold uppercase mt-1">Turno Fijo</p>}
                        </div>
                        <div className="text-left md:text-right flex-1 md:flex-none w-full md:w-auto flex justify-between md:flex-col items-center md:items-end">
                          <div>
                            <p className="font-display font-bold text-crimson capitalize">{format(appt.startTime.toDate(), 'EEEE dd/MM/yyyy', { locale: es })}</p>
                            <p className="font-bold text-lg">{format(appt.startTime.toDate(), 'HH:mm')} HS</p>
                          </div>
                          <div className="flex gap-2 mt-0 md:mt-2">
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
                                     className="text-[10px] font-bold uppercase tracking-widest border border-white/10 px-3 py-2 hover:border-crimson hover:text-crimson transition-colors"
                                   >
                                     Cancelar
                                   </button>
                                   <button
                                     onClick={() => {
                                        if (window.confirm('Para reprogramar, elige tu nuevo horario. El turno actual se cancelará automáticamente cuando confirmes el nuevo. ¿Continuar?')) {
                                            setSelectedBarber(b || null);
                                            setSelectedService(SERVICES.find(s => s.name === appt.service) || null);
                                            setCustomerInfo({ name: appt.customerName, phone: appt.customerPhone });
                                            setReschedulingApptId(appt.id);
                                            setStep(3); // Go to date selection
                                            setBookingTab('agendar');
                                        }
                                     }}
                                     className="text-[10px] font-bold uppercase tracking-widest bg-crimson text-white px-3 py-2 hover:bg-crimson/80 transition-colors"
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
              <div className="flex justify-between mb-12 relative">
                <div className="absolute top-1/2 left-0 w-full h-px bg-charcoal/30 -z-10" />
                {[1, 2, 3, 4].map(s => (
                  <div
                    key={s}
                    className={`w-10 h-10 rounded-full flex items-center justify-center font-display font-bold border-2 transition-all ${step >= s ? 'bg-crimson border-crimson text-white' : 'bg-black border-charcoal/30 text-charcoal'}`}
                  >
                    {s}
                  </div>
                ))}
              </div>

              <AnimatePresence mode="wait">
                {step === 1 && (
                  <motion.div
                    key="step1"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    className="space-y-6"
                  >
                    <h3 className="text-xl md:text-2xl font-display font-bold uppercase flex items-center gap-3">
                      <User className="text-crimson" /> Selecciona tu Barbero
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      {barbers.map(barber => (
                        <button
                          key={barber.id}
                          onClick={() => { setSelectedBarber(barber); setStep(2); }}
                          className="group relative aspect-square overflow-hidden border border-white/5 hover:border-crimson transition-all"
                        >
                          <img src={barber.photo} alt={barber.name} className="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all duration-500" referrerPolicy="no-referrer" />
                          <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent opacity-80" />
                          <div className="absolute bottom-4 left-4 text-left">
                            <p className="font-display font-black uppercase text-xl leading-none">{barber.name}</p>
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
                    className="space-y-6"
                  >
                    <button onClick={() => setStep(1)} className="text-charcoal hover:text-crimson flex items-center gap-2 text-xs uppercase font-bold tracking-widest mb-4">
                      <ChevronLeft className="w-4 h-4" /> Volver
                    </button>
                    <h3 className="text-xl md:text-2xl font-display font-bold uppercase flex items-center gap-3">
                      <Scissors className="text-crimson" /> Elige el Servicio
                    </h3>
                    <div className="grid grid-cols-1 gap-4">
                      {SERVICES.map(service => (
                        <button
                          key={service.id}
                          onClick={() => { setSelectedService(service); setStep(3); }}
                          className="p-6 bg-black border border-white/5 hover:border-crimson transition-all flex justify-between items-center group"
                        >
                          <div className="text-left">
                            <p className="font-display font-black uppercase text-2xl group-hover:text-crimson transition-colors">{service.name}</p>
                            <p className="text-charcoal font-bold uppercase tracking-widest text-xs">{service.duration} MINUTOS</p>
                          </div>
                          <p className="text-2xl font-display font-bold text-light-gray">${service.price.toLocaleString('es-AR')}</p>
                        </button>
                      ))}
                    </div>
                  </motion.div>
                )}

                {step === 3 && (
                  <motion.div
                    key="step3"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    className="space-y-6"
                  >
                    <button onClick={() => setStep(2)} className="text-charcoal hover:text-crimson flex items-center gap-2 text-xs uppercase font-bold tracking-widest mb-4">
                      <ChevronLeft className="w-4 h-4" /> Volver
                    </button>
                    <div className="flex justify-between items-center mb-4">
                      <h3 className="text-xl md:text-2xl font-display font-bold uppercase flex items-center gap-3">
                        <CalendarIcon className="text-crimson" /> Fecha y Hora
                      </h3>
                      <div className="relative">
                        <button className="flex items-center gap-2 bg-zinc-900 border border-white/10 px-4 py-2 hover:border-crimson transition-colors uppercase text-xs font-bold">
                          <CalendarIcon className="w-4 h-4 text-crimson" /> Elegir Día
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
                            }
                          }}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-7 gap-1 md:gap-2 pb-4">
                      {Array.from({ length: 35 }).map((_, i) => {
                        const today = startOfDay(new Date());
                        const currentDayOfWeek = getDay(today);
                        // getDay: 0 = Sunday, 1 = Monday, ...
                        const daysToSubtract = currentDayOfWeek === 0 ? 6 : currentDayOfWeek - 1;
                        const date = addMinutes(today, (i - daysToSubtract) * 1440);
                        
                        const isSelected = isSameDay(date, selectedDate);
                        const isPast = isBefore(date, today);
                        const isToday = isSameDay(date, today);

                        return (
                          <button
                            key={i}
                            disabled={isPast}
                            onClick={() => { setSelectedDate(date); setSelectedTime(null); }}
                            className={`py-2 md:py-3 border flex flex-col items-center transition-all ${
                              isPast
                                ? 'border-white/5 bg-black/50 text-charcoal/30 cursor-not-allowed opacity-50'
                                : isSelected
                                ? 'border-crimson bg-crimson text-white shadow-lg shadow-crimson/20 scale-105 z-10'
                                : isToday
                                ? 'border-white bg-black text-white hover:bg-zinc-900'
                                : 'border-white/5 bg-black text-charcoal hover:border-white/20 hover:bg-zinc-900'
                            }`}
                          >
                            <span className="text-[8px] md:text-[10px] font-bold uppercase tracking-widest">{format(date, 'EEE', { locale: es })}</span>
                            <span className="text-lg md:text-xl font-display font-black">{format(date, 'dd')}</span>
                          </button>
                        );
                      })}
                    </div>

                    <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-3">
                      {getAvailableSlots().map(time => (
                        <button
                          key={time}
                          onClick={() => setSelectedTime(time)}
                          className={`py-3 border font-display font-bold text-lg transition-all ${selectedTime === time ? 'border-white bg-white text-black' : 'border-white/5 bg-black text-charcoal hover:border-crimson hover:text-crimson'}`}
                        >
                          {time}
                        </button>
                      ))}
                      {getAvailableSlots().length === 0 && (
                        <p className="col-span-full text-center py-12 text-charcoal italic border border-dashed border-white/5">
                          No hay horarios disponibles para este día.
                        </p>
                      )}
                    </div>

                    {selectedTime && (
                      <button
                        onClick={() => setStep(4)}
                        className="w-full bg-crimson py-5 font-display font-bold uppercase tracking-widest text-lg mt-8"
                      >
                        Continuar
                      </button>
                    )}
                  </motion.div>
                )}

                {step === 4 && (
                  <motion.div
                    key="step4"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    className="space-y-6"
                  >
                    <button onClick={() => setStep(3)} className="text-charcoal hover:text-crimson flex items-center gap-2 text-xs uppercase font-bold tracking-widest mb-4">
                      <ChevronLeft className="w-4 h-4" /> Volver
                    </button>
                    <h3 className="text-xl md:text-2xl font-display font-bold uppercase flex items-center gap-3">
                      <CheckCircle2 className="text-crimson" /> Confirmar Datos
                    </h3>

                    <form onSubmit={handleBooking} className="space-y-6">
                      <div className="bg-black p-6 border border-white/5 space-y-4">
                        <div className="flex justify-between border-b border-white/5 pb-4">
                          <span className="text-charcoal uppercase text-xs font-bold tracking-widest">Servicio</span>
                          <span className="font-display font-bold uppercase">{selectedService.name}</span>
                        </div>
                        <div className="flex justify-between border-b border-white/5 pb-4">
                          <span className="text-charcoal uppercase text-xs font-bold tracking-widest">Barbero</span>
                          <span className="font-display font-bold uppercase">{selectedBarber.name}</span>
                        </div>
                        <div className="flex justify-between border-b border-white/5 pb-4">
                          <span className="text-charcoal uppercase text-xs font-bold tracking-widest">Fecha</span>
                          <span className="font-display font-bold uppercase">{format(selectedDate, 'dd/MM/yyyy')} - {selectedTime} HS</span>
                        </div>
                      </div>

                      <div className="space-y-4">
                        <input
                          type="text"
                          placeholder="NOMBRE COMPLETO"
                          required
                          value={customerInfo.name}
                          onChange={e => setCustomerInfo({ ...customerInfo, name: e.target.value })}
                          className="w-full bg-black border border-white/10 p-4 font-display font-bold uppercase tracking-widest focus:border-crimson outline-none transition-colors"
                        />
                        <input
                          type="tel"
                          placeholder="TELÉFONO DE CONTACTO (EJ: 3413143702)"
                          required
                          value={customerInfo.phone}
                          onChange={e => setCustomerInfo({ ...customerInfo, phone: e.target.value })}
                          className="w-full bg-black border border-white/10 p-4 font-display font-bold uppercase tracking-widest focus:border-crimson outline-none transition-colors"
                        />
                        <div className="space-y-4">
                          <label className="flex items-center gap-3 text-sm font-bold uppercase cursor-pointer hover:text-crimson bg-zinc-900 border border-white/10 p-4 transition-colors">
                            <input
                              type="checkbox"
                              checked={isFixedAppointment}
                              onChange={(e) => setIsFixedAppointment(e.target.checked)}
                              className="w-5 h-5 accent-crimson"
                            />
                            Turno Fijo (Reservar varias fechas por 1 mes)
                          </label>

                          {isFixedAppointment && (
                            <div className="grid grid-cols-2 gap-4 ml-8 animate-in fade-in slide-in-from-left-2 duration-300">
                              <button
                                type="button"
                                onClick={() => setFixedInterval('weekly')}
                                className={`p-3 border text-xs font-bold uppercase tracking-widest transition-all ${fixedInterval === 'weekly' ? 'border-crimson bg-crimson/10 text-crimson' : 'border-white/5 bg-black text-charcoal'}`}
                              >
                                Semanal (Cada 7 días)
                              </button>
                              <button
                                type="button"
                                onClick={() => setFixedInterval('biweekly')}
                                className={`p-3 border text-xs font-bold uppercase tracking-widest transition-all ${fixedInterval === 'biweekly' ? 'border-crimson bg-crimson/10 text-crimson' : 'border-white/5 bg-black text-charcoal'}`}
                              >
                                Quincenal (Cada 15 días)
                              </button>
                            </div>
                          )}
                        </div>
                      </div>

                      {error && (
                        <div className="p-4 bg-crimson/10 border border-crimson text-crimson text-sm font-bold uppercase flex items-center gap-3">
                          <AlertCircle className="w-5 h-5" /> {error}
                        </div>
                      )}

                      <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-crimson py-5 font-display font-bold uppercase tracking-widest text-lg shadow-xl shadow-crimson/20 disabled:opacity-50"
                      >
                        {loading ? 'PROCESANDO...' : 'CONFIRMAR TURNO'}
                      </button>
                    </form>
                  </motion.div>
                )}

                {step === 5 && (
                  <motion.div
                    key="step5"
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="text-center py-12 space-y-6"
                  >
                    <div className="w-24 h-24 bg-crimson rounded-full flex items-center justify-center mx-auto shadow-2xl shadow-crimson/30">
                      <CheckCircle2 className="w-12 h-12 text-white" />
                    </div>
                    <h3 className="text-4xl md:text-6xl font-display font-black uppercase tracking-normal text-light-gray">¡Turno Confirmado!</h3>
                    <p className="text-charcoal text-lg md:text-xl font-display max-w-md mx-auto">
                      Te esperamos el <span className="text-white">{format(selectedDate, 'dd/MM')}</span> a las <span className="text-white">{selectedTime} HS</span> con <span className="text-white">{selectedBarber.name}</span>.
                    </p>
                    <button
                      onClick={() => { setStep(1); setSelectedBarber(null); setSelectedService(null); setSelectedTime(null); setSuccess(false); setIsFixedAppointment(false); }}
                      className="bg-charcoal/20 px-8 py-4 font-display font-bold uppercase tracking-widest hover:bg-charcoal/40 transition-all"
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
                    className="w-full bg-black border border-white/10 px-3 py-2 text-sm text-light-gray focus:border-crimson outline-none transition-colors"
                  />
                </div>

                {/* Teléfono */}
                <div>
                  <label className="block text-[10px] font-black uppercase text-charcoal mb-1">Teléfono</label>
                  <input
                    type="tel"
                    value={editForm.customerPhone}
                    onChange={(e) => setEditForm({ ...editForm, customerPhone: e.target.value })}
                    className="w-full bg-black border border-white/10 px-3 py-2 text-sm text-light-gray focus:border-crimson outline-none transition-colors"
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
                            ? 'bg-crimson border-crimson text-white'
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
                      placeholder={String(SERVICES.find(s => s.name === editForm.service)?.price ?? '')}
                      className="w-full bg-black border border-white/10 pl-7 pr-3 py-2 text-sm text-light-gray focus:border-crimson outline-none transition-colors"
                    />
                  </div>
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={handleSaveEditAppointment}
                  className="flex-1 bg-crimson py-3 font-display font-bold uppercase tracking-widest text-sm hover:bg-crimson/80 transition-all"
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
      </AnimatePresence>
    </>
  );
};
