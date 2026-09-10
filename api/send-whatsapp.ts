export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { phone, customerName, service, barber, date, time, dayOfWeek, isFixed, lastDate, interval, action } = req.body;

    if (!phone || !customerName || !service || !barber || !date || !time) {
      return res.status(400).json({ error: "Faltan datos requeridos" });
    }

    const firstName = customerName.split(' ')[0].toUpperCase();

    // Limpiar el número de teléfono con soporte internacional completo
    const cleanPhone = (rawPhone: string): string => {
      if (!rawPhone) return "";
      let clean = rawPhone.replace(/\D/g, "");

      if (clean.startsWith("00")) {
        clean = clean.substring(2);
      }

      // España: móvil empieza con 6 o 7
      if ((clean.startsWith("346") || clean.startsWith("347")) && clean.length === 11) {
        return clean;
      }
      if (clean.length === 9 && (clean.startsWith("6") || clean.startsWith("7"))) {
        return "34" + clean;
      }

      // Argentina: remover 54
      if (clean.startsWith("54")) {
        clean = clean.substring(2);
      }

      // Remover 0 inicial
      if (clean.startsWith("0")) {
        clean = clean.substring(1);
      }

      // Si empieza con 9 (ej: 93416366746 - 11 dígitos)
      if (clean.startsWith("9") && clean.length === 11) {
        clean = clean.substring(1);
      }

      // Quitar prefijo "15" dentro de Argentina
      if (clean.length === 12) {
        if (clean.substring(2, 4) === "15") {
          clean = clean.substring(0, 2) + clean.substring(4);
        } else if (clean.substring(3, 5) === "15") {
          clean = clean.substring(0, 3) + clean.substring(5);
        } else if (clean.substring(4, 6) === "15") {
          clean = clean.substring(0, 4) + clean.substring(6);
        }
      } else if (clean.length === 11) {
        if (clean.substring(3, 5) === "15") {
          clean = clean.substring(0, 3) + clean.substring(5);
        } else if (clean.substring(2, 4) === "15") {
          clean = clean.substring(0, 2) + clean.substring(4);
        }
      } else if (clean.length === 9 && clean.startsWith("15")) {
        clean = "341" + clean.substring(2);
      } else if (clean.length === 7) {
        clean = "341" + clean;
      }

      // Formato estándar Argentina móvil WhatsApp: 549 + 10 dígitos
      if (clean.length === 10) {
        return "549" + clean;
      }

      if (clean.startsWith("9") && clean.length === 11) {
        return "54" + clean;
      }

      return clean;
    };

    const formattedPhone = cleanPhone(phone);

    // Para Green API directamente:
    const GREEN_API_ID = process.env.GREEN_API_ID;
    const GREEN_API_TOKEN = process.env.GREEN_API_TOKEN;
    
    // Para un Webhook de n8n:
    const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL;

    let message = "";
    const dayStr = dayOfWeek ? `los ${dayOfWeek} ` : '';
    const intervalTitle = interval === 'biweekly' ? 'FIJO QUINCENAL' : 'FIJO SEMANAL';
    const intervalFreq = interval === 'biweekly' ? 'cada 15 días' : 'todas las semanas';

    if (action === 'cancel_single') {
      message = `¡Hola ${firstName}! 👋\nTe confirmamos que tu turno del ${date} a las ${time} HS con ${barber} ha sido CANCELADO exitosamente.\n\nSi deseas volver a agendar, puedes hacerlo en cualquier momento desde nuestra web. ¡Te esperamos pronto en Punto Barba!`;
    } else if (action === 'cancel_series') {
      message = `¡Hola ${firstName}! 👋\nTe confirmamos que TODA TU SERIE DE TURNOS FIJOS (cada ${dayOfWeek} a las ${time} HS) con ${barber} ha sido CANCELADA exitosamente a partir del ${date}.\n\nSi deseas volver a agendar, puedes hacerlo en cualquier momento desde nuestra web. ¡Te esperamos pronto en Punto Barba!`;
    } else if (action === 'reschedule') {
      message = `¡Hola ${firstName}! 👋\nTu turno en Punto Barba ha sido REPROGRAMADO con éxito.\n\n📅 Nueva Fecha: ${date}\n⏰ Nueva Hora: ${time} HS\n✂️ Servicio: ${service}\n💈 Barbero: ${barber}\n\n📍 Dirección: Mendoza 2656, Rosario\n🗺️ Mapa: https://www.google.com/maps/search/?api=1&query=Mendoza+2656,+Rosario\n\n¡Te esperamos!`;
      if (isFixed) {
        message = `¡Hola ${firstName}! 👋\nTu turno ${intervalTitle} en Punto Barba ha sido REPROGRAMADO con éxito.\n\n📅 A partir de: ${date}\n⏰ Ahora será ${dayStr}a las ${time} HS (${intervalFreq})\n✂️ Servicio: ${service}\n💈 Barbero: ${barber}\n\n🗓️ Último turno: ${lastDate}\n\n📍 Dirección: Mendoza 2656, Rosario\n¡Te esperamos!`;
      }
    } else {
      // Default: book
      message = `¡Hola ${firstName}! 👋\nTu turno en Punto Barba ha sido confirmado.\n\n📅 Fecha: ${date}\n⏰ Hora: ${time} HS\n✂️ Servicio: ${service}\n💈 Barbero: ${barber}\n\n📍 Dirección: Mendoza 2656, Rosario\n🗺️ Mapa: https://www.google.com/maps/search/?api=1&query=Mendoza+2656,+Rosario\n\n¡Te esperamos!`;
      if (isFixed) {
        message = `¡Hola ${firstName}! 👋\nTu turno ${intervalTitle} en Punto Barba ha sido confirmado.\n\n📅 A partir de: ${date}\n⏰ Todos ${dayStr}a las ${time} HS (${intervalFreq})\n✂️ Servicio: ${service}\n💈 Barbero: ${barber}\n\n🗓️ Último turno: ${lastDate}\n\n📍 Dirección: Mendoza 2656, Rosario\n¡Te esperamos!`;
      }
    }

    if (N8N_WEBHOOK_URL) {
      // Opción 1: Enviar a n8n
      const response = await fetch(N8N_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: formattedPhone,
          message: message,
          customerName,
          date,
          time,
          service,
          barber
        })
      });
      
      if (!response.ok) throw new Error("Error enviando al webhook de n8n");
      return res.status(200).json({ success: true, method: "n8n" });

    } else if (GREEN_API_ID && GREEN_API_TOKEN) {
      // Opción 2: Enviar directo a Green API
      const url = `https://api.green-api.com/waInstance${GREEN_API_ID}/sendMessage/${GREEN_API_TOKEN}`;
      
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chatId: `${formattedPhone}@c.us`,
          message: message
        })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Error en Green API");
      return res.status(200).json({ success: true, method: "green_api", data });

    } else {
      console.warn("Falta configuración de WhatsApp en .env (N8N_WEBHOOK_URL o credenciales de Green API)");
      return res.status(500).json({ error: "API de mensajes no configurada" });
    }

  } catch (error) {
    console.error("Error sending message:", error.message);
    return res.status(500).json({ error: "Error enviando el mensaje", details: error.message });
  }
}
