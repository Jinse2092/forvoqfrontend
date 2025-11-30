import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';

// Credentials: prefer loading from Vite env vars for safety.
// Do NOT commit any client secret into the repository. Client secret must remain server-side.
// Create a `.env` at project root with:
// VITE_GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
// VITE_GOOGLE_API_KEY=your-api-key
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '<REPLACE_WITH_YOUR_CLIENT_ID>.apps.googleusercontent.com';
const GOOGLE_API_KEY = import.meta.env.VITE_GOOGLE_API_KEY || '';
const DISCOVERY_DOCS = ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'];
const SCOPES = 'https://www.googleapis.com/auth/drive.file';

const BackupRestore = ({ currentUser }) => {
  const { toast } = useToast();
  const [gapiLoaded, setGapiLoaded] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [lastBackupTime, setLastBackupTime] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [hasBackedUpThisSession, setHasBackedUpThisSession] = useState(false);

  useEffect(() => {
    // Dynamically load gapi client script
    const existing = document.getElementById('gapi-script');
    if (existing) { setGapiLoaded(true); return; }
    const s = document.createElement('script');
    s.src = 'https://apis.google.com/js/api.js';
    s.id = 'gapi-script';
    s.onload = () => {
      window.gapi.load('client:auth2', async () => {
        try {
          await window.gapi.client.init({ apiKey: GOOGLE_API_KEY, clientId: GOOGLE_CLIENT_ID, discoveryDocs: DISCOVERY_DOCS, scope: SCOPES });
          setGapiLoaded(true);
          const auth = window.gapi.auth2.getAuthInstance();
          setSignedIn(auth.isSignedIn.get());
          auth.isSignedIn.listen((val) => setSignedIn(val));
        } catch (e) {
          console.warn('gapi init failed', e);
        }
      });
    };
    s.onerror = () => console.warn('Failed to load gapi');
    document.body.appendChild(s);
    return () => {}; // no cleanup
  }, []);

  const gatherData = () => {
    const dataToExport = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key === 'theme') continue;
      try {
        const parsed = JSON.parse(localStorage.getItem(key));
        if (currentUser && currentUser.role === 'merchant' && Array.isArray(parsed)) {
          dataToExport[key] = parsed.filter(item => {
            if (!item) return false;
            if (item.merchantId) return item.merchantId === currentUser.id;
            if (item.product && item.product.merchantId) return item.product.merchantId === currentUser.id;
            if (typeof item === 'object') return Object.values(item).some(v => v === currentUser.id);
            return false;
          });
        } else {
          dataToExport[key] = parsed;
        }
      } catch (e) {
        if (!currentUser || currentUser.role !== 'merchant') dataToExport[key] = localStorage.getItem(key);
      }
    }
    return dataToExport;
  };

  const downloadBackup = () => {
    try {
      const data = gatherData();
      const jsonString = JSON.stringify(data, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      const now = new Date();
      const stamp = now.toISOString().replace(/[:.]/g, '-');
      link.download = `forvoq_backup_${stamp}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setLastBackupTime(new Date());
      setHasBackedUpThisSession(true);
      toast({ title: 'Backup Downloaded', description: 'A local JSON backup was downloaded.' });
    } catch (err) {
      console.error('downloadBackup error', err);
      toast({ title: 'Backup Failed', description: 'Could not create backup JSON.', variant: 'destructive' });
    }
  };

  const signIn = async () => {
    if (!gapiLoaded) return toast({ title: 'Google API not ready', description: 'Try again in a moment.', variant: 'destructive' });
    try {
      const auth = window.gapi.auth2.getAuthInstance();
      await auth.signIn();
      setSignedIn(true);
      toast({ title: 'Signed In', description: 'You can now upload backups to Google Drive.' });
    } catch (e) {
      console.error('Sign in failed', e);
      toast({ title: 'Sign-in Failed', description: 'Could not sign in to Google.', variant: 'destructive' });
    }
  };

  const signOut = async () => {
    if (!gapiLoaded) return;
    try {
      const auth = window.gapi.auth2.getAuthInstance();
      await auth.signOut();
      setSignedIn(false);
      toast({ title: 'Signed Out' });
    } catch (e) {
      console.warn('Sign out failed', e);
    }
  };

  // Upload backup to server-side endpoint which will store it in app-owned Drive.
  const uploadToServer = async () => {
    setIsUploading(true);
    try {
      const data = gatherData();
      const now = new Date();
      const stamp = now.toISOString().replace(/[:.]/g, '-');
      const filename = `forvoq_backup_${stamp}.json`;

      const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000';
      const ADMIN_SECRET = import.meta.env.VITE_ADMIN_UPLOAD_SECRET || '';

      const headers = { 'Content-Type': 'application/json' };
      if (ADMIN_SECRET) headers['x-admin-upload-secret'] = ADMIN_SECRET; // Only include if explicitly set (not recommended for public clients)

      const res = await fetch(`${BACKEND_URL.replace(/\/$/, '')}/api/admin/backup-upload`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ filename, backup: data }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || res.statusText);
      }
      const body = await res.json();
      setLastBackupTime(new Date());
      setHasBackedUpThisSession(true);
      toast({ title: 'Backup Uploaded', description: `Backup uploaded to server as ${body.file?.name || filename}` });
    } catch (err) {
      console.error('uploadToServer error', err);
      toast({ title: 'Upload Failed', description: String(err.message || err), variant: 'destructive' });
    } finally {
      setIsUploading(false);
    }
  };

  const handleRestoreFile = async (file) => {
    if (!hasBackedUpThisSession) {
      return toast({ title: 'Backup Required', description: 'You must create a fresh backup in this session before restoring.', variant: 'destructive' });
    }
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (typeof parsed !== 'object' || parsed === null) throw new Error('Invalid backup format');
      if (!window.confirm('Restoring will overwrite existing local data. Proceed?')) return;
      // Overwrite localStorage keys with backup
      Object.keys(parsed).forEach(k => {
        try {
          const v = parsed[k];
          if (v === null || v === undefined) { localStorage.removeItem(k); }
          else if (typeof v === 'string') localStorage.setItem(k, v);
          else localStorage.setItem(k, JSON.stringify(v));
        } catch (e) { console.warn('Failed to restore key', k, e); }
      });
      toast({ title: 'Restore Complete', description: 'Local data restored from selected backup. Reloading...' });
      setTimeout(() => window.location.reload(), 800);
    } catch (err) {
      console.error('Restore failed', err);
      toast({ title: 'Restore Failed', description: 'Invalid JSON backup file.', variant: 'destructive' });
    }
  };

  return (
    <div className="p-2 rounded border space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="font-medium">Backups & Restore (Admin)</div>
          <div className="text-sm text-muted-foreground">Create JSON backups and optionally upload them to your Google Drive.</div>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex gap-2">
          <Button onClick={downloadBackup}>Backup & Download</Button>
          <Button onClick={uploadToServer} disabled={isUploading}>
            {isUploading ? 'Uploading...' : 'Backup & Upload to Server Drive'}
          </Button>
        </div>

        <div>
          <Label>Restore (requires a backup this session)</Label>
          <div className="flex items-center gap-2">
            <input type="file" accept="application/json" onChange={(e) => handleRestoreFile(e.target.files && e.target.files[0])} />
            <div className="text-sm text-muted-foreground">You must create a backup first (download or upload) before restoring.</div>
          </div>
        </div>

        <div className="text-sm text-muted-foreground">
          <div>Last backup: {lastBackupTime ? lastBackupTime.toLocaleString() : 'Never in this session'}</div>
          <div className="mt-1">Note: The upload button calls the backend `POST /api/admin/backup-upload` endpoint. Configure your backend with `GOOGLE_SERVICE_ACCOUNT_JSON` and `ADMIN_UPLOAD_SECRET` as described in the repository README.</div>
        </div>
      </div>
    </div>
  );
};

export default BackupRestore;
