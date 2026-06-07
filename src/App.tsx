/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { 
  Scissors, 
  User, 
  Brush, 
  GraduationCap, 
  Award, 
  Wrench, 
  BookOpen, 
  Headset, 
  BarChart3, 
  MapPin, 
  Phone, 
  Instagram,
  Menu,
  X
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useState, useEffect, useRef } from 'react';
import { BookingSystem } from './components/BookingSystem';
import { auth, db } from './firebase';
import { collection, query, onSnapshot } from 'firebase/firestore';
import { Toaster } from 'react-hot-toast';

import logoSymbol from './assets/logo_symbol.png';
import logoHorizontal from './assets/logo_horizontal.png';
import logoVertical from './assets/logo_vertical.png';

export default function App() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [bookingTab, setBookingTab] = useState<'agendar' | 'mis-turnos'>('agendar');
  const [isBookingOpen, setIsBookingOpen] = useState(false);
  const [isBarberAdmin, setIsBarberAdmin] = useState(false);
  const [currentPath, setCurrentPath] = useState(typeof window !== 'undefined' ? window.location.pathname : '/');
  const [showIntro, setShowIntro] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setShowIntro(false);
    }, 2800);
    return () => clearTimeout(timer);
  }, []);

  const isBookingOpenRef = useRef(isBookingOpen);
  useEffect(() => {
    isBookingOpenRef.current = isBookingOpen;
  }, [isBookingOpen]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handlePopState = () => {
      setCurrentPath(window.location.pathname);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    let unsubBarbers = () => {};
    const unsubscribe = auth.onAuthStateChanged((user) => {
      if (user) {
        const adminEmails = ['leoneldariogarcia@gmail.com', 'jhbarber87@gmail.com', 'puntobarba.barber@gmail.com'];
        const isJoseUser = adminEmails.includes(user.email || '');
        const q = query(collection(db, 'barbers'));
        unsubBarbers = onSnapshot(q, (snapshot) => {
          const barbersEmails = snapshot.docs.map(doc => doc.data().email);
          const isBarber = barbersEmails.includes(user.email || '');
          if (isJoseUser || isBarber) {
            setIsBarberAdmin(true);
            if (isBookingOpenRef.current) {
              setIsBookingOpen(false);
              window.history.pushState({}, '', '/admin');
              setCurrentPath('/admin');
            }
          } else {
            setIsBarberAdmin(false);
          }
        });
      } else {
        setIsBarberAdmin(false);
        unsubBarbers();
        // Redirect to home if logging out from the admin path
        if (window.location.pathname === '/admin' || window.location.pathname === '/admin/') {
          window.history.pushState({}, '', '/');
          setCurrentPath('/');
        }
      }
    });
    return () => {
      unsubscribe();
      unsubBarbers();
    };
  }, []);


  // Efecto premium: convertir imágenes en blanco y negro a color al hacer scroll en móviles
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    // Detectar dispositivos táctiles (móviles/tablets) o pantallas con ancho menor a 768px
    const isMobileDevice = window.matchMedia('(pointer: coarse)').matches || window.innerWidth < 768;
    if (!isMobileDevice) return;
    
    const observedElements = new Set<Element>();
    
    const intersectionObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('reveal-color');
        } else {
          entry.target.classList.remove('reveal-color');
        }
      });
    }, {
      root: null,
      rootMargin: '0px 0px -50px 0px', // Activa la revelación ligeramente antes de que entre del todo por abajo
      threshold: 0.05
    });
    
    const scanAndObserve = () => {
      const elements = document.querySelectorAll('.grayscale, [class*="grayscale"]');
      elements.forEach(el => {
        if (!observedElements.has(el)) {
          observedElements.add(el);
          intersectionObserver.observe(el);
        }
      });
    };
    
    // Escaneo inicial
    scanAndObserve();
    
    // Observar mutaciones del DOM para capturar imágenes dinámicas (ej. barberos que cargan después)
    const mutationObserver = new MutationObserver(() => {
      scanAndObserve();
    });
    mutationObserver.observe(document.body, { childList: true, subtree: true });
    
    return () => {
      intersectionObserver.disconnect();
      mutationObserver.disconnect();
    };
  }, []);

  // Bloquear scroll de fondo cuando el modal o la intro están abiertos
  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (isBookingOpen || showIntro) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isBookingOpen, showIntro]);

  if (currentPath === '/admin' || currentPath === '/admin/') {
    return (
      <div className="min-h-screen font-sans selection:bg-crimson selection:text-white bg-distressed text-light-gray py-10 px-4 md:px-12 flex flex-col justify-start">
        <Toaster 
          position="top-center" 
          toastOptions={{
            style: {
              background: '#18181b',
              color: '#fff',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '0px',
              textTransform: 'uppercase',
              fontFamily: 'Inter, sans-serif',
              fontSize: '14px',
              letterSpacing: '1px',
            },
            success: { iconTheme: { primary: '#dc2626', secondary: '#fff' } }
          }} 
        />
        <div className="max-w-7xl w-full mx-auto">
          {/* Header */}
          <div className="flex justify-between items-center mb-10 pb-6 border-b border-white/5">
            <div 
              className="flex items-center gap-1 cursor-pointer"
              onClick={() => {
                window.history.pushState({}, '', '/');
                setCurrentPath('/');
              }}
            >
              <img src={logoHorizontal} alt="Punto Barba" className="h-14 md:h-18 w-auto object-contain" />
            </div>
            <a 
              href="/" 
              onClick={(e) => {
                e.preventDefault();
                window.history.pushState({}, '', '/');
                setCurrentPath('/');
              }}
              className="text-sm font-bold uppercase tracking-widest text-charcoal hover:text-white transition-colors"
            >
              Volver a la Web
            </a>
          </div>

          <BookingSystem bookingTab={bookingTab} setBookingTab={setBookingTab} />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen font-sans selection:bg-crimson selection:text-white bg-distressed text-light-gray">
      {/* Immersive Loader Intro */}
      <AnimatePresence>
        {showIntro && (
          <motion.div
            key="intro-screen"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.8, ease: 'easeInOut' }}
            className="fixed inset-0 z-[9999] bg-[#050505] flex items-center justify-center"
          >
            <motion.div
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ 
                scale: [0.6, 1.05, 1], 
                opacity: [0, 1, 1] 
              }}
              transition={{ 
                duration: 1.6, 
                ease: 'easeInOut',
                times: [0, 0.6, 1]
              }}
              className="flex flex-col items-center justify-center p-6"
            >
              <motion.img 
                layoutId="logo-symbol"
                src={logoSymbol} 
                alt="Punto Barba" 
                className="w-48 h-48 md:w-64 md:h-64 object-contain"
                transition={{ type: "spring", stiffness: 80, damping: 15 }}
              />
              <motion.h2 
                layoutId="logo-text"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 0.9, y: 0 }}
                transition={{ delay: 0.6, duration: 1.0, ease: "easeInOut" }}
                className="text-3xl md:text-5xl font-display font-black tracking-[0.25em] text-crimson mt-6"
              >
                PUNTO BARBA
              </motion.h2>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      <Toaster 
        position="top-center" 
        toastOptions={{
          style: {
            background: '#18181b',
            color: '#fff',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '0px',
            textTransform: 'uppercase',
            fontFamily: 'Inter, sans-serif',
            fontSize: '14px',
            letterSpacing: '1px',
          },
          success: { iconTheme: { primary: '#dc2626', secondary: '#fff' } }
        }} 
      />
      {/* Navigation */}
      <nav className="fixed top-0 w-full z-50 bg-black/80 backdrop-blur-md border-b border-white/5">
        <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            {!showIntro && (
              <>
                <motion.img 
                  layoutId="logo-symbol"
                  src={logoSymbol} 
                  alt="Punto Barba" 
                  className="h-14 md:h-18 w-auto object-contain" 
                  transition={{ type: "spring", stiffness: 80, damping: 15 }}
                />
                <motion.div 
                  layoutId="logo-text"
                  className="flex flex-col justify-center leading-[0.85] font-display font-black text-crimson select-none"
                  transition={{ type: "spring", stiffness: 80, damping: 15 }}
                >
                  <span className="text-2xl md:text-3xl tracking-[0.05em]">PUNTO</span>
                  <span className="text-2xl md:text-3xl tracking-[0.05em]">BARBA</span>
                </motion.div>
              </>
            )}
          </div>
          
          {/* Desktop Menu */}
          <div className="hidden md:flex items-center space-x-8">
            <a href="#cortes" className="text-sm font-bold uppercase tracking-widest hover:text-crimson transition-colors">Cortes</a>
            <a href="#productos" className="text-sm font-bold uppercase tracking-widest hover:text-crimson transition-colors">Productos</a>
            <a href="#contacto" className="text-sm font-bold uppercase tracking-widest hover:text-crimson transition-colors">Contacto</a>
            {isBarberAdmin && (
              <a 
                href="/admin" 
                onClick={(e) => {
                  e.preventDefault();
                  window.history.pushState({}, '', '/admin');
                  setCurrentPath('/admin');
                }}
                className="text-sm font-bold uppercase tracking-widest text-crimson hover:text-white transition-colors"
              >
                Panel de Gestión
              </a>
            )}
            <button 
              onClick={() => { setBookingTab('mis-turnos'); setIsBookingOpen(true); }}
              className="border border-white/20 px-6 py-2 text-sm font-bold uppercase tracking-widest hover:border-crimson hover:text-crimson transition-all active:scale-95 text-light-gray cursor-pointer"
            >
              Mis Turnos
            </button>
            <button 
              onClick={() => { setBookingTab('agendar'); setIsBookingOpen(true); }}
              className="bg-crimson px-6 py-2 text-sm font-bold uppercase tracking-widest hover:bg-crimson/80 transition-all active:scale-95 text-neutral-900 cursor-pointer"
            >
              Reservar
            </button>
          </div>

          {/* Mobile Toggle */}
          <button className="md:hidden" onClick={() => setIsMenuOpen(!isMenuOpen)}>
            {isMenuOpen ? <X /> : <Menu />}
          </button>
        </div>

        {/* Mobile Menu */}
        {isMenuOpen && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="md:hidden bg-[#0e0e0e] border-b border-white/5 p-6 flex flex-col space-y-4"
          >
            <a href="#cortes" onClick={() => setIsMenuOpen(false)} className="font-bold uppercase tracking-widest">Cortes</a>
            <a href="#productos" onClick={() => setIsMenuOpen(false)} className="font-bold uppercase tracking-widest">Productos</a>
            <a href="#contacto" onClick={() => setIsMenuOpen(false)} className="font-bold uppercase tracking-widest">Contacto</a>
            {isBarberAdmin && (
              <a 
                href="/admin" 
                onClick={(e) => {
                  e.preventDefault();
                  setIsMenuOpen(false);
                  window.history.pushState({}, '', '/admin');
                  setCurrentPath('/admin');
                }}
                className="font-bold uppercase tracking-widest text-crimson animate-pulse"
              >
                Panel de Gestión
              </a>
            )}
            <div className="grid grid-cols-2 gap-3 pt-2">
              <button 
                onClick={() => {
                  setIsMenuOpen(false);
                  setBookingTab('mis-turnos');
                  setIsBookingOpen(true);
                }}
                className="border border-white/10 py-3 font-bold uppercase tracking-widest text-center text-xs text-light-gray hover:border-crimson hover:text-white transition-all bg-black/50 cursor-pointer"
              >
                Mis Turnos
              </button>
              <button 
                onClick={() => {
                  setIsMenuOpen(false);
                  setBookingTab('agendar');
                  setIsBookingOpen(true);
                }}
                className="bg-crimson py-3 font-bold uppercase tracking-widest text-center text-xs text-neutral-900 cursor-pointer"
              >
                Reservar
              </button>
            </div>
          </motion.div>
        )}
      </nav>

      <main>
        {/* Hero Section */}
        <section className="relative min-h-screen flex items-center overflow-hidden py-32 md:py-0 bg-gradient-to-br from-[#050505] to-[#101010] border-b border-white/5">
          {/* Subtle background glow */}
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-crimson/5 rounded-full blur-3xl pointer-events-none" />
          
          <div className="relative z-20 max-w-7xl mx-auto px-6 w-full">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-12 md:gap-16 items-center">
              
              {/* Text Column */}
              <motion.div 
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8 }}
                className="col-span-1 md:col-span-7 space-y-6 md:space-y-8 text-center md:text-left"
              >
                <span className="inline-block px-4 py-1.5 bg-crimson/10 border border-crimson/20 text-crimson font-display text-sm font-bold tracking-[0.25em] uppercase rounded-full">
                  Cortes & Rituales Premium
                </span>
                
                <div className="py-2 flex justify-center md:justify-start">
                  <img 
                    src={logoVertical} 
                    alt="Punto Barba" 
                    className="h-40 sm:h-48 md:h-56 lg:h-64 xl:h-72 w-auto object-contain max-w-full"
                  />
                </div>
                
                <p className="text-charcoal text-base md:text-xl font-display uppercase tracking-widest max-w-lg leading-relaxed mx-auto md:mx-0">
                  El espacio donde la precisión clásica se encuentra con la actitud urbana en el corazón de Rosario.
                </p>
                
                <div className="flex flex-col sm:flex-row justify-center md:justify-start gap-4 pt-4">
                  <button 
                    onClick={() => { setBookingTab('agendar'); setIsBookingOpen(true); }}
                    className="bg-crimson px-8 py-4 font-display font-bold uppercase tracking-widest text-base hover:bg-crimson/80 transition-all active:scale-95 shadow-xl shadow-crimson/10 text-center cursor-pointer text-neutral-900 rounded-sm"
                  >
                    Reservar Turno
                  </button>
                  <button 
                    onClick={() => { setBookingTab('mis-turnos'); setIsBookingOpen(true); }}
                    className="bg-transparent border border-crimson/40 text-crimson px-8 py-4 font-display font-bold uppercase tracking-widest text-base hover:border-crimson hover:bg-crimson/5 transition-all active:scale-95 text-center cursor-pointer rounded-sm"
                  >
                    Mis Turnos
                  </button>
                </div>
              </motion.div>
              
              {/* Image Frame Column */}
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.8, delay: 0.2 }}
                className="col-span-1 md:col-span-5 hidden md:block"
              >
                <div className="relative group p-4">
                  {/* Decorative Gold Offset Frame */}
                  <div className="absolute inset-0 border border-crimson/30 translate-x-4 translate-y-4 transition-transform duration-500 group-hover:translate-x-2 group-hover:translate-y-2 rounded-sm" />
                  
                  {/* Main Image */}
                  <div className="relative aspect-[3/4] overflow-hidden border border-white/10 bg-zinc-950 shadow-2xl rounded-sm">
                    <img 
                      src="https://images.unsplash.com/photo-1503951914875-452162b0f3f1?auto=format&fit=crop&q=80&w=1000" 
                      alt="Punto Barba Barbería" 
                      className="w-full h-full object-cover grayscale opacity-85 group-hover:grayscale-0 group-hover:opacity-100 group-hover:scale-105 transition-all duration-700"
                      referrerPolicy="no-referrer"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-80" />
                  </div>
                </div>
              </motion.div>

            </div>
          </div>
        </section>

        {/* Services Section */}
        <section id="cortes" className="py-20 md:py-32 bg-black relative overflow-hidden border-b border-white/5">
          <div className="max-w-7xl mx-auto px-6 relative z-10">
            <div className="text-center mb-16 md:mb-24">
              <span className="text-crimson font-display font-bold uppercase tracking-[0.2em] text-sm mb-4 block">Carta de Servicios</span>
              <h2 className="text-4xl md:text-7xl font-display font-black uppercase tracking-normal text-light-gray">Menú de Autor</h2>
              <div className="h-1 w-20 bg-crimson mt-4 mx-auto" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16 items-start">
              {/* Menu Column (7 cols) */}
              <div className="lg:col-span-7 bg-[#0c0c0c] border border-white/5 p-8 md:p-16 rounded-sm space-y-12 shadow-2xl relative">
                <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-crimson/50 to-transparent" />
                
                {/* Categoría 1 */}
                <div className="space-y-6">
                  <h3 className="text-2xl font-display font-bold uppercase text-crimson tracking-widest border-b border-white/5 pb-2">01. Cabello</h3>
                  
                  <div className="space-y-4">
                    <div className="group">
                      <div className="flex justify-between items-baseline gap-2">
                        <h4 className="text-lg md:text-xl font-display font-bold uppercase text-light-gray tracking-wide">Corte de Pelo Premium</h4>
                        <div className="flex-grow border-b border-dashed border-white/10 group-hover:border-crimson/30 transition-colors mx-2" />
                        <span className="font-display font-bold text-lg text-crimson">$18.000</span>
                      </div>
                      <p className="text-charcoal text-xs md:text-sm font-display uppercase tracking-wider mt-1">Degradados de precisión, tiijera clásica y texturizado personalizado. / 30 MIN</p>
                    </div>

                    <div className="group">
                      <div className="flex justify-between items-baseline gap-2">
                        <h4 className="text-lg md:text-xl font-display font-bold uppercase text-light-gray tracking-wide">Perfilado de Contornos</h4>
                        <div className="flex-grow border-b border-dashed border-white/10 group-hover:border-crimson/30 transition-colors mx-2" />
                        <span className="font-display font-bold text-lg text-crimson">$8.000</span>
                      </div>
                      <p className="text-charcoal text-xs md:text-sm font-display uppercase tracking-wider mt-1">Limpieza absoluta de patillas, frente y nuca para mantener tu estilo pulcro. / 15 MIN</p>
                    </div>
                  </div>
                </div>

                {/* Categoría 2 */}
                <div className="space-y-6">
                  <h3 className="text-2xl font-display font-bold uppercase text-crimson tracking-widest border-b border-white/5 pb-2">02. Barba & Combos</h3>
                  
                  <div className="space-y-4">
                    <div className="group">
                      <div className="flex justify-between items-baseline gap-2">
                        <h4 className="text-lg md:text-xl font-display font-bold uppercase text-light-gray tracking-wide">Barba de Autor</h4>
                        <div className="flex-grow border-b border-dashed border-white/10 group-hover:border-crimson/30 transition-colors mx-2" />
                        <span className="font-display font-bold text-lg text-crimson">$13.000</span>
                      </div>
                      <p className="text-charcoal text-xs md:text-sm font-display uppercase tracking-wider mt-1">Ritual completo de toalla caliente, perfilado detallado con navaja y nutrición con aceites premium. / 30 MIN</p>
                    </div>

                    <div className="group">
                      <div className="flex justify-between items-baseline gap-2">
                        <h4 className="text-lg md:text-xl font-display font-bold uppercase text-light-gray tracking-wide">Corte & Barba (Combo)</h4>
                        <div className="flex-grow border-b border-dashed border-white/10 group-hover:border-crimson/30 transition-colors mx-2" />
                        <span className="font-display font-bold text-lg text-crimson">$25.000</span>
                      </div>
                      <p className="text-charcoal text-xs md:text-sm font-display uppercase tracking-wider mt-1">El ritual definitivo de cuidado para el caballero. Incluye corte premium y spa de barba. / 60 MIN</p>
                    </div>
                  </div>
                </div>

                {/* Reservar CTA */}
                <div className="pt-4 text-center">
                  <button 
                    onClick={() => { setBookingTab('agendar'); setIsBookingOpen(true); }}
                    className="w-full bg-transparent border border-crimson text-crimson py-4 font-display font-bold uppercase tracking-widest hover:bg-crimson hover:text-neutral-900 transition-all duration-300"
                  >
                    Agendar un Servicio
                  </button>
                </div>
              </div>

              {/* Photo Column (5 cols) */}
              <div className="lg:col-span-5 w-full hidden lg:block sticky top-28">
                <div className="relative p-4">
                  <div className="absolute inset-0 border border-crimson/20 -translate-x-4 translate-y-4 rounded-sm" />
                  <div className="relative aspect-[4/5] overflow-hidden border border-white/5 rounded-sm">
                    <img 
                      src="https://images.unsplash.com/photo-1621605815971-fbc98d665033?auto=format&fit=crop&q=80&w=1000" 
                      alt="Barber Tools" 
                      className="w-full h-full object-cover grayscale opacity-75 hover:grayscale-0 hover:opacity-100 transition-all duration-700"
                      referrerPolicy="no-referrer"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Gallery / Portfolio Section */}
        <section id="portfolio" className="py-20 bg-zinc-950 border-y border-white/5 relative overflow-hidden">
          <div className="max-w-7xl mx-auto px-6">
            <div className="text-center mb-16">
              <span className="text-crimson font-display font-bold uppercase tracking-widest text-sm mb-4 block">Nuestro Trabajo</span>
              <h2 className="text-4xl md:text-6xl font-display font-black uppercase tracking-normal text-light-gray">Galería</h2>
            </div>
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                "https://i.postimg.cc/kgZpvN3v/321c5b1d-a0bc-4435-ba08-c39b44025586.jpg",
                "https://i.postimg.cc/fRNGCywF/ccded255-3d3a-4af4-b0f3-2e2e82ab28d4.jpg",
                "https://i.postimg.cc/ydHCPN5n/9696527f-03e6-442a-8ba1-6be736a5f5fc.jpg"
              ].map((img, i) => (
                <div key={i} className="aspect-[4/5] relative overflow-hidden group cursor-pointer border border-white/5">
                  <img 
                    src={img} 
                    alt={`Corte Punto Barba ${i + 1}`} 
                    className="w-full h-full object-cover grayscale opacity-70 group-hover:grayscale-0 group-hover:opacity-100 group-hover:scale-110 transition-all duration-700"
                    referrerPolicy="no-referrer"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-crimson/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                </div>
              ))}
              <a 
                href="https://www.instagram.com/puntobarba.barberia/" 
                target="_blank" 
                rel="noopener noreferrer"
                className="aspect-[4/5] relative overflow-hidden group cursor-pointer border border-white/5 bg-zinc-900 flex flex-col items-center justify-center hover:bg-zinc-800 transition-colors"
              >
                <Instagram className="w-16 h-16 md:w-20 md:h-20 text-white/30 group-hover:text-crimson transition-colors mb-4 md:mb-6" />
                <span className="text-white/30 group-hover:text-crimson font-display font-bold uppercase tracking-widest text-xs md:text-sm transition-colors text-center px-4">Ver más en Instagram</span>
              </a>
            </div>
          </div>
        </section>

        {/* Booking CTA Banner */}
        <section id="reserva" className="py-24 bg-zinc-950 border-y border-white/5 relative overflow-hidden concrete-texture">
          <div className="absolute inset-0 bg-distressed opacity-20 bg-cover bg-center" style={{ backgroundImage: "url('https://i.postimg.cc/kgZpvN3v/321c5b1d-a0bc-4435-ba08-c39b44025586.jpg')" }} />
          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/80 to-transparent" />
          <div className="max-w-4xl mx-auto px-6 text-center relative z-10 space-y-6">
            <h2 className="text-4xl md:text-7xl font-display font-black uppercase tracking-tight text-light-gray">
              ¿Listo para tu cambio de estilo?
            </h2>
            <p className="max-w-lg mx-auto text-charcoal text-sm md:text-lg font-display uppercase tracking-widest leading-relaxed">
              Agenda tu turno en línea en solo 1 minuto con confirmación instantánea por WhatsApp
            </p>
            <div className="pt-4">
              <button 
                onClick={() => { setBookingTab('agendar'); setIsBookingOpen(true); }}
                className="inline-block bg-crimson px-10 py-5 font-display font-bold uppercase tracking-widest text-lg hover:bg-crimson/80 transition-all active:scale-95 shadow-2xl shadow-crimson/30 cursor-pointer text-white"
              >
                Reservar Turno Ahora
              </button>
            </div>
          </div>
        </section>

        {/* Productos Section */}
        <section id="productos" className="py-20 md:py-32 bg-[#0c0c0c] border-t border-white/5 relative overflow-hidden">
          <div className="max-w-7xl mx-auto px-6 relative z-10">
            <div className="text-center mb-16 md:mb-24">
              <span className="text-crimson font-display font-bold uppercase tracking-[0.2em] text-sm mb-4 block">
                Cuidado & Estilo Masculino
              </span>
              <h2 className="text-4xl md:text-7xl font-display font-black uppercase tracking-normal text-light-gray">
                Catálogo de Productos
              </h2>
              <div className="h-1 w-20 bg-crimson mt-4 mx-auto" />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
              {[
                {
                  id: 'cera-matte',
                  name: 'Cera Matte Clay',
                  desc: 'Fijación fuerte con acabado mate natural. Aporta textura y volumen sin dejar residuos.',
                  price: '$12.000',
                  img: 'https://images.unsplash.com/photo-1608248597279-f99d160bfcbc?auto=format&fit=crop&q=80&w=600',
                  tag: 'Fijación Fuerte'
                },
                {
                  id: 'oleo-barba',
                  name: 'Óleo Premium Barba',
                  desc: 'Hidratación profunda para la piel y suavidad extrema para el vello facial con notas a madera noble.',
                  price: '$9.500',
                  img: 'https://images.unsplash.com/photo-1626015713026-d837d172406f?auto=format&fit=crop&q=80&w=600',
                  tag: 'Hidratación'
                },
                {
                  id: 'pomada-brillo',
                  name: 'Pomada Pompadour',
                  desc: 'Fijación media con acabado de brillo clásico húmedo, ideal para peinados formales y tradicionales.',
                  price: '$11.000',
                  img: 'https://images.unsplash.com/photo-1598440947619-2c35fc9aa908?auto=format&fit=crop&q=80&w=600',
                  tag: 'Brillo Clásico'
                },
                {
                  id: 'shampoo-purificante',
                  name: 'Shampoo Carbón Activo',
                  desc: 'Desintoxicación profunda del cuero cabelludo. Elimina impurezas y el exceso de oleosidad.',
                  price: '$14.000',
                  img: 'https://images.unsplash.com/photo-1535585209827-a15fcdbc4c2d?auto=format&fit=crop&q=80&w=600',
                  tag: 'Desintoxicante'
                }
              ].map((prod) => (
                <div key={prod.id} className="group bg-black/40 border border-white/5 hover:border-crimson/30 transition-all duration-500 rounded-sm overflow-hidden flex flex-col justify-between">
                  <div className="relative aspect-square overflow-hidden bg-zinc-950 border-b border-white/5">
                    <img 
                      src={prod.img} 
                      alt={prod.name} 
                      className="w-full h-full object-cover grayscale opacity-75 group-hover:grayscale-0 group-hover:opacity-100 group-hover:scale-105 transition-all duration-700"
                      referrerPolicy="no-referrer"
                    />
                    <span className="absolute top-3 left-3 bg-crimson text-neutral-900 font-display font-bold uppercase text-[10px] tracking-wider px-2 py-0.5 rounded-sm">
                      {prod.tag}
                    </span>
                  </div>
                  <div className="p-6 flex flex-col justify-between flex-grow">
                    <div>
                      <h3 className="text-xl font-display font-bold uppercase text-light-gray tracking-wide">{prod.name}</h3>
                      <p className="text-charcoal text-xs md:text-sm font-display uppercase tracking-wider mt-2 line-clamp-3">{prod.desc}</p>
                    </div>
                    <div>
                      <span className="text-2xl font-display font-black text-crimson mt-4 block">{prod.price}</span>
                      <a 
                        href={`https://wa.me/5493413293388?text=Hola%20Punto%20Barba!%20Me%20interesa%20comprar%20el%20producto%20${encodeURIComponent(prod.name)}%20de%20su%20cat%C3%A1logo.%20%C2%BFHay%20stock%20disponible?`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-full block bg-transparent border border-white/10 hover:border-crimson hover:text-neutral-900 text-center py-2.5 font-display font-bold uppercase text-xs tracking-wider transition-all duration-300 text-light-gray mt-4"
                      >
                        Consultar Stock
                      </a>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Contact Section */}
        <section id="contacto" className="py-20 md:py-32 bg-black concrete-texture">
          <div className="max-w-7xl mx-auto px-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 lg:gap-20">
              <div className="space-y-10 md:space-y-12 text-center lg:text-left">
                <div>
                  <h2 className="text-5xl md:text-9xl font-display font-black uppercase tracking-normal mb-6 text-light-gray">Ubicanos</h2>
                  <p className="text-charcoal text-xl md:text-2xl font-display">El taller donde la técnica se encuentra con el estilo urbano.</p>
                </div>

                <div className="space-y-6 md:space-y-8">
                  <a 
                    href="https://www.google.com/maps/search/?api=1&query=Mendoza+2656,+Rosario,+Santa+Fe" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="flex flex-col md:flex-row items-center gap-4 md:gap-8 group cursor-pointer"
                  >
                    <div className="w-14 h-14 md:w-16 md:h-16 bg-zinc-900 flex items-center justify-center border border-white/5 group-hover:bg-crimson transition-colors shrink-0">
                      <MapPin className="w-5 h-5 md:w-6 md:h-6" />
                    </div>
                    <span className="text-lg md:text-2xl font-display font-medium group-hover:text-crimson transition-colors text-light-gray">Mendoza 2656, Rosario, Santa Fe</span>
                  </a>
                  <a 
                    href="https://wa.me/5493413293388?text=Hola%20Punto%20Barba!%20Me%20gustar%C3%ADa%20reservar%20un%20turno%20para%20un%20servicio%20de%20barber%C3%ADa.%20%C2%BFQu%C3%A9%20horarios%20tienen%20disponibles?" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="flex flex-col md:flex-row items-center gap-4 md:gap-8 group cursor-pointer"
                  >
                    <div className="w-14 h-14 md:w-16 md:h-16 bg-zinc-900 flex items-center justify-center border border-white/5 group-hover:bg-crimson transition-colors shrink-0">
                      <Phone className="w-5 h-5 md:w-6 md:h-6" />
                    </div>
                    <span className="text-lg md:text-2xl font-display font-medium group-hover:text-crimson transition-colors text-light-gray">341 3293388</span>
                  </a>
                  <a 
                    href="https://www.instagram.com/puntobarba.barberia/" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="flex flex-col md:flex-row items-center gap-4 md:gap-8 group cursor-pointer"
                  >
                    <div className="w-14 h-14 md:w-16 md:h-16 bg-zinc-900 flex items-center justify-center border border-white/5 group-hover:bg-crimson transition-colors shrink-0">
                      <Instagram className="w-5 h-5 md:w-6 md:h-6" />
                    </div>
                    <span className="text-lg md:text-2xl font-display font-medium group-hover:text-crimson transition-colors text-light-gray">@puntobarba.barberia</span>
                  </a>
                </div>
              </div>

              <div className="relative h-[400px] md:h-[600px] bg-zinc-900 border border-white/5 overflow-hidden grayscale group rounded-sm concrete-texture">
                <img 
                  src="https://images.unsplash.com/photo-1524666041070-9d87656c25bb?auto=format&fit=crop&q=80&w=1000" 
                  alt="Map Placeholder" 
                  className="w-full h-full object-cover opacity-20 group-hover:opacity-40 transition-opacity"
                  referrerPolicy="no-referrer"
                />
                <div className="absolute inset-0 flex items-center justify-center">
                  <motion.div 
                    animate={{ y: [0, -10, 0] }}
                    transition={{ repeat: Infinity, duration: 2 }}
                  >
                    <MapPin className="w-12 h-12 md:w-16 md:h-16 text-crimson fill-crimson/20" />
                  </motion.div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="bg-black py-16 border-t border-white/5 concrete-texture">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-8">
          <div className="flex items-center gap-1">
            <img src={logoHorizontal} alt="Punto Barba" className="h-16 w-auto object-contain" />
          </div>
          <p className="text-xs text-charcoal uppercase tracking-[0.3em] text-center font-display">
            © 2026 Punto Barba. Mendoza 2656, Rosario, Santa Fe. Tel: 341 3293388
          </p>
          <div className="flex gap-8">
            <a 
              href="https://www.instagram.com/puntobarba.barberia/" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-xs text-charcoal hover:text-crimson uppercase tracking-widest transition-colors font-display"
            >
              Instagram: @puntobarba.barberia
            </a>
          </div>
        </div>
      </footer>

      {/* Immersive Booking App Modal Overlay */}
      <AnimatePresence>
        {isBookingOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-0 md:p-6 overflow-y-auto"
            onClick={(e) => {
              if (e.target === e.currentTarget) setIsBookingOpen(false);
            }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="relative w-[92%] h-auto max-h-[85vh] md:h-auto md:max-h-[90vh] md:max-w-4xl bg-zinc-950 border border-white/10 shadow-2xl p-5 sm:p-8 md:p-10 text-white overflow-y-auto rounded-md concrete-texture flex flex-col justify-start"
            >
              {/* Close Button */}
              <button 
                onClick={() => setIsBookingOpen(false)}
                className="absolute top-4 right-4 md:top-6 md:right-6 text-charcoal hover:text-white transition-colors cursor-pointer p-2 hover:bg-white/5 rounded-full z-50"
              >
                <X className="w-6 h-6" />
              </button>

              <BookingSystem 
                bookingTab={bookingTab} 
                setBookingTab={setBookingTab} 
                onClose={() => setIsBookingOpen(false)}
                forceClientFlow={true}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
