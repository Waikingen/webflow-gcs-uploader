// api/download.mjs

import { Storage } from "@google-cloud/storage";
import fetch from 'node-fetch';

export default async (req, res) => {
  // --- CORS HEADERS & PREFLIGHT HANDLING ---
  const allowedOrigins = [
    "https://www.wikingmedia.com",
    "https://wiking-media.webflow.io",
    "https://webflow-gcs-uploader.vercel.app"
  ];

  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }

  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Max-Age", "86400");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }
  // --- SLUT CORS HANTERING ---

  if (req.method !== "GET") {
    return res.status(405).send("Method Not Allowed. Only GET allowed for download.");
  }

  try {
    if (!process.env.GCS_KEY) {
      console.error('Environment variable GCS_KEY is not set.');
      return res.status(500).json({ error: 'Server configuration error: GCS_KEY missing.' });
    }

    const serviceAccount = JSON.parse(process.env.GCS_KEY);
    const storage = new Storage({
      projectId: serviceAccount.project_id,
      credentials: {
        client_email: serviceAccount.client_email,
        private_key: serviceAccount.private_key.replace(/\\n/g, '\n'),
      },
    });

    const BUCKET_NAME = "wiking-portal"; // Se till att detta är namnet på din bucket

    const { publicId } = req.query;

    if (!publicId) {
      return res.status(400).json({ error: 'Missing publicId for download.' });
    }

    const file = storage.bucket(BUCKET_NAME).file(publicId);

    // Hämta metadata för att få filtyp, originalfilnamn OCH DITT MEDDELANDE
    const [metadata] = await file.getMetadata();
    const contentType = metadata.contentType || 'application/octet-stream';
    
    // --- Extrahera originalfilnamnet från publicId ---
    const lastHyphenIndex = publicId.lastIndexOf('-');
    let originalFileName = publicId;
    if (lastHyphenIndex !== -1) {
        originalFileName = publicId.substring(0, lastHyphenIndex);
    }
    
    // Försök lägga till filändelse om den saknas i originalFileName
    if (!originalFileName.includes('.') && contentType) {
        const fileExtension = contentType.split('/')[1];
        if (fileExtension) {
            originalFileName = `${originalFileName}.${fileExtension}`;
        }
    }

    // *** Hämta det lagrade meddelandet från metadata ***
    // GCS konverterar metadata-nycklar till små bokstäver och lagrar dem under 'metadata' objektet.
    const userMessage = metadata.metadata && metadata.metadata['user-message'] ? metadata.metadata['user-message'] : '';

    // Generera en signerad URL för att läsa filen.
    const expiresAt = Date.now() + 48 * 60 * 60 * 1000; // Signerad URL giltig i 48 timmar
    const [gcsReadUrl] = await file.getSignedUrl({
      version: "v4",
      action: "read",
      expires: expiresAt,
    });

    console.log(`INFO: Vercel hämtar fil från GCS via: ${gcsReadUrl}`);
    console.log(`INFO: Filmeddelande från metadata: ${userMessage}`); // Logga meddelandet

    // --- Proxy-logik: Hämta filen från GCS och skicka den till klienten ---
    const gcsResponse = await fetch(gcsReadUrl);

    if (!gcsResponse.ok) {
        console.error(`FEL: Kunde inte hämta fil från GCS: ${gcsResponse.status} - ${gcsResponse.statusText}`);
        return res.status(gcsResponse.status).json({ error: `Kunde inte hämta fil från lagring: ${gcsResponse.statusText}` });
    }

    // Sätt Content-Disposition: attachment. Detta är vad som tvingar nedladdningen.
    res.setHeader('Content-Disposition', `attachment; filename="${originalFileName}"`);
    res.setHeader('Content-Type', contentType);
    
    // Strömma GCS-svaret direkt till klienten (webbläsaren)
    gcsResponse.body.pipe(res);

  } catch (error) {
    console.error('FATALT FEL i Vercel download-funktion:', error);
    if (error instanceof SyntaxError && error.message.includes('JSON')) {
        return res.status(500).json({ error: 'Serverkonfigurationsfel: GCS_KEY är inte giltig JSON. Kontrollera formatet.' });
    }
    return res.status(500).json({ error: 'Internt serverfel: Kunde inte behandla nedladdningsförfrågan.' });
  }
};