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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '../components/ui/avatar';
import { 
  Users, Plus, Search, Filter, Loader2, Mail, Phone, 
  Building2, Calendar, Briefcase, Edit, Trash2, Eye, Download, Upload
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
    country: 'RDC',
    site_id: '',
    hierarchy_level: 'employe'
  });

  const departments = [
    { value: 'marketing', label: t('departments.marketing') },
    { value: 'comptabilite', label: t('departments.comptabilite') },
    { value: 'administration', label: t('departments.administration') },
    { value: 'ressources_humaines', label: t('departments.ressources_humaines') },
    { value: 'juridique', label: t('departments.juridique') },
    { value: 'nettoyage', label: t('departments.nettoyage') },
    { value: 'securite', label: t('departments.securite') },
    { value: 'chauffeur', label: t('departments.chauffeur') },
    { value: 'technicien', label: t('departments.technicien') },
    { value: 'direction', label: t('departments.direction') },
    { value: 'logistique', label: t('departments.logistique') },
    { value: 'production', label: t('departments.production') },
    { value: 'commercial', label: t('departments.commercial') },
    { value: 'informatique', label: t('departments.informatique') }
  ];

  const hierarchyLevels = [
    { value: 'employe', label: t('admin.simpleEmployee') },
    { value: 'chef_departement', label: t('admin.deptHead') }
  ];

  const countries = ['RDC', 'Congo', 'Rwanda', 'Burundi', 'Uganda', 'Kenya', 'Tanzanie', 'Cameroun'];

  useEffect(() => {
    fetchData();
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
            <div className="flex gap-2">
              {/* Hidden file input for import */}
              <input
                type="file"
                ref={fileInputRef}
                accept=".csv"
                onChange={handleImport}
                className="hidden"
              />
              
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
                            <SelectItem key={country} value={country}>{country}</SelectItem>
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
      </div>
    </DashboardLayout>
  );
};

export default Administration;
