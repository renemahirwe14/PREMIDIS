import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import DashboardLayout from '../components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { ScrollArea } from '../components/ui/scroll-area';
import { 
  Globe, Building2, Plus, Trash2, Loader2, Search, AlertCircle, Check
} from 'lucide-react';
import axios from '../config/api';
import { toast } from 'sonner';

const ConfigurationPage = () => {
  const { isAdmin } = useAuth();
  const { t } = useLanguage();
  
  // Countries state
  const [countries, setCountries] = useState([]);
  const [countriesLoading, setCountriesLoading] = useState(true);
  const [countryDialogOpen, setCountryDialogOpen] = useState(false);
  const [countrySubmitting, setCountrySubmitting] = useState(false);
  const [deleteCountryDialog, setDeleteCountryDialog] = useState({ open: false, country: null });
  const [newCountry, setNewCountry] = useState({ code: '', name: '' });
  const [countrySearch, setCountrySearch] = useState('');
  
  // Departments state
  const [departments, setDepartments] = useState([]);
  const [departmentsLoading, setDepartmentsLoading] = useState(true);
  const [deptDialogOpen, setDeptDialogOpen] = useState(false);
  const [deptSubmitting, setDeptSubmitting] = useState(false);
  const [deleteDeptDialog, setDeleteDeptDialog] = useState({ open: false, dept: null });
  const [newDept, setNewDept] = useState({ code: '', name: '', description: '' });
  const [deptSearch, setDeptSearch] = useState('');

  // Fetch data
  useEffect(() => {
    fetchCountries();
    fetchDepartments();
  }, []);

  const fetchCountries = async () => {
    try {
      setCountriesLoading(true);
      const response = await axios.get('/api/countries');
      setCountries(response.data.countries || []);
    } catch (error) {
      console.error('Failed to fetch countries:', error);
      toast.error(t('config.fetchError') || 'Erreur lors du chargement');
    } finally {
      setCountriesLoading(false);
    }
  };

  const fetchDepartments = async () => {
    try {
      setDepartmentsLoading(true);
      const response = await axios.get('/api/departments');
      setDepartments(response.data.departments || []);
    } catch (error) {
      console.error('Failed to fetch departments:', error);
      toast.error(t('config.fetchError') || 'Erreur lors du chargement');
    } finally {
      setDepartmentsLoading(false);
    }
  };

  // Country handlers
  const handleAddCountry = async () => {
    if (!newCountry.code.trim() || !newCountry.name.trim()) {
      toast.error(t('config.fillAllFields') || 'Veuillez remplir tous les champs');
      return;
    }
    
    setCountrySubmitting(true);
    try {
      const response = await axios.post('/api/countries', newCountry);
      setCountries(prev => [...prev, response.data]);
      setCountryDialogOpen(false);
      setNewCountry({ code: '', name: '' });
      toast.success(t('config.countryAdded') || 'Pays ajouté avec succès');
    } catch (error) {
      toast.error(error.response?.data?.detail || t('config.addError') || 'Erreur lors de l\'ajout');
    } finally {
      setCountrySubmitting(false);
    }
  };

  const handleDeleteCountry = async () => {
    if (!deleteCountryDialog.country) return;
    
    try {
      const countryId = deleteCountryDialog.country.id || deleteCountryDialog.country.code;
      await axios.delete(`/api/countries/${countryId}`);
      setCountries(prev => prev.filter(c => (c.id || c.code) !== countryId));
      setDeleteCountryDialog({ open: false, country: null });
      toast.success(t('config.countryDeleted') || 'Pays supprimé');
    } catch (error) {
      toast.error(error.response?.data?.detail || t('config.deleteError') || 'Erreur lors de la suppression');
    }
  };

  // Department handlers
  const handleAddDepartment = async () => {
    if (!newDept.code.trim() || !newDept.name.trim()) {
      toast.error(t('config.fillAllFields') || 'Veuillez remplir tous les champs');
      return;
    }
    
    setDeptSubmitting(true);
    try {
      const response = await axios.post('/api/departments', newDept);
      setDepartments(prev => [...prev, response.data]);
      setDeptDialogOpen(false);
      setNewDept({ code: '', name: '', description: '' });
      toast.success(t('config.deptAdded') || 'Département ajouté avec succès');
    } catch (error) {
      toast.error(error.response?.data?.detail || t('config.addError') || 'Erreur lors de l\'ajout');
    } finally {
      setDeptSubmitting(false);
    }
  };

  const handleDeleteDepartment = async () => {
    if (!deleteDeptDialog.dept) return;
    
    try {
      const deptId = deleteDeptDialog.dept.id || deleteDeptDialog.dept.code;
      await axios.delete(`/api/departments/${deptId}`);
      setDepartments(prev => prev.filter(d => (d.id || d.code) !== deptId));
      setDeleteDeptDialog({ open: false, dept: null });
      toast.success(t('config.deptDeleted') || 'Département supprimé');
    } catch (error) {
      toast.error(error.response?.data?.detail || t('config.deleteError') || 'Erreur lors de la suppression');
    }
  };

  // Filter lists
  const filteredCountries = countries.filter(c => 
    c.name.toLowerCase().includes(countrySearch.toLowerCase()) ||
    c.code.toLowerCase().includes(countrySearch.toLowerCase())
  );

  const filteredDepartments = departments.filter(d => 
    d.name.toLowerCase().includes(deptSearch.toLowerCase()) ||
    d.code.toLowerCase().includes(deptSearch.toLowerCase())
  );

  if (!isAdmin()) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-[60vh]">
          <Card className="p-8 text-center">
            <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">{t('config.accessDenied') || 'Accès refusé'}</h2>
            <p className="text-muted-foreground">{t('config.adminOnly') || 'Cette page est réservée aux administrateurs'}</p>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6 p-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold">{t('config.title') || 'Configuration'}</h1>
          <p className="text-muted-foreground">{t('config.subtitle') || 'Gérer les pays et départements de l\'entreprise'}</p>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="countries" className="w-full">
          <TabsList className="grid w-full grid-cols-2 max-w-md">
            <TabsTrigger value="countries" className="flex items-center gap-2">
              <Globe className="h-4 w-4" />
              {t('config.countries') || 'Pays'}
            </TabsTrigger>
            <TabsTrigger value="departments" className="flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              {t('config.departments') || 'Départements'}
            </TabsTrigger>
          </TabsList>

          {/* Countries Tab */}
          <TabsContent value="countries" className="mt-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Globe className="h-5 w-5 text-primary" />
                    {t('config.countriesManagement') || 'Gestion des pays'}
                  </CardTitle>
                  <CardDescription>
                    {t('config.countriesDesc') || 'Ajouter ou supprimer des pays disponibles lors de la création d\'employés'}
                  </CardDescription>
                </div>
                <Button onClick={() => setCountryDialogOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  {t('config.addCountry') || 'Ajouter un pays'}
                </Button>
              </CardHeader>
              <CardContent>
                {/* Search */}
                <div className="relative mb-4">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder={t('config.searchCountry') || 'Rechercher un pays...'}
                    value={countrySearch}
                    onChange={(e) => setCountrySearch(e.target.value)}
                    className="pl-10"
                  />
                </div>

                {countriesLoading ? (
                  <div className="flex justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  </div>
                ) : filteredCountries.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <Globe className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>{t('config.noCountries') || 'Aucun pays trouvé'}</p>
                  </div>
                ) : (
                  <ScrollArea className="h-[400px]">
                    <div className="grid gap-2">
                      {filteredCountries.map((country) => (
                        <div
                          key={country.id || country.code}
                          className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <Badge variant="outline" className="font-mono">
                              {country.code}
                            </Badge>
                            <span className="font-medium">{country.name}</span>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDeleteCountryDialog({ open: true, country })}
                            className="text-muted-foreground hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                )}

                <div className="mt-4 pt-4 border-t text-sm text-muted-foreground">
                  {t('config.totalCountries') || 'Total'}: {countries.length} {t('config.countries') || 'pays'}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Departments Tab */}
          <TabsContent value="departments" className="mt-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Building2 className="h-5 w-5 text-primary" />
                    {t('config.deptsManagement') || 'Gestion des départements'}
                  </CardTitle>
                  <CardDescription>
                    {t('config.deptsDesc') || 'Ajouter ou supprimer des départements de l\'entreprise'}
                  </CardDescription>
                </div>
                <Button onClick={() => setDeptDialogOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  {t('config.addDept') || 'Ajouter un département'}
                </Button>
              </CardHeader>
              <CardContent>
                {/* Search */}
                <div className="relative mb-4">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder={t('config.searchDept') || 'Rechercher un département...'}
                    value={deptSearch}
                    onChange={(e) => setDeptSearch(e.target.value)}
                    className="pl-10"
                  />
                </div>

                {departmentsLoading ? (
                  <div className="flex justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  </div>
                ) : filteredDepartments.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <Building2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>{t('config.noDepts') || 'Aucun département trouvé'}</p>
                  </div>
                ) : (
                  <ScrollArea className="h-[400px]">
                    <div className="grid gap-2">
                      {filteredDepartments.map((dept) => (
                        <div
                          key={dept.id || dept.code}
                          className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <Badge variant="secondary" className="font-mono">
                              {dept.code}
                            </Badge>
                            <div>
                              <span className="font-medium">{dept.name}</span>
                              {dept.description && (
                                <p className="text-xs text-muted-foreground">{dept.description}</p>
                              )}
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDeleteDeptDialog({ open: true, dept })}
                            className="text-muted-foreground hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                )}

                <div className="mt-4 pt-4 border-t text-sm text-muted-foreground">
                  {t('config.totalDepts') || 'Total'}: {departments.length} {t('config.departments') || 'départements'}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Add Country Dialog */}
        <Dialog open={countryDialogOpen} onOpenChange={setCountryDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Globe className="h-5 w-5 text-primary" />
                {t('config.addCountry') || 'Ajouter un pays'}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="country-code">{t('config.countryCode') || 'Code pays (ISO)'}</Label>
                <Input
                  id="country-code"
                  placeholder="CD, FR, US..."
                  maxLength={3}
                  value={newCountry.code}
                  onChange={(e) => setNewCountry({...newCountry, code: e.target.value.toUpperCase()})}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="country-name">{t('config.countryName') || 'Nom du pays'}</Label>
                <Input
                  id="country-name"
                  placeholder="RD Congo, France..."
                  value={newCountry.name}
                  onChange={(e) => setNewCountry({...newCountry, name: e.target.value})}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCountryDialogOpen(false)}>
                {t('common.cancel') || 'Annuler'}
              </Button>
              <Button onClick={handleAddCountry} disabled={countrySubmitting}>
                {countrySubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                <Check className="mr-2 h-4 w-4" />
                {t('common.add') || 'Ajouter'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Add Department Dialog */}
        <Dialog open={deptDialogOpen} onOpenChange={setDeptDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5 text-primary" />
                {t('config.addDept') || 'Ajouter un département'}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="dept-code">{t('config.deptCode') || 'Code département'}</Label>
                <Input
                  id="dept-code"
                  placeholder="marketing, rh, it..."
                  value={newDept.code}
                  onChange={(e) => setNewDept({...newDept, code: e.target.value.toLowerCase().replace(/\s/g, '_')})}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="dept-name">{t('config.deptName') || 'Nom du département'}</Label>
                <Input
                  id="dept-name"
                  placeholder="Marketing, Ressources Humaines..."
                  value={newDept.name}
                  onChange={(e) => setNewDept({...newDept, name: e.target.value})}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="dept-desc">{t('config.deptDesc') || 'Description (optionnel)'}</Label>
                <Input
                  id="dept-desc"
                  placeholder="Description du département..."
                  value={newDept.description}
                  onChange={(e) => setNewDept({...newDept, description: e.target.value})}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeptDialogOpen(false)}>
                {t('common.cancel') || 'Annuler'}
              </Button>
              <Button onClick={handleAddDepartment} disabled={deptSubmitting}>
                {deptSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                <Check className="mr-2 h-4 w-4" />
                {t('common.add') || 'Ajouter'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Country Confirmation */}
        <Dialog open={deleteCountryDialog.open} onOpenChange={(open) => !open && setDeleteCountryDialog({ open: false, country: null })}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-destructive">
                <Trash2 className="h-5 w-5" />
                {t('config.deleteCountry') || 'Supprimer le pays'}
              </DialogTitle>
            </DialogHeader>
            <div className="py-4">
              <p className="text-muted-foreground">
                {t('config.deleteCountryConfirm') || 'Voulez-vous vraiment supprimer'} <strong>{deleteCountryDialog.country?.name}</strong> ?
              </p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteCountryDialog({ open: false, country: null })}>
                {t('common.cancel') || 'Annuler'}
              </Button>
              <Button variant="destructive" onClick={handleDeleteCountry}>
                <Trash2 className="h-4 w-4 mr-2" />
                {t('common.delete') || 'Supprimer'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Department Confirmation */}
        <Dialog open={deleteDeptDialog.open} onOpenChange={(open) => !open && setDeleteDeptDialog({ open: false, dept: null })}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-destructive">
                <Trash2 className="h-5 w-5" />
                {t('config.deleteDept') || 'Supprimer le département'}
              </DialogTitle>
            </DialogHeader>
            <div className="py-4">
              <p className="text-muted-foreground">
                {t('config.deleteDeptConfirm') || 'Voulez-vous vraiment supprimer'} <strong>{deleteDeptDialog.dept?.name}</strong> ?
              </p>
              <p className="text-sm text-orange-600 mt-2">
                {t('config.deleteDeptWarning') || '⚠️ Impossible si des employés sont affectés à ce département.'}
              </p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteDeptDialog({ open: false, dept: null })}>
                {t('common.cancel') || 'Annuler'}
              </Button>
              <Button variant="destructive" onClick={handleDeleteDepartment}>
                <Trash2 className="h-4 w-4 mr-2" />
                {t('common.delete') || 'Supprimer'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
};

export default ConfigurationPage;
