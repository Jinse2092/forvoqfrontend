
import React from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useTheme } from '@/components/theme-provider';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/use-toast';

const Settings = () => {
  const { theme, setTheme } = useTheme();
  const { toast } = useToast();

  const handleClearData = () => {
    if (window.confirm('Are you sure you want to clear all local data? This action cannot be undone.')) {
      localStorage.clear();
      toast({
        title: "Data Cleared",
        description: "All local application data has been removed.",
        variant: "destructive",
      });
      // Optionally reload or redirect
       window.location.reload();
    }
  };

  const handleExportData = () => {
     try {
       const dataToExport = {};
       for (let i = 0; i < localStorage.length; i++) {
         const key = localStorage.key(i);
         // Avoid exporting theme setting if desired
         if (key !== 'theme') {
            try {
              dataToExport[key] = JSON.parse(localStorage.getItem(key));
            } catch (e) {
               dataToExport[key] = localStorage.getItem(key);
            }
         }
       }
       const jsonString = JSON.stringify(dataToExport, null, 2);
       const blob = new Blob([jsonString], { type: 'application/json' });
       const link = document.createElement('a');
       link.href = URL.createObjectURL(blob);
       link.download = `inventory_data_backup_${new Date().toISOString().split('T')[0]}.json`;
       document.body.appendChild(link);
       link.click();
       document.body.removeChild(link);
       toast({
         title: "Data Exported",
         description: "Your inventory data has been exported successfully.",
       });
     } catch (error) {
       console.error("Failed to export data:", error);
       toast({
         title: "Export Failed",
         description: "Could not export data. Check console for details.",
         variant: "destructive",
       });
     }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Settings</h1>

      <Card>
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
          <CardDescription>Customize the look and feel of the application.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <Label htmlFor="dark-mode" className="flex flex-col space-y-1">
              <span>Dark Mode</span>
              <span className="font-normal leading-snug text-muted-foreground">
                Enable dark theme for the application.
              </span>
            </Label>
            <Switch
              id="dark-mode"
              checked={theme === 'dark'}
              onCheckedChange={(checked) => setTheme(checked ? 'dark' : 'light')}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Data Management</CardTitle>
           <CardDescription>Manage your application data stored locally.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
           <div className="flex items-center justify-between">
             <Label className="flex flex-col space-y-1">
               <span>Export Data</span>
               <span className="font-normal leading-snug text-muted-foreground">
                 Download all your inventory data as a JSON file.
               </span>
             </Label>
             <Button variant="outline" onClick={handleExportData}>Export Data</Button>
           </div>
           <div className="flex items-center justify-between">
             <Label className="flex flex-col space-y-1 text-destructive">
               <span>Clear Local Data</span>
               <span className="font-normal leading-snug text-muted-foreground">
                 Permanently delete all products, inventory, and transactions stored in your browser.
               </span>
             </Label>
             <Button variant="destructive" onClick={handleClearData}>Clear All Data</Button>
           </div>
        </CardContent>
      </Card>

       <Card>
        <CardHeader>
          <CardTitle>Future Enhancements</CardTitle>
           <CardDescription>Consider these options for a production-ready application.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
           <div className="flex items-center justify-between">
             <Label className="flex flex-col space-y-1">
               <span>Cloud Storage (Recommended)</span>
               <span className="font-normal leading-snug text-muted-foreground">
                 Migrate data from local storage to a secure cloud database like Supabase for reliability and multi-user access.
               </span>
             </Label>
             <Button variant="secondary" disabled>Migrate to Supabase (Coming Soon)</Button>
           </div>
           <div className="flex items-center justify-between">
             <Label className="flex flex-col space-y-1">
               <span>User Authentication</span>
               <span className="font-normal leading-snug text-muted-foreground">
                 Implement user accounts to secure access and manage permissions.
               </span>
             </Label>
             <Button variant="secondary" disabled>Setup Authentication (Coming Soon)</Button>
           </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Settings;
  