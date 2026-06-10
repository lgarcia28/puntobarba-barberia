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
  X,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { motion, AnimatePresence, useMotionValue, animate } from 'motion/react';
import { useState, useEffect, useRef } from 'react';
import { BookingSystem } from './components/BookingSystem';
import { auth, db } from './firebase';
import { collection, query, onSnapshot, doc } from 'firebase/firestore';
import { Toaster } from 'react-hot-toast';
import { DEFAULT_PRODUCTS } from './lib/firestore';

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
  const [selectedServiceForBooking, setSelectedServiceForBooking] = useState<string | null>(null);
  
  // Dynamic products catalog state
  const [products, setProducts] = useState<any[]>([]);
  // Dynamic services state
  const [services, setServices] = useState<any[]>([]);

  useEffect(() => {
    const q = query(collection(db, 'products'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const prodsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      if (prodsData.length === 0) {
        setProducts(DEFAULT_PRODUCTS);
      } else {
        setProducts(prodsData);
      }
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    const docRef = doc(db, 'settings', 'shop');
    const unsubscribe = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists() && docSnap.data().services) {
        setServices(docSnap.data().services);
      } else {
        setServices([
          { id: 'corte', name: 'Corte de Pelo Premium', duration: 30, price: 18000, desc: "Degradados de precisión, corte clásico a tijera y texturizado personalizado. Incluye asesoramiento de visagismo y lavado final." },
          { id: 'barba', name: 'Barba de Autor', duration: 30, price: 13000, desc: "Ritual completo de toallas calientes, perfilado detallado con navaja, recortado simétrico y nutrición con aceites premium de cedro y sándalo." },
          { id: 'corte-barba', name: 'Corte & Barba (Combo)', duration: 60, price: 25000, desc: "La experiencia de cuidado definitiva. Combina nuestro corte premium y el spa completo de barba en una única sesión de una hora." }
        ]);
      }
    });
    return unsubscribe;
  }, []);

  // Gallery Carousel State
  const [activeSlide, setActiveSlide] = useState(0);
  const [activeCategory, setActiveCategory] = useState<'Todos' | 'Cortes' | 'Barba'>('Todos');
  const galleryContainerRef = useRef<HTMLDivElement>(null);
  const [galleryContainerWidth, setGalleryContainerWidth] = useState(0);
  const galleryDragX = useMotionValue(0);
  
  const galleryImages = [
    { url: "https://images.unsplash.com/photo-1621605815971-fbc98d665033?auto=format&fit=crop&q=80&w=1000", category: "Cortes" },
    { url: "https://images.unsplash.com/photo-1599351431202-1e0f0137899a?auto=format&fit=crop&q=80&w=1000", category: "Cortes" },
    { url: "https://images.unsplash.com/photo-1503951914875-452162b0f3f1?auto=format&fit=crop&q=80&w=1000", category: "Barba" },
    { url: "https://images.unsplash.com/photo-1512864084360-7c0c4d0a0845?auto=format&fit=crop&q=80&w=1000", category: "Cortes" },
    { url: "https://images.unsplash.com/photo-1605497746444-ac9dbd324ce8?auto=format&fit=crop&q=80&w=1000", category: "Barba" }
  ];

  const filteredImages = activeCategory === 'Todos' ? galleryImages : galleryImages.filter(img => img.category === activeCategory);

  useEffect(() => {
    setActiveSlide(0);
    galleryDragX.set(0);
  }, [activeCategory, galleryDragX]);

  useEffect(() => {
    if (galleryContainerRef.current) {
      setGalleryContainerWidth(galleryContainerRef.current.offsetWidth);
    }
    const handleResize = () => {
      if (galleryContainerRef.current) {
        setGalleryContainerWidth(galleryContainerRef.current.offsetWidth);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (galleryContainerWidth > 0) {
      animate(galleryDragX, -activeSlide * galleryContainerWidth, {
        type: "spring",
        stiffness: 300,
        damping: 30
      });
    }
  }, [activeSlide, galleryContainerWidth, galleryDragX]);
  
  const handlePrevSlide = () => {
    setActiveSlide((prev) => (prev === 0 ? filteredImages.length - 1 : prev - 1));
  };
  
  const handleNextSlide = () => {
    setActiveSlide((prev) => (prev === filteredImages.length - 1 ? 0 : prev + 1));
  };

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

  // Helper to navigate between pages
  const navigateTo = (path: string) => {
    window.history.pushState({}, '', path);
    setCurrentPath(path);
    setIsMenuOpen(false);
    window.scrollTo(0, 0);
  };

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
              onClick={() => navigateTo('/')}
            >
              <img src={logoHorizontal} alt="Punto Barba" className="h-14 md:h-18 w-auto object-contain" />
            </div>
            <a 
              href="/" 
              onClick={(e) => {
                e.preventDefault();
                navigateTo('/');
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

  // Shared navigation bar for all public pages
  const renderNav = () => (
    <nav className="fixed top-0 w-full z-50 bg-black/80 backdrop-blur-md border-b border-white/5">
      <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
        <div 
          className="flex items-center gap-2 md:gap-2.5 cursor-pointer"
          onClick={() => navigateTo('/')}
        >
          {showIntro && currentPath === '/' ? (
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
                layoutId={currentPath === '/' ? "logo-symbol" : undefined}
                src={logoSymbol} 
                alt="Punto Barba" 
                className="h-[40px] w-[32.6px] md:h-[52px] md:w-[42.4px] object-contain" 
                transition={{ type: "spring", stiffness: 45, damping: 15 }}
              />
              <motion.div 
                layoutId={currentPath === '/' ? "logo-text" : undefined}
                className="flex flex-col justify-center leading-[0.8] font-sans font-black text-gold select-none"
                transition={{ type: "spring", stiffness: 45, damping: 15 }}
              >
                <motion.span layoutId={currentPath === '/' ? "word-punto" : undefined} className="text-[25px] md:text-[32.5px] tracking-tight" transition={{ type: "spring", stiffness: 45, damping: 15 }}>PUNTO</motion.span>
                <motion.span layoutId={currentPath === '/' ? "word-barba" : undefined} className="text-[25px] md:text-[32.5px] tracking-tight" transition={{ type: "spring", stiffness: 45, damping: 15 }}>BARBA</motion.span>
              </motion.div>
            </>
          )}
        </div>
        
        {/* Desktop Menu */}
        <div className="hidden md:flex items-center space-x-8">
          <a href="/galeria" onClick={(e) => { e.preventDefault(); navigateTo('/galeria'); }} className={`text-sm font-bold uppercase tracking-widest hover:text-gold transition-colors ${currentPath === '/galeria' ? 'text-gold' : ''}`}>Galería</a>
          <a href="/catalogo" onClick={(e) => { e.preventDefault(); navigateTo('/catalogo'); }} className={`text-sm font-bold uppercase tracking-widest hover:text-gold transition-colors ${currentPath === '/catalogo' ? 'text-gold' : ''}`}>Productos</a>
          <a href="/#contacto" onClick={(e) => { e.preventDefault(); navigateTo('/'); setTimeout(() => document.getElementById('contacto')?.scrollIntoView({ behavior: 'smooth' }), 100); }} className="text-sm font-bold uppercase tracking-widest hover:text-gold transition-colors">Contacto</a>
          {isBarberAdmin && (
            <a 
              href="/admin" 
              onClick={(e) => {
                e.preventDefault();
                navigateTo('/admin');
              }}
              className="text-sm font-bold uppercase tracking-widest text-gold hover:text-white transition-colors"
            >
              Panel de Gestión
            </a>
          )}
          <button 
            onClick={() => { setSelectedServiceForBooking(null); setBookingTab('mis-turnos'); setIsBookingOpen(true); }}
            className="btn-pill-outline !px-6 !py-2 text-[10px]"
          >
            Mis Turnos
          </button>
          <button 
            onClick={() => { setSelectedServiceForBooking(null); setBookingTab('agendar'); setIsBookingOpen(true); }}
            className="btn-pill-solid !px-6 !py-2 text-[10px]"
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
          <a href="/" onClick={(e) => { e.preventDefault(); navigateTo('/'); }} className={`font-bold uppercase tracking-widest ${currentPath === '/' ? 'text-gold' : ''}`}>Inicio</a>
          <a href="/galeria" onClick={(e) => { e.preventDefault(); navigateTo('/galeria'); }} className={`font-bold uppercase tracking-widest ${currentPath === '/galeria' ? 'text-gold' : ''}`}>Galería</a>
          <a href="/catalogo" onClick={(e) => { e.preventDefault(); navigateTo('/catalogo'); }} className={`font-bold uppercase tracking-widest ${currentPath === '/catalogo' ? 'text-gold' : ''}`}>Productos</a>
          <a href="/#contacto" onClick={(e) => { e.preventDefault(); navigateTo('/'); setTimeout(() => document.getElementById('contacto')?.scrollIntoView({ behavior: 'smooth' }), 100); }} className="font-bold uppercase tracking-widest">Contacto</a>
          {isBarberAdmin && (
            <a 
              href="/admin" 
              onClick={(e) => {
                e.preventDefault();
                navigateTo('/admin');
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
                setSelectedServiceForBooking(null);
                setBookingTab('mis-turnos');
                setIsBookingOpen(true);
              }}
              className="rounded-full border border-white/15 py-2.5 font-display font-semibold uppercase tracking-widest text-center text-[10px] text-light-gray hover:border-gold hover:text-white transition-all bg-black/50 cursor-pointer"
            >
              Mis Turnos
            </button>
            <button 
              onClick={() => {
                setIsMenuOpen(false);
                setSelectedServiceForBooking(null);
                setBookingTab('agendar');
                setIsBookingOpen(true);
              }}
              className="rounded-full bg-gold py-2.5 font-display font-semibold uppercase tracking-widest text-center text-[10px] text-neutral-900 hover:bg-gold-hover transition-all cursor-pointer"
            >
              Reservar
            </button>
          </div>
        </motion.div>
      )}
    </nav>
  );

  // Shared booking modal for all pages
  const renderBookingModal = () => (
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
              onClick={() => {
                setIsBookingOpen(false);
                setSelectedServiceForBooking(null);
              }}
              className="absolute top-4 right-4 md:top-6 md:right-6 text-charcoal hover:text-white transition-colors cursor-pointer p-2 hover:bg-white/5 rounded-full z-50"
            >
              <X className="w-6 h-6" />
            </button>

            <BookingSystem 
              bookingTab={bookingTab} 
              setBookingTab={setBookingTab} 
              onClose={() => {
                setIsBookingOpen(false);
                setSelectedServiceForBooking(null);
              }}
              forceClientFlow={true}
              initialServiceName={selectedServiceForBooking}
            />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  // ==================== GALLERY PAGE ====================
  if (currentPath === '/galeria' || currentPath === '/galeria/') {
    return (
      <div className="min-h-screen font-sans selection:bg-gold selection:text-white bg-distressed text-light-gray">
        <Toaster position="top-center" toastOptions={{ style: { background: '#18181b', color: '#fff', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '0px', textTransform: 'uppercase', fontFamily: 'Inter, sans-serif', fontSize: '14px', letterSpacing: '1px' }, success: { iconTheme: { primary: '#dc2626', secondary: '#fff' } } }} />
        {renderNav()}
        <main className="pt-24">
          <section className="py-24 bg-dark-bg relative overflow-hidden">
            <div className="max-w-7xl mx-auto px-6">
              <div className="text-center mb-10">
                <h2 className="text-3xl md:text-5xl font-display font-bold uppercase tracking-wide text-light-gray">Galería</h2>
              </div>

              {/* Category Filters */}
              <div className="flex justify-center gap-4 mb-8">
                {['Todos', 'Cortes', 'Barba'].map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setActiveCategory(cat as any)}
                    className={`px-4 py-1.5 text-[10px] font-display font-semibold uppercase tracking-widest border transition-all duration-300 rounded-full cursor-pointer ${
                      activeCategory === cat 
                        ? 'bg-gold border-gold text-zinc-950 shadow-md shadow-gold/10' 
                        : 'border-white/10 hover:border-gold/50 text-charcoal hover:text-white'
                    }`}
                  >
                    {cat === 'Todos' ? '[ Todos ]' : cat === 'Cortes' ? '[ Cortes ]' : '[ Barbas ]'}
                  </button>
                ))}
              </div>
              
              {/* Gallery Carousel */}
              <div className="relative max-w-4xl mx-auto">
                <div 
                  ref={galleryContainerRef}
                  className="relative aspect-[16/10] sm:aspect-[16/9] md:aspect-[21/10] overflow-hidden border border-white/5 bg-zinc-950/60 shadow-2xl"
                >
                  <motion.div
                    drag="x"
                    dragConstraints={{
                      left: -galleryContainerWidth * (filteredImages.length - 1),
                      right: 0
                    }}
                    dragElastic={0.6}
                    style={{ x: galleryDragX }}
                    onDragEnd={(event, info) => {
                      const offset = info.offset.x;
                      const velocity = info.velocity.x;
                      const swipeThreshold = galleryContainerWidth * 0.15;
                      let newSlide = activeSlide;
                      if (offset < -swipeThreshold || velocity < -400) {
                        newSlide = Math.min(filteredImages.length - 1, activeSlide + 1);
                      } else if (offset > swipeThreshold || velocity > 400) {
                        newSlide = Math.max(0, activeSlide - 1);
                      }
                      if (newSlide === activeSlide) {
                        animate(galleryDragX, -activeSlide * galleryContainerWidth, { type: "spring", stiffness: 300, damping: 30 });
                      } else {
                        setActiveSlide(newSlide);
                      }
                    }}
                    className="flex w-full h-full cursor-grab active:cursor-grabbing"
                  >
                    {filteredImages.map((img, idx) => (
                      <div key={idx} className="w-full h-full shrink-0 relative select-none">
                        <img
                          src={img.url}
                          alt={`Corte Punto Barba ${idx + 1}`}
                          className="w-full h-full object-cover grayscale opacity-80 pointer-events-none"
                          referrerPolicy="no-referrer"
                        />
                      </div>
                    ))}
                  </motion.div>

                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent pointer-events-none" />
                  
                  <button
                    onClick={handlePrevSlide}
                    className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full border border-white/10 bg-black/60 hover:bg-black hover:border-gold/50 flex items-center justify-center text-white hover:text-gold transition-all duration-300 z-10 cursor-pointer active:scale-90"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <button
                    onClick={handleNextSlide}
                    className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full border border-white/10 bg-black/60 hover:bg-black hover:border-gold/50 flex items-center justify-center text-white hover:text-gold transition-all duration-300 z-10 cursor-pointer active:scale-90"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </div>

                <div className="flex justify-center gap-2 mt-6">
                  {filteredImages.map((_, idx) => (
                    <button
                      key={idx}
                      onClick={() => setActiveSlide(idx)}
                      className={`h-1.5 rounded-full transition-all duration-300 cursor-pointer ${idx === activeSlide ? 'w-6 bg-gold' : 'w-1.5 bg-white/20 hover:bg-white/40'}`}
                    />
                  ))}
                </div>
                
                <div className="text-center mt-8">
                  <a 
                    href="https://www.instagram.com/puntobarba.barberia/" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-charcoal hover:text-gold font-display font-semibold uppercase tracking-[0.2em] text-xs transition-colors duration-300"
                  >
                    <Instagram className="w-4 h-4" />
                    <span>Seguinos en @puntobarba.barberia</span>
                  </a>
                </div>
              </div>
            </div>
          </section>
        </main>
        {renderBookingModal()}
      </div>
    );
  }

  // ==================== CATALOG PAGE ====================
  if (currentPath === '/catalogo' || currentPath === '/catalogo/') {
    return (
      <div className="min-h-screen font-sans selection:bg-gold selection:text-white bg-distressed text-light-gray">
        <Toaster position="top-center" toastOptions={{ style: { background: '#18181b', color: '#fff', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '0px', textTransform: 'uppercase', fontFamily: 'Inter, sans-serif', fontSize: '14px', letterSpacing: '1px' }, success: { iconTheme: { primary: '#dc2626', secondary: '#fff' } } }} />
        {renderNav()}
        <main className="pt-24">
          <section className="py-24 md:py-36 bg-[#090909] relative overflow-hidden">
            {/* Ambient background glows */}
            <div className="absolute top-1/4 left-1/4 w-[400px] h-[400px] bg-gold/[0.03] rounded-full blur-[120px] pointer-events-none" />
            <div className="absolute bottom-1/3 right-1/4 w-[400px] h-[400px] bg-gold/[0.02] rounded-full blur-[120px] pointer-events-none" />

            <div className="max-w-7xl mx-auto px-4 sm:px-6 relative z-10">
              <div className="text-center mb-16 md:mb-20">
                <h2 className="text-3xl md:text-5xl font-display font-bold uppercase tracking-wide text-light-gray">
                  Cuidado & Estilo
                </h2>
                <p className="mt-4 text-charcoal text-xs md:text-sm font-sans tracking-wide max-w-md mx-auto">
                  Una curaduría de fórmulas botánicas y productos de culto esenciales para la rutina del hombre contemporáneo.
                </p>
                <div className="h-[0.5px] w-16 bg-gold/50 mt-6 mx-auto" />
              </div>

              {/* Product Grid */}
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-[1px] bg-white/5 border border-white/5">
                {products.map((prod) => (
                  <div 
                    key={prod.id} 
                    className="group p-3 sm:p-6 md:p-8 flex flex-col justify-between transition-colors hover:bg-white/[0.02] bg-[#090909]"
                  >
                    <div className="space-y-3 sm:space-y-6">
                      <div className="relative aspect-square overflow-hidden bg-zinc-950/60 border border-white/5">
                        <img 
                          src={prod.img} 
                          alt={prod.name} 
                          className="w-full h-full object-cover grayscale opacity-70 group-hover:grayscale-0 group-hover:opacity-100 group-hover:scale-102 transition-all duration-1000"
                          referrerPolicy="no-referrer"
                        />
                        <span className="absolute top-2 left-2 sm:top-3 sm:left-3 bg-zinc-950/90 text-gold font-sans font-semibold text-[7px] sm:text-[8px] tracking-[0.2em] px-1.5 sm:px-2.5 py-0.5 sm:py-1 uppercase border border-white/10">
                          {prod.tag}
                        </span>
                      </div>
                      
                      <div className="space-y-1 sm:space-y-2">
                        <h3 className="text-xs sm:text-lg font-display font-semibold uppercase text-light-gray tracking-wide leading-tight">{prod.name}</h3>
                        <p className="text-charcoal text-[9px] sm:text-[11px] font-sans tracking-wide leading-relaxed line-clamp-2 sm:line-clamp-3 hidden sm:block">{prod.desc}</p>
                      </div>
                    </div>

                    <div className="pt-3 sm:pt-6 space-y-2 sm:space-y-4">
                      <span className="text-sm sm:text-xl font-display font-bold text-gold block">{prod.price}</span>
                      <a 
                        href={`https://wa.me/5493413293388?text=Hola%20Punto%20Barba!%20Me%20interesa%20comprar%20el%20producto%20${encodeURIComponent(prod.name)}%20de%20su%20cat%C3%A1logo.%20%C2%BFHay%20stock%20disponible?`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-full flex items-center justify-center gap-1 sm:gap-2 py-2 sm:py-3 font-display font-semibold uppercase text-[8px] sm:text-[10px] tracking-[0.15em] sm:tracking-[0.25em] text-gold hover:text-white transition-all duration-300 text-light-gray border border-gold/25 hover:border-gold/60 rounded-full group/btn cursor-pointer"
                      >
                        <span>Consultar</span>
                        <span className="inline-block transform transition-transform duration-300 group-hover/btn:translate-x-1">→</span>
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </main>
        {renderBookingModal()}
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
      {renderNav()}

      <main>
        {/* Hero Section */}
        <section className="relative min-h-screen flex items-center overflow-hidden py-32 md:py-0 bg-dark-bg border-b border-white/5">
          {/* Ambient background glow */}
          <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-gold/[0.03] rounded-full blur-[150px] pointer-events-none" />
          
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
                    Cortes | Barbas | Facial | Styling
                  </span>
                  
                  <div className="py-4 flex justify-center md:justify-start">
                    <img 
                      src={logoVertical} 
                      alt="Punto Barba" 
                      className="h-44 sm:h-52 md:h-64 lg:h-72 w-auto object-contain max-w-full"
                    />
                  </div>
                </div>
                
                <h1 className="text-3xl md:text-5xl font-display font-bold uppercase tracking-wide text-light-gray leading-tight">
                  Tu estilo habla antes que vos.
                </h1>
                
                <p className="max-w-md mx-auto md:mx-0 text-charcoal text-sm md:text-base font-sans tracking-wide leading-relaxed">
                  Agenda tu turno en línea en solo 1 minuto
                </p>
                
                <div className="flex justify-center md:justify-start pt-4">
                  <button 
                    onClick={() => { setSelectedServiceForBooking(null); setBookingTab('agendar'); setIsBookingOpen(true); }}
                    className="w-full sm:w-auto btn-pill-solid"
                  >
                    Reservar turno
                  </button>
                </div>
              </motion.div>
              
              {/* Image Frame Column */}
              <motion.div 
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.8, delay: 0.2 }}
                className="col-span-1 md:col-span-5"
              >
                <div className="relative group p-6 max-w-md mx-auto md:max-w-none">
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



        {/* Contact Section */}
        <section id="contacto" className="py-24 md:py-36 bg-dark-bg relative overflow-hidden">
          {/* Ambient background glow */}
          <div className="absolute top-1/2 right-1/4 translate-x-1/2 w-[500px] h-[500px] bg-gold/[0.015] rounded-full blur-[150px] pointer-events-none" />

          <div className="max-w-7xl mx-auto px-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 lg:gap-24 items-center">
              
              {/* Info Column */}
              <div className="space-y-12 text-center lg:text-left">
                <div className="space-y-4">
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

              {/* Google Map Embedded */}
              <div className="relative h-[400px] md:h-[500px] bg-zinc-950 border border-white/5 overflow-hidden rounded-sm">
                <iframe
                  src="https://maps.google.com/maps?q=Mendoza%202656,%20Rosario,%20Argentina&t=&z=16&ie=UTF8&iwloc=&output=embed"
                  className="w-full h-full border-0 grayscale invert-[0.9] contrast-[1.2] opacity-80"
                  loading="lazy"
                  title="Ubicación Punto Barba"
                />
                <div className="absolute inset-0 pointer-events-none border border-white/5" />
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

      {renderBookingModal()}
    </div>
  );
}
