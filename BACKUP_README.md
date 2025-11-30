# Backups & Google Drive — Setup and Production Notes

This project includes a Backup & Restore UI used by the `superadmin` role at `Settings → Admin Backups`.

Quick summary
- Backups are created as JSON files and can be downloaded locally.
- The app also provides server-side export and upload endpoints so you can export the entire database as a single JSON object or upload backups to an application-owned Drive account via the backend.
- Restoring requires creating a fresh backup in the same browser session (safety measure) and then selecting the JSON file.

Where to configure
1. Frontend (development): create a `.env` at the project root (do NOT commit this file). Copy `.env.example` and set `VITE_BACKEND_URL` to point at your backend.

2. Backend (production recommended): set the following environment variables in your backend host or `.env` (do NOT commit):

- `GOOGLE_SERVICE_ACCOUNT_JSON`: full JSON contents of a service account key (if you want the backend to upload to Drive).
- `ADMIN_UPLOAD_SECRET`: random secret string used to protect admin export/upload endpoints (for testing only). For production, use proper authentication checks instead.

Server-side upload (recommended)
--------------------------------
If you want the application to upload backups to a central, application-owned Google Drive account, use the backend endpoint provided in `forwokbackend/server.cjs`:

- Ensure Drive API is enabled for your GCP project and the service account has access.
- Set `GOOGLE_SERVICE_ACCOUNT_JSON` and `ADMIN_UPLOAD_SECRET` in the backend environment.

Endpoint
- `POST /api/admin/backup-upload`
  - Body: JSON object `{ filename?: string, backup: <object> }`.
  - Header: `x-admin-upload-secret: <ADMIN_UPLOAD_SECRET>` (server validates this before uploading).
  - Response: `{ message: 'Backup uploaded to Drive', file: { id, name } }` on success.

Admin export endpoint
- `GET /api/admin/export-all` returns a single JSON object containing the main collections (products, inventory, transactions, orders, inbounds, users, savedPickupLocations, payments, packingFees, shippingTemplates).
  - Header: `x-admin-upload-secret: <ADMIN_UPLOAD_SECRET>` required for the endpoint.

Security notes
- Do NOT store service account keys or admin secrets in the repo. Use a secrets manager or host-provided environment variables.
- Replace the shared-secret check with proper authentication (JWT/session + role check) for production.

