import React, { useEffect, useState, useRef } from 'react';
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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '../components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { 
  Megaphone, Plus, Loader2, AlertTriangle, Info, Bell, Trash2, 
  FileText, Upload, ChevronLeft, ChevronRight, Download, Image, File, ZoomIn, ZoomOut, RotateCw
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

  // Règlement state - Single document
  const [reglement, setReglement] = useState(null);
  const [reglementLoading, setReglementLoading] = useState(false);
  const [uploadingReglement, setUploadingReglement] = useState(false);
  const [deleteReglementDialog, setDeleteReglementDialog] = useState(false);
  
  // Document viewer state
  const [zoomLevel, setZoomLevel] = useState(100);
  const [imageRotation, setImageRotation] = useState(0);
  const containerRef = useRef(null);

  // Fetch announcements
  useEffect(() => {
    fetchAnnouncements();
  }, []);

  // Fetch règlement when tab changes
  useEffect(() => {
    if (activeTab === 'reglement') {
      fetchReglement();
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

  const fetchReglement = async () => {
    try {
      setReglementLoading(true);
      const response = await axios.get('/api/communication/reglement');
      const documents = response.data.documents || [];
      // Get the most recent document (only one should exist)
      setReglement(documents.length > 0 ? documents[0] : null);
      setZoomLevel(100);
      setImageRotation(0);
    } catch (error) {
      console.error('Failed to fetch reglement:', error);
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
    
    const allowedTypes = [
      'application/pdf',
      'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];
    
    if (!allowedTypes.includes(file.type)) {
      toast.error(t('comm.fileTypeError') || 'Types acceptés : PDF, images (JPG, PNG, GIF, WebP), DOC/DOCX');
      return;
    }
    
    setUploadingReglement(true);
    
    try {
      // If a document already exists, delete it first
      if (reglement) {
        await axios.delete(`/api/communication/reglement/${reglement.id}`);
      }
      
      const formData = new FormData();
      formData.append('file', file);
      
      const response = await axios.post('/api/communication/reglement', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      
      toast.success(t('comm.reglementUploaded') || 'Document uploadé avec succès');
      setReglement(response.data.document);
      setZoomLevel(100);
      setImageRotation(0);
    } catch (error) {
      toast.error(error.response?.data?.detail || t('comm.uploadError') || 'Erreur lors de l\'upload');
    } finally {
      setUploadingReglement(false);
      e.target.value = '';
    }
  };

  const confirmDeleteReglement = async () => {
    if (!reglement) return;
    
    try {
      await axios.delete(`/api/communication/reglement/${reglement.id}`);
      toast.success(t('comm.reglementDeleted') || 'Document supprimé');
      setReglement(null);
      setDeleteReglementDialog(false);
      setZoomLevel(100);
      setImageRotation(0);
    } catch (error) {
      toast.error(error.response?.data?.detail || t('comm.deleteError'));
    }
  };

  // Zoom controls
  const zoomIn = () => setZoomLevel(prev => Math.min(prev + 25, 200));
  const zoomOut = () => setZoomLevel(prev => Math.max(prev - 25, 50));
  const rotateImage = () => setImageRotation(prev => (prev + 90) % 360);

  // Helper to get file type from document
  const getFileType = (doc) => {
    if (doc.file_type) return doc.file_type;
    // Fallback: detect from filename/url
    const url = (doc.url || doc.filename || '').toLowerCase();
    if (url.endsWith('.pdf')) return 'pdf';
    if (url.match(/\.(jpg|jpeg|png|gif|webp|svg)$/)) return 'image';
    if (url.match(/\.(doc|docx)$/)) return 'document';
    return 'pdf'; // default
  };

  // Build absolute URL for document
  const getDocumentUrl = (doc) => {
    if (!doc || !doc.url) return '';
    // If already absolute, use as-is
    if (doc.url.startsWith('http')) return doc.url;
    // Build absolute URL from backend base
    const backendUrl = process.env.REACT_APP_BACKEND_URL || window.location.origin;
    return `${backendUrl}${doc.url}`;
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

        {/* Tabs */}
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

          {/* Règlement Tab - Document Viewer (PDF, Image, DOC) */}
          <TabsContent value="reglement" className="mt-6">
            <Card className="overflow-hidden">
              {/* Header with actions */}
              <CardHeader className="border-b bg-muted/30">
                <div className="flex items-center justify-between flex-wrap gap-4">
                  <div>
                    <CardTitle className="flex items-center gap-2 text-xl">
                      <FileText className="h-6 w-6 text-primary" />
                      {t('comm.reglementTitle') || 'RÈGLEMENT D\'ENTREPRISE'}
                    </CardTitle>
                    {reglement && (
                      <p className="text-sm text-muted-foreground mt-1">
                        {reglement.name} • {format(new Date(reglement.uploaded_at), 'dd MMM yyyy', { locale: fr })}
                      </p>
                    )}
                  </div>
                  
                  {/* Action Buttons */}
                  <div className="flex items-center gap-2">
                    {/* Upload Button */}
                    {isAdmin() && (
                      <label className="cursor-pointer">
                        <input
                          type="file"
                          accept=".pdf,.jpg,.jpeg,.png,.gif,.webp,.svg,.doc,.docx"
                          onChange={handleReglementUpload}
                          className="hidden"
                          disabled={uploadingReglement}
                        />
                        <Button variant="outline" size="sm" asChild disabled={uploadingReglement}>
                          <span>
                            {uploadingReglement ? (
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                              <Upload className="mr-2 h-4 w-4" />
                            )}
                            {reglement ? (t('comm.replace') || 'Remplacer') : (t('comm.upload') || 'Uploader')}
                          </span>
                        </Button>
                      </label>
                    )}
                    
                    {/* Download Button */}
                    {reglement && (
                      <a href={getDocumentUrl(reglement)} download={reglement.name} target="_blank" rel="noopener noreferrer">
                        <Button variant="outline" size="sm">
                          <Download className="mr-2 h-4 w-4" />
                          {t('comm.download') || 'Télécharger'}
                        </Button>
                      </a>
                    )}
                    
                    {/* Delete Button */}
                    {isAdmin() && reglement && (
                      <Button 
                        variant="destructive" 
                        size="sm"
                        onClick={() => setDeleteReglementDialog(true)}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        {t('comm.delete') || 'Supprimer'}
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              
              {/* Document Viewer */}
              <CardContent className="p-0">
                {reglementLoading ? (
                  <div className="flex items-center justify-center h-[700px] bg-gray-50 dark:bg-gray-900">
                    <Loader2 className="h-12 w-12 animate-spin text-primary" />
                  </div>
                ) : !reglement ? (
                  /* No Document State */
                  <div className="flex flex-col items-center justify-center h-[600px] bg-gray-50 dark:bg-gray-900 text-center p-8">
                    <FileText className="h-24 w-24 text-muted-foreground/30 mb-6" />
                    <h3 className="text-xl font-semibold text-muted-foreground mb-2">
                      {t('comm.noReglement') || 'Aucun document disponible'}
                    </h3>
                    <p className="text-sm text-muted-foreground mb-6">
                      {t('comm.noReglementDesc') || 'Le règlement intérieur n\'a pas encore été uploadé'}
                    </p>
                    <p className="text-xs text-muted-foreground mb-4">
                      {t('comm.acceptedFormats') || 'Formats acceptés : PDF, Images (JPG, PNG, GIF, WebP), DOC/DOCX'}
                    </p>
                    {isAdmin() && (
                      <label className="cursor-pointer">
                        <input
                          type="file"
                          accept=".pdf,.jpg,.jpeg,.png,.gif,.webp,.svg,.doc,.docx"
                          onChange={handleReglementUpload}
                          className="hidden"
                          disabled={uploadingReglement}
                        />
                        <Button size="lg" asChild>
                          <span>
                            {uploadingReglement ? (
                              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                            ) : (
                              <Upload className="mr-2 h-5 w-5" />
                            )}
                            {t('comm.uploadReglement') || 'Uploader le règlement'}
                          </span>
                        </Button>
                      </label>
                    )}
                  </div>
                ) : (
                  /* Document Viewer - adapts based on file type */
                  <div ref={containerRef} className="relative">
                    {getFileType(reglement) === 'pdf' ? (
                      /* PDF Viewer using iframe */
                      <div className="bg-gray-800">
                        <iframe
                          src={`${getDocumentUrl(reglement)}#toolbar=1&navpanes=1&scrollbar=1`}
                          title={reglement.name || 'Règlement'}
                          className="w-full border-0"
                          style={{ height: '700px' }}
                        />
                      </div>
                    ) : getFileType(reglement) === 'image' ? (
                      /* Image Viewer with zoom and rotate */
                      <div className="bg-gray-100 dark:bg-gray-900 flex flex-col">
                        {/* Image Toolbar */}
                        <div className="flex items-center justify-center gap-2 py-3 px-4 bg-muted/50 border-b">
                          <Button variant="outline" size="sm" onClick={zoomOut} disabled={zoomLevel <= 50}>
                            <ZoomOut className="h-4 w-4" />
                          </Button>
                          <span className="text-sm font-medium min-w-[50px] text-center">{zoomLevel}%</span>
                          <Button variant="outline" size="sm" onClick={zoomIn} disabled={zoomLevel >= 200}>
                            <ZoomIn className="h-4 w-4" />
                          </Button>
                          <div className="w-px h-5 bg-border mx-2" />
                          <Button variant="outline" size="sm" onClick={rotateImage}>
                            <RotateCw className="h-4 w-4" />
                          </Button>
                        </div>
                        {/* Image Display */}
                        <div className="overflow-auto flex items-center justify-center" style={{ height: '650px' }}>
                          <img
                            src={getDocumentUrl(reglement)}
                            alt={reglement.name || 'Règlement'}
                            className="max-w-full transition-transform duration-300 ease-in-out"
                            style={{ 
                              transform: `scale(${zoomLevel / 100}) rotate(${imageRotation}deg)`,
                              transformOrigin: 'center center'
                            }}
                            onError={(e) => {
                              e.target.style.display = 'none';
                              e.target.nextSibling && (e.target.nextSibling.style.display = 'flex');
                            }}
                          />
                          <div className="hidden flex-col items-center justify-center text-center p-8">
                            <Image className="h-16 w-16 text-muted-foreground mb-4" />
                            <p className="text-lg font-medium mb-2">
                              {t('comm.imageError') || 'Impossible de charger l\'image'}
                            </p>
                          </div>
                        </div>
                      </div>
                    ) : (
                      /* DOC/DOCX Viewer - Google Docs Viewer fallback + download */
                      <div className="bg-gray-100 dark:bg-gray-900">
                        <iframe
                          src={`https://docs.google.com/gview?url=${encodeURIComponent(getDocumentUrl(reglement))}&embedded=true`}
                          title={reglement.name || 'Document'}
                          className="w-full border-0"
                          style={{ height: '700px' }}
                          onError={() => console.log('Google Docs viewer failed')}
                        />
                        {/* Fallback message below iframe */}
                        <div className="flex items-center justify-center gap-3 py-3 px-4 bg-muted/50 border-t text-sm text-muted-foreground">
                          <File className="h-4 w-4" />
                          <span>{t('comm.docViewerHint') || 'Si le document ne s\'affiche pas, vous pouvez le télécharger :'}</span>
                          <a href={getDocumentUrl(reglement)} download={reglement.name}>
                            <Button variant="outline" size="sm">
                              <Download className="mr-2 h-4 w-4" />
                              {t('comm.download') || 'Télécharger'}
                            </Button>
                          </a>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Delete Announcement Dialog */}
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
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteDialog({ open: false, id: null })}>
                {t('common.cancel')}
              </Button>
              <Button variant="destructive" onClick={confirmDelete}>
                <Trash2 className="h-4 w-4 mr-2" />
                {t('common.delete')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Règlement Dialog */}
        <Dialog open={deleteReglementDialog} onOpenChange={setDeleteReglementDialog}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-destructive">
                <Trash2 className="h-5 w-5" />
                {t('comm.deleteReglement') || 'Supprimer le règlement'}
              </DialogTitle>
            </DialogHeader>
            <div className="py-4">
              <p className="text-muted-foreground">
                {t('comm.deleteReglementConfirm') || 'Voulez-vous vraiment supprimer ce document ? Cette action est irréversible.'}
              </p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteReglementDialog(false)}>
                {t('common.cancel')}
              </Button>
              <Button variant="destructive" onClick={confirmDeleteReglement}>
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

export default Communication;
