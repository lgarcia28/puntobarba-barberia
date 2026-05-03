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
import { BARBERS as INITIAL_BARBERS, SERVICES, handleFirestoreError, OperationType, clearAppointments, addBarber, deleteBarber, updateBarber } from '../lib/firestore';
import { format, addMinutes, startOfDay, endOfDay, isBefore, isAfter, parseISO, setHours, setMinutes, eachMinuteOfInterval, isSameDay, eachDayOfInterval, getDay } from 'date-fns';
import { es } from 'date-fns/locale';
import { motion, AnimatePresence } from 'framer-motion';
import { Calendar as CalendarIcon, Clock, User, Scissors, CheckCircle2, AlertCircle, ChevronLeft, ChevronRight, LogIn, LogOut, Trash2, RefreshCcw, Database, Edit2 } from 'lucide-react';
import { signInWithPopup, GoogleAuthProvider, signOut } from 'firebase/auth';

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
  const [appointments, setAppointments] = useState<any[]>([]);
  const [blocks, setBlocks] = useState<any[]>([]);
  
  // Admin Panel Specific State
  const [adminDate, setAdminDate] = useState(new Date());
  const [blockingEndDate, setBlockingEndDate] = useState<Date | null>(null);
  const [isRangeMode, setIsRangeMode] = useState(false);
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
  const [showBarberManagement, setShowBarberManagement] = useState(false);
  const [newBarber, setNewBarber] = useState({ name: '', email: '', photo: '', role: 'barber' });
  const [editingBarberId, setEditingBarberId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    const start = startOfDay(adminDate);
    const end = endOfDay(adminDate);
    
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
  }, [selectedBarber, adminDate, isBarberAdmin]);

  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (err: any) {
      console.error('Login error:', err);
      if (err.code === 'auth/popup-blocked') {
        alert('El navegador bloqueó la ventana emergente. Por favor, permite las ventanas emergentes para este sitio.');
      } else if (err.code === 'auth/unauthorized-domain') {
        alert('Este dominio no está autorizado en la consola de Firebase. Por favor, añade ' + window.location.hostname + ' a la lista de dominios autorizados en Firebase Auth.');
      } else {
        alert('Error al iniciar sesión: ' + (err.message || 'Error desconocido'));
      }
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
  };

  const getAvailableSlots = () => {
    if (!selectedBarber || !selectedService) return [];

    const dayOfWeek = getDay(selectedDate);
    if (dayOfWeek === 0) return []; // Sunday closed

    const slots = [];
    const startHour = 9;
    const endHour = dayOfWeek === 6 ? 17 : 19; // Sat: 17, Mon-Fri: 19
    
    const startTime = setMinutes(setHours(startOfDay(selectedDate), startHour), 0);
    const endTime = setMinutes(setHours(startOfDay(selectedDate), endHour), 0);

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

  const handleBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBarber || !selectedService || !selectedTime || !customerInfo.name || !customerInfo.phone) return;

    setLoading(true);
    setError(null);

    const [hours, minutes] = selectedTime.split(':').map(Number);
    const startTime = setMinutes(setHours(startOfDay(selectedDate), hours), minutes);
    const endTime = addMinutes(startTime, selectedService.duration);

    try {
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
          const apptStart = appt.startTime.toDate();
          const apptEnd = appt.endTime.toDate();
          return (isBefore(startTime, apptEnd) && isAfter(endTime, apptStart));
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
          startTime: Timestamp.fromDate(startTime),
          endTime: Timestamp.fromDate(endTime),
          status: 'confirmed',
          createdAt: Timestamp.now()
        });
      });

      setSuccess(true);
      setStep(5);
    } catch (err: any) {
      setError(err.message || 'Error al agendar el turno.');
      handleFirestoreError(err, OperationType.WRITE, 'appointments');
    } finally {
      setLoading(false);
    }
  };

  const handleCancelAppointment = async (apptId: string) => {
    if (!window.confirm('¿Estás seguro de que deseas cancelar este turno?')) return;
    try {
      const apptRef = doc(db, 'appointments', apptId);
      await updateDoc(apptRef, { status: 'cancelled' });
      alert('Turno cancelado correctamente.');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, 'appointments');
    }
  };

  const handleUnblockTime = async () => {
    if (!selectedBarber || selectedTimesForBlocking.length === 0) return;
    
    setLoading(true);
    try {
      const batch = writeBatch(db);
      const datesToUnblock = isRangeMode && blockingEndDate 
        ? eachDayOfInterval({ start: startOfDay(adminDate), end: startOfDay(blockingEndDate) })
        : [adminDate];

      for (const date of datesToUnblock) {
        const start = startOfDay(date);
        const end = endOfDay(date);
        
        // Fetch all blocks for this date to find matches
        const q = query(
          collection(db, 'blocks'),
          where('barberId', '==', selectedBarber.id),
          where('startTime', '>=', Timestamp.fromDate(start)),
          where('startTime', '<=', Timestamp.fromDate(end))
        );
        const snapshot = await getDocs(q);
        const dayBlocks = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));

        for (const timeStr of selectedTimesForBlocking) {
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
    if (!selectedBarber || selectedTimesForBlocking.length === 0) return;
    
    setLoading(true);
    try {
      const batch = writeBatch(db);
      const datesToBlock = isRangeMode && blockingEndDate 
        ? eachDayOfInterval({ start: startOfDay(adminDate), end: startOfDay(blockingEndDate) })
        : [adminDate];

      const cancelledAppointments: any[] = [];

      for (const date of datesToBlock) {
        // Fetch appointments for this date to check for cancellations
        const start = startOfDay(date);
        const end = endOfDay(date);
        const q = query(
          collection(db, 'appointments'),
          where('barberId', '==', selectedBarber.id),
          where('startTime', '>=', Timestamp.fromDate(start)),
          where('startTime', '<=', Timestamp.fromDate(end)),
          where('status', '==', 'confirmed')
        );
        const snapshot = await getDocs(q);
        const dayAppts = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));

        for (const timeStr of selectedTimesForBlocking) {
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
    <div ref={containerRef} className="max-w-4xl mx-auto bg-zinc-900/50 border border-white/5 p-6 md:p-10 rounded-sm concrete-texture shadow-2xl">
        <div className="flex justify-between items-center mb-8">
          <h2 className="text-3xl md:text-5xl font-display font-black uppercase tracking-tighter text-light-gray">
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

        {isBarberAdmin ? (
          <div className="space-y-8">
            {isJose && (
              <div className="flex gap-4 border-b border-white/5 pb-4">
                <button 
                  onClick={() => setShowBarberManagement(false)}
                  className={`text-xs font-bold uppercase tracking-widest ${!showBarberManagement ? 'text-crimson' : 'text-charcoal'}`}
                >
                  Agenda y Bloqueos
                </button>
                <button 
                  onClick={() => setShowBarberManagement(true)}
                  className={`text-xs font-bold uppercase tracking-widest ${showBarberManagement ? 'text-crimson' : 'text-charcoal'}`}
                >
                  Gestión de Barberos
                </button>
              </div>
            )}

            {!showBarberManagement ? (
              <>
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
                    <div className="bg-black p-6 border border-white/5">
                      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
                        <div className="flex flex-col gap-4">
                          <div className="flex flex-col gap-2">
                            <div className="relative">
                              <button 
                                className="font-display font-bold uppercase flex items-center gap-2 hover:text-crimson transition-colors text-xl"
                              >
                                <CalendarIcon className="w-6 h-6 text-crimson" /> {isRangeMode ? 'Desde:' : 'Fecha:'} {format(adminDate, 'dd/MM/yyyy')}
                              </button>
                              <input 
                                type="date" 
                                className="absolute inset-0 opacity-0 cursor-pointer"
                                onChange={(e) => {
                                  if (e.target.value) {
                                    setAdminDate(new Date(e.target.value + 'T00:00:00'));
                                    setSelectedTimesForBlocking([]);
                                  }
                                }}
                              />
                            </div>
                            <div className="flex gap-2">
                              <button onClick={() => { setAdminDate(addMinutes(adminDate, -1440)); setSelectedTimesForBlocking([]); }} className="p-2 bg-zinc-800 hover:bg-crimson transition-colors"><ChevronLeft /></button>
                              <button onClick={() => { setAdminDate(addMinutes(adminDate, 1440)); setSelectedTimesForBlocking([]); }} className="p-2 bg-zinc-800 hover:bg-crimson transition-colors"><ChevronRight /></button>
                            </div>
                          </div>

                          {isRangeMode && (
                            <div className="relative">
                              <button 
                                className="font-display font-bold uppercase flex items-center gap-2 hover:text-crimson transition-colors text-xl"
                              >
                                <CalendarIcon className="w-6 h-6 text-crimson" /> Hasta: {blockingEndDate ? format(blockingEndDate, 'dd/MM/yyyy') : 'Seleccionar...'}
                              </button>
                              <input 
                                type="date" 
                                min={format(adminDate, 'yyyy-MM-dd')}
                                className="absolute inset-0 opacity-0 cursor-pointer"
                                onChange={(e) => {
                                  if (e.target.value) {
                                    setBlockingEndDate(new Date(e.target.value + 'T00:00:00'));
                                  }
                                }}
                              />
                            </div>
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
                        </div>

                        <button 
                          onClick={() => {
                            const dayOfWeek = getDay(adminDate);
                            const endHour = dayOfWeek === 6 ? 17 : 19;
                            const allSlots = eachMinuteOfInterval({
                              start: setHours(startOfDay(adminDate), 9),
                              end: setHours(startOfDay(adminDate), endHour)
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
                            const endHour = dayOfWeek === 6 ? 17 : 19;
                            const allSlots = eachMinuteOfInterval({
                              start: setHours(startOfDay(adminDate), 9),
                              end: setHours(startOfDay(adminDate), endHour)
                            }, { step: 30 }).map(t => format(t, 'HH:mm'));
                            return selectedTimesForBlocking.length === allSlots.length ? 'Deseleccionar Todo' : 'Seleccionar Todo';
                          })()}
                        </button>
                      </div>

                      <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-3 mb-8">
                        {eachMinuteOfInterval({
                          start: setHours(startOfDay(adminDate), 9),
                          end: setHours(startOfDay(adminDate), getDay(adminDate) === 6 ? 17 : 19)
                        }, { step: 30 }).map(time => {
                          const tStr = format(time, 'HH:mm');
                          const block = adminBlocks.find(b => format(b.startTime.toDate(), 'HH:mm') === tStr);
                          const appt = adminAppts.find(a => format(a.startTime.toDate(), 'HH:mm') === tStr);
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
                              className={`p-4 text-xs font-bold border transition-all flex flex-col items-center gap-1 min-h-[80px] justify-center relative ${
                                isSelected ? 'scale-105 z-10 shadow-2xl' : ''
                              } ${
                                isSelected 
                                  ? 'bg-white text-black border-white' 
                                  : appt 
                                    ? 'bg-crimson/20 border-crimson text-crimson' 
                                    : block 
                                      ? 'bg-zinc-800 border-zinc-700 text-zinc-500' 
                                      : 'border-white/5 hover:border-white/20'
                              }`}
                            >
                              <span className="text-sm">{tStr}</span>
                              {appt && <span className="uppercase text-[9px] font-black truncate w-full text-center">{appt.customerName}</span>}
                              {block && <span className="uppercase text-[9px] font-black">Bloqueado</span>}
                              {!appt && !block && <span className="uppercase text-[9px] font-black opacity-30">Libre</span>}
                            </button>
                          );
                        })}
                      </div>

                      <div className="flex flex-col md:flex-row gap-4">
                        <button 
                          onClick={handleBlockTime}
                          disabled={selectedTimesForBlocking.length === 0 || loading}
                          className="flex-1 bg-crimson py-4 font-display font-bold uppercase tracking-widest disabled:opacity-50 flex items-center justify-center gap-2 hover:bg-crimson/80 transition-all"
                        >
                          {loading ? <RefreshCcw className="w-4 h-4 animate-spin" /> : null}
                          Bloquear / Cancelar Seleccionados ({selectedTimesForBlocking.length})
                        </button>
                        
                        {selectedTimesForBlocking.length > 0 && (
                          <button 
                            onClick={handleUnblockTime}
                            disabled={loading}
                            className="bg-white text-black px-8 py-4 font-display font-bold uppercase tracking-widest hover:bg-zinc-200 transition-all disabled:opacity-50"
                          >
                            Desbloquear Seleccionados
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </>
            ) : (
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
                      onChange={(e) => setNewBarber({...newBarber, name: e.target.value})}
                      className="bg-zinc-900 border border-white/10 p-3 text-sm focus:border-crimson outline-none"
                    />
                    <input 
                      type="email" 
                      placeholder="Email (para login)"
                      value={newBarber.email}
                      onChange={(e) => setNewBarber({...newBarber, email: e.target.value})}
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
                                setNewBarber({...newBarber, photo: reader.result as string});
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
                          alert('Por favor completa todos los campos y sube una foto.');
                          return;
                        }
                        setLoading(true);
                        try {
                          if (editingBarberId) {
                            await updateBarber(editingBarberId, newBarber);
                            alert('Barbero actualizado correctamente.');
                          } else {
                            await addBarber(newBarber);
                            alert('Barbero agregado correctamente.');
                          }
                          setNewBarber({ name: '', email: '', photo: '', role: 'barber' });
                          setEditingBarberId(null);
                        } catch (err) {
                          alert('Error al guardar barbero.');
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
                                  } catch (err) {
                                    alert('Error al eliminar barbero.');
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
          </div>
        ) : (
          <div className="space-y-8">
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
                  <h3 className="text-xl md:text-2xl font-display font-bold uppercase flex items-center gap-3">
                    <CalendarIcon className="text-crimson" /> Fecha y Hora
                  </h3>
                  
                  <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide">
                    {[0, 1, 2, 3, 4, 5, 6].map(days => {
                      const date = addMinutes(new Date(), days * 1440);
                      const isSelected = isSameDay(date, selectedDate);
                      return (
                        <button 
                          key={days}
                          onClick={() => { setSelectedDate(date); setSelectedTime(null); }}
                          className={`flex-shrink-0 w-20 py-4 border flex flex-col items-center transition-all ${isSelected ? 'border-crimson bg-crimson text-white' : 'border-white/5 bg-black text-charcoal hover:border-white/20'}`}
                        >
                          <span className="text-[10px] font-bold uppercase tracking-widest">{format(date, 'EEE', { locale: es })}</span>
                          <span className="text-2xl font-display font-black">{format(date, 'dd')}</span>
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
                        onChange={e => setCustomerInfo({...customerInfo, name: e.target.value})}
                        className="w-full bg-black border border-white/10 p-4 font-display font-bold uppercase tracking-widest focus:border-crimson outline-none transition-colors"
                      />
                      <input 
                        type="tel" 
                        placeholder="TELÉFONO DE CONTACTO (EJ: 3413143702)"
                        required
                        value={customerInfo.phone}
                        onChange={e => setCustomerInfo({...customerInfo, phone: e.target.value})}
                        className="w-full bg-black border border-white/10 p-4 font-display font-bold uppercase tracking-widest focus:border-crimson outline-none transition-colors"
                      />
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
                  <h3 className="text-4xl md:text-6xl font-display font-black uppercase tracking-tighter text-light-gray">¡Turno Confirmado!</h3>
                  <p className="text-charcoal text-lg md:text-xl font-display max-w-md mx-auto">
                    Te esperamos el <span className="text-white">{format(selectedDate, 'dd/MM')}</span> a las <span className="text-white">{selectedTime} HS</span> con <span className="text-white">{selectedBarber.name}</span>.
                  </p>
                  <button 
                    onClick={() => { setStep(1); setSelectedBarber(null); setSelectedService(null); setSelectedTime(null); setSuccess(false); }}
                    className="bg-charcoal/20 px-8 py-4 font-display font-bold uppercase tracking-widest hover:bg-charcoal/40 transition-all"
                  >
                    Volver al Inicio
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>
  );
};
