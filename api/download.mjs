// api/download.mjs (ADJUSTED FOR THE NEW FILENAME FORMAT)

import { Storage } from "@google-cloud/storage";
import fetch from 'node-fetch';
import path from 'path'; // Import Node.js path module

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
  // --- END CORS HANDLING ---

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

    const BUCKET_NAME = "wiking-portal";

    const { publicId } = req.query;

    if (!publicId) {
      return res.status(400).json({ error: 'Missing publicId for download.' });
    }

    const file = storage.bucket(BUCKET_NAME).file(publicId);

    // Hämta metadata för att få filtyp (inte längre för originalfilnamn, vi parsade det från publicId)
    const [metadata] = await file.getMetadata();
    const contentType = metadata.contentType || 'application/octet-stream';
    
    // *** EXTRACT ORIGINAL FILENAME FROM THE NEW publicId FORMAT ***
    // Example publicId: "remuneration-new (1).png-1749486849780-abcdef"
    const lastHyphenIndex = publicId.lastIndexOf('-');
    let originalFileNameWithExt = publicId; // Default to publicId if no hyphen found
    if (lastHyphenIndex !== -1) {
        originalFileNameWithExt = publicId.substring(0, lastHyphenIndex); // "remuneration-new (1).png"
    }

    // Now, originalFileNameWithExt *should* contain the full original filename including extension.
    // We can also ensure it has the correct extension based on contentType if needed, but it should be fine.
    // Let's use the extracted name directly.
    const originalFileName = originalFileNameWithExt; // This is the name we want to show/download as.
    
    // NOTE: The 'user-message' metadata is still stored in GCS by upload.mjs,
    // but in this setup, we're not using it directly in download.mjs.
    // You could retrieve it here with `metadata.metadata['user-message']` if you wanted to log it,
    // but it won't be sent to the client by this download.mjs version.

    const expiresAt = Date.now() + 48 * 60 * 60 * 1000;
    const [gcsReadUrl] = await file.getSignedUrl({
      version: "v4",
      action: "read",
      expires: expiresAt,
    });

    console.log(`INFO: Vercel fetching file from GCS via: ${gcsReadUrl}`);

    const gcsResponse = await fetch(gcsReadUrl);

    if (!gcsResponse.ok) {
        console.error(`ERROR: Could not fetch file from GCS: ${gcsResponse.status} - ${gcsResponse.statusText}`);
        return res.status(gcsResponse.status).json({ error: `Could not fetch file from storage: ${gcsResponse.statusText}` });
    }

    res.setHeader('Content-Disposition', `attachment; filename="${originalFileName}"`);
    res.setHeader('Content-Type', contentType);
    
    gcsResponse.body.pipe(res);

  } catch (error) {
    console.error('FATAL ERROR in Vercel download-function:', error);
    if (error instanceof SyntaxError && error.message.includes('JSON')) {
        return res.status(500).json({ error: 'Server configuration error: GCS_KEY is not valid JSON. Check format.' });
    }
    return res.status(500).json({ error: 'Internal Server Error: Could not process download request.' });
  }
};