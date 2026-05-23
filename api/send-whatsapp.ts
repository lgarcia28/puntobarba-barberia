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
      message = `¡Hola ${firstName}! 👋\nTe confirmamos que tu turno del ${date} a las ${time} HS con ${barber} ha sido CANCELADO exitosamente.\n\nSi deseas volver a agendar, puedes hacerlo en cualquier momento desde nuestra web. ¡Te esperamos pronto en ResetART!`;
    } else if (action === 'cancel_series') {
      message = `¡Hola ${firstName}! 👋\nTe confirmamos que TODA TU SERIE DE TURNOS FIJOS (cada ${dayOfWeek} a las ${time} HS) con ${barber} ha sido CANCELADA exitosamente a partir del ${date}.\n\nSi deseas volver a agendar, puedes hacerlo en cualquier momento desde nuestra web. ¡Te esperamos pronto en ResetART!`;
    } else if (action === 'reschedule') {
      message = `¡Hola ${firstName}! 👋\nTu turno en ResetART ha sido REPROGRAMADO con éxito.\n\n📅 Nueva Fecha: ${date}\n⏰ Nueva Hora: ${time} HS\n✂️ Servicio: ${service}\n💈 Barbero: ${barber}\n\n📍 Dirección: Mitre 264, Rosario\n🗺️ Mapa: https://www.google.com/maps/search/?api=1&query=Mitre+264,+Rosario\n\n¡Te esperamos!`;
      if (isFixed) {
        message = `¡Hola ${firstName}! 👋\nTu turno ${intervalTitle} en ResetART ha sido REPROGRAMADO con éxito.\n\n📅 A partir de: ${date}\n⏰ Ahora será ${dayStr}a las ${time} HS (${intervalFreq})\n✂️ Servicio: ${service}\n💈 Barbero: ${barber}\n\n🗓️ Último turno: ${lastDate}\n\n📍 Dirección: Mitre 264, Rosario\n¡Te esperamos!`;
      }
    } else {
      // Default: book
      message = `¡Hola ${firstName}! 👋\nTu turno en ResetART ha sido confirmado.\n\n📅 Fecha: ${date}\n⏰ Hora: ${time} HS\n✂️ Servicio: ${service}\n💈 Barbero: ${barber}\n\n📍 Dirección: Mitre 264, Rosario\n🗺️ Mapa: https://www.google.com/maps/search/?api=1&query=Mitre+264,+Rosario\n\n¡Te esperamos!`;
      if (isFixed) {
        message = `¡Hola ${firstName}! 👋\nTu turno ${intervalTitle} en ResetART ha sido confirmado.\n\n📅 A partir de: ${date}\n⏰ Todos ${dayStr}a las ${time} HS (${intervalFreq})\n✂️ Servicio: ${service}\n💈 Barbero: ${barber}\n\n🗓️ Último turno: ${lastDate}\n\n📍 Dirección: Mitre 264, Rosario\n¡Te esperamos!`;
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
