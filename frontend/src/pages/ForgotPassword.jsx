import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useLanguage } from '../contexts/LanguageContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '../components/ui/card';
import { Alert, AlertDescription } from '../components/ui/alert';
import { Loader2, Mail, ArrowLeft, CheckCircle, Key } from 'lucide-react';
import axios from 'axios';

import API_URL from "../config/api";

const ForgotPassword = () => {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [step, setStep] = useState(1);
  const [email, setEmail] = useState('');
  const [token, setToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleSendEmail = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await axios.post(`${API_URL}/api/auth/forgot-password`, { email });
      setSuccess(t('auth.resetEmailSent'));
      if (response.data.token) {
        setToken(response.data.token);
      }
      setStep(2);
    } catch (err) {
      setError(err.response?.data?.detail || t('auth.errorOccurred'));
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    setError('');

    if (newPassword !== confirmPassword) {
      setError(t('auth.passwordsNoMatch'));
      return;
    }

    if (newPassword.length < 6) {
      setError(t('auth.passwordMinLength'));
      return;
    }

    setLoading(true);

    try {
      await axios.post(`${API_URL}/api/auth/reset-password`, {
        token: token,
        new_password: newPassword
      });
      setStep(3);
    } catch (err) {
      setError(err.response?.data?.detail || t('auth.tokenInvalid'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div 
      className="min-h-screen flex items-center justify-center p-4 bg-cover bg-center bg-no-repeat relative"
      style={{
        backgroundImage: 'url(https://images.unsplash.com/photo-1514905565314-fea02285fa69?crop=entropy&cs=srgb&fm=jpg&q=85)'
      }}
    >
      <div className="absolute inset-0 bg-gradient-to-br from-primary/80 to-secondary/80 backdrop-blur-sm" />
      
      <div className="relative z-10 w-full max-w-md animate-slide-in">
        <div className="flex justify-center mb-8">
          <div className="flex items-center gap-3 bg-white/10 backdrop-blur-xl rounded-2xl px-6 py-3 border border-white/20">
            <svg width="48" height="48" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M25 80 C10 80 10 50 25 35 C35 25 55 25 55 45 C55 60 40 60 35 55 C30 50 35 40 45 40" stroke="#14B8A6" strokeWidth="8" strokeLinecap="round" fill="none"/>
              <path d="M30 35 L30 20" stroke="#14B8A6" strokeWidth="8" strokeLinecap="round"/>
              <path d="M75 20 C90 20 90 50 75 65 C65 75 45 75 45 55 C45 40 60 40 65 45 C70 50 65 60 55 60" stroke="#8B5CF6" strokeWidth="8" strokeLinecap="round" fill="none"/>
              <path d="M70 65 L70 80" stroke="#8B5CF6" strokeWidth="8" strokeLinecap="round"/>
            </svg>
            <div className="text-white">
              <h1 className="text-2xl font-bold">PREMIDIS SARL</h1>
            </div>
          </div>
        </div>

        <Card className="glass-effect border-white/20 shadow-2xl">
          <CardHeader className="space-y-1 text-center">
            <CardTitle className="text-2xl font-bold">
              {step === 1 && t('auth.forgotTitle')}
              {step === 2 && t('auth.resetTitle')}
              {step === 3 && t('auth.successTitle')}
            </CardTitle>
            <CardDescription>
              {step === 1 && t('auth.forgotSubtitle')}
              {step === 2 && t('auth.resetSubtitle')}
              {step === 3 && t('auth.resetSuccess')}
            </CardDescription>
          </CardHeader>
          
          {step === 1 && (
            <form onSubmit={handleSendEmail}>
              <CardContent className="space-y-4">
                {error && (
                  <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}

                <div className="space-y-2">
                  <Label htmlFor="email">{t('auth.emailAddress')}</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="email"
                      type="email"
                      placeholder={t('auth.emailPlaceholder')}
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="pl-10"
                      required
                      data-testid="forgot-email"
                    />
                  </div>
                </div>
              </CardContent>

              <CardFooter className="flex flex-col gap-4">
                <Button type="submit" className="w-full h-11" disabled={loading} data-testid="send-reset-btn">
                  {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mail className="mr-2 h-4 w-4" />}
                  {t('auth.sendLink')}
                </Button>

                <Link to="/login" className="flex items-center justify-center gap-2 text-sm text-muted-foreground hover:text-foreground">
                  <ArrowLeft className="h-4 w-4" />
                  {t('auth.backToLogin')}
                </Link>
              </CardFooter>
            </form>
          )}

          {step === 2 && (
            <form onSubmit={handleResetPassword}>
              <CardContent className="space-y-4">
                {error && (
                  <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}
                {success && (
                  <Alert className="bg-green-50 border-green-200">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    <AlertDescription className="text-green-800">{success}</AlertDescription>
                  </Alert>
                )}

                <div className="space-y-2">
                  <Label htmlFor="token">{t('auth.verificationCode')}</Label>
                  <Input
                    id="token"
                    type="text"
                    placeholder={t('auth.enterCode')}
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    required
                    data-testid="reset-token"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="newPassword">{t('auth.newPassword')}</Label>
                  <div className="relative">
                    <Key className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="newPassword"
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="pl-10"
                      required
                      data-testid="new-password"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">{t('auth.confirmPassword')}</Label>
                  <div className="relative">
                    <Key className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="confirmPassword"
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="pl-10"
                      required
                      data-testid="confirm-password"
                    />
                  </div>
                </div>
              </CardContent>

              <CardFooter className="flex flex-col gap-4">
                <Button type="submit" className="w-full h-11" disabled={loading} data-testid="reset-password-btn">
                  {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  {t('auth.resetPassword')}
                </Button>
              </CardFooter>
            </form>
          )}

          {step === 3 && (
            <CardContent className="space-y-6 text-center">
              <div className="flex justify-center">
                <div className="h-16 w-16 rounded-full bg-green-100 flex items-center justify-center">
                  <CheckCircle className="h-8 w-8 text-green-600" />
                </div>
              </div>
              <p className="text-muted-foreground">
                {t('auth.passwordChanged')}
              </p>
              <Button onClick={() => navigate('/login')} className="w-full" data-testid="back-to-login">
                {t('auth.signIn')}
              </Button>
            </CardContent>
          )}
        </Card>
      </div>
    </div>
  );
};

export default ForgotPassword;
