import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useInventory } from '@/context/inventory-context.jsx';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { motion } from 'framer-motion';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const { login } = useInventory();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    const success = await login(email, password);
    if (success) {
      navigate('/'); // Redirect to dashboard on successful login
    } else {
      setError('Invalid credentials. Please try again.');
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-primary/10 via-background to-secondary/10 p-2 sm:p-4">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <Card className="w-full max-w-md sm:max-w-md shadow-xl border-border/40 rounded-lg sm:rounded-xl mx-2 sm:mx-0">
          <CardHeader className="space-y-1 text-center">
            <CardTitle className="text-xl sm:text-2xl font-bold tracking-tight">Merchant Login</CardTitle>
            <CardDescription className="text-sm sm:text-base">Enter your email and password to access your dashboard.</CardDescription>
          </CardHeader>
          <form onSubmit={handleSubmit}>
            <CardContent className="grid gap-3 sm:gap-4">
              <div className="grid gap-1.5 sm:gap-2">
                <Label htmlFor="email" className="text-sm sm:text-base">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="merchant@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="text-sm sm:text-base px-3 py-2"
                />
              </div>
              <div className="grid gap-1.5 sm:gap-2">
                <Label htmlFor="password" className="text-sm sm:text-base">Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="text-sm sm:text-base px-3 py-2"
                />
              </div>
              {error && <p className="text-xs sm:text-sm text-destructive text-center">{error}</p>}
              <p className="text-xs text-center text-primary underline underline-offset-2 cursor-pointer">
                <Link to="/forgot-password">Forgot Password?</Link>
              </p>
            </CardContent>
            <CardFooter className="flex flex-col space-y-3 sm:space-y-4">
              <Button className="w-full text-base sm:text-lg py-2 sm:py-3" type="submit">Login</Button>
              <p className="text-xs sm:text-sm text-center text-muted-foreground">
                Don't have an account?{' '}
                <Link to="/register" className="underline underline-offset-2 hover:text-primary">
                  Register here
                </Link>
              </p>
            </CardFooter>
          </form>
        </Card>
      </motion.div>
    </div>
  );
};

export default Login;
