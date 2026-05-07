import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Vite middleware for development
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

  app.post("/api/send-whatsapp", async (req, res) => {
    try {
      const { phone, customerName, service, barber, date, time } = req.body;
      
      if (!phone || !customerName || !date || !time) {
        return res.status(400).json({ error: "Faltan datos requeridos" });
      }

      // Format phone number to E.164 without '+' (e.g., 549341...)
      const formattedPhone = phone.replace(/\D/g, "");

      // Para Green API directamente:
      const GREEN_API_ID = process.env.GREEN_API_ID;
      const GREEN_API_TOKEN = process.env.GREEN_API_TOKEN;
      
      // Para un Webhook de n8n:
      const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL;

      const message = `¡Hola ${customerName}! 👋\nTu turno en ResetART ha sido confirmado.\n\n📅 Fecha: ${date}\n⏰ Hora: ${time} HS\n✂️ Servicio: ${service}\n💈 Barbero: ${barber}\n\n¡Te esperamos!`;

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
        // El formato de chatId en Green API suele ser número + @c.us
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

    } catch (error: any) {
      console.error("Error sending message:", error.message);
      res.status(500).json({ error: "Error enviando el mensaje", details: error.message });
    }
  });

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
