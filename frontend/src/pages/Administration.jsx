import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import DashboardLayout from '../components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '../components/ui/dialog';
import { ScrollArea } from '../components/ui/scroll-area';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '../components/ui/avatar';
import { 
  Users, Plus, Search, Filter, Loader2, Mail, Phone, 
  Building2, Calendar, Briefcase, Edit, Trash2, Eye, Download, Upload,
  Globe, Settings, Check
} from 'lucide-react';
import axios from '../config/api';
import { toast } from 'sonner';
import { format } from 'date-fns';

const Administration = () => {
  const navigate = useNavigate();
  const { user, isAdmin, canEdit } = useAuth();
  const { t } = useLanguage();
  const [employees, setEmployees] = useState([]);
  const [sites, setSites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterDepartment, setFilterDepartment] = useState('all');
  const [filterSite, setFilterSite] = useState('all');
  const [filterHierarchy, setFilterHierarchy] = useState('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editEmployee, setEditEmployee] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef(null);
  
  // Delete confirmation dialog
  const [deleteDialog, setDeleteDialog] = useState({ open: false, id: null, permanent: false });

  // Countries and Departments from API
  const [countries, setCountries] = useState([]);
  const [departments, setDepartments] = useState([]);
  
  // Countries management
  const [countryDialogOpen, setCountryDialogOpen] = useState(false);
  const [countrySubmitting, setCountrySubmitting] = useState(false);
  const [deleteCountryDialog, setDeleteCountryDialog] = useState({ open: false, country: null });
  const [newCountry, setNewCountry] = useState({ code: '', name: '' });
  
  // Departments management
  const [deptDialogOpen, setDeptDialogOpen] = useState(false);
  const [deptSubmitting, setDeptSubmitting] = useState(false);
  const [deleteDeptDialog, setDeleteDeptDialog] = useState({ open: false, dept: null });
  const [newDept, setNewDept] = useState({ code: '', name: '', description: '' });
  
  // Management panels
  const [showCountriesPanel, setShowCountriesPanel] = useState(false);
  const [showDeptsPanel, setShowDeptsPanel] = useState(false);

  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    email: '',
    password: 'Temp123!',
    phone: '',
    department: 'administration',
    position: '',
    hire_date: '',
    salary: '',
    salary_currency: 'USD',
    role: 'employee',
    category: 'agent',
    country: 'CD',
    site_id: '',
    hierarchy_level: 'employe'
  });

  const hierarchyLevels = [
    { value: 'employe', label: t('admin.simpleEmployee') },
    { value: 'chef_departement', label: t('admin.deptHead') }
  ];

  useEffect(() => {
    fetchData();
    fetchCountries();
    fetchDepartments();
  }, [filterDepartment, filterSite, filterHierarchy]);

  const fetchData = async () => {
    try {
      const [empRes, sitesRes] = await Promise.all([
        axios.get(`/api/employees`),
        axios.get(`/api/sites`)
      ]);
      setEmployees(empRes.data.employees || []);
      setSites(sitesRes.data.sites || []);
    } catch (error) {
      toast.error(t('admin.loadError'));
    } finally {
      setLoading(false);
    }
  };

  const fetchCountries = async () => {
    try {
      const response = await axios.get('/api/countries');
      const countriesData = response.data.countries || [];
      // Support both string format and object format {code, name}
      const transformedCountries = countriesData.map(country => {
        if (typeof country === 'string') {
          return { code: country, name: country };
        }
        return country;
      });
      setCountries(transformedCountries);
    } catch (error) {
      console.error('Failed to fetch countries:', error);
    }
  };

  const fetchDepartments = async () => {
    try {
      const response = await axios.get('/api/departments');
      const depts = response.data.departments || [];
      // Transform to {value, label} format for dropdown
      const transformedDepts = depts.map(dept => ({
        value: dept.code,
        label: dept.name,
        code: dept.code,
        name: dept.name,
        description: dept.description
      }));
      setDepartments(transformedDepts);
    } catch (error) {
      console.error('Failed to fetch departments:', error);
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
      await axios.post('/api/countries', newCountry);
      await fetchCountries();
      setCountryDialogOpen(false);
      setNewCountry({ code: '', name: '' });
      toast.success(t('config.countryAdded') || 'Pays ajouté avec succès');
    } catch (error) {
      toast.error(error.response?.data?.detail || t('config.addError') || 'Erreur');
    } finally {
      setCountrySubmitting(false);
    }
  };

  const handleDeleteCountry = async () => {
    if (!deleteCountryDialog.country) return;
    
    try {
      const countryId = deleteCountryDialog.country.id || deleteCountryDialog.country.code;
      await axios.delete(`/api/countries/${countryId}`);
      await fetchCountries();
      setDeleteCountryDialog({ open: false, country: null });
      toast.success(t('config.countryDeleted') || 'Pays supprimé');
    } catch (error) {
      toast.error(error.response?.data?.detail || t('config.deleteError') || 'Erreur');
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
      await axios.post('/api/departments', newDept);
      await fetchDepartments();
      setDeptDialogOpen(false);
      setNewDept({ code: '', name: '', description: '' });
      toast.success(t('config.deptAdded') || 'Département ajouté avec succès');
    } catch (error) {
      toast.error(error.response?.data?.detail || t('config.addError') || 'Erreur');
    } finally {
      setDeptSubmitting(false);
    }
  };

  const handleDeleteDepartment = async () => {
    if (!deleteDeptDialog.dept) return;
    
    try {
      const deptId = deleteDeptDialog.dept.id || deleteDeptDialog.dept.code;
      await axios.delete(`/api/departments/${deptId}`);
      await fetchDepartments();
      setDeleteDeptDialog({ open: false, dept: null });
      toast.success(t('config.deptDeleted') || 'Département supprimé');
    } catch (error) {
      toast.error(error.response?.data?.detail || t('config.deleteError') || 'Erreur');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      const payload = {
        ...formData,
        salary: parseFloat(formData.salary) || 0,
        is_manager: formData.hierarchy_level === 'chef_departement'
      };
      
      if (editEmployee) {
        await axios.put(`/api/employees/${editEmployee.id}`, payload);
        toast.success(t('admin.employeeUpdated'));
      } else {
        await axios.post(`/api/employees`, payload);
        toast.success(t('admin.employeeAdded'));
      }
      setDialogOpen(false);
      resetForm();
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || t('common.error'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = (employee) => {
    setEditEmployee(employee);
    setFormData({
      first_name: employee.first_name || '',
      last_name: employee.last_name || '',
      email: employee.email || '',
      phone: employee.phone || '',
      department: employee.department || 'administration',
      position: employee.position || '',
      hire_date: employee.hire_date || '',
      salary: employee.salary ? employee.salary.toString() : '',
      salary_currency: employee.salary_currency || 'USD',
      role: employee.role || 'employee',
      category: employee.category || 'agent',
      country: employee.country || 'RDC',
      site_id: employee.site_id || '',
      hierarchy_level: employee.hierarchy_level || (employee.is_manager ? 'chef_departement' : 'employe')
    });
    setDialogOpen(true);
  };

  const handleDelete = (id, permanent = false) => {
    setDeleteDialog({ open: true, id, permanent });
  };
  
  const confirmDelete = async () => {
    const { id, permanent } = deleteDialog;
    setDeleteDialog({ open: false, id: null, permanent: false });
    
    try {
      await axios.delete(`/api/employees/${id}`, {
        params: { permanent }
      });
      toast.success(permanent ? t('admin.employeeDeleted') : t('admin.employeeDeactivated'));
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || t('common.error'));
    }
  };

  const resetForm = () => {
    setEditEmployee(null);
    setFormData({
      first_name: '',
      last_name: '',
      email: '',
      password: 'Temp123!',
      phone: '',
      department: 'administration',
      position: '',
      hire_date: '',
      salary: '',
      salary_currency: 'USD',
      role: 'employee',
      category: 'agent',
      country: 'RDC',
      site_id: '',
      hierarchy_level: 'employe'
    });
  };

  // Filter employees based on search and filters
  const filteredEmployees = employees.filter(emp => {
    // Search filter
    const searchMatch = !searchQuery || 
      `${emp.first_name} ${emp.last_name}`.toLowerCase().includes(searchQuery.toLowerCase()) ||
      emp.email?.toLowerCase().includes(searchQuery.toLowerCase());
    
    // Department filter
    const deptMatch = filterDepartment === 'all' || emp.department === filterDepartment;
    
    // Site filter
    const siteMatch = filterSite === 'all' || emp.site_id === filterSite;
    
    // Hierarchy filter
    const hierarchyMatch = filterHierarchy === 'all' || 
      (filterHierarchy === 'chef_departement' && (emp.hierarchy_level === 'chef_departement' || emp.is_manager)) ||
      (filterHierarchy === 'employe' && emp.hierarchy_level !== 'chef_departement' && !emp.is_manager);
    
    return searchMatch && deptMatch && siteMatch && hierarchyMatch;
  });

  // Export employees to CSV
  const handleExport = () => {
    try {
      const headers = [t('auth.firstName'), t('auth.lastName'), t('auth.email'), t('admin.phone'), t('auth.department'), t('admin.position'), t('admin.hireDate'), 'Status'];
      const csv = [
        headers.join(','),
        ...filteredEmployees.map(emp => [
          emp.first_name,
          emp.last_name,
          emp.email,
          emp.phone || '',
          emp.department,
          emp.position || '',
          emp.hire_date || '',
          emp.is_active ? t('status.active') : t('status.inactive')
        ].map(val => `"${val}"`).join(','))
      ].join('\n');
      
      // Add BOM for UTF-8 compatibility
      const BOM = '\uFEFF';
      const blob = new Blob([BOM + csv], { type: 'text/csv;charset=utf-8;' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `employes_${format(new Date(), 'yyyy-MM-dd')}.csv`;
      document.body.appendChild(a); // Required for Firefox
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      toast.success(t('admin.exportSuccess'));
    } catch (error) {
      console.error('Export error:', error);
      toast.error(t('admin.exportError'));
    }
  };

  // Import employees from CSV
  const handleImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    try {
      const text = await file.text();
      const lines = text.split('\n').slice(1); // Skip header
      let imported = 0;
      
      for (const line of lines) {
        if (!line.trim()) continue;
        const parts = line.split(',').map(p => p.replace(/"/g, '').trim());
        const [firstName, lastName, email, phone, department, position, hireDate] = parts;
        
        if (firstName && lastName && email) {
          try {
            await axios.post(`/api/employees`, {
              first_name: firstName,
              last_name: lastName,
              email: email,
              password: 'Import123!',
              phone: phone || '',
              department: department || 'administration',
              position: position || '',
              hire_date: hireDate || '',
              role: 'employee',
              category: 'agent'
            });
            imported++;
          } catch (err) {
            console.error('Failed to import:', email, err);
          }
        }
      }
      
      toast.success(`${imported} ${t('admin.importSuccess')}`);
      fetchData();
    } catch (error) {
      toast.error(t('admin.importError'));
    }
    
    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6" data-testid="administration-page">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{t('admin.title')}</h1>
            <p className="text-muted-foreground">{t('admin.subtitle')}</p>
          </div>
          
          {canEdit() && (
            <div className="flex gap-2 flex-wrap">
              {/* Hidden file input for import */}
              <input
                type="file"
                ref={fileInputRef}
                accept=".csv"
                onChange={handleImport}
                className="hidden"
              />
              
              {/* Configuration buttons */}
              {isAdmin() && (
                <>
                  <Button variant="outline" onClick={() => setShowCountriesPanel(true)} data-testid="manage-countries-btn">
                    <Globe className="mr-2 h-4 w-4" />
                    {t('config.manageCountries') || 'Gérer les pays'}
                  </Button>
                  
                  <Button variant="outline" onClick={() => setShowDeptsPanel(true)} data-testid="manage-depts-btn">
                    <Settings className="mr-2 h-4 w-4" />
                    {t('config.manageDepts') || 'Gérer les départements'}
                  </Button>
                </>
              )}
              
              <Button variant="outline" onClick={() => fileInputRef.current?.click()} data-testid="import-btn">
                <Upload className="mr-2 h-4 w-4" />
                {t('admin.import')}
              </Button>
              
              <Button variant="outline" onClick={handleExport} data-testid="export-btn">
                <Download className="mr-2 h-4 w-4" />
                {t('admin.export')}
              </Button>
              
              <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
                <DialogTrigger asChild>
                  <Button data-testid="add-employee-btn">
                    <Plus className="mr-2 h-4 w-4" />
                    {t('admin.add')}
                  </Button>
                </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>
                    {editEmployee ? t('admin.editEmployee') : t('admin.newEmployee')}
                  </DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>{t('auth.firstName')}</Label>
                      <Input
                        value={formData.first_name}
                        onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                        required
                        data-testid="emp-firstname"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>{t('auth.lastName')}</Label>
                      <Input
                        value={formData.last_name}
                        onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                        required
                        data-testid="emp-lastname"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>{t('auth.email')}</Label>
                      <Input
                        type="email"
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        required
                        data-testid="emp-email"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>{t('admin.phone')}</Label>
                      <Input
                        value={formData.phone}
                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                        data-testid="emp-phone"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>{t('auth.department')}</Label>
                      <Select
                        value={formData.department}
                        onValueChange={(value) => setFormData({ ...formData, department: value })}
                      >
                        <SelectTrigger data-testid="emp-department">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {departments.map((dept) => (
                            <SelectItem key={dept.value} value={dept.value}>
                              {dept.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>{t('admin.position')}</Label>
                      <Input
                        value={formData.position}
                        onChange={(e) => setFormData({ ...formData, position: e.target.value })}
                        required
                        data-testid="emp-position"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>{t('admin.hireDate')}</Label>
                      <Input
                        type="date"
                        value={formData.hire_date}
                        onChange={(e) => setFormData({ ...formData, hire_date: e.target.value })}
                        required
                        data-testid="emp-hire-date"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>{t('admin.salary')}</Label>
                      <div className="flex gap-2">
                        <Input
                          type="number"
                          value={formData.salary}
                          onChange={(e) => setFormData({ ...formData, salary: e.target.value })}
                          required
                          className="flex-1"
                          data-testid="emp-salary"
                        />
                        <Select
                          value={formData.salary_currency || 'USD'}
                          onValueChange={(value) => setFormData({ ...formData, salary_currency: value })}
                        >
                          <SelectTrigger className="w-24" data-testid="emp-currency">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="USD">USD</SelectItem>
                            <SelectItem value="FC">FC</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>{t('admin.workSite')}</Label>
                      <Select
                        value={formData.site_id || 'none'}
                        onValueChange={(value) => setFormData({ ...formData, site_id: value === 'none' ? '' : value })}
                      >
                        <SelectTrigger data-testid="emp-site">
                          <SelectValue placeholder={t('admin.selectSite')} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">{t('admin.notAssigned')}</SelectItem>
                          {sites.map((site) => (
                            <SelectItem key={site.id} value={site.id}>{site.name} - {site.city}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>{t('admin.hierarchyLevel')}</Label>
                      <Select
                        value={formData.hierarchy_level}
                        onValueChange={(value) => setFormData({ ...formData, hierarchy_level: value })}
                      >
                        <SelectTrigger data-testid="emp-hierarchy">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {hierarchyLevels.map((level) => (
                            <SelectItem key={level.value} value={level.value}>{level.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>{t('admin.country')}</Label>
                      <Select
                        value={formData.country}
                        onValueChange={(value) => setFormData({ ...formData, country: value })}
                      >
                        <SelectTrigger data-testid="emp-country">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {countries.map((country) => (
                            <SelectItem key={country.code || country} value={country.code || country}>
                              {country.name || country}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <Button type="submit" className="w-full" disabled={submitting} data-testid="save-employee-btn">
                    {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    {editEmployee ? t('admin.update') : t('admin.add')}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
            </div>
          )}
        </div>

        {/* Filters - ENRICHIS */}
        <div className="flex flex-wrap gap-4">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={t('admin.searchEmployee')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
              data-testid="employee-search"
            />
          </div>
          <Select value={filterDepartment} onValueChange={setFilterDepartment}>
            <SelectTrigger className="w-[180px]" data-testid="department-filter">
              <Filter className="h-4 w-4 mr-2" />
              <SelectValue placeholder={t('auth.department')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('admin.allDepartments')}</SelectItem>
              {departments.map((dept) => (
                <SelectItem key={dept.value} value={dept.value}>{dept.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={filterSite} onValueChange={setFilterSite}>
            <SelectTrigger className="w-[180px]" data-testid="site-filter">
              <Building2 className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Site" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('admin.allSites')}</SelectItem>
              {sites.map((site) => (
                <SelectItem key={site.id} value={site.id}>{site.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={filterHierarchy} onValueChange={setFilterHierarchy}>
            <SelectTrigger className="w-[180px]" data-testid="hierarchy-filter">
              <SelectValue placeholder="Niveau" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('admin.allLevels')}</SelectItem>
              <SelectItem value="chef_departement">{t('admin.deptHeads')}</SelectItem>
              <SelectItem value="employe">{t('admin.simpleEmployees')}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Employee Count */}
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Users className="h-4 w-4" />
          <span>{filteredEmployees.length} {t('admin.employeesFound')}</span>
        </div>

        {/* Employees Grid */}
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : filteredEmployees.length === 0 ? (
          <Card>
            <CardContent className="text-center py-12 text-muted-foreground">
              <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>{t('admin.noEmployee')}</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filteredEmployees.map((employee) => (
              <Card key={employee.id} className="hover:shadow-md transition-shadow" data-testid={`employee-card-${employee.id}`}>
                <CardContent className="pt-6">
                  <div className="flex items-start gap-4">
                    <Avatar className="h-14 w-14">
                      <AvatarImage src={employee.avatar_url ? (employee.avatar_url.startsWith('http') ? employee.avatar_url : `${axios.defaults.baseURL}${employee.avatar_url.startsWith('/api/') ? '' : '/api'}${employee.avatar_url}`) : null} />
                      <AvatarFallback className="bg-primary/10 text-primary text-lg">
                        {employee.first_name?.[0]}{employee.last_name?.[0]}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold truncate">
                        {employee.first_name} {employee.last_name}
                      </h3>
                      <p className="text-sm text-muted-foreground">{employee.position}</p>
                      <Badge variant="secondary" className="mt-1 capitalize text-xs">
                        {employee.department?.replace('_', ' ')}
                      </Badge>
                    </div>
                  </div>

                  <div className="mt-4 space-y-2 text-sm">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Mail className="h-4 w-4" />
                      <span className="truncate">{employee.email}</span>
                    </div>
                    {employee.phone && (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Phone className="h-4 w-4" />
                        <span>{employee.phone}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Building2 className="h-4 w-4" />
                      <span>{employee.country}</span>
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Briefcase className="h-4 w-4" />
                      <span>{employee.contract_type}</span>
                    </div>
                  </div>

                  <div className="mt-4 pt-4 border-t flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => navigate(`/employee/${employee.id}`)}
                      data-testid={`view-${employee.id}`}
                    >
                      <Eye className="h-4 w-4 mr-1" />
                      {t('admin.viewFile')}
                    </Button>
                    {isAdmin() && (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleEdit(employee)}
                          data-testid={`edit-${employee.id}`}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-destructive border-destructive hover:bg-destructive hover:text-destructive-foreground"
                              data-testid={`delete-${employee.id}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleDelete(employee.id, false)}>
                              {t('admin.deactivate')}
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              onClick={() => handleDelete(employee.id, true)}
                              className="text-destructive"
                            >
                              {t('admin.deletePermanent')}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Delete Employee Confirmation Dialog */}
        <Dialog open={deleteDialog.open} onOpenChange={(open) => !open && setDeleteDialog({ open: false, id: null, permanent: false })}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-destructive">
                <Trash2 className="h-5 w-5" />
                {deleteDialog.permanent ? t('admin.permanentDelete') : t('admin.deactivateEmployee')}
              </DialogTitle>
            </DialogHeader>
            <div className="py-4">
              <p className="text-muted-foreground">
                {deleteDialog.permanent 
                  ? t('admin.permanentWarning')
                  : t('admin.deactivateWarning')
                }
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDeleteDialog({ open: false, id: null, permanent: false })}>
                {t('common.cancel')}
              </Button>
              <Button variant="destructive" onClick={confirmDelete}>
                <Trash2 className="h-4 w-4 mr-2" />
                {deleteDialog.permanent ? t('common.delete') : t('admin.deactivate')}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Countries Management Panel */}
        <Dialog open={showCountriesPanel} onOpenChange={setShowCountriesPanel}>
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Globe className="h-5 w-5 text-primary" />
                {t('config.manageCountries') || 'Gérer les pays'}
              </DialogTitle>
            </DialogHeader>
            
            <div className="space-y-4">
              {/* Add Country Form */}
              <Card className="bg-muted/30">
                <CardContent className="pt-4">
                  <div className="flex gap-2">
                    <Input
                      placeholder={t('config.countryCode') || 'Code (ex: CD)'}
                      value={newCountry.code}
                      onChange={(e) => setNewCountry({ ...newCountry, code: e.target.value.toUpperCase() })}
                      maxLength={3}
                      className="w-24"
                    />
                    <Input
                      placeholder={t('config.countryName') || 'Nom du pays'}
                      value={newCountry.name}
                      onChange={(e) => setNewCountry({ ...newCountry, name: e.target.value })}
                      className="flex-1"
                    />
                    <Button onClick={handleAddCountry} disabled={countrySubmitting}>
                      {countrySubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                    </Button>
                  </div>
                </CardContent>
              </Card>
              
              {/* Countries List */}
              <ScrollArea className="h-[300px] border rounded-lg">
                <div className="p-4 space-y-2">
                  {countries.length === 0 ? (
                    <p className="text-center text-muted-foreground py-8">
                      {t('config.noCountries') || 'Aucun pays configuré'}
                    </p>
                  ) : (
                    countries.map((country) => (
                      <div key={country.code || country} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg hover:bg-muted/50 transition-colors">
                        <div className="flex items-center gap-3">
                          <Globe className="h-4 w-4 text-muted-foreground" />
                          <div>
                            <p className="font-medium">{country.name || country}</p>
                            {country.code && <p className="text-xs text-muted-foreground">{country.code}</p>}
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeleteCountryDialog({ open: true, country })}
                          className="text-destructive hover:text-destructive hover:bg-destructive/10"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))
                  )}
                </div>
              </ScrollArea>
            </div>
          </DialogContent>
        </Dialog>

        {/* Departments Management Panel */}
        <Dialog open={showDeptsPanel} onOpenChange={setShowDeptsPanel}>
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5 text-primary" />
                {t('config.manageDepts') || 'Gérer les départements'}
              </DialogTitle>
            </DialogHeader>
            
            <div className="space-y-4">
              {/* Add Department Form */}
              <Card className="bg-muted/30">
                <CardContent className="pt-4 space-y-2">
                  <div className="flex gap-2">
                    <Input
                      placeholder={t('config.deptCode') || 'Code (ex: RH)'}
                      value={newDept.code}
                      onChange={(e) => setNewDept({ ...newDept, code: e.target.value.toLowerCase() })}
                      className="w-32"
                    />
                    <Input
                      placeholder={t('config.deptName') || 'Nom du département'}
                      value={newDept.name}
                      onChange={(e) => setNewDept({ ...newDept, name: e.target.value })}
                      className="flex-1"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Input
                      placeholder={t('config.deptDesc') || 'Description (optionnel)'}
                      value={newDept.description}
                      onChange={(e) => setNewDept({ ...newDept, description: e.target.value })}
                      className="flex-1"
                    />
                    <Button onClick={handleAddDepartment} disabled={deptSubmitting}>
                      {deptSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                    </Button>
                  </div>
                </CardContent>
              </Card>
              
              {/* Departments List */}
              <ScrollArea className="h-[300px] border rounded-lg">
                <div className="p-4 space-y-2">
                  {departments.length === 0 ? (
                    <p className="text-center text-muted-foreground py-8">
                      {t('config.noDepts') || 'Aucun département configuré'}
                    </p>
                  ) : (
                    departments.map((dept) => (
                      <div key={dept.value || dept.code} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg hover:bg-muted/50 transition-colors">
                        <div className="flex items-center gap-3 flex-1">
                          <Briefcase className="h-4 w-4 text-muted-foreground" />
                          <div className="flex-1">
                            <p className="font-medium">{dept.label || dept.name}</p>
                            {dept.description && <p className="text-xs text-muted-foreground">{dept.description}</p>}
                            <p className="text-xs text-muted-foreground/70">{dept.value || dept.code}</p>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeleteDeptDialog({ open: true, dept })}
                          className="text-destructive hover:text-destructive hover:bg-destructive/10"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))
                  )}
                </div>
              </ScrollArea>
            </div>
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
                {t('config.deleteCountryConfirm') || 'Voulez-vous vraiment supprimer ce pays ? Les employés associés devront être modifiés.'}
              </p>
              {deleteCountryDialog.country && (
                <p className="font-medium mt-2">{deleteCountryDialog.country.name || deleteCountryDialog.country}</p>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteCountryDialog({ open: false, country: null })}>
                {t('common.cancel')}
              </Button>
              <Button variant="destructive" onClick={handleDeleteCountry}>
                <Trash2 className="h-4 w-4 mr-2" />
                {t('common.delete')}
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
                {t('config.deleteDeptConfirm') || 'Voulez-vous vraiment supprimer ce département ? Les employés associés devront être modifiés.'}
              </p>
              {deleteDeptDialog.dept && (
                <p className="font-medium mt-2">{deleteDeptDialog.dept.label || deleteDeptDialog.dept.name}</p>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteDeptDialog({ open: false, dept: null })}>
                {t('common.cancel')}
              </Button>
              <Button variant="destructive" onClick={handleDeleteDepartment}>
                <Trash2 className="h-4 w-4 mr-2" />
                {t('common.delete')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
};

export default Administration;
