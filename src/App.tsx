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
import { motion } from 'motion/react';
import { useState, useEffect } from 'react';
import { BookingSystem } from './components/BookingSystem';
import { auth } from './firebase';
import { Toaster } from 'react-hot-toast';

export default function App() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      // User authentication state changed
    });
    return () => unsubscribe();
  }, []);

  return (
    <div className="min-h-screen font-sans selection:bg-crimson selection:text-white bg-distressed text-light-gray">
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
          <div className="text-3xl font-black tracking-normal uppercase font-display flex items-center gap-1">
            RESET <span className="bg-crimson text-white px-2 py-0.5 leading-none">ART</span> <span className="text-sm font-bold tracking-[0.3em] ml-2 hidden sm:inline">BARBERSHOP</span>
          </div>
          
          {/* Desktop Menu */}
          <div className="hidden md:flex items-center space-x-8">
            <a href="#cortes" className="text-sm font-bold uppercase tracking-widest hover:text-crimson transition-colors">Cortes</a>
            <a href="#cursos" className="text-sm font-bold uppercase tracking-widest hover:text-crimson transition-colors">Cursos</a>
            <a href="#contacto" className="text-sm font-bold uppercase tracking-widest hover:text-crimson transition-colors">Contacto</a>
            <a 
              href="#reserva" 
              className="bg-crimson px-6 py-2 text-sm font-bold uppercase tracking-widest hover:bg-crimson/80 transition-all active:scale-95"
            >
              Reservar
            </a>
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
            <a href="#cursos" onClick={() => setIsMenuOpen(false)} className="font-bold uppercase tracking-widest">Cursos</a>
            <a href="#contacto" onClick={() => setIsMenuOpen(false)} className="font-bold uppercase tracking-widest">Contacto</a>
            <a 
              href="#reserva" 
              onClick={() => setIsMenuOpen(false)}
              className="bg-red-600 w-full py-3 font-bold uppercase tracking-widest text-center"
            >
              Reservar
            </a>
          </motion.div>
        )}
      </nav>

      <main>
        {/* Hero Section */}
        <section className="relative min-h-screen flex items-center overflow-hidden py-20 md:py-0">
          <div className="absolute inset-0 z-0">
            <div className="absolute inset-0 bg-gradient-to-b md:bg-gradient-to-r from-black via-black/90 md:via-black/80 to-transparent z-10" />
            <img 
              src="https://images.unsplash.com/photo-1512690196252-741ef2c5a44a?auto=format&fit=crop&q=80&w=2000" 
              alt="Barber Shop" 
              className="w-full h-full object-cover grayscale opacity-20 md:opacity-30"
              referrerPolicy="no-referrer"
            />
          </div>

          <div className="relative z-20 max-w-7xl mx-auto px-6 w-full">
            <motion.div 
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8 }}
              className="max-w-3xl space-y-6 md:space-y-8 text-center md:text-left"
            >
              <span className="inline-block px-3 py-1 bg-crimson/10 border border-crimson/20 text-crimson font-display text-sm font-bold tracking-[0.2em] uppercase">
                Estilo & Academia
              </span>
              <h1 className="text-6xl sm:text-7xl md:text-8xl lg:text-[10rem] font-display font-black uppercase leading-[0.85] tracking-normal">
                RESET <span className="text-crimson">ART</span>
              </h1>
              <p className="text-lg md:text-3xl font-display text-charcoal max-w-lg italic border-l-0 md:border-l-4 border-crimson md:pl-6 uppercase tracking-tight mx-auto md:mx-0">
                Ven y descubre la mejor versión de ti
              </p>
              <div className="flex flex-col sm:flex-row justify-center md:justify-start gap-4 pt-6">
                <a 
                  href="#reserva" 
                  className="bg-crimson px-10 py-5 font-display font-bold uppercase tracking-widest text-lg hover:bg-crimson/80 transition-all active:scale-95 shadow-xl shadow-crimson/20 text-center"
                >
                  Reservar Turno
                </a>
                <a 
                  href="#cursos"
                  className="bg-charcoal/30 backdrop-blur-sm px-10 py-5 font-display font-bold uppercase tracking-widest text-lg hover:bg-charcoal/50 transition-all active:scale-95 border border-white/10 text-center"
                >
                  Ver Cursos
                </a>
              </div>
            </motion.div>
          </div>
        </section>

        {/* Services Section */}
        <section id="cortes" className="py-20 md:py-32 bg-black relative overflow-hidden concrete-texture">
          <div className="max-w-7xl mx-auto px-6 relative z-10">
            <div className="flex flex-col lg:flex-row justify-between items-center mb-16 md:mb-24 gap-12">
              <div className="flex-1 text-center lg:text-left">
                <h2 className="text-4xl md:text-7xl font-display font-black uppercase tracking-normal text-light-gray">Servicios de Autor</h2>
                <div className="h-2 w-24 bg-crimson mt-4 mx-auto lg:mx-0" />
                <p className="max-w-md text-charcoal text-base md:text-xl mt-8 mx-auto lg:mx-0 font-display">
                  Excelencia técnica en cada detalle. Fusionamos la barbería clásica con tendencias contemporáneas de alto nivel.
                </p>
              </div>
              <div className="flex-1 w-full max-w-md">
                <div className="relative aspect-square overflow-hidden rounded-sm border border-white/5 shadow-2xl grayscale hover:grayscale-0 transition-all duration-700 group">
                  <img 
                    src="https://i.postimg.cc/fRNGCywF/ccded255-3d3a-4af4-b0f3-2e2e82ab28d4.jpg" 
                    alt="Corte de Autor - Reset Barbería" 
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                    referrerPolicy="no-referrer"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent opacity-60" />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-charcoal/20 border border-charcoal/20">
              {[
                { id: '01', title: 'Cortes de Cabello', desc: 'Técnicas de degradado precisas, tijera clásica y texturizado personalizado.', icon: Scissors },
                { id: '02', title: 'Barba', desc: 'Ritual completo de toalla caliente, perfilado con navaja y nutrición profunda.', icon: User },
                { id: '03', title: 'Perfilado', desc: 'Limpieza absoluta de contornos y detalles críticos para un look pulcro.', icon: Brush },
              ].map((service) => (
                <div key={service.id} className="group relative bg-black p-8 md:p-12 hover:bg-zinc-900 transition-all duration-500 overflow-hidden concrete-texture">
                  <span className="text-crimson font-display font-bold text-xl mb-6 block">{service.id}</span>
                  <h3 className="text-3xl md:text-4xl font-display font-bold uppercase mb-4 text-light-gray">{service.title}</h3>
                  <p className="text-charcoal leading-relaxed mb-8 text-sm md:text-lg font-display">{service.desc}</p>
                  <service.icon className="w-12 h-12 md:w-16 md:h-16 absolute bottom-8 right-8 text-white/5 group-hover:text-crimson/20 transition-all duration-500" />
                </div>
              ))}
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
                "https://i.postimg.cc/Bnv8p37t/WhatsApp-Image-2024-10-09-at-15-58-20.jpg",
                "https://i.postimg.cc/c4s3F7zB/corte2.jpg" // Added a placeholder or repeated image to fill 4 columns. Wait, let's just use what we have and some realistic ones. I will use the same image twice or let's find 4 good generic barber images. Let's repeat 2.
              ].map((img, i) => (
                <div key={i} className="aspect-[4/5] relative overflow-hidden group cursor-pointer border border-white/5">
                  <img 
                    src={img} 
                    alt={`Corte Reset ART ${i + 1}`} 
                    className="w-full h-full object-cover grayscale opacity-70 group-hover:grayscale-0 group-hover:opacity-100 group-hover:scale-110 transition-all duration-700"
                    referrerPolicy="no-referrer"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-crimson/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                </div>
              ))}
            </div>
            <div className="text-center mt-12">
              <a href="https://instagram.com/reset.barberia" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-white hover:text-crimson transition-colors font-display font-bold uppercase tracking-widest border-b border-white/20 hover:border-crimson pb-1">
                <Instagram className="w-5 h-5" /> Ver más en Instagram
              </a>
            </div>
          </div>
        </section>

        {/* Booking Section */}
        <section id="reserva" className="py-20 md:py-32 bg-black concrete-texture relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-crimson to-transparent opacity-30" />
          <div className="max-w-7xl mx-auto px-6 relative z-10">
            <div className="text-center mb-16">
              <h2 className="text-4xl md:text-8xl font-display font-black uppercase tracking-normal text-light-gray">Agenda tu Turno</h2>
              <p className="text-charcoal text-lg md:text-2xl font-display mt-4 uppercase tracking-widest">Sistema de gestión en tiempo real</p>
            </div>
            <BookingSystem />
          </div>
        </section>

        {/* Academy Section */}
        <section id="cursos" className="py-20 md:py-32 relative overflow-hidden bg-black concrete-texture">
          <div className="max-w-7xl mx-auto px-6 relative z-10">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 lg:gap-24 items-center">
              <div className="relative order-2 lg:order-1">
                <div className="absolute -top-10 -left-10 w-48 md:w-64 h-48 md:h-64 bg-crimson/10 rounded-full blur-3xl" />
                <div className="relative aspect-square overflow-hidden rounded-sm border border-white/5 shadow-2xl">
                  <img 
                    src="https://lh3.googleusercontent.com/gps-cs-s/AHVAweoyt6z_GAUoSiBtsIysbEtb6a0je-DvhUxX3FvSX8DBCP8PtxqvJtI37DmlkWHZNkz99e24bQlcwXBcfXrD5PnVm763nNBGPOzC2fWj0Lv7zgCJYDpMcYxrPVUCCH-vVphDnvjlYw=s680-w680-h510-rw" 
                    alt="Reset Academy - Capacitación Profesional" 
                    className="w-full h-full object-cover grayscale hover:grayscale-0 transition-all duration-700"
                    referrerPolicy="no-referrer"
                  />
                  <div className="absolute bottom-0 right-0 bg-crimson p-6 md:p-8">
                    <h4 className="font-display font-black text-xl md:text-4xl uppercase leading-none text-white">Aprendizaje<br/>Garantizado</h4>
                  </div>
                </div>
              </div>

              <div className="space-y-8 md:space-y-10 order-1 lg:order-2 text-center lg:text-left">
                <div>
                  <span className="text-crimson font-display font-bold uppercase tracking-widest text-sm md:text-lg mb-4 block">Reset Academy</span>
                  <h2 className="text-4xl md:text-8xl font-display font-black uppercase tracking-normal leading-[0.9] text-light-gray">
                    Capacitación Barbería Profesional
                  </h2>
                </div>

                <div className="space-y-4 md:space-y-6">
                  <div className="flex flex-col md:flex-row items-center md:items-start gap-4 md:gap-6 p-6 md:p-8 bg-zinc-900/50 border border-white/5 hover:border-crimson/30 transition-colors text-center md:text-left concrete-texture">
                    <GraduationCap className="text-crimson w-8 h-8 shrink-0" />
                    <div>
                      <h5 className="text-lg md:text-2xl font-display font-bold uppercase mb-2 text-light-gray">Barbería Inicial</h5>
                      <p className="text-charcoal text-sm md:text-lg font-display">Desde cero absoluto hasta dominar las herramientas y técnicas de corte más demandadas.</p>
                    </div>
                  </div>
                  <div className="flex flex-col md:flex-row items-center md:items-start gap-4 md:gap-6 p-6 md:p-8 bg-zinc-900/50 border border-white/5 hover:border-crimson/30 transition-colors text-center md:text-left concrete-texture">
                    <Award className="text-crimson w-8 h-8 shrink-0" />
                    <div>
                      <h5 className="text-lg md:text-2xl font-display font-bold uppercase mb-2 text-light-gray">Certificado de Participación</h5>
                      <p className="text-charcoal text-sm md:text-lg font-display">Aval oficial de Reset ART para impulsar tu carrera profesional en el mercado laboral.</p>
                    </div>
                  </div>
                </div>

                <a 
                  href="https://wa.me/5493413143702?text=Hola!%20Estoy%20interesado%20en%20inscribirme%20a%20los%20cursos%20de%20Reset%20Academy.%20%C2%BFMe%20podr%C3%ADan%20dar%20m%C3%A1s%20informaci%C3%B3n?" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="w-full md:w-auto bg-transparent border-2 border-crimson text-crimson px-12 py-5 font-display font-bold uppercase tracking-widest text-lg hover:bg-crimson hover:text-white transition-all shadow-lg shadow-crimson/5 text-center"
                >
                  Inscribirse Ahora
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* Features Bento Grid */}
        <section className="py-20 md:py-32 bg-black concrete-texture">
          <div className="max-w-7xl mx-auto px-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
              <div className="sm:col-span-2 bg-zinc-900/50 p-8 md:p-12 flex flex-col justify-between min-h-[280px] md:h-[320px] border border-white/5 group hover:border-crimson/20 transition-colors concrete-texture">
                <Wrench className="text-crimson w-10 h-10 md:w-12 md:h-12" />
                <div>
                  <h3 className="text-xl md:text-3xl font-display font-bold uppercase mb-3 text-light-gray">Te prestamos las herramientas</h3>
                  <p className="text-charcoal text-sm md:text-lg font-display">Equipamiento profesional de alta gama a tu disposición durante toda la cursada.</p>
                </div>
              </div>
              
              <div className="bg-crimson p-8 md:p-12 flex flex-col justify-between min-h-[280px] md:h-[320px] shadow-xl shadow-crimson/10 concrete-texture">
                <BookOpen className="text-white w-10 h-10 md:w-12 md:h-12" />
                <div>
                  <h3 className="text-xl md:text-3xl font-display font-bold uppercase mb-3 text-white">Guía Digital</h3>
                  <p className="text-white/80 text-sm md:text-lg font-display">Material de estudio exclusivo en formato digital para repasar en cualquier momento.</p>
                </div>
              </div>

              <div className="bg-zinc-900/50 p-8 md:p-12 flex flex-col justify-between min-h-[280px] md:h-[320px] border border-white/5 group hover:border-crimson/20 transition-colors concrete-texture">
                <Headset className="text-crimson w-10 h-10 md:w-12 md:h-12" />
                <div>
                  <h3 className="text-xl md:text-3xl font-display font-bold uppercase mb-3 text-light-gray">Asesoría Personalizada</h3>
                  <p className="text-charcoal text-sm md:text-lg font-display">Mentoría individual para perfeccionar tus puntos débiles técnicos.</p>
                </div>
              </div>

              <div className="sm:col-span-2 lg:col-span-4 bg-zinc-900/50 p-8 md:p-12 border border-white/5 group hover:border-crimson/20 transition-colors concrete-texture">
                <div className="flex flex-col md:flex-row items-center gap-6 md:gap-10 text-center md:text-left">
                  <BarChart3 className="text-crimson w-12 h-12 md:w-16 md:h-16 shrink-0" />
                  <div>
                    <h3 className="text-2xl md:text-4xl font-display font-bold uppercase mb-2 text-light-gray">Supervisión y Seguimiento</h3>
                    <p className="text-charcoal text-base md:text-xl font-display">Evaluación constante de tu progreso real para garantizar resultados profesionales.</p>
                  </div>
                </div>
              </div>
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
                    href="https://www.google.com/maps/search/?api=1&query=Mitre+264,+Rosario,+Santa+Fe" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="flex flex-col md:flex-row items-center gap-4 md:gap-8 group cursor-pointer"
                  >
                    <div className="w-14 h-14 md:w-16 md:h-16 bg-zinc-900 flex items-center justify-center border border-white/5 group-hover:bg-crimson transition-colors shrink-0">
                      <MapPin className="w-5 h-5 md:w-6 md:h-6" />
                    </div>
                    <span className="text-lg md:text-2xl font-display font-medium group-hover:text-crimson transition-colors text-light-gray">Mitre 264, Rosario, Santa Fe</span>
                  </a>
                  <a 
                    href="https://wa.me/5493413143702?text=Hola%20ResetART!%20Me%20gustar%C3%ADa%20reservar%20un%20turno%20para%20un%20servicio%20de%20barber%C3%ADa.%20%C2%BFQu%C3%A9%20horarios%20tienen%20disponibles?" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="flex flex-col md:flex-row items-center gap-4 md:gap-8 group cursor-pointer"
                  >
                    <div className="w-14 h-14 md:w-16 md:h-16 bg-zinc-900 flex items-center justify-center border border-white/5 group-hover:bg-crimson transition-colors shrink-0">
                      <Phone className="w-5 h-5 md:w-6 md:h-6" />
                    </div>
                    <span className="text-lg md:text-2xl font-display font-medium group-hover:text-crimson transition-colors text-light-gray">341 3143702</span>
                  </a>
                  <a 
                    href="https://www.instagram.com/reset.barberia/" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="flex flex-col md:flex-row items-center gap-4 md:gap-8 group cursor-pointer"
                  >
                    <div className="w-14 h-14 md:w-16 md:h-16 bg-zinc-900 flex items-center justify-center border border-white/5 group-hover:bg-crimson transition-colors shrink-0">
                      <Instagram className="w-5 h-5 md:w-6 md:h-6" />
                    </div>
                    <span className="text-lg md:text-2xl font-display font-medium group-hover:text-crimson transition-colors text-light-gray">@reset.barberia</span>
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
          <div className="text-3xl font-black uppercase font-display tracking-normal flex items-center gap-1">
            RESET <span className="bg-crimson text-white px-2 py-0.5 leading-none">ART</span>
          </div>
          <p className="text-xs text-charcoal uppercase tracking-[0.3em] text-center font-display">
            © 2024 ResetART BarberShop. Mitre 264, Rosario, Santa Fe. Tel: 341 3143702
          </p>
          <div className="flex gap-8">
            <a 
              href="https://www.instagram.com/reset.barberia/" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-xs text-charcoal hover:text-crimson uppercase tracking-widest transition-colors font-display"
            >
              Instagram: @reset.barberia
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
