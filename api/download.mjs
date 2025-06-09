// api/download.mjs (THE CORRECTED VERSION FOR base-ID.ext FILENAMES)

import { Storage } from "@google-cloud/storage";
import fetch from 'node-fetch'; // Still imported, though not directly used for proxying
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

    const { publicId } = req.query; // publicId is the full GCS filename (e.g., "remuneration-new (1)-ID.png")

    if (!publicId) {
      return res.status(400).json({ error: 'Missing publicId for download.' });
    }

    const file = storage.bucket(BUCKET_NAME).file(publicId);

    // Get metadata to determine content type
    const [metadata] = await file.getMetadata();
    const contentType = metadata.contentType || 'application/octet-stream';
    
    // --- EXTRACT ORIGINAL FILENAME FROM THE NEW publicId FORMAT (base-ID.ext) ---
    // Example publicId: "remuneration-new (1)-1749486849780-abcdef.png"
    const fileExtension = path.extname(publicId); // ".png"
    const baseNameWithId = path.basename(publicId, fileExtension); // "remuneration-new (1)-1749486849780-abcdef"

    const lastHyphenIndex = baseNameWithId.lastIndexOf('-'); // Find the last hyphen in the base name (before the ID)
    let originalFileNameWithoutId;

    if (lastHyphenIndex !== -1) {
        // If an ID was found, take the part before it
        originalFileNameWithoutId = baseNameWithId.substring(0, lastHyphenIndex); // "remuneration-new (1)"
    } else {
        // If no ID was found (unlikely for new uploads, but handle gracefully)
        originalFileNameWithoutId = baseNameWithId;
    }

    // Combine the cleaned base name with the original extension
    const originalFileNameForDownload = `${originalFileNameWithoutId}${fileExtension}`; 

    // *** Retrieve user message from metadata (if needed, currently not sent to client by this API) ***
    const userMessage = metadata.metadata && metadata.metadata['user-message'] ? metadata.metadata['user-message'] : '';
    // console.log(`INFO: Filmeddelande från metadata: ${userMessage}`); // Uncomment to log

    // Generate a signed URL to read the file.
    const expiresAt = Date.now() + 48 * 60 * 60 * 1000; // Signed URL valid for 48 hours
    const [gcsReadUrl] = await file.getSignedUrl({
      version: "v4",
      action: "read",
      expires: expiresAt,
    });

    console.log(`INFO: Vercel fetching file from GCS via: ${gcsReadUrl}`);
    
    // --- IMPORTANT: This part now directly downloads the file from GCS,
    // not just provides a URL. This matches your HTML from earlier where you said
    // it was downloading immediately by redirecting to this endpoint.
    // If you want the "button click" behavior from before, this section needs to be changed
    // back to `res.status(200).json({ downloadUrl: gcsReadUrl, ... })`

    const gcsResponse = await fetch(gcsReadUrl);

    if (!gcsResponse.ok) {
        console.error(`ERROR: Could not fetch file from GCS: ${gcsResponse.status} - ${gcsResponse.statusText}`);
        return res.status(gcsResponse.status).json({ error: `Kunde inte hämta fil från lagring: ${gcsResponse.statusText}` });
    }

    // Set Content-Disposition: attachment. This forces the download and suggests the filename.
    res.setHeader('Content-Disposition', `attachment; filename="${originalFileNameForDownload}"`);
    res.setHeader('Content-Type', contentType);
    
    // Stream the GCS response directly to the client (browser)
    gcsResponse.body.pipe(res);

  } catch (error) {
    console.error('FATAL ERROR in Vercel download-function:', error);
    if (error instanceof SyntaxError && error.message.includes('JSON')) {
        return res.status(500).json({ error: 'Server configuration error: GCS_KEY is not valid JSON. Check format.' });
    }
    return res.status(500).json({ error: 'Internal Server Error: Could not process download request.' });
  }
};