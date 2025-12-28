import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import JSZip from 'jszip';

// This component no longer performs client-side Google Drive uploads.
// All Drive uploads / full exports should be done via the server endpoints.

const BackupRestore = ({ currentUser }) => {
  const { toast } = useToast();
  const [lastBackupTime, setLastBackupTime] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [hasBackedUpThisSession, setHasBackedUpThisSession] = useState(false);
  const [showSelectRestore, setShowSelectRestore] = useState(false);

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

  // Fetch all collections from server and download each collection as its own JSON file inside a zip
  const downloadServerExport = async () => {
    try {
      const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'https://api.forvoq.com';
      let ADMIN_SECRET = import.meta.env.VITE_ADMIN_UPLOAD_SECRET || '';
      if (!ADMIN_SECRET) {
        try {
          const promptSecret = window.prompt('Enter admin upload secret (server ADMIN_UPLOAD_SECRET) to authorize export:');
          if (promptSecret) ADMIN_SECRET = promptSecret.trim();
        } catch (e) {}
      }
      const headers = { 'Content-Type': 'application/json' };
      if (ADMIN_SECRET) headers['x-admin-upload-secret'] = ADMIN_SECRET;

      const resp = await fetch(`${BACKEND_URL.replace(/\/$/, '')}/api/admin/export-all`, { headers });
      if (!resp.ok) {
        const body = await resp.json().catch(() => null);
        throw new Error(body?.error || resp.statusText);
      }
      const json = await resp.json();

      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const folderName = `server_export_${stamp}`;
      const zip = new JSZip();
      Object.keys(json).forEach(key => {
        try {
          zip.file(`${folderName}/${key}.json`, JSON.stringify(json[key], null, 2));
        } catch (e) {
          zip.file(`${folderName}/${key}.json`, String(json[key]));
        }
      });
      const blob = await zip.generateAsync({ type: 'blob' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `${folderName}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setHasBackedUpThisSession(true);
      setLastBackupTime(new Date());
      toast({ title: 'Export Downloaded', description: 'All server collections downloaded as zip.' });
    } catch (err) {
      console.error('Server export failed', err);
      toast({ title: 'Export Failed', description: String(err.message || err), variant: 'destructive' });
    }
  };
  // Create a zip containing each localStorage key as a separate JSON file and download it
  const downloadFolderBackup = async (prefix = 'forvoq_backup') => {
    try {
      const data = gatherData();
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const folderName = `${prefix}_${stamp}`;
      const zip = new JSZip();
      // Put each key as its own file under the folder
      Object.keys(data).forEach(key => {
        try {
          const content = typeof data[key] === 'string' ? data[key] : JSON.stringify(data[key], null, 2);
          zip.file(`${folderName}/${key}.json`, content);
        } catch (e) {
          zip.file(`${folderName}/${key}.json`, String(data[key]));
        }
      });
      const blob = await zip.generateAsync({ type: 'blob' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `${folderName}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setLastBackupTime(new Date());
      setHasBackedUpThisSession(true);
      toast({ title: 'Backup Downloaded', description: 'Local data folder downloaded as zip.' });
    } catch (err) {
      console.error('downloadFolderBackup error', err);
      toast({ title: 'Backup Failed', description: 'Could not create backup zip.', variant: 'destructive' });
      throw err;
    }
  };

  // Note: client-side Drive sign-in/upload removed.

  // Server upload removed from UI per user request. Backups are local zip downloads.

  // Restore from a zip file by uploading it to the server which will apply changes to the DB
  // The server will skip restoring the `users` collection as configured server-side.
  const handleRestoreZip = async (file) => {
    if (!file) return;
    try {
      // 1) create/download a backup of current local data before modifying
      await downloadFolderBackup('pre_restore_backup');

      if (!window.confirm('This will upload the selected zip and restore server data (users will be skipped). Proceed?')) return;

      // 2) upload zip to server
      setIsUploading(true);
      const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'https://api.forvoq.com';
      let ADMIN_SECRET = import.meta.env.VITE_ADMIN_UPLOAD_SECRET || '';
      if (!ADMIN_SECRET) {
        try {
          const promptSecret = window.prompt('Enter admin upload secret (server ADMIN_UPLOAD_SECRET) to authorize restore:');
          if (promptSecret) ADMIN_SECRET = promptSecret.trim();
        } catch (e) {}
      }

      const form = new FormData();
      form.append('file', file, file.name || 'restore.zip');

      const headers = {};
      if (ADMIN_SECRET) headers['x-admin-upload-secret'] = ADMIN_SECRET;

      const resp = await fetch(`${BACKEND_URL.replace(/\/$/, '')}/api/admin/restore-zip`, {
        method: 'POST',
        headers,
        body: form
      });
      setIsUploading(false);

      if (!resp.ok) {
        const body = await resp.json().catch(() => null);
        throw new Error(body?.error || resp.statusText || 'Restore failed');
      }
      const body = await resp.json();
      // show result summary
      const restored = (body.results && body.results.restored) ? body.results.restored.join(', ') : '';
      const skipped = (body.results && body.results.skipped) ? body.results.skipped.join(', ') : '';
      const errors = (body.results && body.results.errors) ? JSON.stringify(body.results.errors) : '';
      toast({ title: 'Restore Completed', description: `Restored: ${restored || 'none'}. Skipped: ${skipped || 'none'}.` });
      if (errors) console.warn('Restore errors', body.results.errors);

      // reload to pick up any server-driven changes
      setTimeout(() => window.location.reload(), 800);
    } catch (err) {
      console.error('Restore upload failed', err);
      setIsUploading(false);
      toast({ title: 'Restore Failed', description: String(err.message || err), variant: 'destructive' });
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
          <Button onClick={downloadServerExport}>Backup</Button>
          <input id="restore-zip-input" type="file" accept=".zip" style={{ display: 'none' }} onChange={(e) => {
            const f = e.target.files && e.target.files[0];
            if (f) handleRestoreZip(f);
            e.target.value = null;
          }} />
          <Button onClick={() => {
            // Trigger restore: download a server snapshot first, then show a 'Select restore zip' button the user must click.
            setShowSelectRestore(false);
            setIsUploading(true);
            downloadServerExport().then(() => {
              setIsUploading(false);
              setShowSelectRestore(true);
            }).catch(() => {
              setIsUploading(false);
              setShowSelectRestore(true);
            });
          }}>Restore</Button>
          {showSelectRestore && (
            <Button onClick={() => {
              // This click is a direct user activation, safe to call file input.
              const input = document.getElementById('restore-zip-input');
              if (!input) return;
              input.click();
              // hide the select button until next cycle
              setShowSelectRestore(false);
            }}>Select restore zip</Button>
          )}
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
