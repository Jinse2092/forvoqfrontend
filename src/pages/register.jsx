import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useInventory } from '../context/inventory-context.jsx';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '../components/ui/card';
import { motion } from 'framer-motion';

const Register = () => {
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    companyName: '',
    email: '',
    password: '',
    confirmPassword: '',
    phoneNumber: '',
  });
  const [otp, setOtp] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const { register } = useInventory();
  const navigate = useNavigate();

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleRequestOtp = async () => {
    setError('');
    setMessage('');
    // Check if passwords match before sending OTP
    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match.');
      setMessage('Passwords do not match.');
      return;
    }
    if (!formData.email) {
      setError('Email is required to send OTP.');
      return;
    }
    setLoading(true);
    try {
      // Check if email is already in use before sending OTP
      const checkRes = await fetch('localhost:4000/api/users');
      const users = await checkRes.json();
      if (users.some(u => u.email === formData.email)) {
        setError('This email is already registered. Please use a different email or login.');
        setMessage('This email is already registered. Please use a different email or login.');
        setLoading(false);
        return;
      }
      const response = await fetch('localhost:4000/api/register/request-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: formData.email }),
      });
      const data = await response.json();
      if (response.ok) {
        setMessage(data.message || 'OTP sent to your email.');
        setStep(2);
      } else {
        setError(data.error || 'Failed to send OTP.');
      }
    } catch (err) {
      setError('Network error. Please try again later.');
    }
    setLoading(false);
  };

  const handleVerifyOtp = async () => {
    setError('');
    setMessage('');
    if (!otp) {
      setError('Please enter the OTP.');
      return;
    }
    setLoading(true);
    try {
      const response = await fetch('localhost:4000/api/register/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: formData.email, otp }),
      });
      const data = await response.json();
      if (response.ok) {
        setMessage(data.message || 'OTP verified.');
        setStep(3);
      } else {
        setError(data.error || 'Invalid OTP.');
      }
    } catch (err) {
      setError('Network error. Please try again later.');
    }
    setLoading(false);
  };

  const handleRegister = async () => {
    setError('');
    setMessage('');
    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (formData.password.length < 6) {
      setError('Password must be at least 6 characters long.');
      return;
    }
    setLoading(true);
    try {
      const { confirmPassword, ...registrationData } = formData;
      // registrationData now includes phoneNumber
      const success = await register(registrationData);
      if (success) {
        setMessage('Registration successful. Redirecting to login...');
        setTimeout(() => navigate('/login'), 2000);
      } else {
        setError('Registration failed. Please try again.');
      }
    } catch (err) {
      setError('Network error. Please try again later.');
    }
    setLoading(false);
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
            <CardTitle className="text-xl sm:text-2xl font-bold tracking-tight">Register Merchant Account</CardTitle>
            <CardDescription className="text-sm sm:text-base">
              {step === 1 && 'Fill in your company details to get started.'}
              {step === 2 && 'Enter the OTP sent to your email.'}
              {step === 3 && 'Registration successful! Redirecting...'}
            </CardDescription>
          </CardHeader>
          {step === 1 && (
            <form onSubmit={e => { e.preventDefault(); handleRequestOtp(); }}>
              <CardContent className="grid gap-3 sm:gap-4">
                <div className="grid gap-1.5 sm:gap-2">
                  <Label htmlFor="companyName" className="text-sm sm:text-base">Company Name</Label>
                  <Input
                    id="companyName"
                    name="companyName"
                    placeholder="Your Company Inc."
                    value={formData.companyName}
                    onChange={handleChange}
                    required
                    className="text-sm sm:text-base px-3 py-2"
                  />
                </div>
                <div className="grid gap-1.5 sm:gap-2">
                  <Label htmlFor="email" className="text-sm sm:text-base">Email</Label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    placeholder="admin@yourcompany.com"
                    value={formData.email}
                    onChange={handleChange}
                    required
                    className="text-sm sm:text-base px-3 py-2"
                  />
                </div>
                <div className="grid gap-1.5 sm:gap-2">
                  <Label htmlFor="phoneNumber" className="text-sm sm:text-base">Phone Number</Label>
                  <Input
                    id="phoneNumber"
                    name="phoneNumber"
                    type="tel"
                    placeholder="+1 234 567 8900"
                    value={formData.phoneNumber}
                    onChange={handleChange}
                    required
                    className="text-sm sm:text-base px-3 py-2"
                  />
                </div>
                <div className="grid gap-1.5 sm:gap-2">
                  <Label htmlFor="password" className="text-sm sm:text-base">Password</Label>
                  <Input
                    id="password"
                    name="password"
                    type="password"
                    placeholder="Min. 6 characters"
                    value={formData.password}
                    onChange={handleChange}
                    required
                    className="text-sm sm:text-base px-3 py-2"
                  />
                </div>
                <div className="grid gap-1.5 sm:gap-2">
                  <Label htmlFor="confirmPassword" className="text-sm sm:text-base">Confirm Password</Label>
                  <Input
                    id="confirmPassword"
                    name="confirmPassword"
                    type="password"
                    value={formData.confirmPassword}
                    onChange={handleChange}
                    required
                    className="text-sm sm:text-base px-3 py-2"
                  />
                </div>
                {error && <p className="text-xs sm:text-sm text-destructive text-center">{error}</p>}
              </CardContent>
              <CardFooter className="flex flex-col space-y-3 sm:space-y-4">
                <Button className="w-full text-base sm:text-lg py-2 sm:py-3" type="submit" disabled={loading}>
                  {loading ? 'Sending OTP...' : 'Send OTP'}
                </Button>
                <p className="text-xs sm:text-sm text-center text-muted-foreground">
                  Already have an account?{' '}
                  <Link to="/login" className="underline underline-offset-2 hover:text-primary">
                    Login here
                  </Link>
                </p>
              </CardFooter>
            </form>
          )}
          {step === 2 && (
            <form onSubmit={e => { e.preventDefault(); handleVerifyOtp(); }}>
              <CardContent className="grid gap-3 sm:gap-4">
                <div className="grid gap-1.5 sm:gap-2">
                  <Label htmlFor="otp" className="text-sm sm:text-base">OTP</Label>
                  <Input
                    id="otp"
                    type="text"
                    placeholder="Enter OTP"
                    value={otp}
                    onChange={e => setOtp(e.target.value)}
                    required
                    className="text-sm sm:text-base px-3 py-2"
                  />
                </div>
                {error && <p className="text-xs sm:text-sm text-destructive text-center">{error}</p>}
                {message && <p className="text-xs sm:text-sm text-green-600 text-center">{message}</p>}
              </CardContent>
              <CardFooter className="flex flex-col space-y-3 sm:space-y-4">
                <Button className="w-full text-base sm:text-lg py-2 sm:py-3" type="submit" disabled={loading}>
                  {loading ? 'Verifying OTP...' : 'Verify OTP'}
                </Button>
              </CardFooter>
            </form>
          )}
          {step === 3 && (
            <CardContent className="text-center">
              <p className="text-green-600 mb-4 text-sm sm:text-base">{message}</p>
              <Button className="w-full text-base sm:text-lg py-2 sm:py-3" onClick={handleRegister} disabled={loading}>
                {loading ? 'Registering...' : 'Complete Registration'}
              </Button>
            </CardContent>
          )}
        </Card>
      </motion.div>
    </div>
  );
};

export default Register;
