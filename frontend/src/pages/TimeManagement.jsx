import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import DashboardLayout from '../components/layout/DashboardLayout';
import { getErrorMessage } from '../utils/errorHandler';
import { exportToCSV } from '../utils/csvExport';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Badge } from '../components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from '../components/ui/dialog';
import { Calendar } from '../components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '../components/ui/popover';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { ScrollArea } from '../components/ui/scroll-area';
import { 
  Calendar as CalendarIcon, Plus, Clock, CheckCircle, XCircle, AlertCircle, 
  Loader2, ChevronLeft, ChevronRight, LogIn, LogOut, Download,
  Users, FileText, Settings, Save, Edit, Trash2, Calculator
} from 'lucide-react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, isWithinInterval, parseISO, addMonths, subMonths, addDays, addWeeks } from 'date-fns';
import { fr } from 'date-fns/locale';
import axios from '../config/api';
import { toast } from 'sonner';

const TimeManagement = () => {
  const { user, isAdmin, canEdit } = useAuth();
  const { t } = useLanguage();
  const [searchParams] = useSearchParams();
  
  // Get tab from URL params or default to 'calendar'
  const tabFromUrl = searchParams.get('tab');
  const [activeTab, setActiveTab] = useState(tabFromUrl || 'calendar');
  
  // Update tab when URL changes
  useEffect(() => {
    if (tabFromUrl && ['calendar', 'leaves', 'attendance'].includes(tabFromUrl)) {
      setActiveTab(tabFromUrl);
    }
  }, [tabFromUrl]);
  
  const [leaves, setLeaves] = useState([]);
  const [calendarLeaves, setCalendarLeaves] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [todayAttendance, setTodayAttendance] = useState(null);
  const [stats, setStats] = useState({ pending: 0, approved: 0, rejected: 0 });
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [attendanceDialogOpen, setAttendanceDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  
  // Delete leave confirmation dialog
  const [deleteLeaveDialog, setDeleteLeaveDialog] = useState({ open: false, leaveId: null });
  
  // Leave configuration state
  const [adjustDialogOpen, setAdjustDialogOpen] = useState(false);
  const [leaveTypesConfig, setLeaveTypesConfig] = useState([]);
  const [editingLeaveType, setEditingLeaveType] = useState(null);
  const [savingConfig, setSavingConfig] = useState(false);
  
  const [formData, setFormData] = useState({
    leave_type: 'annual',
    start_date: null,
    end_date: null,
    reason: '',
    employee_id: '',
    for_all_employees: false,
    auto_calculated: false
  });

  const [employees, setEmployees] = useState([]);

  const [attendanceForm, setAttendanceForm] = useState({
    employee_id: '',
    date: format(new Date(), 'yyyy-MM-dd'),
    check_in: '',
    check_out: '',
    notes: ''
  });
  
  const [statusFilter, setStatusFilter] = useState(null);
  const [leaveRules, setLeaveRules] = useState(null);
  const [leaveBalance, setLeaveBalance] = useState({});
  
  // Document generation state
  const [generateDocDialogOpen, setGenerateDocDialogOpen] = useState(false);
  const [selectedLeaveId, setSelectedLeaveId] = useState(null);
  const [documentTemplates, setDocumentTemplates] = useState([]);
  const [generatingDocument, setGeneratingDocument] = useState(false);

  // Default leave types (fallback)
  const defaultLeaveTypes = [
    { value: 'annual', label: 'Congé annuel', color: 'bg-blue-500' },
    { value: 'sick', label: 'Congé maladie', color: 'bg-red-500' },
    { value: 'maternity', label: 'Congé maternité', color: 'bg-pink-500' },
    { value: 'paternity', label: 'Congé paternité', color: 'bg-cyan-500' },
    { value: 'exceptional', label: 'Congé exceptionnel', color: 'bg-orange-500' },
    { value: 'collective', label: 'Congé collectif (tous)', color: 'bg-green-500' },
    { value: 'permanent', label: 'Congé permanent/récurrent', color: 'bg-purple-500' }
  ];

  // Computed leave types from config or defaults
  const leaveTypes = leaveTypesConfig.length > 0 
    ? leaveTypesConfig.map(lt => ({
        value: lt.code,
        label: lt.name,
        color: `bg-[${lt.color}]`,
        duration_value: lt.duration_value,
        duration_unit: lt.duration_unit
      }))
    : defaultLeaveTypes;

  useEffect(() => {
    fetchData();
    fetchLeaveTypesConfig();
  }, [currentMonth]);

  const fetchLeaveTypesConfig = async () => {
    try {
      const response = await axios.get(`/api/config/leave-types`);
      setLeaveTypesConfig(response.data.leave_types || []);
    } catch (error) {
      console.error('Error fetching leave types:', error);
    }
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch leaves
      const leavesRes = await axios.get(`/api/leaves`);
      setLeaves(leavesRes.data.leaves || []);

      // Fetch calendar leaves
      const calendarRes = await axios.get(`/api/leaves/calendar`, {
        params: { 
          month: currentMonth.getMonth() + 1, 
          year: currentMonth.getFullYear() 
        }
      });
      setCalendarLeaves(calendarRes.data.leaves || []);

      // Fetch stats
      const statsRes = await axios.get(`/api/leaves/stats`);
      setStats(statsRes.data);

      // Fetch leave rules
      try {
        const rulesRes = await axios.get(`/api/leaves/rules`);
        setLeaveRules(rulesRes.data);
      } catch (error) {
        console.error('Error fetching leave rules:', error);
      }

      // Fetch leave balance
      try {
        const balanceRes = await axios.get(`/api/leaves/balance`);
        setLeaveBalance(balanceRes.data);
      } catch (error) {
        console.error('Error fetching leave balance:', error);
      }

      // Fetch employees for admin/secretary
      if (isAdmin() || canEdit()) {
        try {
          const empRes = await axios.get(`/api/employees`);
          setEmployees(empRes.data.employees || []);
        } catch (error) {
          console.error('Error fetching employees:', error);
        }
      }

      // Fetch attendance
      const attRes = await axios.get(`/api/attendance`);
      setAttendance(attRes.data.attendance || []);
      setTodayAttendance(attRes.data.today || null);

    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Calculate end date automatically based on leave type
  const calculateEndDate = async (leaveType, startDate) => {
    if (!startDate || !leaveType) return;
    
    const config = leaveTypesConfig.find(lt => lt.code === leaveType);
    if (!config) return;
    
    try {
      const response = await axios.post(`/api/config/calculate-leave-end-date`, null, {
        params: {
          leave_type_code: leaveType,
          start_date: format(startDate, 'yyyy-MM-dd')
        }
      });
      
      const endDate = parseISO(response.data.end_date);
      setFormData(prev => ({
        ...prev,
        end_date: endDate,
        auto_calculated: true
      }));
      // Calcul silencieux - pas de toast
    } catch (error) {
      console.error('Error calculating end date:', error);
    }
  };

  // Handle leave type change - auto calculate if start date is set
  const handleLeaveTypeChange = async (value) => {
    setFormData(prev => ({ ...prev, leave_type: value }));
    
    if (formData.start_date) {
      await calculateEndDate(value, formData.start_date);
    }
  };

  // Handle start date change - auto calculate end date
  const handleStartDateChange = async (date) => {
    setFormData(prev => ({ ...prev, start_date: date, auto_calculated: false }));
    
    if (date && formData.leave_type) {
      await calculateEndDate(formData.leave_type, date);
    }
  };

  // Save leave type configuration
  const handleSaveLeaveType = async (leaveType) => {
    setSavingConfig(true);
    try {
      if (leaveType.id) {
        await axios.put(`/api/config/leave-types/${leaveType.id}`, leaveType);
        toast.success('Type de congé mis à jour');
      } else {
        await axios.post(`/api/config/leave-types`, leaveType);
        toast.success('Type de congé créé');
      }
      await fetchLeaveTypesConfig();
      setEditingLeaveType(null);
    } catch (error) {
      toast.error(getErrorMessage(error, 'Erreur lors de la sauvegarde'));
    } finally {
      setSavingConfig(false);
    }
  };

  const handleSubmitLeave = async (e) => {
    e.preventDefault();
    if (!formData.start_date || !formData.end_date) {
      toast.error('Veuillez sélectionner les dates');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        leave_type: formData.leave_type,
        start_date: format(formData.start_date, 'yyyy-MM-dd'),
        end_date: format(formData.end_date, 'yyyy-MM-dd'),
        reason: formData.reason,
        employee_id: formData.employee_id || null,
        for_all_employees: formData.for_all_employees
      };
      
      const response = await axios.post(`/api/leaves`, payload);
      
      if (response.data.count) {
        toast.success(`Jour férié créé pour ${response.data.count} employés`);
      } else {
        toast.success('Demande de congé soumise');
      }
      setDialogOpen(false);
      setFormData({ 
        leave_type: 'annual', 
        start_date: null, 
        end_date: null, 
        reason: '',
        employee_id: '',
        for_all_employees: false,
        auto_calculated: false
      });
      fetchData();
    } catch (error) {
      toast.error(getErrorMessage(error, 'Erreur'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleStatusUpdate = async (leaveId, status) => {
    try {
      await axios.put(`/api/leaves/${leaveId}`, { status });
      toast.success(`Demande ${status === 'approved' ? 'approuvée' : 'rejetée'}`);
      fetchData();
    } catch (error) {
      toast.error('Erreur lors de la mise à jour');
    }
  };

  // Delete a leave - opens confirmation dialog
  const handleDeleteLeave = (leaveId) => {
    setDeleteLeaveDialog({ open: true, leaveId });
  };
  
  // Confirm leave deletion
  const confirmDeleteLeave = async () => {
    const leaveId = deleteLeaveDialog.leaveId;
    setDeleteLeaveDialog({ open: false, leaveId: null });
    
    try {
      await axios.delete(`/api/leaves/${leaveId}`);
      toast.success('Congé supprimé');
      fetchData();
    } catch (error) {
      toast.error(getErrorMessage(error, 'Erreur lors de la suppression'));
    }
  };

  // Check for informational alerts (non-blocking)
  const getInfoAlerts = (date) => {
    const alerts = [];
    
    // Check if it's a Sunday
    if (date && date.getDay() === 0) {
      alerts.push({ type: 'info', message: 'Ce jour est un dimanche' });
    }
    
    // Check if more than 50% of company is on leave that day (simplified check)
    if (date && employees.length > 0) {
      const dateStr = format(date, 'yyyy-MM-dd');
      const leavesOnDate = calendarLeaves.filter(l => {
        const start = parseISO(l.start_date);
        const end = parseISO(l.end_date);
        const checkDate = parseISO(dateStr);
        return isWithinInterval(checkDate, { start, end });
      });
      
      if (leavesOnDate.length >= employees.length / 2) {
        alerts.push({ type: 'warning', message: `Plus de 50% des employés sont en congé ce jour (${leavesOnDate.length}/${employees.length})` });
      }
    }
    
    return alerts;
  };

  const handleCheckIn = async () => {
    try {
      await axios.post(`/api/attendance/check-in`);
      toast.success('Pointage d\'entrée enregistré');
      fetchData();
    } catch (error) {
      toast.error(getErrorMessage(error, 'Erreur'));
    }
  };

  const handleCheckOut = async () => {
    try {
      await axios.post(`/api/attendance/check-out`);
      toast.success('Pointage de sortie enregistré');
      fetchData();
    } catch (error) {
      toast.error(getErrorMessage(error, 'Erreur'));
    }
  };

  const handleCreateAttendance = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await axios.post(`/api/attendance`, attendanceForm);
      toast.success('Pointage enregistré');
      setAttendanceDialogOpen(false);
      setAttendanceForm({ employee_id: '', date: format(new Date(), 'yyyy-MM-dd'), check_in: '', check_out: '', notes: '' });
      fetchData();
    } catch (error) {
      toast.error(getErrorMessage(error, 'Erreur'));
    } finally {
      setSubmitting(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleExport = () => {
    const data = activeTab === 'attendance' ? attendance : leaves;
    const headers = Object.keys(data[0] || {});
    const success = exportToCSV(
      data,
      headers,
      (row) => Object.values(row),
      `${activeTab}_${format(new Date(), 'yyyy-MM-dd')}`
    );
    if (success) {
      toast.success('Export réussi');
    } else {
      toast.error('Erreur lors de l\'export');
    }
  };

  const handleGenerateDocument = async (leaveId) => {
    setSelectedLeaveId(leaveId);
    setGeneratingDocument(true);
    
    try {
      // Récupérer les formes de documents (pas les templates)
      const response = await axios.get(`/api/documents/forms`);
      // Filtrer pour obtenir uniquement "Communication d'Absences"
      const allForms = response.data.forms || [];
      const leaveForms = allForms.filter(form => 
        form.name && form.name.toLowerCase().includes('absence')
      );
      setDocumentTemplates(leaveForms);
      setGenerateDocDialogOpen(true);
    } catch (error) {
      toast.error('Erreur lors du chargement des modèles');
      console.error(error);
    } finally {
      setGeneratingDocument(false);
    }
  };

  const handleConfirmGenerateDocument = async (templateId) => {
    setGeneratingDocument(true);
    
    try {
      const response = await axios.post(
        `/api/leaves/${selectedLeaveId}/generate-document`,
        null,
        { params: { template_id: templateId } }
      );
      
      toast.success('✅ Document généré avec succès');
      setGenerateDocDialogOpen(false);
      
      // Naviguer vers le module Documents ou afficher le document
      const documentId = response.data.document?.id;
      if (documentId) {
        toast.info('📄 Document disponible dans le module Documents', {
          duration: 5000
        });
      }
    } catch (error) {
      toast.error(getErrorMessage(error, 'Erreur lors de la génération du document'));
      console.error(error);
    } finally {
      setGeneratingDocument(false);
    }
  };

  const getStatusBadge = (status) => {
    const styles = {
      pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
      approved: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
      rejected: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
    };
    const icons = { pending: AlertCircle, approved: CheckCircle, rejected: XCircle };
    const Icon = icons[status];
    
    return (
      <Badge className={`${styles[status]} flex items-center gap-1`}>
        <Icon className="h-3 w-3" />
        {t(status)}
      </Badge>
    );
  };

  // Calendar helpers
  const daysInMonth = eachDayOfInterval({
    start: startOfMonth(currentMonth),
    end: endOfMonth(currentMonth)
  });

  const getLeavesForDay = (day) => {
    return calendarLeaves.filter(leave => {
      try {
        const start = parseISO(leave.start_date);
        const end = parseISO(leave.end_date);
        return isWithinInterval(day, { start, end }) || isSameDay(day, start) || isSameDay(day, end);
      } catch {
        return false;
      }
    });
  };

  const getLeaveColor = (leaveType) => {
    const type = leaveTypes.find(t => t.value === leaveType);
    return type?.color || 'bg-primary';
  };

  const getLeaveBorderColor = (leaveType) => {
    const type = leaveTypes.find(t => t.value === leaveType);
    const bgColor = type?.color || 'bg-primary';
    
    // Convertir bg-* en border-*
    // Ex: bg-blue-500 -> border-blue-500
    return bgColor.replace('bg-', 'border-');
  };

  return (
    <DashboardLayout>
      <div className="space-y-6" data-testid="time-management-page">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{t('timeManagement')}</h1>
            <p className="text-muted-foreground">Congés, présences et pointage</p>
          </div>
          
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleExport} data-testid="export-btn">
              <Download className="mr-2 h-4 w-4" />
              Exporter
            </Button>
            {isAdmin() && (
              <Dialog open={adjustDialogOpen} onOpenChange={setAdjustDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" data-testid="adjust-leaves-btn">
                    <Settings className="mr-2 h-4 w-4" />
                    Ajuster les congés
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[700px] max-h-[90vh]">
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                      <Settings className="h-5 w-5" />
                      Configuration des types de congés
                    </DialogTitle>
                    <DialogDescription>
                      Définissez la durée officielle de chaque type de congé. Cette durée sera utilisée pour calculer automatiquement la date de fin.
                    </DialogDescription>
                  </DialogHeader>
                  
                  <ScrollArea className="max-h-[60vh] pr-4">
                    <div className="space-y-4">
                      {/* Leave Types Configuration */}
                      {leaveTypesConfig.map((leaveType) => (
                        <div 
                          key={leaveType.id || leaveType.code} 
                          className="p-4 border rounded-lg bg-card hover:bg-muted/50 transition-colors"
                        >
                          {editingLeaveType?.id === leaveType.id ? (
                            // Edit Mode
                            <div className="space-y-4">
                              <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                  <Label>Nom du congé</Label>
                                  <Input
                                    value={editingLeaveType.name}
                                    onChange={(e) => setEditingLeaveType({...editingLeaveType, name: e.target.value})}
                                  />
                                </div>
                                <div className="space-y-2">
                                  <Label>Code</Label>
                                  <Input
                                    value={editingLeaveType.code}
                                    disabled
                                    className="bg-muted"
                                  />
                                </div>
                              </div>
                              
                              <div className="grid grid-cols-3 gap-4">
                                <div className="space-y-2">
                                  <Label>Durée officielle</Label>
                                  <Input
                                    type="number"
                                    min="1"
                                    value={editingLeaveType.duration_value}
                                    onChange={(e) => setEditingLeaveType({...editingLeaveType, duration_value: parseInt(e.target.value) || 1})}
                                  />
                                </div>
                                <div className="space-y-2">
                                  <Label>Unité de temps</Label>
                                  <Select
                                    value={editingLeaveType.duration_unit}
                                    onValueChange={(value) => setEditingLeaveType({...editingLeaveType, duration_unit: value})}
                                  >
                                    <SelectTrigger>
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="days">Jours</SelectItem>
                                      <SelectItem value="weeks">Semaines</SelectItem>
                                      <SelectItem value="months">Mois</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div className="space-y-2">
                                  <Label>Solde par défaut</Label>
                                  <Input
                                    type="number"
                                    min="0"
                                    value={editingLeaveType.default_balance}
                                    onChange={(e) => setEditingLeaveType({...editingLeaveType, default_balance: parseInt(e.target.value) || 0})}
                                  />
                                </div>
                              </div>
                              
                              <div className="flex justify-end gap-2">
                                <Button variant="outline" onClick={() => setEditingLeaveType(null)}>
                                  Annuler
                                </Button>
                                <Button onClick={() => handleSaveLeaveType(editingLeaveType)} disabled={savingConfig}>
                                  {savingConfig ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                                  Enregistrer
                                </Button>
                              </div>
                            </div>
                          ) : (
                            // View Mode
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <div 
                                  className="w-4 h-4 rounded-full" 
                                  style={{ backgroundColor: leaveType.color }}
                                />
                                <div>
                                  <h4 className="font-medium">{leaveType.name}</h4>
                                  <p className="text-sm text-muted-foreground">
                                    Durée: <strong>{leaveType.duration_value}</strong> {
                                      leaveType.duration_unit === 'days' ? 'jour(s)' :
                                      leaveType.duration_unit === 'weeks' ? 'semaine(s)' :
                                      leaveType.duration_unit === 'months' ? 'mois' : leaveType.duration_unit
                                    }
                                    {' • '}Solde: <strong>{leaveType.default_balance}</strong> jours
                                  </p>
                                </div>
                              </div>
                              <Button 
                                variant="ghost" 
                                size="sm"
                                onClick={() => setEditingLeaveType({...leaveType})}
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                            </div>
                          )}
                        </div>
                      ))}
                      
                      {leaveTypesConfig.length === 0 && (
                        <div className="text-center py-8 text-muted-foreground">
                          <Settings className="h-12 w-12 mx-auto mb-4 opacity-30" />
                          <p>Chargement des types de congés...</p>
                        </div>
                      )}
                      
                      {/* Add New Leave Type Button */}
                      {!editingLeaveType && (
                        <Button 
                          variant="outline" 
                          className="w-full border-dashed"
                          onClick={() => setEditingLeaveType({
                            id: null,
                            name: '',
                            code: '',
                            duration_value: 1,
                            duration_unit: 'days',
                            default_balance: 0,
                            requires_approval: true,
                            is_active: true,
                            color: '#4F46E5'
                          })}
                        >
                          <Plus className="mr-2 h-4 w-4" />
                          Créer un nouveau type de congé
                        </Button>
                      )}
                      
                      {/* New Leave Type Form */}
                      {editingLeaveType && !editingLeaveType.id && (
                        <div className="p-4 border-2 border-dashed border-primary/50 rounded-lg bg-primary/5">
                          <h4 className="font-medium mb-4 flex items-center gap-2">
                            <Plus className="h-4 w-4" />
                            Nouveau type de congé
                          </h4>
                          <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                              <div className="space-y-2">
                                <Label>Nom du congé *</Label>
                                <Input
                                  value={editingLeaveType.name}
                                  onChange={(e) => setEditingLeaveType({...editingLeaveType, name: e.target.value})}
                                  placeholder="Ex: Congé parental"
                                />
                              </div>
                              <div className="space-y-2">
                                <Label>Code unique *</Label>
                                <Input
                                  value={editingLeaveType.code}
                                  onChange={(e) => setEditingLeaveType({...editingLeaveType, code: e.target.value.toLowerCase().replace(/\s+/g, '_')})}
                                  placeholder="Ex: parental"
                                />
                              </div>
                            </div>
                            
                            <div className="grid grid-cols-3 gap-4">
                              <div className="space-y-2">
                                <Label>Durée officielle *</Label>
                                <Input
                                  type="number"
                                  min="1"
                                  value={editingLeaveType.duration_value}
                                  onChange={(e) => setEditingLeaveType({...editingLeaveType, duration_value: parseInt(e.target.value) || 1})}
                                />
                              </div>
                              <div className="space-y-2">
                                <Label>Unité *</Label>
                                <Select
                                  value={editingLeaveType.duration_unit}
                                  onValueChange={(value) => setEditingLeaveType({...editingLeaveType, duration_unit: value})}
                                >
                                  <SelectTrigger>
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="days">Jours</SelectItem>
                                    <SelectItem value="weeks">Semaines</SelectItem>
                                    <SelectItem value="months">Mois</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="space-y-2">
                                <Label>Solde par défaut</Label>
                                <Input
                                  type="number"
                                  min="0"
                                  value={editingLeaveType.default_balance}
                                  onChange={(e) => setEditingLeaveType({...editingLeaveType, default_balance: parseInt(e.target.value) || 0})}
                                />
                              </div>
                            </div>
                            
                            <div className="space-y-2">
                              <Label>Couleur</Label>
                              <div className="flex gap-2">
                                {['#4F46E5', '#EF4444', '#EC4899', '#3B82F6', '#F59E0B', '#10B981', '#8B5CF6', '#06B6D4'].map(color => (
                                  <button
                                    key={color}
                                    type="button"
                                    className={`w-8 h-8 rounded-full border-2 ${editingLeaveType.color === color ? 'border-foreground' : 'border-transparent'}`}
                                    style={{ backgroundColor: color }}
                                    onClick={() => setEditingLeaveType({...editingLeaveType, color})}
                                  />
                                ))}
                              </div>
                            </div>
                            
                            <div className="flex justify-end gap-2">
                              <Button variant="outline" onClick={() => setEditingLeaveType(null)}>
                                Annuler
                              </Button>
                              <Button 
                                onClick={() => handleSaveLeaveType(editingLeaveType)} 
                                disabled={savingConfig || !editingLeaveType.name || !editingLeaveType.code}
                              >
                                {savingConfig ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                                Créer le type de congé
                              </Button>
                            </div>
                          </div>
                        </div>
                      )}
                      
                      {/* Example Calculation */}
                      <div className="mt-6 p-4 bg-primary/5 rounded-lg border border-primary/20">
                        <h4 className="font-medium flex items-center gap-2 mb-2">
                          <Calculator className="h-4 w-4" />
                          Exemple de calcul automatique
                        </h4>
                        <p className="text-sm text-muted-foreground">
                          Si vous sélectionnez <strong>Congé maternité</strong> (3 mois) et la date de début <strong>01 mars 2026</strong>, 
                          le système calculera automatiquement:
                        </p>
                        <ul className="text-sm mt-2 space-y-1">
                          <li>→ Date de fin: <strong>31 mai 2026</strong></li>
                          <li>→ Durée totale: <strong>3 mois</strong></li>
                        </ul>
                      </div>
                    </div>
                  </ScrollArea>
                </DialogContent>
              </Dialog>
            )}
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button data-testid="request-leave-btn">
                  <Plus className="mr-2 h-4 w-4" />
                  Demander un congé
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                  <DialogTitle>Nouvelle demande de congé</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmitLeave} className="space-y-4">
                  {/* Admin/Secretary can select employee or apply to all */}
                  {canEdit() && (
                    <>
                      <div className="space-y-2">
                        <Label>Pour qui ?</Label>
                        <Select
                          value={formData.for_all_employees ? 'all' : (formData.employee_id || 'self')}
                          onValueChange={(value) => {
                            if (value === 'all') {
                              setFormData({ ...formData, for_all_employees: true, employee_id: '', leave_type: 'public' });
                            } else if (value === 'self') {
                              setFormData({ ...formData, for_all_employees: false, employee_id: '' });
                            } else {
                              setFormData({ ...formData, for_all_employees: false, employee_id: value });
                            }
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Sélectionner" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="self">Pour moi-même</SelectItem>
                            <SelectItem value="all">🎉 Jour férié (tous les employés)</SelectItem>
                            {employees.map((emp) => (
                              <SelectItem key={emp.id} value={emp.id}>
                                {emp.first_name} {emp.last_name} - {emp.department}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      
                      {formData.for_all_employees && (
                        <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg text-sm text-green-700 dark:text-green-300">
                          ⚠️ Ce jour férié sera appliqué à <strong>tous les employés</strong> et automatiquement approuvé.
                        </div>
                      )}
                    </>
                  )}

                  <div className="space-y-2">
                    <Label>Type de congé</Label>
                    <Select
                      value={formData.leave_type}
                      onValueChange={handleLeaveTypeChange}
                      disabled={formData.for_all_employees}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {leaveTypes.map((type) => (
                          <SelectItem key={type.value} value={type.value}>
                            <div className="flex items-center gap-2">
                              <div className={`w-3 h-3 rounded-full ${type.color}`} />
                              {type.label}
                              {type.duration_value && (
                                <span className="text-xs text-muted-foreground ml-1">
                                  ({type.duration_value} {type.duration_unit === 'days' ? 'j' : type.duration_unit === 'weeks' ? 'sem' : 'mois'})
                                </span>
                              )}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {/* Show duration info for selected type */}
                    {formData.leave_type && leaveTypesConfig.find(lt => lt.code === formData.leave_type) && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <Calculator className="h-3 w-3" />
                        Durée configurée: {leaveTypesConfig.find(lt => lt.code === formData.leave_type)?.duration_value}{' '}
                        {leaveTypesConfig.find(lt => lt.code === formData.leave_type)?.duration_unit === 'days' ? 'jour(s)' :
                         leaveTypesConfig.find(lt => lt.code === formData.leave_type)?.duration_unit === 'weeks' ? 'semaine(s)' : 'mois'}
                      </p>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Date de début</Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline" className="w-full justify-start text-left">
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {formData.start_date ? format(formData.start_date, 'dd/MM/yyyy') : 'Sélectionner'}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0">
                          <Calendar
                            mode="single"
                            selected={formData.start_date}
                            onSelect={handleStartDateChange}
                            locale={fr}
                          />
                        </PopoverContent>
                      </Popover>
                    </div>
                    
                    <div className="space-y-2">
                      <Label className="flex items-center gap-2">
                        Date de fin
                        {formData.auto_calculated && (
                          <Badge variant="secondary" className="text-xs">
                            <Calculator className="h-3 w-3 mr-1" />
                            Auto
                          </Badge>
                        )}
                      </Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button 
                            variant="outline" 
                            className={`w-full justify-start text-left ${formData.auto_calculated ? 'border-green-500 bg-green-50 dark:bg-green-900/20' : ''}`}
                          >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {formData.end_date ? format(formData.end_date, 'dd/MM/yyyy') : 'Sélectionner'}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0">
                          <Calendar
                            mode="single"
                            selected={formData.end_date}
                            onSelect={(date) => setFormData({ ...formData, end_date: date, auto_calculated: false })}
                            locale={fr}
                          />
                        </PopoverContent>
                      </Popover>
                      {formData.auto_calculated && (
                        <p className="text-xs text-green-600 dark:text-green-400">
                          ✓ Calculée automatiquement selon la durée du type de congé
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Motif</Label>
                    <Textarea
                      value={formData.reason}
                      onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                      placeholder="Décrivez la raison..."
                      required
                    />
                  </div>

                  <Button type="submit" className="w-full" disabled={submitting}>
                    {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Soumettre
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Quick Punch Buttons */}
        <Card className="bg-gradient-to-r from-primary/10 to-secondary/10">
          <CardContent className="pt-6">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <div>
                <h3 className="font-semibold text-lg">Pointage du jour</h3>
                <p className="text-sm text-muted-foreground">
                  {format(new Date(), 'EEEE dd MMMM yyyy', { locale: fr })}
                </p>
                {todayAttendance && (
                  <div className="flex gap-4 mt-2 text-sm">
                    <span className="text-green-600">Entrée: {todayAttendance.check_in || '-'}</span>
                    <span className="text-red-600">Sortie: {todayAttendance.check_out || '-'}</span>
                  </div>
                )}
              </div>
              <div className="flex gap-3">
                  <Button
                    onClick={handleCheckIn}
                    disabled={todayAttendance?.check_in}
                    className="bg-green-600 hover:bg-green-700"
                    data-testid="check-in-btn"
                  >
                    <LogIn className="mr-2 h-4 w-4" />
                    Entrée
                  </Button>
                <Button
                  onClick={handleCheckOut}
                  disabled={!todayAttendance?.check_in || todayAttendance?.check_out}
                  className="bg-red-600 hover:bg-red-700"
                  data-testid="check-out-btn"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  Sortie
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Stats Cards - CLICKABLE */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card 
            className={`border-l-4 border-l-yellow-500 cursor-pointer hover:shadow-lg transition-all ${statusFilter === 'pending' ? 'ring-2 ring-yellow-500' : ''}`}
            onClick={() => {
              setStatusFilter(statusFilter === 'pending' ? null : 'pending');
              setActiveTab('leaves');
            }}
            data-testid="stat-pending"
          >
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{t('pending')}</p>
                  <p className="text-2xl font-bold">{stats.pending}</p>
                </div>
                <AlertCircle className="h-8 w-8 text-yellow-500/50" />
              </div>
            </CardContent>
          </Card>
          
          <Card 
            className={`border-l-4 border-l-green-500 cursor-pointer hover:shadow-lg transition-all ${statusFilter === 'approved' ? 'ring-2 ring-green-500' : ''}`}
            onClick={() => {
              setStatusFilter(statusFilter === 'approved' ? null : 'approved');
              setActiveTab('leaves');
            }}
            data-testid="stat-approved"
          >
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{t('approved')}</p>
                  <p className="text-2xl font-bold">{stats.approved}</p>
                </div>
                <CheckCircle className="h-8 w-8 text-green-500/50" />
              </div>
            </CardContent>
          </Card>

          <Card 
            className={`border-l-4 border-l-red-500 cursor-pointer hover:shadow-lg transition-all ${statusFilter === 'rejected' ? 'ring-2 ring-red-500' : ''}`}
            onClick={() => {
              setStatusFilter(statusFilter === 'rejected' ? null : 'rejected');
              setActiveTab('leaves');
            }}
            data-testid="stat-rejected"
          >
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{t('rejected')}</p>
                  <p className="text-2xl font-bold">{stats.rejected}</p>
                </div>
                <XCircle className="h-8 w-8 text-red-500/50" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-3 max-w-lg">
            <TabsTrigger value="calendar" className="flex items-center gap-2">
              <CalendarIcon className="h-4 w-4" />
              Calendrier
            </TabsTrigger>
            <TabsTrigger value="leaves" className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Mes congés
            </TabsTrigger>
            <TabsTrigger value="attendance" className="flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Pointages
            </TabsTrigger>
          </TabsList>

          {/* Calendar Tab */}
          <TabsContent value="calendar" className="mt-6">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Calendrier des congés</CardTitle>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="icon" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="font-medium min-w-[150px] text-center">
                      {format(currentMonth, 'MMMM yyyy', { locale: fr })}
                    </span>
                    <Button variant="outline" size="icon" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <CardDescription>
                  {isAdmin() ? 'Vue complète de tous les congés' : 'Congés approuvés et vos demandes'}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {/* Legend */}
                <div className="flex flex-wrap gap-3 mb-4">
                  {leaveTypes.map((type) => (
                    <div key={type.value} className="flex items-center gap-1.5 text-sm">
                      <div className={`w-3 h-3 rounded-full ${type.color}`} />
                      <span>{type.label}</span>
                    </div>
                  ))}
                </div>

                {/* Calendar Grid */}
                <div className="grid grid-cols-7 gap-1">
                  {['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map((day) => (
                    <div key={day} className="text-center text-sm font-medium text-muted-foreground py-2">
                      {day}
                    </div>
                  ))}
                  
                  {/* Empty cells for days before first of month */}
                  {Array.from({ length: (startOfMonth(currentMonth).getDay() + 6) % 7 }).map((_, i) => (
                    <div key={`empty-${i}`} className="h-24 bg-muted/30 rounded-lg" />
                  ))}
                  
                  {daysInMonth.map((day) => {
                    const dayLeaves = getLeavesForDay(day);
                    const isToday = isSameDay(day, new Date());
                    
                    return (
                      <div
                        key={day.toISOString()}
                        className={`h-24 p-1 rounded-lg border transition-colors ${
                          isToday ? 'border-primary bg-primary/5' : 'border-transparent hover:bg-muted/50'
                        }`}
                      >
                        <div className={`text-sm font-medium mb-1 ${isToday ? 'text-primary' : ''}`}>
                          {format(day, 'd')}
                        </div>
                        <div className="space-y-0.5 overflow-hidden">
                          {dayLeaves.slice(0, 3).map((leave) => {
                            const leaveBorderColor = getLeaveBorderColor(leave.leave_type);
                            const displayName = leave.employee_name || 'Employé';
                            return (
                              <div
                                key={leave.id}
                                className={`text-[10px] px-1.5 py-1 rounded truncate font-semibold text-foreground bg-background/95 border-2 ${leaveBorderColor}`}
                                title={`${displayName} - ${leaveTypes.find(t => t.value === leave.leave_type)?.label || leave.leave_type}`}
                              >
                                {displayName.split(' ')[0]}
                              </div>
                            );
                          })}
                          {dayLeaves.length > 3 && (
                            <div className="text-[10px] text-muted-foreground px-1">
                              +{dayLeaves.length - 3}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Leaves Tab */}
          <TabsContent value="leaves" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Mes demandes de congé</CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  </div>
                ) : leaves.filter(l => !statusFilter || l.status === statusFilter).length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Clock className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>Aucune demande de congé {statusFilter ? `(${t(statusFilter)})` : ''}</p>
                    {statusFilter && (
                      <Button variant="link" onClick={() => setStatusFilter(null)}>
                        Voir toutes les demandes
                      </Button>
                    )}
                  </div>
                ) : (
                  <div className="space-y-4">
                    {leaves.filter(l => !statusFilter || l.status === statusFilter).map((leave) => (
                      <div
                        key={leave.id}
                        className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-lg border bg-card hover:bg-muted/50 transition-colors gap-4"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <div className={`w-3 h-3 rounded-full ${getLeaveColor(leave.leave_type)}`} />
                            <span className="font-medium">
                              {leaveTypes.find(t => t.value === leave.leave_type)?.label || leave.leave_type}
                            </span>
                            {getStatusBadge(leave.status)}
                          </div>
                          <p className="text-sm text-muted-foreground">
                            Du {leave.start_date} au {leave.end_date}
                          </p>
                          <p className="text-sm">{leave.reason}</p>
                          {leave.employee_name && isAdmin() && (
                            <p className="text-xs text-muted-foreground">Par: {leave.employee_name}</p>
                          )}
                        </div>
                        
                        {/* Generate Document button for approved leaves (admin only) */}
                        {isAdmin() && leave.status === 'approved' && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="flex items-center gap-2"
                            onClick={() => handleGenerateDocument(leave.id)}
                          >
                            <FileText className="h-4 w-4" />
                            Générer document
                          </Button>
                        )}
                        
                        {isAdmin() && leave.status === 'pending' && (
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              className="bg-green-600 hover:bg-green-700"
                              onClick={() => handleStatusUpdate(leave.id, 'approved')}
                            >
                              <CheckCircle className="h-4 w-4 mr-1" />
                              Approuver
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => handleStatusUpdate(leave.id, 'rejected')}
                            >
                              <XCircle className="h-4 w-4 mr-1" />
                              Rejeter
                            </Button>
                          </div>
                        )}
                        
                        {/* Delete button - Admin can delete any, user can delete their own pending */}
                        {(isAdmin() || (leave.status === 'pending' && leave.employee_id === user?.id)) && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={() => handleDeleteLeave(leave.id)}
                          >
                            <Trash2 className="h-4 w-4 mr-1" />
                            Supprimer
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Attendance Tab */}
          <TabsContent value="attendance" className="mt-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Historique des pointages</CardTitle>
                  <CardDescription>Enregistrement des heures d&apos;entrée et sortie</CardDescription>
                </div>
                {isAdmin() && (
                  <Dialog open={attendanceDialogOpen} onOpenChange={setAttendanceDialogOpen}>
                    <DialogTrigger asChild>
                      <Button data-testid="add-attendance-btn">
                        <Plus className="mr-2 h-4 w-4" />
                        Ajouter
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Enregistrer un pointage</DialogTitle>
                      </DialogHeader>
                      <form onSubmit={handleCreateAttendance} className="space-y-4">
                        <div className="space-y-2">
                          <Label>Date</Label>
                          <Input
                            type="date"
                            value={attendanceForm.date}
                            onChange={(e) => setAttendanceForm({...attendanceForm, date: e.target.value})}
                            required
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label>Heure d&apos;entrée</Label>
                            <Input
                              type="time"
                              value={attendanceForm.check_in}
                              onChange={(e) => setAttendanceForm({...attendanceForm, check_in: e.target.value})}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Heure de sortie</Label>
                            <Input
                              type="time"
                              value={attendanceForm.check_out}
                              onChange={(e) => setAttendanceForm({...attendanceForm, check_out: e.target.value})}
                            />
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label>Notes</Label>
                          <Textarea
                            value={attendanceForm.notes}
                            onChange={(e) => setAttendanceForm({...attendanceForm, notes: e.target.value})}
                            placeholder="Notes optionnelles..."
                          />
                        </div>
                        <Button type="submit" className="w-full" disabled={submitting}>
                          {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                          Enregistrer
                        </Button>
                      </form>
                    </DialogContent>
                  </Dialog>
                )}
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  </div>
                ) : attendance.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Clock className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>Aucun pointage enregistré</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {attendance.map((att) => (
                      <div
                        key={att.id}
                        className="flex items-center justify-between p-4 rounded-lg border hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex items-center gap-4">
                          <div className="text-center min-w-[80px]">
                            <p className="text-lg font-bold">{format(parseISO(att.date), 'dd')}</p>
                            <p className="text-xs text-muted-foreground">
                              {format(parseISO(att.date), 'MMM yyyy', { locale: fr })}
                            </p>
                          </div>
                          <div>
                            <p className="font-medium">{att.employee_name}</p>
                            <div className="flex gap-4 text-sm">
                              <span className="text-green-600 flex items-center gap-1">
                                <LogIn className="h-3 w-3" />
                                {att.check_in || '-'}
                              </span>
                              <span className="text-red-600 flex items-center gap-1">
                                <LogOut className="h-3 w-3" />
                                {att.check_out || '-'}
                              </span>
                            </div>
                          </div>
                        </div>
                        {att.notes && (
                          <p className="text-sm text-muted-foreground max-w-[200px] truncate">
                            {att.notes}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Delete Leave Confirmation Dialog */}
        <Dialog open={deleteLeaveDialog.open} onOpenChange={(open) => !open && setDeleteLeaveDialog({ open: false, leaveId: null })}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-destructive">
                <Trash2 className="h-5 w-5" />
                Confirmer la suppression
              </DialogTitle>
              <DialogDescription>
                Voulez-vous vraiment supprimer ce congé ? Cette action est irréversible.
              </DialogDescription>
            </DialogHeader>
            <div className="flex justify-end gap-2 mt-4">
              <Button variant="outline" onClick={() => setDeleteLeaveDialog({ open: false, leaveId: null })}>
                Annuler
              </Button>
              <Button variant="destructive" onClick={confirmDeleteLeave}>
                <Trash2 className="h-4 w-4 mr-2" />
                Supprimer
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Generate Document Dialog */}
        <Dialog open={generateDocDialogOpen} onOpenChange={setGenerateDocDialogOpen}>
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary" />
                Générer un document de congé
              </DialogTitle>
              <DialogDescription>
                Sélectionnez un modèle pour générer automatiquement le document de communication d'absence.
                Les informations seront pré-remplies automatiquement.
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4">
              {generatingDocument ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : documentTemplates.length === 0 ? (
                <div className="text-center py-8">
                  <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p className="text-muted-foreground">Aucun modèle disponible pour les congés.</p>
                  <p className="text-sm text-muted-foreground mt-2">
                    Veuillez créer un modèle dans le module Documents RH.
                  </p>
                </div>
              ) : (
                <>
                  <div className="grid gap-3">
                    {documentTemplates.map((template) => (
                      <div
                        key={template.id}
                        className="p-4 border rounded-lg hover:bg-muted/50 transition-colors cursor-pointer"
                        onClick={() => handleConfirmGenerateDocument(template.id)}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <h4 className="font-semibold text-sm mb-1">{template.name}</h4>
                            {template.description && (
                              <p className="text-xs text-muted-foreground mb-2">{template.description}</p>
                            )}
                            <div className="flex items-center gap-2">
                              <Badge variant="secondary" className="text-xs">
                                {template.category}
                              </Badge>
                              {template.fields && template.fields.length > 0 && (
                                <span className="text-xs text-muted-foreground">
                                  {template.fields.length} balises automatiques
                                </span>
                              )}
                            </div>
                          </div>
                          <Button size="sm" variant="outline">
                            <FileText className="h-4 w-4 mr-2" />
                            Utiliser
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                  
                  <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                    <div className="flex items-start gap-3">
                      <AlertCircle className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
                      <div className="text-sm text-blue-900 dark:text-blue-100">
                        <p className="font-medium mb-1">Informations automatiques</p>
                        <ul className="text-xs space-y-1 text-blue-700 dark:text-blue-200">
                          <li>• Les données de l'employé et du congé seront remplies automatiquement</li>
                          <li>• Vous pourrez modifier le document avant de le valider</li>
                          <li>• Le document sera enregistré dans le module Documents</li>
                        </ul>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
};

export default TimeManagement;
