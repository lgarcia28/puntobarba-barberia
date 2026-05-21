import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import dotenv from "dotenv";
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, query, where, getDocs, updateDoc, doc, Timestamp, getDoc, runTransaction } from 'firebase/firestore';
import fs from 'fs';

dotenv.config();

let firebaseApp;
let db: any;
try {
  const firebaseConfig = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'firebase-applet-config.json'), 'utf-8'));
  firebaseApp = initializeApp(firebaseConfig);
  db = getFirestore(firebaseApp, firebaseConfig.firestoreDatabaseId);
} catch (e) {
  console.error("No se pudo inicializar Firebase en el servidor:", e);
}

async function sendWhatsAppMessage(phone: string, message: string) {
  let formattedPhone = phone.replace(/\D/g, "");
  if (formattedPhone.length === 10) {
    formattedPhone = "549" + formattedPhone;
  } else if (formattedPhone.startsWith("54") && formattedPhone.length === 12) {
    formattedPhone = "549" + formattedPhone.substring(2);
  } else if (formattedPhone.startsWith("0")) {
    formattedPhone = "549" + formattedPhone.substring(1);
  }

  const GREEN_API_ID = process.env.GREEN_API_ID;
  const GREEN_API_TOKEN = process.env.GREEN_API_TOKEN;
  const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL;

  if (N8N_WEBHOOK_URL) {
    const response = await fetch(N8N_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: formattedPhone, message })
    });
    if (!response.ok) throw new Error("Error enviando al webhook de n8n");
    return { success: true, method: "n8n" };
  } else if (GREEN_API_ID && GREEN_API_TOKEN) {
    const url = `https://api.green-api.com/waInstance${GREEN_API_ID}/sendMessage/${GREEN_API_TOKEN}`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chatId: `${formattedPhone}@c.us`, message })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || "Error en Green API");
    return { success: true, method: "green_api", data };
  } else {
    throw new Error("API de mensajes no configurada");
  }
}

export async function processReminders(db: any) {
  const results: { sent: string[], errors: string[] } = { sent: [], errors: [] };
  if (!db) {
    throw new Error("Base de datos no inicializada");
  }

  try {
    const now = new Date();
    const q = query(
      collection(db, 'appointments'),
      where('status', '==', 'confirmed'),
      where('startTime', '>=', Timestamp.fromDate(now))
    );
    
    const snapshot = await getDocs(q);
    
    for (const docSnap of snapshot.docs) {
      const appt = docSnap.data();
      if (appt.reminderSent) continue;
      
      const startTime = appt.startTime.toDate();
      
      // Obtener la fecha y hora exacta en la zona horaria de Argentina (UTC-3)
      const argStartTime = new Date(startTime.getTime() - 3 * 3600000);
      const argNow = new Date(now.getTime() - 3 * 3600000);
      
      const startHour = argStartTime.getUTCHours();
      const startMinutes = argStartTime.getUTCMinutes();
      const timeFloat = startHour + startMinutes / 60;
      
      let shouldSend = false;
      const diffHours = (startTime.getTime() - now.getTime()) / (1000 * 60 * 60);
      
      if (timeFloat >= 12) {
        // Turnos de tarde (12:00 hs en adelante): recordatorio 4 horas antes
        if (diffHours <= 4 && diffHours > 0) {
          shouldSend = true;
        }
      } else {
        // Turnos de mañana (antes de las 12:00 hs): el día anterior entre las 20:30 y las 21:30 hs
        const previousDayDate = new Date(argStartTime.getTime() - 24 * 3600000);
        const isPreviousDay = argNow.getUTCDate() === previousDayDate.getUTCDate() && 
                              argNow.getUTCMonth() === previousDayDate.getUTCMonth() &&
                              argNow.getUTCFullYear() === previousDayDate.getUTCFullYear();
        
        const nowHour = argNow.getUTCHours();
        const nowMinutes = argNow.getUTCMinutes();
        const nowFloat = nowHour + nowMinutes / 60;
        
        const isBetweenWindow = nowFloat >= 20.5 && nowFloat <= 21.5; // Entre las 20:30 y las 21:30 hs
        
        const isSameDay = argNow.getUTCDate() === argStartTime.getUTCDate() &&
                          argNow.getUTCMonth() === argStartTime.getUTCMonth() &&
                          argNow.getUTCFullYear() === argStartTime.getUTCFullYear();
        
        if (isPreviousDay && isBetweenWindow) {
          shouldSend = true;
        } else if (isSameDay && diffHours <= 12 && diffHours > 0) {
          // Respaldo para reservas de último momento hechas el mismo día
          shouldSend = true;
        }
      }
      
      if (shouldSend) {
        let transactionSuccess = false;
        try {
          transactionSuccess = await runTransaction(db, async (transaction) => {
            const apptRef = doc(db, 'appointments', docSnap.id);
            const freshDoc = await transaction.get(apptRef);
            if (!freshDoc.exists()) return false;
            
            const freshAppt = freshDoc.data();
            if (freshAppt.reminderSent) return false;
            
            transaction.update(apptRef, { reminderSent: true });
            return true;
          });
        } catch (tErr) {
          console.error(`Error en transacción para recordatorio ${docSnap.id}:`, tErr);
          continue;
        }

        if (transactionSuccess) {
          let firstName = (appt.customerName || "Cliente").trim().split(" ")[0];
          if (firstName) firstName = firstName.charAt(0).toUpperCase() + firstName.slice(1).toLowerCase();
          
          const dateStr = `${argStartTime.getUTCDate().toString().padStart(2, '0')}/${(argStartTime.getUTCMonth() + 1).toString().padStart(2, '0')}/${argStartTime.getUTCFullYear()}`;
          const timeStr = `${argStartTime.getUTCHours().toString().padStart(2, '0')}:${argStartTime.getUTCMinutes().toString().padStart(2, '0')}`;
          
          let barberName = "Barbero";
          if (appt.barberId) {
            try {
              const barberDoc = await getDoc(doc(db, 'barbers', appt.barberId));
              if (barberDoc.exists()) {
                barberName = barberDoc.data().name || "Barbero";
              }
            } catch (e) {
              console.error("Error obteniendo barbero:", e);
            }
          }

          const message = `¡Hola ${firstName}! 👋\nTe recordamos que tienes un turno en ResetART.\n\n📅 Fecha: ${dateStr}\n⏰ Hora: ${timeStr} HS\n✂️ Servicio: ${appt.service}\n💈 Barbero: ${barberName}\n\n📍 Dirección: Mitre 264, Rosario\n\n¡Te esperamos!`;
          
          try {
            await sendWhatsAppMessage(appt.customerPhone, message);
            console.log(`Recordatorio enviado a ${appt.customerPhone} para el turno de las ${timeStr}`);
            results.sent.push(`${appt.customerPhone} (${timeStr})`);
          } catch (waErr: any) {
            console.error(`Error enviando recordatorio a ${appt.customerPhone}:`, waErr);
            results.errors.push(`${appt.customerPhone}: ${waErr.message || String(waErr)}`);
          }
        }
      }
    }
  } catch (err: any) {
    console.error("Error en processReminders:", err);
    throw err;
  }
  return results;
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  app.post("/api/send-whatsapp", async (req, res) => {
    try {
      const { phone, customerName, service, barber, date, time, action } = req.body;
      
      if (!phone || !customerName || !date || !time) {
        return res.status(400).json({ error: "Faltan datos requeridos" });
      }

      let firstName = customerName.trim().split(" ")[0];
      if (firstName) {
        firstName = firstName.charAt(0).toUpperCase() + firstName.slice(1).toLowerCase();
      } else {
        firstName = "Cliente";
      }

      let message = "";
      if (action === 'cancel_single' || action === 'cancel_series') {
        message = `Hola ${firstName},\nLamentamos informarte que tu turno en ResetART para el día ${date} a las ${time} HS ha sido cancelado.\n\nSi deseas reprogramar, puedes hacerlo desde nuestra web.`;
      } else if (action === 'reschedule') {
        message = `¡Hola ${firstName}! 👋\nTu turno en ResetART ha sido reprogramado con éxito.\n\n📅 Nueva Fecha: ${date}\n⏰ Nueva Hora: ${time} HS\n✂️ Servicio: ${service}\n💈 Barbero: ${barber}\n\n📍 Dirección: Mitre 264, Rosario\n\n¡Te esperamos!`;
      } else {
        message = `¡Hola ${firstName}! 👋\nTu turno en ResetART ha sido confirmado.\n\n📅 Fecha: ${date}\n⏰ Hora: ${time} HS\n✂️ Servicio: ${service}\n💈 Barbero: ${barber}\n\n📍 Dirección: Mitre 264, Rosario\n🗺️ Mapa: https://www.google.com/maps/search/?api=1&query=Mitre+264,+Rosario\n\n¡Te esperamos!`;
      }

      const result = await sendWhatsAppMessage(phone, message);
      return res.status(200).json(result);
    } catch (error: any) {
      console.error("Error sending message:", error.message);
      res.status(500).json({ error: "Error enviando el mensaje", details: error.message });
    }
  });

  // Endpoints públicos para disparar recordatorios por Cron (GET y POST)
  app.get("/api/cron-reminders", async (req, res) => {
    try {
      if (!db) {
        return res.status(500).json({ error: "Base de datos no inicializada en el servidor" });
      }
      const results = await processReminders(db);
      return res.status(200).json({ success: true, ...results });
    } catch (error: any) {
      console.error("Error en endpoint cron-reminders (GET):", error.message);
      res.status(500).json({ error: "Error procesando recordatorios", details: error.message });
    }
  });

  app.post("/api/cron-reminders", async (req, res) => {
    try {
      if (!db) {
        return res.status(500).json({ error: "Base de datos no inicializada en el servidor" });
      }
      const results = await processReminders(db);
      return res.status(200).json({ success: true, ...results });
    } catch (error: any) {
      console.error("Error en endpoint cron-reminders (POST):", error.message);
      res.status(500).json({ error: "Error procesando recordatorios", details: error.message });
    }
  });

  if (db) {
    // Check reminders every 5 minutes
    setInterval(async () => {
      try {
        await processReminders(db);
      } catch (err) {
        console.error("Error en cron de recordatorios por interval:", err);
      }
    }, 5 * 60 * 1000);
  }

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
