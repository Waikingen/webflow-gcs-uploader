// api/upload.mjs (FILNAMN BÖR ÄNDRAS TILL .mjs)

import { Storage } from "@google-cloud/storage";
import * as crypto from "crypto";

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
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS"); // Endast POST för uppladdning
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Max-Age", "86400");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }
  // --- END CORS HANDLING ---

  // --- Logik för UPPLADDNING (POST-förfrågan) ---
  if (req.method !== "POST") {
    return res.status(405).send("Method Not Allowed. Only POST allowed for upload.");
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

    const { filename, contentType } = req.body;

    if (!filename || !contentType) {
      return res.status(400).send("Missing fields: filename or contentType");
    }

    const fileId = `${Date.now()}-${crypto.randomBytes(6).toString("hex")}`;
    const gcsFileName = `${fileId}-${filename}`;
    const file = storage.bucket(BUCKET_NAME).file(gcsFileName);

    const expiresAt = Date.now() + 48 * 60 * 60 * 1000; // Signerad URL giltig i 48 timmar (48h * 60min/h * 60s/min * 1000ms/s)

    const [uploadUrl] = await file.getSignedUrl({
      version: "v4",
      action: "write",
      expires: expiresAt,
      contentType: contentType,
    });

    return res.json({
      uploadUrl: uploadUrl,
      publicId: gcsFileName // Detta är filens unika ID i GCS
    });

  } catch (error) {
    console.error('Error in Vercel upload-function:', error); // Specifikare loggmeddelande
    if (error instanceof SyntaxError && error.message.includes('JSON')) {
        return res.status(500).json({ error: 'Server configuration error: GCS_KEY is not valid JSON. Check format.' });
    }
    return res.status(500).json({ error: 'Internal Server Error: Could not process upload request.' }); // Specifikare felmeddelande
  }
};