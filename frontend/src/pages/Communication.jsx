import React, { useEffect, useState, useCallback, useRef } from 'react';
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
  FileText, Upload, Download, ChevronLeft, ChevronRight, FileUp
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
  
  // PDF viewer state
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [pdfKey, setPdfKey] = useState(0);
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
      setCurrentPage(1);
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
    
    if (file.type !== 'application/pdf') {
      toast.error(t('comm.pdfOnly') || 'Seuls les fichiers PDF sont acceptés');
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
      
      toast.success(t('comm.reglementUploaded') || 'Règlement uploadé avec succès');
      setReglement(response.data.document);
      setCurrentPage(1);
      setPdfKey(prev => prev + 1); // Force re-render of PDF viewer
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
      setCurrentPage(1);
      setTotalPages(1);
    } catch (error) {
      toast.error(error.response?.data?.detail || t('comm.deleteError'));
    }
  };

  // Page navigation
  const goToPage = useCallback((page) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
    }
  }, [totalPages]);

  const nextPage = () => goToPage(currentPage + 1);
  const prevPage = () => goToPage(currentPage - 1);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (activeTab !== 'reglement' || !reglement) return;
      
      if (e.key === 'ArrowLeft') {
        prevPage();
      } else if (e.key === 'ArrowRight') {
        nextPage();
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTab, reglement, currentPage, totalPages]);

  // Touch/Swipe handling
  const touchStartX = useRef(0);
  const handleTouchStart = (e) => {
    touchStartX.current = e.touches[0].clientX;
  };
  
  const handleTouchEnd = (e) => {
    const touchEndX = e.changedTouches[0].clientX;
    const diff = touchStartX.current - touchEndX;
    
    if (Math.abs(diff) > 50) {
      if (diff > 0) {
        nextPage();
      } else {
        prevPage();
      }
    }
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

          {/* Règlement Tab - Direct PDF Viewer */}
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
                          accept=".pdf,application/pdf"
                          onChange={handleReglementUpload}
                          className="hidden"
                          disabled={uploadingReglement}
                        />
                        <Button variant="outline" size="sm" asChild disabled={uploadingReglement}>
                          <span>
                            {uploadingReglement ? (
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                              <FileUp className="mr-2 h-4 w-4" />
                            )}
                            {reglement ? (t('comm.replace') || 'Remplacer') : (t('comm.import') || 'Importer')}
                          </span>
                        </Button>
                      </label>
                    )}
                    
                    {/* Download Button */}
                    {reglement && (
                      <a href={reglement.url} download={reglement.name}>
                        <Button variant="outline" size="sm">
                          <Download className="mr-2 h-4 w-4" />
                          {t('comm.export') || 'Exporter'}
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
                  <div className="flex items-center justify-center h-[600px] bg-gray-50 dark:bg-gray-900">
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
                    {isAdmin() && (
                      <label className="cursor-pointer">
                        <input
                          type="file"
                          accept=".pdf,application/pdf"
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
                  /* PDF Viewer */
                  <div 
                    ref={containerRef}
                    className="relative bg-gray-800"
                    onTouchStart={handleTouchStart}
                    onTouchEnd={handleTouchEnd}
                  >
                    {/* PDF Display */}
                    <div className="h-[600px] w-full">
                      <object
                        key={pdfKey}
                        data={`${reglement.url}#page=${currentPage}&toolbar=0&navpanes=0`}
                        type="application/pdf"
                        className="w-full h-full"
                      >
                        <div className="flex flex-col items-center justify-center h-full bg-gray-100 dark:bg-gray-900 p-8 text-center">
                          <FileText className="h-16 w-16 text-muted-foreground mb-4" />
                          <p className="text-lg font-medium mb-2">
                            {t('comm.pdfNotSupported') || 'Impossible d\'afficher le PDF'}
                          </p>
                          <a href={reglement.url} download={reglement.name}>
                            <Button>
                              <Download className="h-4 w-4 mr-2" />
                              {t('comm.download') || 'Télécharger'}
                            </Button>
                          </a>
                        </div>
                      </object>
                    </div>
                    
                    {/* Navigation Controls - Floating at bottom */}
                    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-black/70 backdrop-blur-sm rounded-full px-4 py-2 shadow-lg">
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={prevPage}
                        disabled={currentPage <= 1}
                        className="text-white hover:text-white hover:bg-white/20 rounded-full h-8 w-8 p-0"
                      >
                        <ChevronLeft className="h-5 w-5" />
                      </Button>
                      
                      <div className="flex items-center gap-2 px-3">
                        <span className="text-white text-sm font-medium">Page</span>
                        <input
                          type="number"
                          min={1}
                          max={totalPages}
                          value={currentPage}
                          onChange={(e) => {
                            const page = parseInt(e.target.value);
                            if (!isNaN(page)) goToPage(page);
                          }}
                          className="w-12 text-center bg-white/20 border-0 rounded text-white text-sm py-1"
                        />
                        <span className="text-white text-sm">/ {totalPages}</span>
                      </div>
                      
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={nextPage}
                        disabled={currentPage >= totalPages}
                        className="text-white hover:text-white hover:bg-white/20 rounded-full h-8 w-8 p-0"
                      >
                        <ChevronRight className="h-5 w-5" />
                      </Button>
                    </div>
                    
                    {/* Instructions */}
                    <div className="absolute top-4 right-4 bg-black/50 backdrop-blur-sm rounded-lg px-3 py-2 text-xs text-white/80">
                      ← → {t('comm.navHint') || 'ou swipe pour naviguer'}
                    </div>
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
