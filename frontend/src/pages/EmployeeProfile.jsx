import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import DashboardLayout from '../components/layout/DashboardLayout';
import BehaviorCard from '../components/BehaviorCard';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Badge } from '../components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '../components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Progress } from '../components/ui/progress';
import { Separator } from '../components/ui/separator';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { 
  Briefcase, User, Award, FileText, Banknote, Settings, 
  Mail, Phone, Building2, Calendar, MapPin, Upload, Download,
  Edit, ArrowLeft, Plus, Clock, Target, CheckCircle, Loader2,
  ThumbsUp, ThumbsDown, UserCheck, Camera, DollarSign, Eye,
  CalendarDays, CalendarCheck, CalendarX, CalendarClock, History,
  Trash2, Pencil, X, Check
} from 'lucide-react';
import axios from '../config/api';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

const EmployeeProfile = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, isAdmin, canEdit } = useAuth();
  const { t } = useLanguage();
  const [employee, setEmployee] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('travail');
  const [documents, setDocuments] = useState([]);
  const [payslips, setPayslips] = useState([]);
  const [objectives, setObjectives] = useState([]);
  const [behaviors, setBehaviors] = useState([]);
  const [leaves, setLeaves] = useState([]);
  const [leaveBalance, setLeaveBalance] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState({});
  const [uploading, setUploading] = useState(false);
  
  // Document viewer/editor states
  const [viewingDoc, setViewingDoc] = useState(null);
  const [editingDocName, setEditingDocName] = useState(null);
  const [newDocName, setNewDocName] = useState('');
  
  // Dialog states for replacing native prompts/confirms
  const [deleteDocDialog, setDeleteDocDialog] = useState({ open: false, docId: null });
  const [salaryDialog, setSalaryDialog] = useState({ open: false, salary: '', currency: 'USD' });
  
  // For creating objectives (admin only)
  const [objectiveDialog, setObjectiveDialog] = useState(false);
  const [objectiveForm, setObjectiveForm] = useState({
    title: '',
    description: '',
    target_date: '',
    progress: 0
  });

  const isOwnProfile = user?.id === id || !id;
  const canModify = isAdmin() || (canEdit() && !isOwnProfile);

  useEffect(() => {
    fetchEmployeeData();
  }, [id]);

  const fetchEmployeeData = async () => {
    try {
      const employeeId = id || user?.id;
      
      // Fetch employee details
      const empResponse = await axios.get(`/api/employees/${employeeId}`).catch(() => null);
      if (empResponse) {
        setEmployee(empResponse.data);
        setEditData(empResponse.data);
      } else {
        // Use user data if no employee record
        setEmployee({
          id: user.id,
          first_name: user.first_name,
          last_name: user.last_name,
          email: user.email,
          department: user.department,
          position: user.position || t('employeeProfile.defaults.employee'),
          phone: user.phone,
          hire_date: user.created_at?.split('T')[0],
          country: t('employeeProfile.defaults.country'),
          contract_type: t('employeeProfile.defaults.contractType')
        });
      }

      // Fetch payslips
      try {
        const payslipsResponse = await axios.get(`/api/payroll`, {
          params: { employee_id: employeeId }
        });
        setPayslips(payslipsResponse.data.payslips || []);
      } catch {
        setPayslips([]);
      }

      // Fetch documents
      try {
        const docsResponse = await axios.get(`/api/employees/${employeeId}/documents`);
        setDocuments(docsResponse.data.documents || []);
      } catch {
        setDocuments([]);
      }

      // Fetch behavior notes
      try {
        const behaviorResponse = await axios.get(`/api/behavior/${employeeId}`);
        setBehaviors(behaviorResponse.data.behaviors || []);
      } catch {
        setBehaviors([]);
      }

      // Fetch employee leaves
      try {
        const leavesResponse = await axios.get(`/api/leaves`, {
          params: { employee_id: employeeId }
        });
        setLeaves(leavesResponse.data.leaves || []);
      } catch {
        setLeaves([]);
      }

      // Fetch leave balance (from employee data)
      try {
        const balanceResponse = await axios.get(`/api/leaves/balance`);
        setLeaveBalance(balanceResponse.data);
      } catch {
        setLeaveBalance(null);
      }

    } catch (error) {
      console.error('Error fetching employee data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Upload profile picture
  const handleAvatarUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);
    
    try {
      const employeeId = id || user?.id;
      const response = await axios.post(`/api/upload/avatar/${employeeId}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      toast.success(t('employeeProfile.uploadSuccess'));
      fetchEmployeeData();
    } catch (error) {
      toast.error(error.response?.data?.detail || t('employeeProfile.uploadError'));
    } finally {
      setUploading(false);
    }
  };

  // Upload document
  const handleDocumentUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);
    
    try {
      // First upload the file
      const uploadResponse = await axios.post(`/api/upload/file`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      
      // Then save the document reference
      const employeeId = id || user?.id;
      await axios.post(`/api/employees/${employeeId}/documents`, {
        name: file.name,
        type: file.type.includes('pdf') ? 'pdf' : 'image',
        url: uploadResponse.data.url
      });
      
      toast.success(t('employeeProfile.documentAdded'));
      fetchEmployeeData();
    } catch (error) {
      toast.error(error.response?.data?.detail || t('employeeProfile.uploadError'));
    } finally {
      setUploading(false);
    }
  };

  // Rename document
  const handleRenameDocument = async (docId) => {
    if (!newDocName.trim()) {
      toast.error(t('employeeProfile.emptyName'));
      return;
    }
    
    try {
      const employeeId = id || user?.id;
      await axios.put(`/api/employees/${employeeId}/documents/${docId}?name=${encodeURIComponent(newDocName)}`);
      toast.success(t('employeeProfile.documentRenamed'));
      setEditingDocName(null);
      setNewDocName('');
      fetchEmployeeData();
    } catch (error) {
      toast.error(error.response?.data?.detail || t('employeeProfile.renameError'));
    }
  };

  // Delete document - opens confirmation dialog
  const handleDeleteDocument = (docId) => {
    setDeleteDocDialog({ open: true, docId });
  };
  
  // Confirm document deletion
  const confirmDeleteDocument = async () => {
    const docId = deleteDocDialog.docId;
    setDeleteDocDialog({ open: false, docId: null });
    
    try {
      const employeeId = id || user?.id;
      await axios.delete(`/api/employees/${employeeId}/documents/${docId}`);
      toast.success(t('employeeProfile.documentDeleted'));
      fetchEmployeeData();
    } catch (error) {
      toast.error(error.response?.data?.detail || t('employeeProfile.deleteError'));
    }
  };
  
  // Update salary
  const handleUpdateSalary = async () => {
    const { salary, currency } = salaryDialog;
    if (!salary || isNaN(parseFloat(salary))) {
      toast.error(t('employeeProfile.invalidAmount'));
      return;
    }
    const validCurrency = ['USD', 'FC'].includes(currency?.toUpperCase()) ? currency.toUpperCase() : 'USD';
    
    try {
      await axios.put(`/api/employees/${employee.id}/salary?salary=${salary}&currency=${validCurrency}`);
      toast.success(t('employeeProfile.salaryUpdated'));
      setSalaryDialog({ open: false, salary: '', currency: 'USD' });
      fetchEmployeeData();
    } catch (err) {
      toast.error(err.response?.data?.detail || t('employeeProfile.updateError'));
    }
  };

  const handleSaveEdit = async () => {
    try {
      await axios.put(`/api/employees/${employee.id}`, editData);
      setEmployee(editData);
      setIsEditing(false);
      toast.success(t('employeeProfile.profileUpdated'));
    } catch (error) {
      toast.error(t('employeeProfile.updateError'));
    }
  };

  const handleCreateObjective = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`/api/performance`, {
        employee_id: employee.id,
        period: objectiveForm.title,
        objectives: [{
          title: objectiveForm.title,
          description: objectiveForm.description,
          target_date: objectiveForm.target_date,
          progress: objectiveForm.progress
        }],
        rating: 0,
        comments: objectiveForm.description
      });
      toast.success(t('employeeProfile.objectiveCreated'));
      setObjectiveDialog(false);
      setObjectiveForm({ title: '', description: '', target_date: '', progress: 0 });
      fetchEmployeeData();
    } catch (error) {
      toast.error(t('employeeProfile.createError'));
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('fr-CD', {
      style: 'currency',
      currency: 'USD'
    }).format(amount || 0);
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex justify-center items-center h-96">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  if (!employee) {
    return (
      <DashboardLayout>
        <div className="text-center py-12">
          <p className="text-muted-foreground">{t('employeeProfile.notFound')}</p>
          <Button onClick={() => navigate(-1)} className="mt-4">
            <ArrowLeft className="mr-2 h-4 w-4" />
            {t('employeeProfile.back')}
          </Button>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6" data-testid="employee-profile-page">
        {/* Header with back button */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <h1 className="text-2xl font-bold">{t('employeeProfile.title')}</h1>
              {canModify && (
                <Button 
                  variant={isEditing ? "default" : "outline"} 
                  onClick={() => isEditing ? handleSaveEdit() : setIsEditing(true)}
                  data-testid="edit-profile-btn"
                >
                  {isEditing ? (
                    <>{t('employeeProfile.save')}</>
                  ) : (
                    <><Edit className="mr-2 h-4 w-4" />{t('employeeProfile.edit')}</>
                  )}
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Employee Header Card */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col md:flex-row gap-6">
              {/* Avatar with upload option */}
              <div className="relative">
                <Avatar className="h-24 w-24">
                  <AvatarImage src={employee.avatar_url ? (employee.avatar_url.startsWith('http') ? employee.avatar_url : `${axios.defaults.baseURL}${employee.avatar_url.startsWith('/api/') ? '' : '/api'}${employee.avatar_url}`) : null} />
                  <AvatarFallback className="bg-primary/10 text-primary text-2xl">
                    {employee.first_name?.[0]}{employee.last_name?.[0]}
                  </AvatarFallback>
                </Avatar>
                {(isOwnProfile || canModify) && (
                  <label className="absolute bottom-0 right-0 p-1.5 bg-primary text-white rounded-full cursor-pointer hover:bg-primary/90 transition-colors">
                    <input
                      type="file"
                      accept="image/jpeg,image/jpg,image/png,image/webp"
                      onChange={handleAvatarUpload}
                      className="hidden"
                    />
                    {uploading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Camera className="h-4 w-4" />
                    )}
                  </label>
                )}
              </div>
              
              <div className="flex-1 space-y-3">
                <div>
                  <h2 className="text-2xl font-bold">
                    {employee.first_name} {employee.last_name}
                  </h2>
                  <p className="text-lg text-muted-foreground">{employee.position}</p>
                </div>
                
                <div className="flex flex-wrap gap-4 text-sm">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Mail className="h-4 w-4" />
                    <span>{employee.email}</span>
                  </div>
                  {employee.phone && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Phone className="h-4 w-4" />
                      <span>{employee.phone}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Building2 className="h-4 w-4" />
                    <span className="capitalize">{employee.department?.replace('_', ' ')}</span>
                  </div>
                </div>
                
                <div className="flex gap-2">
                  <Badge variant="secondary">{employee.contract_type}</Badge>
                  <Badge variant="outline">{employee.country}</Badge>
                </div>
              </div>

              {/* Quick Stats */}
              <div className="grid grid-cols-2 gap-4 min-w-[200px]">
                <div className="text-center p-3 rounded-lg bg-muted">
                  <p className="text-2xl font-bold text-primary">{documents.length}</p>
                  <p className="text-xs text-muted-foreground">{t('employeeProfile.documents')}</p>
                </div>
                <div className="text-center p-3 rounded-lg bg-muted">
                  <p className="text-2xl font-bold text-secondary">{behaviors.length}</p>
                  <p className="text-xs text-muted-foreground">{t('employeeProfile.behaviorNotes')}</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Tabs - Simplified */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="w-full justify-start bg-muted/50 p-1 h-auto flex-wrap">
            <TabsTrigger value="travail" className="flex items-center gap-2">
              <Briefcase className="h-4 w-4" />
              {t('employeeProfile.tabs.info')}
            </TabsTrigger>
            <TabsTrigger value="documents" className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              {t('employeeProfile.tabs.documents')}
            </TabsTrigger>
            <TabsTrigger value="comportement" className="flex items-center gap-2">
              <UserCheck className="h-4 w-4" />
              {t('employeeProfile.tabs.behavior')}
            </TabsTrigger>
            <TabsTrigger value="conges" className="flex items-center gap-2">
              <CalendarDays className="h-4 w-4" />
              {t('employeeProfile.tabs.leaves')}
            </TabsTrigger>
          </TabsList>

          {/* TRAVAIL/INFO Tab */}
          <TabsContent value="travail" className="mt-6">
            <div className="grid gap-6 md:grid-cols-2">
              {/* IDENTITÉ Card */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">{t('employeeProfile.identity')}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="col-span-2">
                      <Label className="text-muted-foreground">{t('employeeProfile.fullName')}</Label>
                      <p className="font-medium text-lg">{employee.first_name} {employee.last_name}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">{t('employeeProfile.birthDate')}</Label>
                      {isEditing && canModify ? (
                        <Input
                          type="date"
                          value={editData.birth_date || ''}
                          onChange={(e) => setEditData({...editData, birth_date: e.target.value})}
                        />
                      ) : (
                        <p className="font-medium">
                          {employee.birth_date ? format(new Date(employee.birth_date), 'dd MMMM yyyy', { locale: fr }) : t('employeeProfile.notProvidedFemale')}
                        </p>
                      )}
                    </div>
                    <div>
                      <Label className="text-muted-foreground">{t('employeeProfile.hireDate')}</Label>
                      {isEditing && canModify ? (
                        <Input
                          type="date"
                          value={editData.hire_date || ''}
                          onChange={(e) => setEditData({...editData, hire_date: e.target.value})}
                        />
                      ) : (
                        <p className="font-medium">
                          {employee.hire_date ? format(new Date(employee.hire_date), 'dd MMMM yyyy', { locale: fr }) : t('employeeProfile.notProvidedFemale')}
                        </p>
                      )}
                    </div>
                    <div>
                      <Label className="text-muted-foreground">{t('employeeProfile.email')}</Label>
                      <p className="font-medium">{employee.email}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">{t('employeeProfile.phone')}</Label>
                      {isEditing && canModify ? (
                        <Input
                          value={editData.phone || ''}
                          onChange={(e) => setEditData({...editData, phone: e.target.value})}
                        />
                      ) : (
                        <p className="font-medium">{employee.phone || t('employeeProfile.notProvided')}</p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* TRAVAIL Card */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">{t('employeeProfile.work')}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-muted-foreground">{t('employeeProfile.company')}</Label>
                      <p className="font-medium">PREMIDIS sarl</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">{t('employeeProfile.department')}</Label>
                      {isEditing && canModify ? (
                        <Input
                          value={editData.department}
                          onChange={(e) => setEditData({...editData, department: e.target.value})}
                        />
                      ) : (
                        <p className="font-medium capitalize">{employee.department?.replace('_', ' ')}</p>
                      )}
                    </div>
                    <div>
                      <Label className="text-muted-foreground">{t('employeeProfile.position')}</Label>
                      {isEditing && canModify ? (
                        <Input
                          value={editData.position}
                          onChange={(e) => setEditData({...editData, position: e.target.value})}
                        />
                      ) : (
                        <p className="font-medium">{employee.position || t('employeeProfile.notDefined')}</p>
                      )}
                    </div>
                    <div>
                      <Label className="text-muted-foreground">{t('employeeProfile.hierarchyLevel')}</Label>
                      {isEditing && canModify ? (
                        <Input
                          value={editData.hierarchy_level || ''}
                          onChange={(e) => setEditData({...editData, hierarchy_level: e.target.value})}
                          placeholder={t('employeeProfile.hierarchyPlaceholder')}
                        />
                      ) : (
                        <p className="font-medium">{employee.hierarchy_level === 'chef_departement' || employee.is_manager ? t('employeeProfile.deptHead') : t('employeeProfile.simpleEmployee')}</p>
                      )}
                    </div>
                  </div>
                  
                  {/* Salary section - visible only to employee (own) or admin */}
                  {(isOwnProfile || isAdmin()) && (
                    <div className="mt-6 pt-6 border-t">
                      <div className="flex items-center justify-between">
                        <div>
                          <Label className="text-muted-foreground">{t('employeeProfile.salary')}</Label>
                          <p className="text-2xl font-bold text-primary">
                            {employee.salary 
                              ? `${employee.salary.toLocaleString()} ${employee.salary_currency || 'USD'}` 
                              : t('employeeProfile.notDefined')}
                          </p>
                        </div>
                        {isAdmin() && (
                          <Button variant="outline" size="sm" onClick={() => {
                            setSalaryDialog({ 
                              open: true, 
                              salary: employee.salary?.toString() || '', 
                              currency: employee.salary_currency || 'USD' 
                            });
                          }}>
                            <DollarSign className="h-4 w-4 mr-1" />
                            {t('employeeProfile.modifySalary')}
                          </Button>
                        )}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* SITE DE TRAVAIL Card */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">{t('employeeProfile.workSite')}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="col-span-2">
                      <Label className="text-muted-foreground">{t('employeeProfile.mainSite')}</Label>
                      <p className="font-medium flex items-center gap-2">
                        <Building2 className="h-4 w-4 text-primary" />
                        {employee.site_name || t('employeeProfile.notAssigned')}
                      </p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">{t('employeeProfile.hierarchicalGroup')}</Label>
                      <p className="font-medium">{employee.hierarchical_group_name || t('employeeProfile.notAssigned')}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">{t('employeeProfile.country')}</Label>
                      <p className="font-medium">{employee.country || 'RDC'}</p>
                    </div>
                  </div>
                  
                  {/* Ancienneté */}
                  {employee.hire_date && (
                    <div className="mt-4 pt-4 border-t">
                      <Label className="text-muted-foreground">{t('employeeProfile.seniority')}</Label>
                      <p className="font-medium text-lg text-primary">
                        {(() => {
                          const hireDate = new Date(employee.hire_date);
                          const now = new Date();
                          const years = now.getFullYear() - hireDate.getFullYear();
                          const months = now.getMonth() - hireDate.getMonth();
                          const totalMonths = years * 12 + months;
                          if (totalMonths < 12) {
                            return `${totalMonths} ${t('employeeProfile.months')}`;
                          } else {
                            const y = Math.floor(totalMonths / 12);
                            const m = totalMonths % 12;
                            return `${y} ${y > 1 ? t('employeeProfile.yearsPlural') : t('employeeProfile.years')}${m > 0 ? ` ${t('employeeProfile.and')} ${m} ${t('employeeProfile.months')}` : ''}`;
                          }
                        })()}
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Documents Tab */}
          <TabsContent value="documents" className="mt-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-lg">{t('employeeProfile.documentsTitle')}</CardTitle>
                  <CardDescription>{t('employeeProfile.documentsDesc')}</CardDescription>
                </div>
                {(isOwnProfile || canModify) && (
                  <label className="cursor-pointer">
                    <input
                      type="file"
                      accept=".pdf,image/jpeg,image/jpg,image/png"
                      onChange={handleDocumentUpload}
                      className="hidden"
                    />
                    <Button variant="outline" size="sm" asChild>
                      <span>
                        {uploading ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Upload className="mr-2 h-4 w-4" />
                        )}
                        {t('employeeProfile.addDocument')}
                      </span>
                    </Button>
                  </label>
                )}
              </CardHeader>
              <CardContent>
                {documents.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>{t('employeeProfile.noDocuments')}</p>
                    <p className="text-sm mt-2">{t('employeeProfile.acceptedFormats')}</p>
                  </div>
                ) : (
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {documents.map((doc) => {
                      // Construct the full URL for the document - handle both /uploads and /api/uploads
                      const docUrl = doc.url ? (doc.url.startsWith('http') ? doc.url : `${axios.defaults.baseURL}${doc.url.startsWith('/api/') ? '' : '/api'}${doc.url}`) : null;
                      const fileType = doc.type?.toLowerCase() || '';
                      const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'image'].includes(fileType);
                      const isPdf = fileType === 'pdf';
                      const canView = docUrl && (isImage || isPdf);
                      const canDownload = docUrl;
                      
                      return (
                        <div key={doc.id} className="rounded-lg border hover:shadow-md transition-all overflow-hidden bg-card">
                          {/* Preview area */}
                          {isImage && docUrl ? (
                            <div className="relative h-32 bg-muted">
                              <img 
                                src={docUrl} 
                                alt={doc.name}
                                className="w-full h-full object-cover"
                                onError={(e) => { 
                                  e.target.style.display = 'none';
                                  e.target.parentElement.classList.add('flex', 'items-center', 'justify-center');
                                  const icon = document.createElement('div');
                                  icon.innerHTML = '<svg class="h-12 w-12 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>';
                                  e.target.parentElement.appendChild(icon);
                                }}
                              />
                            </div>
                          ) : isPdf ? (
                            <div className="h-32 bg-gradient-to-br from-red-50 to-red-100 dark:from-red-900/20 dark:to-red-800/20 flex items-center justify-center">
                              <FileText className="h-12 w-12 text-red-500" />
                            </div>
                          ) : (
                            <div className="h-32 bg-muted flex items-center justify-center">
                              <FileText className="h-12 w-12 text-muted-foreground" />
                            </div>
                          )}
                          
                          {/* Document info */}
                          <div className="p-3">
                            {/* Document name - editable */}
                            {editingDocName === doc.id ? (
                              <div className="flex items-center gap-1 mb-2">
                                <Input
                                  value={newDocName}
                                  onChange={(e) => setNewDocName(e.target.value)}
                                  className="h-7 text-sm"
                                  autoFocus
                                />
                                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleRenameDocument(doc.id)}>
                                  <Check className="h-3 w-3 text-green-500" />
                                </Button>
                                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setEditingDocName(null); setNewDocName(''); }}>
                                  <X className="h-3 w-3 text-red-500" />
                                </Button>
                              </div>
                            ) : (
                              <div className="flex items-center justify-between mb-1">
                                <p className="font-medium text-sm truncate flex-1" title={doc.name}>{doc.name}</p>
                                {(isOwnProfile || canModify) && (
                                  <Button 
                                    size="icon" 
                                    variant="ghost" 
                                    className="h-6 w-6 ml-1"
                                    onClick={() => { setEditingDocName(doc.id); setNewDocName(doc.name); }}
                                  >
                                    <Pencil className="h-3 w-3" />
                                  </Button>
                                )}
                              </div>
                            )}
                            <p className="text-xs text-muted-foreground uppercase mb-3">{doc.type || t('employeeProfile.file')}</p>
                            
                            {/* Action buttons */}
                            <div className="flex gap-1 flex-wrap">
                              {/* View button */}
                              {canView && (
                                <Button 
                                  size="sm" 
                                  variant="outline" 
                                  className="flex-1"
                                  onClick={() => setViewingDoc({ ...doc, url: docUrl, isImage, isPdf })}
                                >
                                  <Eye className="h-4 w-4 mr-1" />
                                  {t('employeeProfile.view')}
                                </Button>
                              )}
                              
                              {/* Download button */}
                              {canDownload && (
                                <a href={docUrl} download={doc.name || 'document'}>
                                  <Button size="sm" variant="outline">
                                    <Download className="h-4 w-4" />
                                  </Button>
                                </a>
                              )}
                              
                              {/* Delete button */}
                              {(isOwnProfile || canModify) && (
                                <Button 
                                  size="sm" 
                                  variant="outline"
                                  className="text-destructive hover:text-destructive"
                                  onClick={() => handleDeleteDocument(doc.id)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Comportement Tab - MIROIR DU MODULE GLOBAL (Mode Lecture Seule) */}
          <TabsContent value="comportement" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <UserCheck className="h-5 w-5" />
                  {t('employeeProfile.behaviorTitle')}
                </CardTitle>
                <CardDescription>
                  {t('employeeProfile.behaviorDesc')}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {behaviors.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <UserCheck className="h-16 w-16 mx-auto mb-4 opacity-30" />
                    <p className="text-lg font-medium mb-2">{t('employeeProfile.noBehaviorNotes')}</p>
                    <p className="text-sm">{t('employeeProfile.emptyBehaviorFile')}</p>
                  </div>
                ) : (
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {behaviors.map((behavior) => (
                      <BehaviorCard
                        key={behavior.id}
                        behavior={behavior}
                        showEmployeeName={false}
                        canDelete={false}
                        onDelete={null}
                      />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Congés Tab - SIMPLIFIÉ : Calendrier + Historique uniquement */}
          <TabsContent value="conges" className="mt-6">
            {/* Mini Calendrier des congés */}
            <Card className="mb-6">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <CalendarDays className="h-5 w-5 text-primary" />
                  {t('employeeProfile.leavesCalendar')}
                </CardTitle>
                <CardDescription>{t('employeeProfile.leavesCalendarDesc')}</CardDescription>
              </CardHeader>
              <CardContent>
                {leaves.filter(l => l.status === 'approved').length === 0 ? (
                  <p className="text-muted-foreground text-sm text-center py-4">{t('employeeProfile.noApprovedLeaves')}</p>
                ) : (
                  <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
                    {leaves
                      .filter(l => l.status === 'approved')
                      .sort((a, b) => new Date(a.start_date) - new Date(b.start_date))
                      .map((leave) => {
                        const typeLabels = {
                          annual: t('employeeProfile.leaveTypes.annual'),
                          sick: t('employeeProfile.leaveTypes.sick'),
                          exceptional: t('employeeProfile.leaveTypes.exceptional'),
                          maternity: t('employeeProfile.leaveTypes.maternity'),
                          paternity: t('employeeProfile.leaveTypes.paternity'),
                          public: t('employeeProfile.leaveTypes.public'),
                          collective: t('employeeProfile.leaveTypes.collective'),
                          permanent: t('employeeProfile.leaveTypes.permanent')
                        };
                        const isPast = new Date(leave.end_date) < new Date();
                        const isOngoing = new Date(leave.start_date) <= new Date() && new Date(leave.end_date) >= new Date();
                        
                        return (
                          <div 
                            key={leave.id} 
                            className={`p-3 rounded-lg border ${
                              isOngoing ? 'border-green-300 bg-green-50 dark:bg-green-900/20' :
                              isPast ? 'border-gray-200 bg-gray-50 dark:bg-gray-900/20 opacity-60' :
                              'border-blue-200 bg-blue-50 dark:bg-blue-900/20'
                            }`}
                          >
                            <div className="flex items-center gap-2 mb-1">
                              <CalendarCheck className={`h-4 w-4 ${
                                isOngoing ? 'text-green-500' :
                                isPast ? 'text-gray-400' : 'text-blue-500'
                              }`} />
                              <span className="font-medium text-sm">{typeLabels[leave.leave_type] || leave.leave_type}</span>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {format(new Date(leave.start_date), 'dd MMM', { locale: fr })} → {format(new Date(leave.end_date), 'dd MMM yyyy', { locale: fr })}
                            </p>
                            {isOngoing && (
                              <Badge variant="outline" className="mt-2 text-xs border-green-400 text-green-600">
                                {t('employeeProfile.ongoing')}
                              </Badge>
                            )}
                          </div>
                        );
                      })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Historique complet */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <History className="h-5 w-5" />
                  {t('employeeProfile.leavesHistory')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {leaves.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <CalendarDays className="h-10 w-10 mx-auto mb-3 opacity-50" />
                    <p>{t('employeeProfile.noLeaveRequest')}</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {leaves.sort((a, b) => new Date(b.start_date) - new Date(a.start_date)).map((leave) => {
                      const statusConfig = {
                        approved: { label: t('employeeProfile.leaveStatus.approved'), color: 'text-green-600 bg-green-100 dark:bg-green-900/30' },
                        pending: { label: t('employeeProfile.leaveStatus.pending'), color: 'text-yellow-600 bg-yellow-100 dark:bg-yellow-900/30' },
                        rejected: { label: t('employeeProfile.leaveStatus.rejected'), color: 'text-red-600 bg-red-100 dark:bg-red-900/30' }
                      };
                      const config = statusConfig[leave.status] || statusConfig.pending;
                      const typeLabels = {
                        annual: t('employeeProfile.leaveTypesShort.annual'),
                        sick: t('employeeProfile.leaveTypesShort.sick'),
                        exceptional: t('employeeProfile.leaveTypesShort.exceptional'),
                        maternity: t('employeeProfile.leaveTypesShort.maternity'),
                        paternity: t('employeeProfile.leaveTypesShort.paternity'),
                        public: t('employeeProfile.leaveTypesShort.public'),
                        collective: t('employeeProfile.leaveTypesShort.collective'),
                        permanent: t('employeeProfile.leaveTypesShort.permanent')
                      };
                      
                      return (
                        <div key={leave.id} className="flex items-center justify-between p-3 rounded border hover:bg-muted/50">
                          <div className="flex items-center gap-3">
                            <Badge variant="outline" className="text-xs">{typeLabels[leave.leave_type] || leave.leave_type}</Badge>
                            <span className="text-sm">
                              {format(new Date(leave.start_date), 'dd/MM/yyyy', { locale: fr })} - {format(new Date(leave.end_date), 'dd/MM/yyyy', { locale: fr })}
                            </span>
                            <span className="text-xs text-muted-foreground">({leave.working_days}j)</span>
                          </div>
                          <Badge className={config.color}>{config.label}</Badge>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

        </Tabs>

        {/* Document Viewer Modal */}
        <Dialog open={!!viewingDoc} onOpenChange={() => setViewingDoc(null)}>
          <DialogContent className="max-w-4xl max-h-[90vh]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                {viewingDoc?.name}
              </DialogTitle>
            </DialogHeader>
            <div className="overflow-auto max-h-[70vh]">
              {viewingDoc?.isImage && (
                <img 
                  src={viewingDoc.url} 
                  alt={viewingDoc.name}
                  className="w-full h-auto rounded-lg"
                />
              )}
              {viewingDoc?.isPdf && (
                <iframe
                  src={viewingDoc.url}
                  className="w-full h-[65vh] rounded-lg border"
                  title={viewingDoc.name}
                />
              )}
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <a href={viewingDoc?.url} download={viewingDoc?.name}>
                <Button variant="outline">
                  <Download className="h-4 w-4 mr-2" />
                  {t('employeeProfile.download')}
                </Button>
              </a>
              <a href={viewingDoc?.url} target="_blank" rel="noopener noreferrer">
                <Button variant="outline">
                  {t('employeeProfile.openNewTab')}
                </Button>
              </a>
              <Button onClick={() => setViewingDoc(null)}>{t('employeeProfile.close')}</Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Delete Document Confirmation Dialog */}
        <Dialog open={deleteDocDialog.open} onOpenChange={(open) => !open && setDeleteDocDialog({ open: false, docId: null })}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-destructive">
                <Trash2 className="h-5 w-5" />
                {t('employeeProfile.deleteConfirmTitle')}
              </DialogTitle>
            </DialogHeader>
            <div className="py-4">
              <p className="text-muted-foreground">
                {t('employeeProfile.deleteConfirmMessage')}
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDeleteDocDialog({ open: false, docId: null })}>
                {t('employeeProfile.cancel')}
              </Button>
              <Button variant="destructive" onClick={confirmDeleteDocument}>
                <Trash2 className="h-4 w-4 mr-2" />
                {t('employeeProfile.delete')}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Salary Modification Dialog */}
        <Dialog open={salaryDialog.open} onOpenChange={(open) => !open && setSalaryDialog({ open: false, salary: '', currency: 'USD' })}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <DollarSign className="h-5 w-5 text-primary" />
                {t('employeeProfile.modifySalary')}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="salary">{t('employeeProfile.newSalary')}</Label>
                <Input
                  id="salary"
                  type="number"
                  placeholder={t('employeeProfile.salaryPlaceholder')}
                  value={salaryDialog.salary}
                  onChange={(e) => setSalaryDialog(prev => ({ ...prev, salary: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="currency">{t('employeeProfile.currency')}</Label>
                <Select 
                  value={salaryDialog.currency} 
                  onValueChange={(value) => setSalaryDialog(prev => ({ ...prev, currency: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t('employeeProfile.selectCurrency')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="USD">{t('employeeProfile.usd')}</SelectItem>
                    <SelectItem value="FC">{t('employeeProfile.fc')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setSalaryDialog({ open: false, salary: '', currency: 'USD' })}>
                {t('employeeProfile.cancel')}
              </Button>
              <Button onClick={handleUpdateSalary}>
                <Check className="h-4 w-4 mr-2" />
                {t('employeeProfile.save')}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
};

export default EmployeeProfile;
