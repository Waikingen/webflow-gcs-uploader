// api/upload.mjs
import { Storage } from "@google-cloud/storage"; // FIXAD RAD
import * as crypto from "crypto"; // FIXAD RAD

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
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Max-Age", "86400");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }
  // --- END CORS HANDLING ---

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

    // --- Logik för UPPLADDNING (POST-förfrågan) ---
    if (req.method === "POST") {
      const { filename, contentType } = req.body;

      if (!filename || !contentType) {
        return res.status(400).send("Missing fields: filename or contentType");
      }

      const fileId = `${Date.now()}-${crypto.randomBytes(6).toString("hex")}`;
      const gcsFileName = `${fileId}-${filename}`;
      const file = storage.bucket(BUCKET_NAME).file(gcsFileName);

      const expiresAt = Date.now() + 10 * 60 * 1000; // Signerad URL giltig i 10 min för UPLADDNING

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
    }

    // --- Logik för NEDLADDNING (GET-förfrågan) ---
    // Denna del av koden är redundant om du har en separat download.mjs-fil.
    // Jag rekommenderar att ta bort den för att hålla funktionerna rena och dedikerade.
    else if (req.method === "GET") {
      const { publicId } = req.query;

      if (!publicId) {
        return res.status(400).json({ error: 'Missing publicId for download.' });
      }

      const file = storage.bucket(BUCKET_NAME).file(publicId);

      const expiresAt = Date.now() + 10 * 60 * 1000; // Signerad URL giltig i 10 min för NEDLADDNING

      // Försök extrahera originalfilnamnet från publicId för Content-Disposition
      const originalFileName = publicId.includes('-') ? publicId.substring(publicId.indexOf('-') + 1) : publicId;

      const [downloadUrl] = await file.getSignedUrl({
        version: "v4",
        action: "read",
        expires: expiresAt,
        otherArgs: {
          responseDisposition: `attachment; filename="${originalFileName}"`,
        },
      });

      return res.json({ downloadUrl: downloadUrl });
    }

    // --- Hantera andra HTTP-metoder ---
    else {
      return res.status(405).send("Method Not Allowed. Only POST for upload and GET for download allowed.");
    }

  } catch (error) {
    console.error('Error in Vercel function:', error);
    if (error instanceof SyntaxError && error.message.includes('JSON')) {
        return res.status(500).json({ error: 'Server configuration error: GCS_KEY is not valid JSON. Check format.' });
    }
    return res.status(500).json({ error: 'Internal Server Error: Could not process request.' });
  }
};