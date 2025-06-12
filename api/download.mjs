diff --git a/api/download.mjs b/api/download.mjs
index 3da056a34af4e528b34cb7f8c86b69306ebcd017..0992568de7e1932448dfee3dbe72395873acda62 100644
--- a/api/download.mjs
+++ b/api/download.mjs
@@ -1,105 +1,101 @@
-// api/download.mjs (FILNAMN BÖR ÄNDRAS TILL .mjs)
-
-// Använd "import" för @google-cloud/storage istället för "require"
+// api/download.mjs
 import { Storage } from "@google-cloud/storage";
 import fetch from 'node-fetch';
-
-// Funktionen måste exporteras med "export default" för ES Modules
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
-  // --- SLUT CORS HANTERING ---
+  // --- END CORS HANDLING ---
 
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
 
-    const BUCKET_NAME = "wiking-portal"; // Se till att detta är namnet på din bucket
+    const BUCKET_NAME = "wiking-portal"; // Ensure this matches your bucket name
 
     const { publicId } = req.query;
 
     if (!publicId) {
       return res.status(400).json({ error: 'Missing publicId for download.' });
     }
 
     const file = storage.bucket(BUCKET_NAME).file(publicId);
 
-    // Hämta metadata för att få filtyp och originalfilnamn
+    // Retrieve metadata to get file type and original name
     const [metadata] = await file.getMetadata();
     const contentType = metadata.contentType || 'application/octet-stream';
     let originalFileName = publicId.includes('-') ? publicId.substring(publicId.indexOf('-') + 1) : publicId;
     
-    // Försök lägga till filändelse om den saknas i originalFileName (t.ex. om filen hette bara "mittdokument" innan)
+      // Try to append a file extension if missing in the original name
     if (!originalFileName.includes('.') && contentType) {
         const fileExtension = contentType.split('/')[1];
         if (fileExtension) {
             originalFileName = `${originalFileName}.${fileExtension}`;
         }
     }
 
-    // Generera en signerad URL för att läsa filen.
-    const expiresAt = Date.now() + 10 * 60 * 1000; // Signerad URL giltig i 10 min för Vercel att läsa
+    // Generate a signed URL to read the file
+      const expiresAt = Date.now() + 10 * 60 * 1000; // Signed URL valid for 10 minutes
     const [gcsReadUrl] = await file.getSignedUrl({
       version: "v4",
       action: "read",
       expires: expiresAt,
     });
 
-    console.log(`INFO: Vercel hämtar fil från GCS via: ${gcsReadUrl}`);
+      console.log(`INFO: Vercel fetching file from GCS via: ${gcsReadUrl}`);
 
-    // --- Proxy-logik: Hämta filen från GCS och skicka den till klienten ---
+      // --- Proxy logic: fetch the file from GCS and stream to the client ---
     const gcsResponse = await fetch(gcsReadUrl);
 
     if (!gcsResponse.ok) {
-        console.error(`FEL: Kunde inte hämta fil från GCS: ${gcsResponse.status} - ${gcsResponse.statusText}`);
-        return res.status(gcsResponse.status).json({ error: `Kunde inte hämta fil från lagring: ${gcsResponse.statusText}` });
+          console.error(`ERROR: Could not fetch file from GCS: ${gcsResponse.status} - ${gcsResponse.statusText}`);
+          return res.status(gcsResponse.status).json({ error: `Could not fetch file from storage: ${gcsResponse.statusText}` });
     }
 
-    // Sätt Content-Disposition: attachment. Detta är vad som tvingar nedladdningen.
+      // Set Content-Disposition: attachment to force the download
     res.setHeader('Content-Disposition', `attachment; filename="${originalFileName}"`);
     res.setHeader('Content-Type', contentType);
     
-    // Strömma GCS-svaret direkt till klienten (webbläsaren)
+      // Stream the GCS response directly to the browser
     gcsResponse.body.pipe(res);
 
   } catch (error) {
-    console.error('FATALT FEL i Vercel download-funktion:', error);
+    console.error('Fatal error in Vercel download function:', error);
     if (error instanceof SyntaxError && error.message.includes('JSON')) {
-        return res.status(500).json({ error: 'Serverkonfigurationsfel: GCS_KEY är inte giltig JSON. Kontrollera formatet.' });
+        return res.status(500).json({ error: 'Server configuration error: GCS_KEY is not valid JSON. Check format.' });
     }
-    return res.status(500).json({ error: 'Internt serverfel: Kunde inte behandla nedladdningsförfrågan.' });
+    return res.status(500).json({ error: 'Internal server error: Could not process download request.' });
   }
-};
+};
