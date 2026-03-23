import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useLanguage } from '../contexts/LanguageContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '../components/ui/card';
import { Alert, AlertDescription } from '../components/ui/alert';
import { Loader2, Key, CheckCircle, XCircle, ArrowLeft } from 'lucide-react';
import axios from 'axios';

import API_URL from "../config/api";

const ResetPassword = () => {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [tokenValid, setTokenValid] = useState(false);
  const [userEmail, setUserEmail] = useState('');

  useEffect(() => {
    if (token) {
      verifyToken();
    } else {
      setVerifying(false);
      setError('Lien invalide - token manquant');
    }
  }, [token]);

  const verifyToken = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/auth/verify-reset-token?token=${token}`);
      setTokenValid(true);
      setUserEmail(response.data.email);
    } catch (err) {
      setError(err.response?.data?.detail || 'Lien invalide ou expiré');
      setTokenValid(false);
    } finally {
      setVerifying(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (newPassword !== confirmPassword) {
      setError('Les mots de passe ne correspondent pas');
      return;
    }

    if (newPassword.length < 6) {
      setError('Le mot de passe doit contenir au moins 6 caractères');
      return;
    }

    setLoading(true);

    try {
      await axios.post(`${API_URL}/api/auth/reset-password`, {
        token: token,
        new_password: newPassword
      });
      setSuccess(true);
    } catch (err) {
      setError(err.response?.data?.detail || 'Erreur lors de la réinitialisation');
    } finally {
      setLoading(false);
    }
  };

  if (verifying) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-primary/20 to-secondary/20">
        <Card className="w-full max-w-md">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
            <p className="text-muted-foreground">Vérification du lien...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div 
      className="min-h-screen flex items-center justify-center p-4 bg-cover bg-center bg-no-repeat relative"
      style={{
        backgroundImage: 'url(https://images.unsplash.com/photo-1514905565314-fea02285fa69?crop=entropy&cs=srgb&fm=jpg&q=85)'
      }}
    >
      <div className="absolute inset-0 bg-gradient-to-br from-primary/80 to-secondary/80 backdrop-blur-sm" />
      
      <div className="relative z-10 w-full max-w-md animate-slide-in">
        {/* Logo */}
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
          {!tokenValid && !success ? (
            <>
              <CardHeader className="space-y-1 text-center">
                <div className="flex justify-center mb-4">
                  <div className="h-16 w-16 rounded-full bg-red-100 flex items-center justify-center">
                    <XCircle className="h-8 w-8 text-red-600" />
                  </div>
                </div>
                <CardTitle className="text-2xl font-bold">Lien invalide</CardTitle>
                <CardDescription>{error || 'Ce lien de réinitialisation est invalide ou a expiré.'}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Button onClick={() => navigate('/forgot-password')} className="w-full">
                  Demander un nouveau lien
                </Button>
                <Link to="/login" className="flex items-center justify-center gap-2 text-sm text-muted-foreground hover:text-foreground">
                  <ArrowLeft className="h-4 w-4" />
                  Retour à la connexion
                </Link>
              </CardContent>
            </>
          ) : success ? (
            <>
              <CardHeader className="space-y-1 text-center">
                <div className="flex justify-center mb-4">
                  <div className="h-16 w-16 rounded-full bg-green-100 flex items-center justify-center">
                    <CheckCircle className="h-8 w-8 text-green-600" />
                  </div>
                </div>
                <CardTitle className="text-2xl font-bold">Mot de passe réinitialisé !</CardTitle>
                <CardDescription>
                  Votre mot de passe a été modifié avec succès. Vous pouvez maintenant vous connecter.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button onClick={() => navigate('/login')} className="w-full" data-testid="back-to-login">
                  Se connecter
                </Button>
              </CardContent>
            </>
          ) : (
            <form onSubmit={handleSubmit}>
              <CardHeader className="space-y-1 text-center">
                <CardTitle className="text-2xl font-bold">Nouveau mot de passe</CardTitle>
                <CardDescription>
                  Créez un nouveau mot de passe pour <strong>{userEmail}</strong>
                </CardDescription>
              </CardHeader>
              
              <CardContent className="space-y-4">
                {error && (
                  <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}

                <div className="space-y-2">
                  <Label htmlFor="newPassword">Nouveau mot de passe</Label>
                  <div className="relative">
                    <Key className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="newPassword"
                      type="password"
                      placeholder="Au moins 6 caractères"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="pl-10"
                      required
                      data-testid="new-password"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Confirmer le mot de passe</Label>
                  <div className="relative">
                    <Key className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="confirmPassword"
                      type="password"
                      placeholder="Répétez le mot de passe"
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
                  {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Key className="mr-2 h-4 w-4" />}
                  Réinitialiser le mot de passe
                </Button>

                <Link to="/login" className="flex items-center justify-center gap-2 text-sm text-muted-foreground hover:text-foreground">
                  <ArrowLeft className="h-4 w-4" />
                  Retour à la connexion
                </Link>
              </CardFooter>
            </form>
          )}
        </Card>
      </div>
    </div>
  );
};

export default ResetPassword;
