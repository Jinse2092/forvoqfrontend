import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '../components/ui/card';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://https://forwokbackend-1.onrender.com';

const ForgotPassword = () => {
  const [step, setStep] = useState(1);
  const [identifier, setIdentifier] = useState(''); // email, merchantId or phone
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [userId, setUserId] = useState(null);
  const navigate = useNavigate();

  const handleRequestOtp = async (e) => {
    e.preventDefault();
    setMessage('');
    setError('');
    setLoading(true);
    try {
      // Check if identifier exists before sending OTP
      let userExists = false;
      const checkRes = await fetch(`${API_BASE_URL}/api/users`);
      const users = await checkRes.json();
      if (identifier.includes('@')) {
        userExists = users.some(u => u.email === identifier);
      } else if (/^\d{10,}$/.test(identifier)) {
        userExists = users.some(u => u.phone === identifier);
      } else {
        userExists = users.some(u => u.merchantId === identifier);
      }
      if (!userExists) {
        setError('No account found with this identifier. Please check and try again.');
        setLoading(false);
        return;
      }
      const body = {};
      if (identifier.includes('@')) {
        body.email = identifier;
      } else if (/^\d{10,}$/.test(identifier)) {
        body.phone = identifier;
      } else {
        body.merchantId = identifier;
      }
      const response = await fetch(`${API_BASE_URL}/api/forgot-password/request-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (response.ok) {
        setMessage(data.message || 'OTP sent to registered email');
        // Save userId for next steps from backend response
        setUserId(data.userId);
        setStep(2);
      } else {
        setError(data.error || 'Failed to send OTP');
      }
    } catch (err) {
      setError('Network error. Please try again later.');
    }
    setLoading(false);
  };

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    setMessage('');
    setError('');
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/forgot-password/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, otp }),
      });
      const data = await response.json();
      if (response.ok) {
        setMessage(data.message || 'OTP verified');
        setStep(3);
      } else {
        setError(data.error || 'Invalid OTP');
      }
    } catch (err) {
      setError('Network error. Please try again later.');
    }
    setLoading(false);
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    setMessage('');
    setError('');
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/forgot-password/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, newPassword }),
      });
      const data = await response.json();
      if (response.ok) {
        setMessage(data.message || 'Password updated successfully');
        setStep(4);
      } else {
        setError(data.error || 'Failed to update password');
      }
    } catch (err) {
      setError('Network error. Please try again later.');
    }
    setLoading(false);
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-primary/10 via-background to-secondary/10 p-4">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <Card className="w-full max-w-md shadow-xl border-border/40">
          <CardHeader className="space-y-1 text-center">
            <CardTitle className="text-2xl font-bold tracking-tight">Forgot Password</CardTitle>
            <CardDescription>
              {step === 1 && 'Enter your email, merchant ID, or phone number to receive an OTP.'}
              {step === 2 && 'Enter the OTP sent to your registered email.'}
              {step === 3 && 'Enter your new password.'}
              {step === 4 && 'Password reset successful. You can now login with your new password.'}
            </CardDescription>
          </CardHeader>
          {step === 1 && (
            <form onSubmit={handleRequestOtp}>
              <CardContent className="grid gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="identifier">Email / Merchant ID / Phone</Label>
                  <Input
                    id="identifier"
                    type="text"
                    placeholder="Enter email, merchant ID, or phone"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    required
                  />
                </div>
                {message && <p className="text-sm text-green-600 text-center">{message}</p>}
                {error && <p className="text-sm text-destructive text-center">{error}</p>}
              </CardContent>
              <CardFooter className="flex flex-col space-y-4">
                <Button className="w-full" type="submit" disabled={loading}>
                  {loading ? 'Sending OTP...' : 'Send OTP'}
                </Button>
                <p className="text-xs text-center text-muted-foreground">
                  Remembered your password?{' '}
                  <Link to="/login" className="underline underline-offset-2 hover:text-primary">
                    Login here
                  </Link>
                </p>
              </CardFooter>
            </form>
          )}
          {step === 2 && (
            <form onSubmit={handleVerifyOtp}>
              <CardContent className="grid gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="otp">OTP</Label>
                  <Input
                    id="otp"
                    type="text"
                    placeholder="Enter OTP"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value)}
                    required
                  />
                </div>
                {message && <p className="text-sm text-green-600 text-center">{message}</p>}
                {error && <p className="text-sm text-destructive text-center">{error}</p>}
              </CardContent>
              <CardFooter className="flex flex-col space-y-4">
                <Button className="w-full" type="submit" disabled={loading}>
                  {loading ? 'Verifying OTP...' : 'Verify OTP'}
                </Button>
              </CardFooter>
            </form>
          )}
          {step === 3 && (
            <form onSubmit={handleResetPassword}>
              <CardContent className="grid gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="newPassword">New Password</Label>
                  <Input
                    id="newPassword"
                    type="password"
                    placeholder="Enter new password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="confirmPassword">Confirm Password</Label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    placeholder="Confirm new password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                  />
                </div>
                {message && <p className="text-sm text-green-600 text-center">{message}</p>}
                {error && <p className="text-sm text-destructive text-center">{error}</p>}
              </CardContent>
              <CardFooter className="flex flex-col space-y-4">
                <Button className="w-full" type="submit" disabled={loading}>
                  {loading ? 'Resetting Password...' : 'Reset Password'}
                </Button>
              </CardFooter>
            </form>
          )}
          {step === 4 && (
            <CardContent className="text-center">
              <p className="text-green-600 mb-4">{message}</p>
              <Button onClick={() => navigate('/login')}>Go to Login</Button>
            </CardContent>
          )}
        </Card>
      </motion.div>
    </div>
  );
};

export default ForgotPassword;
