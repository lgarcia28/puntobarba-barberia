import { initializeApp } from 'firebase/app';
import { getFirestore, collection, query, where, getDocs, updateDoc, doc, Timestamp, getDoc, runTransaction } from 'firebase/firestore';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

async function sendWhatsAppMessage(phone: string, message: string) {
  let clean = phone.replace(/\D/g, "");
  if (clean.startsWith("00")) {
    clean = clean.substring(2);
  }
  if (clean.startsWith("0") && clean.length > 5) {
    clean = clean.substring(1);
  }

  let formattedPhone = clean;
  if (clean.startsWith("34") && clean.length === 11) {
    formattedPhone = clean;
  } else if (clean.length === 9 && (clean.startsWith("6") || clean.startsWith("7"))) {
    formattedPhone = "34" + clean;
  } else if (clean.length === 10) {
    formattedPhone = "549" + clean;
  } else if (clean.startsWith("54") && !clean.startsWith("549") && clean.length === 12) {
    formattedPhone = "549" + clean.substring(2);
  } else if (clean.startsWith("549") && clean.length === 13) {
    formattedPhone = clean;
  } else if (clean.length >= 10) {
    formattedPhone = clean;
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

export default async function handler(req: any, res: any) {
  // Allow both GET and POST requests for triggering the cron
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  let db: any;
  try {
    const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
    const firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    const firebaseApp = initializeApp(firebaseConfig);
    db = getFirestore(firebaseApp, firebaseConfig.firestoreDatabaseId);
  } catch (e: any) {
    console.error("No se pudo inicializar Firebase en el endpoint cron:", e);
    return res.status(500).json({ error: "Error al inicializar base de datos", details: e.message });
  }

  const results: { sent: string[], errors: string[] } = { sent: [], errors: [] };

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
    
    return res.status(200).json({ success: true, ...results });
  } catch (error: any) {
    console.error("Error en handler de cron-reminders:", error);
    return res.status(500).json({ error: "Error interno al enviar recordatorios", details: error.message });
  }
}
