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

      // Format phone number to E.164 without '+' (Meta API format: e.g., 549341...)
      const formattedPhone = phone.replace(/\D/g, "");

      const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
      const WHATSAPP_PHONE_ID = process.env.WHATSAPP_PHONE_ID;

      if (!WHATSAPP_TOKEN || !WHATSAPP_PHONE_ID) {
        console.warn("Falta configuración de WhatsApp en .env");
        return res.status(500).json({ error: "WhatsApp no configurado en el servidor" });
      }

      const message = `¡Hola ${customerName}! 👋\nTu turno en ResetART ha sido confirmado.\n\n📅 Fecha: ${date}\n⏰ Hora: ${time} HS\n✂️ Servicio: ${service}\n💈 Barbero: ${barber}\n\n¡Te esperamos!`;

      const response = await fetch(`https://graph.facebook.com/v17.0/${WHATSAPP_PHONE_ID}/messages`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${WHATSAPP_TOKEN}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: formattedPhone,
          type: "text",
          text: { body: message }
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error?.message || "Error desconocido en Meta API");
      }

      res.status(200).json({ success: true, data });
    } catch (error: any) {
      console.error("Error sending WhatsApp:", error.message);
      res.status(500).json({ error: "Error enviando el mensaje", details: error.message });
    }
  });

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
