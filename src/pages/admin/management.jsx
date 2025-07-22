import React, { useState } from 'react';
import { useInventory } from '@/context/inventory-context.jsx';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose, DialogDescription } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog.jsx";
import { PlusCircle, Trash2 } from 'lucide-react';

const AdminManagement = () => {
  const { users, addAdmin, removeUser, currentUser } = useInventory();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState({ companyName: '', email: '', password: '' });

  // Pin superadmin to top of the list.
  const admins = [
    ...users.filter(u => u.role === 'superadmin'),
    ...users.filter(u => u.role === 'admin')
  ];

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleAddAdminSubmit = (e) => {
    e.preventDefault();
    const success = addAdmin(formData);
    if (success) {
      setIsModalOpen(false);
      setFormData({ companyName: '', email: '', password: '' });
    }
  };

  const handleRemove = (userId, companyName) => {
     removeUser(userId);
  };

  return (
    <div className="p-2 sm:p-6 space-y-6">
      <div className="flex justify-between items-center">
         <h1 className="text-3xl font-bold">Admin Management</h1>
          <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
            <DialogTrigger asChild>
              <Button>
                <PlusCircle className="mr-2 h-4 w-4" /> Add New Admin
              </Button>
            </DialogTrigger>
          <DialogContent className="sm:max-w-[425px]" aria-describedby="add-admin-description">
              <DialogHeader>
                <DialogTitle>Add New Admin User</DialogTitle>
                <DialogDescription id="add-admin-description">Fill in the details below to add a new admin user.</DialogDescription>
              </DialogHeader>
              <form onSubmit={handleAddAdminSubmit} className="grid gap-4 py-4">
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="companyName" className="text-right">Name/Dept</Label>
                  <Input id="companyName" name="companyName" value={formData.companyName} onChange={handleInputChange} className="col-span-3" required />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="email" className="text-right">Email</Label>
                  <Input id="email" name="email" type="email" value={formData.email} onChange={handleInputChange} className="col-span-3" required />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="password" className="text-right">Password</Label>
                  <Input id="password" name="password" type="password" value={formData.password} onChange={handleInputChange} className="col-span-3" required />
                </div>
                <DialogFooter>
                  <DialogClose asChild>
                    <Button type="button" variant="outline">Cancel</Button>
                  </DialogClose>
                  <Button type="submit">Add Admin</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
      </div>

       <Card>
        <CardHeader>
          <CardTitle>Admin & Super Admin List</CardTitle>
           <CardDescription>Manage users with administrative privileges.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name/Dept</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>User ID</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {admins.map((admin) => (
                <TableRow key={admin.id}>
                  <TableCell className="font-medium">{admin.companyName}</TableCell>
                  <TableCell>{admin.email}</TableCell>
                  <TableCell>
                     <span className={`text-xs px-2 py-0.5 rounded font-medium ${admin.role === 'superadmin' ? 'bg-destructive/10 text-destructive' : 'bg-primary/10 text-primary'}`}>
                       {admin.role.toUpperCase()}
                     </span>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{admin.id}</TableCell>
                  <TableCell className="text-right">
                     <AlertDialog>
                        <AlertDialogTrigger asChild>
                           <Button variant="destructive" size="sm" disabled={admin.id === currentUser.id || admin.role === 'superadmin'}>
                             <Trash2 className="h-4 w-4 mr-1" /> Remove
                           </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This action cannot be undone. This will permanently remove the admin account
                               <span className="font-semibold"> {admin.companyName}</span> ({admin.email}).
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleRemove(admin.id, admin.companyName)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                              Yes, Remove Admin
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
           {admins.length === 0 && (
             <p className="text-center text-muted-foreground py-4">No admin users found.</p>
           )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminManagement;
