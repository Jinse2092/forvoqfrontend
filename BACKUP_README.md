# Backups & Google Drive — Setup and Production Notes

This project includes a client-side Backup & Restore UI used by the `superadmin` role at `Settings → Admin Backups`.

Quick summary
- The client component reads Google credentials from Vite env vars: `VITE_GOOGLE_CLIENT_ID` and optionally `VITE_GOOGLE_API_KEY`.
- Backups are created as JSON files and can be downloaded locally or uploaded to the signed-in user's Google Drive (`gapi` client).
- Restoring requires creating a fresh backup in the same browser session (safety measure) and then selecting the JSON file.

Where to put the credentials
1. Locally (development): create a `.env` file in the project root (do NOT commit this file). Copy `.env.example` and fill values.

   Example `.env`:

   VITE_GOOGLE_CLIENT_ID=56302885028-laan5qadd9mukfm8pbnj5f96dui58c3o.apps.googleusercontent.com
   VITE_GOOGLE_API_KEY=your_api_key_here

2. Production (recommended): set the environment variables in your hosting provider's environment settings (Vercel, Netlify, Render, Docker, etc.).

   - Vercel: Project Settings → Environment Variables → add `VITE_GOOGLE_CLIENT_ID` and `VITE_GOOGLE_API_KEY` for the `Production` environment.
   - Netlify: Site settings → Build & deploy → Environment → Environment variables.
   - Docker: pass env vars at container runtime or use a secrets manager.

Important: OAuth / Google Console steps
1. Open https://console.cloud.google.com and select or create a project.
2. Enable the **Google Drive API** (APIs & Services → Library → search Drive API → Enable).
3. Configure OAuth consent screen (APIs & Services → OAuth consent screen). Add the testing accounts you will use (if app is unverified and External).
4. Create OAuth credentials (APIs & Services → Credentials → Create Credentials → OAuth client ID) → choose **Web application**.
   - Add authorized JavaScript origins for your production domain(s) (e.g. `https://your-domain.com`) and dev origin if needed (e.g. `http://localhost:5173`).
   - Copy the **Client ID** to your `VITE_GOOGLE_CLIENT_ID` variable.
5. (Optional) Create an API key (APIs & Services → Credentials → Create Credentials → API key). Restrict the key by HTTP referrers and by API (Drive API).

Security notes and recommended production flow
- Never embed or commit OAuth client secrets into client-side code or the repository. The *Client ID* and *API key* are safe to use client-side when restricted, but the *Client secret* must remain server-side.
- If you want backups uploaded to an application-owned Drive account (centralized backups), implement a secure server-side upload using a Service Account or server-side OAuth; keep service account keys or client secrets out of the client bundle.
- For user-owned backups (current approach), users upload to their own Drive; the client uses OAuth to obtain permission to write files to the signed-in user's Drive.

Testing in production
- Because you said you can only test in production, ensure you set the `VITE_GOOGLE_CLIENT_ID` in production environment settings before deploying.
- Deploy the app and visit the `Settings` page as a `superadmin`. Use the Sign in flow, then try `Backup & Upload to Google Drive`.

Troubleshooting
- If sign-in fails: check OAuth Consent screen status and that your account is allowed (test users if unverified).
- If uploads fail: check API key restrictions, Drive API enabled, and browser console for errors.

If you'd like, I can:
- Add a server-side endpoint to accept uploads (recommended for app-owned backups), or
- Patch the component to use a small server-side token-exchange flow instead of pure client-side gapi.
 
Server-side upload (recommended)
--------------------------------
If you want the application to upload backups to a central, application-owned Google Drive account (instead of each user uploading to their personal Drive), use the backend endpoint provided in `forwokbackend/server.cjs`:

- Set `GOOGLE_SERVICE_ACCOUNT_JSON` in your backend environment to the JSON contents of a Google Service Account key (grant Drive API scopes).
- Set `ADMIN_UPLOAD_SECRET` in the backend environment to a random secret string and keep it private. The frontend will include this secret in an `x-admin-upload-secret` header when calling the endpoint.

Endpoint
- `POST /api/admin/backup-upload`
   - Body: JSON object `{ filename?: string, backup: <object> }` where `backup` is the backup JSON (the frontend can send the same object that it would download).
   - Header: `x-admin-upload-secret: <ADMIN_UPLOAD_SECRET>` (server validates this before uploading).
   - Response: `{ message: 'Backup uploaded to Drive', file: { id, name } }` on success.

How it works
- The backend reads `GOOGLE_SERVICE_ACCOUNT_JSON`, creates a `googleapis` client and calls Drive API to create a file with the provided JSON payload. The service account must have Drive access (share folder with service account or use domain-wide delegation as needed).

Security notes
- Do NOT store service account keys in the repo. Use your hosting provider's secrets manager or environment variables.
- Protect the endpoint using a secret or using your existing auth system. The example uses a simple `ADMIN_UPLOAD_SECRET` header. For production, use proper authentication (JWT/admin role check).

