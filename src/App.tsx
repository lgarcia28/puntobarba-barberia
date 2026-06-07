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
      <div className="min-h-screen font-sans selection:bg-gold selection:text-white bg-distressed text-light-gray py-10 px-4 md:px-12 flex flex-col justify-start">
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
    <div className="min-h-screen font-sans selection:bg-gold selection:text-white bg-distressed text-light-gray">
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
                className="w-[100px] h-[122.5px] md:w-[150px] md:h-[183.7px] object-contain"
                transition={{ type: "spring", stiffness: 45, damping: 15 }}
              />
              <motion.div 
                layoutId="logo-text"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 0.9, y: 0 }}
                transition={{ delay: 0.6, duration: 1.0, ease: "easeInOut" }}
                className="flex flex-col items-center justify-center leading-[0.8] font-sans font-black text-gold mt-1 md:mt-1.5 text-[34px] md:text-[50px] select-none"
              >
                <motion.span layoutId="word-punto" className="tracking-tight" transition={{ type: "spring", stiffness: 45, damping: 15 }}>PUNTO</motion.span>
                <motion.span layoutId="word-barba" className="tracking-tight" transition={{ type: "spring", stiffness: 45, damping: 15 }}>BARBA</motion.span>
              </motion.div>
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
          <div className="flex items-center gap-2 md:gap-2.5">
            {showIntro ? (
              <>
                <img 
                  src={logoSymbol} 
                  alt="" 
                  className="h-[40px] w-[32.6px] md:h-[52px] md:w-[42.4px] object-contain opacity-0 pointer-events-none" 
                  aria-hidden="true"
                />
                <div className="flex flex-col justify-center leading-[0.8] font-sans font-black text-gold select-none opacity-0 pointer-events-none" aria-hidden="true">
                  <span className="text-[25px] md:text-[32.5px] tracking-tight">PUNTO</span>
                  <span className="text-[25px] md:text-[32.5px] tracking-tight">BARBA</span>
                </div>
              </>
            ) : (
              <>
                <motion.img 
                  layoutId="logo-symbol"
                  src={logoSymbol} 
                  alt="Punto Barba" 
                  className="h-[40px] w-[32.6px] md:h-[52px] md:w-[42.4px] object-contain" 
                  transition={{ type: "spring", stiffness: 45, damping: 15 }}
                />
                <motion.div 
                  layoutId="logo-text"
                  className="flex flex-col justify-center leading-[0.8] font-sans font-black text-gold select-none"
                  transition={{ type: "spring", stiffness: 45, damping: 15 }}
                >
                  <motion.span layoutId="word-punto" className="text-[25px] md:text-[32.5px] tracking-tight" transition={{ type: "spring", stiffness: 45, damping: 15 }}>PUNTO</motion.span>
                  <motion.span layoutId="word-barba" className="text-[25px] md:text-[32.5px] tracking-tight" transition={{ type: "spring", stiffness: 45, damping: 15 }}>BARBA</motion.span>
                </motion.div>
              </>
            )}
          </div>
          
          {/* Desktop Menu */}
          <div className="hidden md:flex items-center space-x-8">
            <a href="#cortes" className="text-sm font-bold uppercase tracking-widest hover:text-gold transition-colors">Cortes</a>
            <a href="#productos" className="text-sm font-bold uppercase tracking-widest hover:text-gold transition-colors">Productos</a>
            <a href="#contacto" className="text-sm font-bold uppercase tracking-widest hover:text-gold transition-colors">Contacto</a>
            {isBarberAdmin && (
              <a 
                href="/admin" 
                onClick={(e) => {
                  e.preventDefault();
                  window.history.pushState({}, '', '/admin');
                  setCurrentPath('/admin');
                }}
                className="text-sm font-bold uppercase tracking-widest text-gold hover:text-white transition-colors"
              >
                Panel de Gestión
              </a>
            )}
            <button 
              onClick={() => { setBookingTab('mis-turnos'); setIsBookingOpen(true); }}
              className="border border-white/20 px-6 py-2 text-sm font-bold uppercase tracking-widest hover:border-gold hover:text-gold transition-all active:scale-95 text-light-gray cursor-pointer"
            >
              Mis Turnos
            </button>
            <button 
              onClick={() => { setBookingTab('agendar'); setIsBookingOpen(true); }}
              className="bg-gold px-6 py-2 text-sm font-bold uppercase tracking-widest hover:bg-gold/80 transition-all active:scale-95 text-neutral-900 cursor-pointer"
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
                className="font-bold uppercase tracking-widest text-gold animate-pulse"
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
                className="border border-white/10 py-3 font-bold uppercase tracking-widest text-center text-xs text-light-gray hover:border-gold hover:text-white transition-all bg-black/50 cursor-pointer"
              >
                Mis Turnos
              </button>
              <button 
                onClick={() => {
                  setIsMenuOpen(false);
                  setBookingTab('agendar');
                  setIsBookingOpen(true);
                }}
                className="bg-gold py-3 font-bold uppercase tracking-widest text-center text-xs text-neutral-900 cursor-pointer"
              >
                Reservar
              </button>
            </div>
          </motion.div>
        )}
      </nav>

      <main>
        {/* Hero Section */}
        <section className="relative min-h-screen flex items-center overflow-hidden py-32 md:py-0 bg-dark-bg border-b border-white/5">
          {/* Subtle background glow */}
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-gold/5 rounded-full blur-3xl pointer-events-none" />
          
          <div className="relative z-20 max-w-7xl mx-auto px-6 w-full">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-16 md:gap-20 items-center">
              
              {/* Text Column */}
              <motion.div 
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8 }}
                className="col-span-1 md:col-span-7 space-y-8 text-center md:text-left"
              >
                <div className="space-y-4">
                  <span className="inline-block px-4 py-1 bg-gold/10 border border-gold/20 text-gold font-sans text-xs font-semibold tracking-[0.3em] uppercase rounded-full">
                    Club Social & Barbería de Autor
                  </span>
                  
                  <div className="py-4 flex justify-center md:justify-start">
                    <img 
                      src={logoVertical} 
                      alt="Punto Barba" 
                      className="h-44 sm:h-52 md:h-64 lg:h-72 w-auto object-contain max-w-full"
                    />
                  </div>
                </div>
                
                <p className="text-charcoal text-sm md:text-base font-sans tracking-wide max-w-md leading-relaxed mx-auto md:mx-0">
                  Un taller reservado para el perfeccionamiento del detalle, donde la precisión clásica se encuentra con la actitud urbana en el corazón de Rosario.
                </p>
                
                <div className="flex flex-col sm:flex-row justify-center md:justify-start items-center gap-6 pt-6">
                  <button 
                    onClick={() => { setBookingTab('agendar'); setIsBookingOpen(true); }}
                    className="w-full sm:w-auto bg-gold px-8 py-4 font-display font-semibold uppercase tracking-[0.2em] text-sm hover:bg-gold-hover transition-all active:scale-95 text-neutral-900 cursor-pointer rounded-none border border-gold"
                  >
                    Agendar Experiencia
                  </button>
                  <button 
                    onClick={() => { setBookingTab('mis-turnos'); setIsBookingOpen(true); }}
                    className="text-xs font-display font-semibold uppercase tracking-[0.2em] text-light-gray hover:text-gold transition-colors py-2 cursor-pointer border-b border-white/10 hover:border-gold"
                  >
                    Mis Turnos
                  </button>
                </div>
              </motion.div>
              
              {/* Image Frame Column */}
              <motion.div 
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.8, delay: 0.2 }}
                className="col-span-1 md:col-span-5 hidden md:block"
              >
                <div className="relative group p-6">
                  {/* Decorative Gold Offset Frame */}
                  <div className="absolute inset-0 border-[0.5px] border-gold/30 translate-x-4 translate-y-4 transition-transform duration-700 group-hover:translate-x-2 group-hover:translate-y-2" />
                  
                  {/* Main Image */}
                  <div className="relative aspect-[3/4] overflow-hidden border border-white/5 bg-zinc-950 shadow-2xl">
                    <img 
                      src="https://images.unsplash.com/photo-1503951914875-452162b0f3f1?auto=format&fit=crop&q=80&w=1000" 
                      alt="Punto Barba Barbería" 
                      className="w-full h-full object-cover grayscale opacity-80 group-hover:grayscale-0 group-hover:opacity-100 group-hover:scale-105 transition-all duration-1000"
                      referrerPolicy="no-referrer"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-dark-bg/85 via-transparent to-transparent opacity-90" />
                  </div>
                </div>
              </motion.div>

            </div>
          </div>
        </section>

        {/* Services Section */}
        <section id="cortes" className="py-24 md:py-36 bg-[#090909] relative overflow-hidden border-b border-white/5">
          <div className="max-w-5xl mx-auto px-6 relative z-10">
            <div className="text-center mb-20">
              <span className="text-gold font-display font-semibold uppercase tracking-[0.25em] text-xs mb-3 block">Estilos & Rituales</span>
              <h2 className="text-3xl md:text-5xl font-display font-bold uppercase tracking-wide text-light-gray">Servicios de Autor</h2>
              <p className="mt-4 text-charcoal text-xs md:text-sm font-sans tracking-wide max-w-md mx-auto">
                Técnicas de corte clásico, rituales de afeitado tradicionales y el confort de nuestro club. Los precios se detallan al momento de agendar.
              </p>
              <div className="h-[0.5px] w-16 bg-gold/50 mt-6 mx-auto" />
            </div>

            {/* Editorial List Layout */}
            <div className="bg-dark-surface/30 border border-white/5 p-8 md:p-16 space-y-1">
              
              {/* Servicio I */}
              <div className="border-b border-white/5 py-8 group transition-colors hover:border-gold/30">
                <div className="flex flex-col md:flex-row md:items-baseline md:justify-between">
                  <div className="flex items-baseline gap-4">
                    <span className="font-display font-light text-2xl text-gold/60">I.</span>
                    <h3 className="font-display font-semibold uppercase text-xl md:text-2xl text-light-gray tracking-wide">Corte de Pelo Premium</h3>
                  </div>
                  <span className="text-[10px] uppercase tracking-[0.2em] text-gold font-sans font-semibold mt-2 md:mt-0">[ Duración: 30 Minutos ]</span>
                </div>
                <p className="mt-3 text-charcoal text-xs md:text-sm font-sans tracking-wide max-w-3xl leading-relaxed">
                  Degradados de precisión, corte clásico a tijera y texturizado personalizado. Incluye asesoramiento de visagismo y lavado final.
                </p>
              </div>

              {/* Servicio II */}
              <div className="border-b border-white/5 py-8 group transition-colors hover:border-gold/30">
                <div className="flex flex-col md:flex-row md:items-baseline md:justify-between">
                  <div className="flex items-baseline gap-4">
                    <span className="font-display font-light text-2xl text-gold/60">II.</span>
                    <h3 className="font-display font-semibold uppercase text-xl md:text-2xl text-light-gray tracking-wide">Barba de Autor</h3>
                  </div>
                  <span className="text-[10px] uppercase tracking-[0.2em] text-gold font-sans font-semibold mt-2 md:mt-0">[ Duración: 30 Minutos ]</span>
                </div>
                <p className="mt-3 text-charcoal text-xs md:text-sm font-sans tracking-wide max-w-3xl leading-relaxed">
                  Ritual completo de toallas calientes, perfilado detallado con navaja, recortado simétrico y nutrición con aceites premium de cedro y sándalo.
                </p>
              </div>

              {/* Servicio III */}
              <div className="border-b border-white/5 py-8 group transition-colors hover:border-gold/30">
                <div className="flex flex-col md:flex-row md:items-baseline md:justify-between">
                  <div className="flex items-baseline gap-4">
                    <span className="font-display font-light text-2xl text-gold/60">III.</span>
                    <h3 className="font-display font-semibold uppercase text-xl md:text-2xl text-light-gray tracking-wide">Perfilado de Contornos</h3>
                  </div>
                  <span className="text-[10px] uppercase tracking-[0.2em] text-gold font-sans font-semibold mt-2 md:mt-0">[ Duración: 15 Minutos ]</span>
                </div>
                <p className="mt-3 text-charcoal text-xs md:text-sm font-sans tracking-wide max-w-3xl leading-relaxed">
                  Limpieza y delimitación absoluta de patillas, frente y nuca con navaja y trimmer. Ideal para mantener tu corte nítido entre visitas.
                </p>
              </div>

              {/* Servicio IV */}
              <div className="border-b border-white/5 py-8 group transition-colors hover:border-gold/30">
                <div className="flex flex-col md:flex-row md:items-baseline md:justify-between">
                  <div className="flex items-baseline gap-4">
                    <span className="font-display font-light text-2xl text-gold/60">IV.</span>
                    <h3 className="font-display font-semibold uppercase text-xl md:text-2xl text-light-gray tracking-wide">Corte & Barba (Combo)</h3>
                  </div>
                  <span className="text-[10px] uppercase tracking-[0.2em] text-gold font-sans font-semibold mt-2 md:mt-0">[ Duración: 60 Minutos ]</span>
                </div>
                <p className="mt-3 text-charcoal text-xs md:text-sm font-sans tracking-wide max-w-3xl leading-relaxed">
                  La experiencia de cuidado definitiva. Combina nuestro corte premium y el spa completo de barba en una única sesión de una hora.
                </p>
              </div>

              {/* Reservar CTA */}
              <div className="pt-10 text-center">
                <button 
                  onClick={() => { setBookingTab('agendar'); setIsBookingOpen(true); }}
                  className="w-full sm:w-auto bg-transparent border border-gold text-gold px-12 py-4 font-display font-semibold uppercase tracking-[0.2em] text-xs hover:bg-gold hover:text-neutral-900 transition-all duration-300 cursor-pointer"
                >
                  Agendar un Turno
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* Gallery / Portfolio Section */}
        <section id="portfolio" className="py-24 bg-dark-bg border-b border-white/5 relative overflow-hidden">
          <div className="max-w-7xl mx-auto px-6">
            <div className="text-center mb-16">
              <span className="text-gold font-display font-semibold uppercase tracking-[0.25em] text-xs mb-3 block">El Registro</span>
              <h2 className="text-3xl md:text-5xl font-display font-bold uppercase tracking-wide text-light-gray">Galería</h2>
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
                    className="w-full h-full object-cover grayscale opacity-70 group-hover:grayscale-0 group-hover:opacity-100 group-hover:scale-105 transition-all duration-1000"
                    referrerPolicy="no-referrer"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-transparent to-transparent opacity-0 group-hover:opacity-80 transition-opacity duration-700" />
                </div>
              ))}
              <a 
                href="https://www.instagram.com/puntobarba.barberia/" 
                target="_blank" 
                rel="noopener noreferrer"
                className="aspect-[4/5] relative overflow-hidden group cursor-pointer border border-white/5 bg-zinc-950 flex flex-col items-center justify-center hover:bg-zinc-900 transition-colors"
              >
                <Instagram className="w-10 h-10 text-white/20 group-hover:text-gold transition-colors mb-4" />
                <span className="text-white/30 group-hover:text-gold font-display font-semibold uppercase tracking-[0.2em] text-[10px] md:text-xs transition-colors text-center px-4 leading-relaxed">@puntobarba.barberia</span>
              </a>
            </div>
          </div>
        </section>

        {/* Booking CTA Banner */}
        <section id="reserva" className="py-28 bg-dark-bg border-b border-white/5 relative overflow-hidden">
          <div className="absolute inset-0 bg-cover bg-center opacity-10 filter grayscale" style={{ backgroundImage: "url('https://i.postimg.cc/kgZpvN3v/321c5b1d-a0bc-4435-ba08-c39b44025586.jpg')" }} />
          <div className="max-w-4xl mx-auto px-6 text-center relative z-10 space-y-8">
            <h2 className="text-3xl md:text-5xl font-display font-bold uppercase tracking-wide text-light-gray leading-tight">
              ¿Listo para tu cambio de estilo?
            </h2>
            <p className="max-w-md mx-auto text-charcoal text-xs md:text-sm font-sans tracking-wide leading-relaxed">
              Agenda tu turno en línea en solo 1 minuto con confirmación instantánea por WhatsApp
            </p>
            <div className="pt-4">
              <button 
                onClick={() => { setBookingTab('agendar'); setIsBookingOpen(true); }}
                className="inline-block bg-gold px-12 py-5 font-display font-semibold uppercase tracking-[0.2em] text-xs hover:bg-gold-hover transition-all active:scale-95 shadow-2xl shadow-gold/20 cursor-pointer text-neutral-900 rounded-none border border-gold"
              >
                Reservar Turno Ahora
              </button>
            </div>
          </div>
        </section>

        {/* Productos Section (La Botica) */}
        <section id="productos" className="py-24 md:py-36 bg-[#090909] border-b border-white/5 relative overflow-hidden">
          <div className="max-w-7xl mx-auto px-6 relative z-10">
            <div className="text-center mb-20">
              <span className="text-gold font-display font-semibold uppercase tracking-[0.25em] text-xs mb-3 block">
                La Botica de Punto Barba
              </span>
              <h2 className="text-3xl md:text-5xl font-display font-bold uppercase tracking-wide text-light-gray">
                Cuidado & Estilo
              </h2>
              <p className="mt-4 text-charcoal text-xs md:text-sm font-sans tracking-wide max-w-md mx-auto">
                Una curaduría de fórmulas botánicas y productos de culto esenciales para la rutina del hombre contemporáneo.
              </p>
              <div className="h-[0.5px] w-16 bg-gold/50 mt-6 mx-auto" />
            </div>

            {/* Apothecary Minimal Grid (No Cards) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 border border-white/5 bg-zinc-950/20">
              {[
                {
                  id: 'cera-matte',
                  name: 'Cera Matte Clay',
                  desc: 'Fijación fuerte con acabado mate natural. Aporta textura y volumen sin dejar residuos.',
                  price: '$12.000',
                  img: 'https://images.unsplash.com/photo-1608248597279-f99d160bfcbc?auto=format&fit=crop&q=80&w=600',
                  tag: '[ FIX ]'
                },
                {
                  id: 'oleo-barba',
                  name: 'Óleo Premium Barba',
                  desc: 'Hidratación profunda para la piel y suavidad extrema para el vello facial con notas a madera noble.',
                  price: '$9.500',
                  img: 'https://images.unsplash.com/photo-1626015713026-d837d172406f?auto=format&fit=crop&q=80&w=600',
                  tag: '[ HYDRATE ]'
                },
                {
                  id: 'pomada-brillo',
                  name: 'Pomada Pompadour',
                  desc: 'Fijación media con acabado de brillo clásico húmedo, ideal para peinados formales y tradicionales.',
                  price: '$11.000',
                  img: 'https://images.unsplash.com/photo-1598440947619-2c35fc9aa908?auto=format&fit=crop&q=80&w=600',
                  tag: '[ SHINE ]'
                },
                {
                  id: 'shampoo-purificante',
                  name: 'Shampoo Carbón Activo',
                  desc: 'Desintoxicación profunda del cuero cabelludo. Elimina impurezas y el exceso de oleosidad.',
                  price: '$14.000',
                  img: 'https://images.unsplash.com/photo-1535585209827-a15fcdbc4c2d?auto=format&fit=crop&q=80&w=600',
                  tag: '[ DETOX ]'
                }
              ].map((prod, index) => (
                <div 
                  key={prod.id} 
                  className={`group p-8 flex flex-col justify-between transition-colors hover:bg-white/[0.01] border-white/5
                    ${index < 3 ? 'lg:border-r' : ''} 
                    ${index % 2 === 0 ? 'sm:border-r lg:border-r-0' : ''} 
                    ${index > 1 ? 'border-t sm:border-t-0' : ''} 
                    ${index > 0 ? 'border-t sm:border-t-0' : ''}
                    sm:border-t lg:border-t-0`}
                >
                  <div className="space-y-6">
                    <div className="relative aspect-square overflow-hidden bg-zinc-950/60 border border-white/5">
                      <img 
                        src={prod.img} 
                        alt={prod.name} 
                        className="w-full h-full object-cover grayscale opacity-70 group-hover:grayscale-0 group-hover:opacity-100 group-hover:scale-102 transition-all duration-1000"
                        referrerPolicy="no-referrer"
                      />
                      <span className="absolute top-3 left-3 bg-zinc-950/90 text-gold font-sans font-semibold text-[8px] tracking-[0.2em] px-2.5 py-1 uppercase border border-white/10">
                        {prod.tag}
                      </span>
                    </div>
                    
                    <div className="space-y-2">
                      <h3 className="text-lg font-display font-semibold uppercase text-light-gray tracking-wide">{prod.name}</h3>
                      <p className="text-charcoal text-[11px] font-sans tracking-wide leading-relaxed line-clamp-3">{prod.desc}</p>
                    </div>
                  </div>

                  <div className="pt-6 space-y-4">
                    <span className="text-xl font-display font-bold text-gold block">{prod.price}</span>
                    <a 
                      href={`https://wa.me/5493413293388?text=Hola%20Punto%20Barba!%20Me%20interesa%20comprar%20el%20producto%20${encodeURIComponent(prod.name)}%20de%20su%20cat%C3%A1logo.%20%C2%BFHay%20stock%20disponible?`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full block bg-transparent border border-white/10 hover:border-gold hover:text-neutral-900 text-center py-3 font-display font-semibold uppercase text-[10px] tracking-[0.2em] transition-all duration-300 text-light-gray"
                    >
                      Consultar Stock
                    </a>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Contact Section */}
        <section id="contacto" className="py-24 md:py-36 bg-dark-bg">
          <div className="max-w-7xl mx-auto px-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 lg:gap-24 items-center">
              
              {/* Info Column */}
              <div className="space-y-12 text-center lg:text-left">
                <div className="space-y-4">
                  <span className="text-gold font-display font-semibold uppercase tracking-[0.25em] text-xs block">El Taller</span>
                  <h2 className="text-4xl md:text-6xl font-display font-bold uppercase tracking-wide text-light-gray">Ubicanos</h2>
                  <div className="h-[0.5px] w-12 bg-gold/50 my-4 mx-auto lg:mx-0" />
                </div>

                <div className="space-y-8">
                  <a 
                    href="https://www.google.com/maps/search/?api=1&query=Mendoza+2656,+Rosario,+Santa+Fe" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="flex flex-col md:flex-row items-center gap-6 group cursor-pointer"
                  >
                    <div className="w-12 h-12 bg-zinc-950/60 flex items-center justify-center border border-white/5 group-hover:border-gold transition-colors shrink-0">
                      <MapPin className="w-4 h-4 text-gold" />
                    </div>
                    <span className="text-sm md:text-base font-sans tracking-wide text-charcoal group-hover:text-gold transition-colors">Mendoza 2656, Rosario, Santa Fe</span>
                  </a>
                  <a 
                    href="https://wa.me/5493413293388?text=Hola%20Punto%20Barba!%20Me%20gustar%C3%ADa%20reservar%20un%20turno%20para%20un%20servicio%20de%20barber%C3%ADa.%20%C2%BFQu%C3%A9%20horarios%20tienen%20disponibles?" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="flex flex-col md:flex-row items-center gap-6 group cursor-pointer"
                  >
                    <div className="w-12 h-12 bg-zinc-950/60 flex items-center justify-center border border-white/5 group-hover:border-gold transition-colors shrink-0">
                      <Phone className="w-4 h-4 text-gold" />
                    </div>
                    <span className="text-sm md:text-base font-sans tracking-wide text-charcoal group-hover:text-gold transition-colors">341 3293388</span>
                  </a>
                  <a 
                    href="https://www.instagram.com/puntobarba.barberia/" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="flex flex-col md:flex-row items-center gap-6 group cursor-pointer"
                  >
                    <div className="w-12 h-12 bg-zinc-950/60 flex items-center justify-center border border-white/5 group-hover:border-gold transition-colors shrink-0">
                      <Instagram className="w-4 h-4 text-gold" />
                    </div>
                    <span className="text-sm md:text-base font-sans tracking-wide text-charcoal group-hover:text-gold transition-colors">@puntobarba.barberia</span>
                  </a>
                </div>
              </div>

              {/* Map Placeholder Card */}
              <div className="relative h-[400px] md:h-[500px] bg-zinc-950 border border-white/5 overflow-hidden grayscale group">
                <img 
                  src="https://images.unsplash.com/photo-1524666041070-9d87656c25bb?auto=format&fit=crop&q=80&w=1000" 
                  alt="Map Placeholder" 
                  className="w-full h-full object-cover opacity-10 group-hover:opacity-25 transition-opacity duration-1000"
                  referrerPolicy="no-referrer"
                />
                <div className="absolute inset-0 flex items-center justify-center">
                  <motion.div 
                    animate={{ y: [0, -6, 0] }}
                    transition={{ repeat: Infinity, duration: 2.5, ease: "easeInOut" }}
                  >
                    <MapPin className="w-10 h-10 text-gold fill-gold/10" />
                  </motion.div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="bg-dark-bg py-20 border-t border-white/5">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-10">
          <div className="flex items-center gap-1">
            <img src={logoHorizontal} alt="Punto Barba" className="h-14 w-auto object-contain" />
          </div>
          <p className="text-[10px] text-charcoal uppercase tracking-[0.3em] text-center font-sans">
            © 2026 Punto Barba. Mendoza 2656, Rosario, Santa Fe. Tel: 341 3293388
          </p>
          <div className="flex gap-8">
            <a 
              href="https://www.instagram.com/puntobarba.barberia/" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-[10px] text-charcoal hover:text-gold uppercase tracking-[0.2em] transition-colors font-display"
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
