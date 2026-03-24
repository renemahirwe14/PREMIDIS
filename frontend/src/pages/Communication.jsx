import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import DashboardLayout from '../components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Badge } from '../components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription, DialogFooter } from '../components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { ScrollArea } from '../components/ui/scroll-area';
import { 
  Megaphone, Plus, Loader2, AlertTriangle, Info, Bell, Trash2, 
  FileText, Upload, Eye, Download, Maximize2, X, File
} from 'lucide-react';
import axios from '../config/api';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

const Communication = () => {
  const { user, isAdmin, canEdit } = useAuth();
  const { t } = useLanguage();
  const [searchParams] = useSearchParams();
  
  // Get tab from URL params or default to 'announcements'
  const tabFromUrl = searchParams.get('tab');
  const [activeTab, setActiveTab] = useState(tabFromUrl || 'announcements');
  
  // Update tab when URL changes
  useEffect(() => {
    if (tabFromUrl && ['announcements', 'reglement'].includes(tabFromUrl)) {
      setActiveTab(tabFromUrl);
    }
  }, [tabFromUrl]);
  
  // Announcements state
  const [announcements, setAnnouncements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deleteDialog, setDeleteDialog] = useState({ open: false, id: null });
  const [formData, setFormData] = useState({
    title: '',
    content: '',
    priority: 'normal'
  });

  // Règlement state
  const [reglements, setReglements] = useState([]);
  const [reglementLoading, setReglementLoading] = useState(false);
  const [uploadingReglement, setUploadingReglement] = useState(false);
  const [viewingDocument, setViewingDocument] = useState(null);
  const [deleteReglementDialog, setDeleteReglementDialog] = useState({ open: false, id: null });

  // Fetch announcements
  useEffect(() => {
    fetchAnnouncements();
  }, []);

  // Fetch règlements when tab changes
  useEffect(() => {
    if (activeTab === 'reglement') {
      fetchReglements();
    }
  }, [activeTab]);

  const fetchAnnouncements = async () => {
    try {
      const response = await axios.get('/api/communication/announcements');
      setAnnouncements(response.data.announcements || []);
    } catch (error) {
      console.error('Failed to fetch announcements:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchReglements = async () => {
    try {
      setReglementLoading(true);
      const response = await axios.get('/api/communication/reglement');
      setReglements(response.data.documents || []);
    } catch (error) {
      console.error('Failed to fetch reglements:', error);
    } finally {
      setReglementLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    
    try {
      await axios.post('/api/communication/announcements', formData);
      toast.success(t('comm.announcementCreated'));
      setDialogOpen(false);
      setFormData({ title: '', content: '', priority: 'normal' });
      fetchAnnouncements();
    } catch (error) {
      toast.error(error.response?.data?.detail || t('comm.announcementError'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = (id) => {
    setDeleteDialog({ open: true, id });
  };

  const confirmDelete = async () => {
    if (!deleteDialog.id) return;
    
    try {
      await axios.delete(`/api/communication/announcements/${deleteDialog.id}`);
      toast.success(t('comm.announcementDeleted'));
      setDeleteDialog({ open: false, id: null });
      fetchAnnouncements();
    } catch (error) {
      toast.error(error.response?.data?.detail || t('comm.deleteError'));
    }
  };

  // Règlement handlers
  const handleReglementUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    if (file.type !== 'application/pdf') {
      toast.error(t('comm.pdfOnly') || 'Seuls les fichiers PDF sont acceptés');
      return;
    }
    
    setUploadingReglement(true);
    
    try {
      const formData = new FormData();
      formData.append('file', file);
      
      await axios.post('/api/communication/reglement', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      
      toast.success(t('comm.reglementUploaded') || 'Règlement uploadé avec succès');
      fetchReglements();
    } catch (error) {
      toast.error(error.response?.data?.detail || t('comm.uploadError') || 'Erreur lors de l\'upload');
    } finally {
      setUploadingReglement(false);
      e.target.value = '';
    }
  };

  const handleDeleteReglement = (id) => {
    setDeleteReglementDialog({ open: true, id });
  };

  const confirmDeleteReglement = async () => {
    if (!deleteReglementDialog.id) return;
    
    try {
      await axios.delete(`/api/communication/reglement/${deleteReglementDialog.id}`);
      toast.success(t('comm.reglementDeleted') || 'Document supprimé');
      setDeleteReglementDialog({ open: false, id: null });
      fetchReglements();
    } catch (error) {
      toast.error(error.response?.data?.detail || t('comm.deleteError'));
    }
  };

  const openDocument = (doc) => {
    setViewingDocument(doc);
  };

  const formatFileSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const getPriorityConfig = (priority) => {
    switch (priority) {
      case 'urgent':
        return { 
          color: 'destructive', 
          bg: 'bg-red-50 dark:bg-red-950/20 border-l-red-500', 
          icon: AlertTriangle,
          label: t('comm.urgent')
        };
      case 'important':
        return { 
          color: 'warning', 
          bg: 'bg-orange-50 dark:bg-orange-950/20 border-l-orange-500', 
          icon: Bell,
          label: t('comm.important')
        };
      default:
        return { 
          color: 'secondary', 
          bg: 'bg-blue-50 dark:bg-blue-950/20 border-l-blue-500', 
          icon: Info,
          label: t('comm.normal')
        };
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 p-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">{t('nav.communication')}</h1>
            <p className="text-muted-foreground">{t('comm.subtitle')}</p>
          </div>
          
          {/* Create Announcement Button - Only for users who can edit */}
          {canEdit() && activeTab === 'announcements' && (
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button className="gap-2">
                  <Plus className="h-4 w-4" />
                  {t('comm.newAnnouncement')}
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <Megaphone className="h-5 w-5" />
                    {t('comm.newAnnouncement')}
                  </DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="title">{t('comm.title')}</Label>
                    <Input
                      id="title"
                      value={formData.title}
                      onChange={(e) => setFormData({...formData, title: e.target.value})}
                      required
                      placeholder={t('comm.titlePlaceholder')}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="content">{t('comm.content')}</Label>
                    <Textarea
                      id="content"
                      value={formData.content}
                      onChange={(e) => setFormData({...formData, content: e.target.value})}
                      required
                      rows={5}
                      placeholder={t('comm.contentPlaceholder')}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="priority">{t('comm.priority')}</Label>
                    <Select 
                      value={formData.priority} 
                      onValueChange={(value) => setFormData({...formData, priority: value})}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="normal">{t('comm.normal')}</SelectItem>
                        <SelectItem value="important">{t('comm.important')}</SelectItem>
                        <SelectItem value="urgent">{t('comm.urgent')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex justify-end gap-2 pt-4">
                    <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                      {t('common.cancel')}
                    </Button>
                    <Button type="submit" disabled={submitting}>
                      {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      {t('comm.publish')}
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          )}
        </div>

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card className="border-l-4 border-l-primary">
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{t('comm.totalAnnouncements')}</p>
                  <p className="text-2xl font-bold">{announcements.length}</p>
                </div>
                <Megaphone className="h-8 w-8 text-primary/50" />
              </div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-red-500">
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{t('comm.urgent')}</p>
                  <p className="text-2xl font-bold text-red-600">
                    {announcements.filter(a => a.priority === 'urgent').length}
                  </p>
                </div>
                <AlertTriangle className="h-8 w-8 text-red-500/50" />
              </div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-orange-500">
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{t('comm.important')}</p>
                  <p className="text-2xl font-bold text-orange-600">
                    {announcements.filter(a => a.priority === 'important').length}
                  </p>
                </div>
                <Bell className="h-8 w-8 text-orange-500/50" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tabs for Announcements and Règlement */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2 max-w-md">
            <TabsTrigger value="announcements" className="flex items-center gap-2">
              <Megaphone className="h-4 w-4" />
              {t('comm.announcements')}
            </TabsTrigger>
            <TabsTrigger value="reglement" className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              {t('comm.reglement') || 'Règlement'}
            </TabsTrigger>
          </TabsList>

          {/* Announcements Tab */}
          <TabsContent value="announcements" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Megaphone className="h-5 w-5" />
                  {t('comm.announcements')}
                </CardTitle>
                <CardDescription>
                  {t('comm.allComms')}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="flex justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  </div>
                ) : announcements.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <Megaphone className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>{t('comm.noAnnouncement')}</p>
                    {canEdit() && (
                      <p className="text-sm mt-2">{t('comm.clickNew')}</p>
                    )}
                  </div>
                ) : (
                  <div className="space-y-4">
                    {announcements.map((announcement) => {
                      const config = getPriorityConfig(announcement.priority);
                      const IconComponent = config.icon;
                      
                      return (
                        <div
                          key={announcement.id}
                          className={`p-4 rounded-lg border-l-4 ${config.bg} transition-all hover:shadow-md`}
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex items-start gap-3 flex-1">
                              <IconComponent className={`h-5 w-5 mt-0.5 ${
                                announcement.priority === 'urgent' ? 'text-red-500' :
                                announcement.priority === 'important' ? 'text-orange-500' : 'text-blue-500'
                              }`} />
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                  <h3 className="font-semibold">{announcement.title}</h3>
                                  <Badge variant={config.color}>{config.label}</Badge>
                                </div>
                                <p className="text-sm text-foreground whitespace-pre-wrap">{announcement.content}</p>
                                <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
                                  <span>{t('comm.by')} {announcement.author_name}</span>
                                  <span>•</span>
                                  <span>
                                    {format(new Date(announcement.created_at), 'dd MMMM yyyy à HH:mm', { locale: fr })}
                                  </span>
                                </div>
                              </div>
                            </div>
                            
                            {isAdmin() && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDelete(announcement.id)}
                                className="text-muted-foreground hover:text-destructive"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Règlement Tab */}
          <TabsContent value="reglement" className="mt-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="h-5 w-5" />
                    {t('comm.reglementTitle') || 'Règlement Intérieur'}
                  </CardTitle>
                  <CardDescription>
                    {t('comm.reglementDesc') || 'Documents officiels du règlement intérieur de l\'entreprise'}
                  </CardDescription>
                </div>
                
                {/* Upload Button - Admin only */}
                {isAdmin() && (
                  <label className="cursor-pointer">
                    <input
                      type="file"
                      accept=".pdf,application/pdf"
                      onChange={handleReglementUpload}
                      className="hidden"
                      disabled={uploadingReglement}
                    />
                    <Button variant="default" size="sm" asChild disabled={uploadingReglement}>
                      <span>
                        {uploadingReglement ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Upload className="mr-2 h-4 w-4" />
                        )}
                        {t('comm.uploadReglement') || 'Ajouter un document'}
                      </span>
                    </Button>
                  </label>
                )}
              </CardHeader>
              <CardContent>
                {reglementLoading ? (
                  <div className="flex justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  </div>
                ) : reglements.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <FileText className="h-16 w-16 mx-auto mb-4 opacity-30" />
                    <p className="text-lg font-medium">{t('comm.noReglement') || 'Aucun règlement intérieur'}</p>
                    <p className="text-sm mt-2">{t('comm.noReglementDesc') || 'Aucun document n\'a encore été ajouté'}</p>
                  </div>
                ) : (
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {reglements.map((doc) => (
                      <Card key={doc.id} className="group hover:shadow-lg transition-all border-2 hover:border-primary/50">
                        <CardContent className="p-4">
                          <div className="flex flex-col items-center text-center">
                            {/* PDF Icon */}
                            <div className="w-20 h-24 bg-red-100 dark:bg-red-900/30 rounded-lg flex items-center justify-center mb-4 group-hover:scale-105 transition-transform">
                              <File className="h-10 w-10 text-red-500" />
                            </div>
                            
                            {/* Document Name */}
                            <h4 className="font-medium text-sm truncate w-full mb-1" title={doc.name}>
                              {doc.name}
                            </h4>
                            
                            {/* Meta Info */}
                            <p className="text-xs text-muted-foreground mb-1">
                              {formatFileSize(doc.size)}
                            </p>
                            <p className="text-xs text-muted-foreground mb-4">
                              {format(new Date(doc.uploaded_at), 'dd MMM yyyy', { locale: fr })}
                            </p>
                            
                            {/* Actions */}
                            <div className="flex gap-2 w-full">
                              <Button 
                                variant="default" 
                                size="sm" 
                                className="flex-1"
                                onClick={() => openDocument(doc)}
                              >
                                <Eye className="h-4 w-4 mr-1" />
                                {t('comm.view') || 'Voir'}
                              </Button>
                              
                              {isAdmin() && (
                                <Button 
                                  variant="destructive" 
                                  size="sm"
                                  onClick={() => handleDeleteReglement(doc.id)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Delete Announcement Confirmation Dialog */}
        <Dialog open={deleteDialog.open} onOpenChange={(open) => !open && setDeleteDialog({ open: false, id: null })}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-destructive">
                <Trash2 className="h-5 w-5" />
                {t('comm.deleteAnnouncement')}
              </DialogTitle>
            </DialogHeader>
            <div className="py-4">
              <p className="text-muted-foreground">
                {t('comm.deleteConfirm')}
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDeleteDialog({ open: false, id: null })}>
                {t('common.cancel')}
              </Button>
              <Button variant="destructive" onClick={confirmDelete}>
                <Trash2 className="h-4 w-4 mr-2" />
                {t('common.delete')}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Delete Règlement Confirmation Dialog */}
        <Dialog open={deleteReglementDialog.open} onOpenChange={(open) => !open && setDeleteReglementDialog({ open: false, id: null })}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-destructive">
                <Trash2 className="h-5 w-5" />
                {t('comm.deleteReglement') || 'Supprimer le document'}
              </DialogTitle>
            </DialogHeader>
            <div className="py-4">
              <p className="text-muted-foreground">
                {t('comm.deleteReglementConfirm') || 'Voulez-vous vraiment supprimer ce document ? Cette action est irréversible.'}
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDeleteReglementDialog({ open: false, id: null })}>
                {t('common.cancel')}
              </Button>
              <Button variant="destructive" onClick={confirmDeleteReglement}>
                <Trash2 className="h-4 w-4 mr-2" />
                {t('common.delete')}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Full Screen Document Viewer */}
        <Dialog open={!!viewingDocument} onOpenChange={(open) => !open && setViewingDocument(null)}>
          <DialogContent className="max-w-[95vw] max-h-[95vh] w-full h-[90vh] p-0">
            <div className="flex flex-col h-full">
              {/* Header */}
              <div className="flex items-center justify-between p-4 border-b bg-muted/50">
                <div className="flex items-center gap-3">
                  <FileText className="h-5 w-5 text-primary" />
                  <div>
                    <h3 className="font-semibold">{viewingDocument?.name}</h3>
                    <p className="text-xs text-muted-foreground">
                      {t('comm.reglementTitle') || 'Règlement Intérieur'}
                    </p>
                  </div>
                </div>
                
                <div className="flex items-center gap-2">
                  {/* Open in new tab */}
                  <a href={viewingDocument?.url} target="_blank" rel="noopener noreferrer">
                    <Button variant="outline" size="sm">
                      <Maximize2 className="h-4 w-4 mr-2" />
                      {t('comm.openNewTab') || 'Nouvel onglet'}
                    </Button>
                  </a>
                  
                  {/* Download */}
                  <a href={viewingDocument?.url} download={viewingDocument?.name}>
                    <Button variant="outline" size="sm">
                      <Download className="h-4 w-4 mr-2" />
                      {t('comm.download') || 'Télécharger'}
                    </Button>
                  </a>
                  
                  {/* Close */}
                  <Button variant="ghost" size="sm" onClick={() => setViewingDocument(null)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              
              {/* PDF Viewer using object tag */}
              <div className="flex-1 overflow-hidden bg-gray-100 dark:bg-gray-900">
                {viewingDocument && (
                  <object
                    data={viewingDocument.url}
                    type="application/pdf"
                    className="w-full h-full"
                  >
                    <div className="flex flex-col items-center justify-center h-full text-center p-8">
                      <FileText className="h-16 w-16 text-muted-foreground mb-4" />
                      <p className="text-lg font-medium mb-2">
                        {t('comm.pdfNotSupported') || 'Impossible d\'afficher le PDF dans le navigateur'}
                      </p>
                      <p className="text-sm text-muted-foreground mb-4">
                        {t('comm.downloadInstead') || 'Veuillez télécharger le document pour le consulter'}
                      </p>
                      <a href={viewingDocument.url} download={viewingDocument.name}>
                        <Button>
                          <Download className="h-4 w-4 mr-2" />
                          {t('comm.download') || 'Télécharger'}
                        </Button>
                      </a>
                    </div>
                  </object>
                )}
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
};

export default Communication;
