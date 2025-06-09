const { Storage } = require("@google-cloud/storage");
const crypto = require("crypto");

module.exports = async (req, res) => {
  // --- CORS HEADERS & PREFLIGHT HANDLING ---
  // Lägg till ALLA domäner som ska kunna prata med din API-funktion här
  const allowedOrigins = [
    "https://www.wikingmedia.com",
    "https://wiking-media.webflow.io"
    // Lägg även till din Vercel-applikations URL här när den är klar, t.ex. "https://webflow-gcs-uploader.vercel.app"
  ];

  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }

  res.setHeader("Vary", "Origin"); // Viktigt för cache om du har flera origins
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Max-Age", "86400"); // Cache preflight response for 24 hours

  if (req.method === "OPTIONS") {
    // Svara omedelbart på preflight-förfrågningar
    return res.status(200).end();
  }
  // --- END CORS HANDLING ---

  // --- Huvudlogik ---
  try {
    if (!process.env.GCS_KEY) {
      console.error('Environment variable GCS_KEY is not set.');
      return res.status(500).json({ error: 'Server configuration error: GCS_KEY missing.' });
    }
    
    // Parsar din GCS_KEY från miljövariabeln
    const serviceAccount = JSON.parse(process.env.GCS_KEY);

    // Initialiserar Google Cloud Storage klienten
    const storage = new Storage({
      projectId: serviceAccount.project_id,
      credentials: {
        client_email: serviceAccount.client_email,
        private_key: serviceAccount.private_key.replace(/\\n/g, '\n'), // Viktigt för att hantera radbrytningar
      },
    });

    const BUCKET_NAME = "wiking-portal"; // Se till att detta är namnet på din bucket

    // Endast tillåt POST-förfrågningar för uppladdning
    if (req.method !== "POST") {
      return res.status(405).send("Only POST allowed");
    }

    const { filename, contentType } = req.body;

    if (!filename || !contentType) {
      return res.status(400).send("Missing fields: filename or contentType");
    }

    // Skapa ett unikt filnamn för att lagra i din bucket
    const fileId = `${Date.now()}-${crypto.randomBytes(6).toString("hex")}`;
    const gcsFileName = `${fileId}-${filename}`;
    const file = storage.bucket(BUCKET_NAME).file(gcsFileName);

    // Skapa en signed URL som är giltig i 10 minuter för uppladdning
    const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minuter

    const [url] = await file.getSignedUrl({
      version: "v4",
      action: "write",
      expires: expiresAt,
      contentType: contentType,
    });

    // Returnera uppladdnings-URL och det publika ID:t
    return res.json({
      uploadUrl: url,
      publicId: gcsFileName
    });

  } catch (error) {
    console.error('Error in Vercel function:', error);
    // Förbättrad felhantering för GCS_KEY-problem
    if (error instanceof SyntaxError && error.message.includes('JSON')) {
        return res.status(500).json({ error: 'Server configuration error: GCS_KEY is not valid JSON. Check format.' });
    }
    return res.status(500).json({ error: 'Internal Server Error: Could not process request.' });
  }
};