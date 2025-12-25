import React from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import BackupRestore from '@/components/admin/BackupRestore.jsx';
import { useInventory } from '../../context/inventory-context.jsx';

const AdminSettings = () => {
  const { currentUser } = useInventory();

  if (!currentUser || currentUser.role !== 'superadmin') {
    return (
      <div className="p-2 sm:p-6">
        <h1 className="text-2xl font-semibold">Admin Settings</h1>
        <p className="text-sm text-muted-foreground">You must be a superadmin to access admin tools.</p>
      </div>
    );
  }

  return (
    <div className="p-2 sm:p-6 space-y-6">
      <h1 className="text-3xl font-bold">Admin Settings</h1>

      <Card>
        <CardHeader>
          <CardTitle>Admin Backups</CardTitle>
          <CardDescription>Super admin: create backups and restore data (Google Drive upload supported).</CardDescription>
        </CardHeader>
        <CardContent>
          <BackupRestore currentUser={currentUser} />
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminSettings;
