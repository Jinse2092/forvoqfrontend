
import React, { useState } from 'react';
import { useInventory } from '@/context/inventory-context.jsx';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Trash2 } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog.jsx";

const AdminMerchants = () => {
  const { users, removeUser, currentUser } = useInventory();
  const [searchTerm, setSearchTerm] = useState('');

  const merchants = users.filter(u => u.role === 'merchant');

  const filteredMerchants = merchants.filter(merchant =>
    merchant.companyName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    merchant.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    merchant.id.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleRemove = (userId, companyName) => {
     removeUser(userId);
  };

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Manage Merchants</h1>
       <Card>
        <CardHeader>
          <CardTitle>Merchant List</CardTitle>
           <CardDescription>View and manage registered merchants.</CardDescription>
           <div className="pt-2">
              <Input
                placeholder="Search by name, email, or ID..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="max-w-sm"
              />
           </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Company Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Phone Number</TableHead>
                <TableHead>Merchant ID</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredMerchants.map((merchant) => (
                <TableRow key={merchant.id}>
                <TableCell className="font-medium">{merchant.companyName}</TableCell>
                <TableCell>{merchant.email}</TableCell>
                <TableCell>{merchant.phoneNumber || merchant.phone || '-'}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{merchant.id}</TableCell>
                <TableCell className="text-right">
                     <AlertDialog>
                        <AlertDialogTrigger asChild>
                           <Button variant="destructive" size="sm" disabled={merchant.id === currentUser.id}>
                             <Trash2 className="h-4 w-4 mr-1" /> Kick Out
                           </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This action cannot be undone. This will permanently remove the merchant account
                               <span className="font-semibold"> {merchant.companyName}</span> and potentially their associated data.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleRemove(merchant.id, merchant.companyName)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                              Yes, Kick Out Merchant
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
           {filteredMerchants.length === 0 && (
             <p className="text-center text-muted-foreground py-4">No merchants found matching your search.</p>
           )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminMerchants;
  