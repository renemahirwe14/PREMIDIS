import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '../components/ui/card';
import { Alert, AlertDescription } from '../components/ui/alert';
import { Loader2, Mail, Lock, Eye, EyeOff, Sparkles } from 'lucide-react';

const Login = () => {
  const { login } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await login(email, password);
      navigate('/dashboard');
    } catch (err) {
      const errorMessage = err.response?.data?.detail || err.message || t('auth.errorOccurred');
      setError(String(errorMessage));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden bg-[#0a0b14]">
      {/* Animated mesh gradient background */}
      <div className="absolute inset-0" style={{
        background: `
          radial-gradient(ellipse 80% 60% at 20% 30%, rgba(124, 58, 237, 0.25) 0%, transparent 60%),
          radial-gradient(ellipse 60% 50% at 80% 70%, rgba(6, 182, 212, 0.2) 0%, transparent 60%),
          radial-gradient(ellipse 50% 40% at 50% 50%, rgba(236, 72, 153, 0.12) 0%, transparent 60%),
          linear-gradient(135deg, #0a0b14 0%, #111328 50%, #0a0b14 100%)
        `
      }} />
      
      {/* Floating orbs */}
      <div className="absolute top-1/4 left-1/4 w-72 h-72 bg-primary/20 rounded-full blur-[100px] animate-float" />
      <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-secondary/15 rounded-full blur-[100px] animate-float" style={{ animationDelay: '-3s' }} />
      
      {/* Grid pattern overlay */}
      <div className="absolute inset-0 opacity-[0.03]" style={{
        backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`,
        backgroundSize: '60px 60px'
      }} />
      
      <div className="relative z-10 w-full max-w-md animate-slide-in">
        {/* Logo */}
        <div className="flex justify-center mb-8">
          <div className="flex items-center gap-3 px-6 py-3 rounded-2xl" style={{
            background: 'rgba(255,255,255,0.06)',
            backdropFilter: 'blur(20px)',
            border: '1px solid rgba(255,255,255,0.08)'
          }}>
            <img 
              src="/logo.webp" 
              alt="PREMIDIS Logo" 
              className="h-12 w-12 object-contain rounded-xl"
            />
            <div className="text-white">
              <h1 className="text-2xl font-bold tracking-tight">PREMIDIS SARL</h1>
            </div>
          </div>
        </div>

        {/* Glass Login Card */}
        <div className="rounded-2xl p-[1px]" style={{
          background: 'linear-gradient(135deg, rgba(124,58,237,0.3), rgba(6,182,212,0.1), rgba(124,58,237,0.1))'
        }}>
          <div className="rounded-2xl px-8 py-8" style={{
            background: 'rgba(15, 18, 35, 0.75)',
            backdropFilter: 'blur(40px) saturate(180%)',
          }}>
            <div className="text-center mb-6">
              <h2 className="text-2xl font-bold text-white flex items-center justify-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                {t('auth.login')}
              </h2>
              <p className="text-sm text-gray-400 mt-1.5">{t('auth.loginSubtitle')}</p>
            </div>
            
            <form onSubmit={handleSubmit} className="space-y-5">
              {error && (
                <div className="animate-fade-in rounded-xl px-4 py-3 text-sm" style={{
                  background: 'rgba(239, 68, 68, 0.12)',
                  border: '1px solid rgba(239, 68, 68, 0.2)',
                  color: '#fca5a5'
                }}>
                  {error}
                </div>
              )}

              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-300">{t('auth.email')}</label>
                <div className="relative neon-focus rounded-xl">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                  <input
                    type="email"
                    placeholder={t('auth.emailPlaceholder')}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full h-11 pl-10 pr-4 rounded-xl text-sm text-white placeholder-gray-500 outline-none transition-all"
                    style={{
                      background: 'rgba(255,255,255,0.05)',
                      border: '1px solid rgba(255,255,255,0.08)',
                    }}
                    required
                    data-testid="login-email"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-300">{t('auth.password')}</label>
                <div className="relative neon-focus rounded-xl">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full h-11 pl-10 pr-10 rounded-xl text-sm text-white placeholder-gray-500 outline-none transition-all"
                    style={{
                      background: 'rgba(255,255,255,0.05)',
                      border: '1px solid rgba(255,255,255,0.08)',
                    }}
                    required
                    data-testid="login-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-end">
                <Link to="/forgot-password" className="text-sm text-primary/80 hover:text-primary transition-colors">
                  {t('auth.forgotPassword')}
                </Link>
              </div>

              <button 
                type="submit" 
                className="w-full h-11 rounded-xl text-white font-semibold text-sm transition-all duration-200 flex items-center justify-center gap-2 disabled:opacity-50"
                style={{
                  background: 'linear-gradient(135deg, hsl(258, 90%, 62%), hsl(258, 80%, 52%))',
                  boxShadow: '0 4px 20px -5px rgba(124, 58, 237, 0.5)'
                }}
                disabled={loading}
                data-testid="login-submit"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {t('auth.loggingIn')}
                  </>
                ) : (
                  t('auth.login')
                )}
              </button>

              <p className="text-center text-sm text-gray-500">
                {t('auth.noAccount')}{' '}
                <Link to="/register" className="text-primary font-medium hover:underline">
                  {t('auth.createAccount')}
                </Link>
              </p>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
