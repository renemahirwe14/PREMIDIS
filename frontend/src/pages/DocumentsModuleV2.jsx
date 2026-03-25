import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useNavigate } from 'react-router-dom';
import axios from '../config/api';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { toast } from 'sonner';
import {
  FileText,
  ArrowLeft,
  Save,
  Printer,
  Eye,
  Edit,
  Trash2,
  Upload,
  Plus,
  Bold,
  Italic,
  Underline as UnderlineIcon,
  AlignLeft,
  AlignCenter,
  AlignRight,
  List,
  ListOrdered,
  Type,
  Highlighter,
  MousePointer
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from '../components/ui/dialog';

const DocumentsModuleV2 = () => {
  const { user } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [view, setView] = useState('library'); // 'library', 'editor', 'preview'
  const [forms, setForms] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [selectedForm, setSelectedForm] = useState(null);
  const [currentDocument, setCurrentDocument] = useState(null);
  const [documentTitle, setDocumentTitle] = useState('');
  const [editorContent, setEditorContent] = useState('');
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [itemToDelete, setItemToDelete] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const iframeRef = useRef(null);

  useEffect(() => {
    fetchForms();
    fetchDocuments();
  }, []);

  const fetchForms = async () => {
    try {
      const response = await axios.get('/api/documents/forms');
      setForms(response.data.forms || []);
    } catch (error) {
      console.error('Error fetching forms:', error);
    }
  };

  const fetchDocuments = async () => {
    try {
      // Récupérer les documents normaux
      const response = await axios.get('/api/documents');
      const normalDocs = response.data.documents || [];
      
      // Récupérer aussi les documents RH (congés)
      const hrResponse = await axios.get('/api/hr-documents');
      const hrDocs = hrResponse.data.documents || [];
      
      // Combiner les deux listes
      const allDocuments = [...normalDocs, ...hrDocs];
      setDocuments(allDocuments);
    } catch (error) {
      console.error('Error fetching documents:', error);
    }
  };

  const initSystemForms = async () => {
    try {
      await axios.post('/api/documents/forms/init-premidis-templates');
      toast.success(t('docs.templatesInit'));
      fetchForms();
    } catch (error) {
      toast.error(error.response?.data?.detail || t('common.error'));
    }
  };

  const handleUseForm = (form) => {
    console.log('Using form:', form.name, 'Content length:', form.content?.length || 0);
    setSelectedForm(form);
    setEditorContent(form.content);
    setDocumentTitle(`Nouveau ${form.name}`);
    setCurrentDocument(null);
    // Use setTimeout to ensure state is updated before changing view
    setTimeout(() => setView('editor'), 50);
  };

  const handleEditDocument = async (doc) => {
    console.log('Editing document:', doc.title, 'Content length:', doc.content?.length || 0);
    setCurrentDocument(doc);
    setEditorContent(doc.content);
    setDocumentTitle(doc.title);
    setSelectedForm(null);
    setTimeout(() => setView('editor'), 50);
  };

  const getIframeContent = () => {
    if (!iframeRef.current) return '';
    const iframeDoc = iframeRef.current.contentDocument || iframeRef.current.contentWindow.document;
    const body = iframeDoc.body;
    return body ? body.innerHTML : '';
  };

  const handleSaveDocument = async () => {
    if (!documentTitle.trim()) {
      toast.error(t('docs.titleRequired'));
      return;
    }

    const content = getIframeContent();

    try {
      if (currentDocument) {
        await axios.put(`/api/documents/${currentDocument.id}`, {
          title: documentTitle,
          content: content
        });
        toast.success(t('docs.docUpdated'));
      } else {
        await axios.post('/api/documents', {
          form_id: selectedForm?.id,
          title: documentTitle,
          content: content
        });
        toast.success(t('docs.docSaved'));
      }
      
      fetchDocuments();
      setView('library');
    } catch (error) {
      toast.error(error.response?.data?.detail || t('docs.saveError'));
    }
  };

  const handlePrint = () => {
    if (iframeRef.current) {
      iframeRef.current.contentWindow.print();
    }
  };

  const handleDeleteConfirm = async () => {
    try {
      if (itemToDelete.type === 'document') {
        await axios.delete(`/api/documents/${itemToDelete.id}`);
        toast.success(t('docs.docDeleted'));
        fetchDocuments();
      } else if (itemToDelete.type === 'hr-doc') {
        await axios.delete(`/api/hr-documents/${itemToDelete.id}`);
        toast.success(t('docs.docDeleted'));
        fetchDocuments();
      } else if (itemToDelete.type === 'form') {
        await axios.delete(`/api/documents/forms/${itemToDelete.id}`);
        toast.success(t('docs.formDeleted'));
        fetchForms();
      }
      setShowDeleteDialog(false);
      setItemToDelete(null);
    } catch (error) {
      toast.error(error.response?.data?.detail || t('docs.deleteError'));
    }
  };

  const handleUploadForm = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.name.endsWith('.docx')) {
      toast.error(t('docs.onlyDocx'));
      return;
    }

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await axios.post('/api/documents/forms/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      toast.success(t('docs.uploadSuccess'));
      fetchForms();
    } catch (error) {
      toast.error(error.response?.data?.detail || t('docs.uploadError'));
    }
  };

  const handlePreview = (doc) => {
    setCurrentDocument(doc);
    setEditorContent(doc.content);
    setDocumentTitle(doc.title);
    setView('preview');
  };

  // Toolbar commands
  const execCommand = (command, value = null) => {
    if (!iframeRef.current) return;
    const iframeDoc = iframeRef.current.contentDocument || iframeRef.current.contentWindow.document;
    iframeDoc.execCommand(command, false, value);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* LIBRARY VIEW */}
      {view === 'library' && (
        <div className="p-6 max-w-7xl mx-auto">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate('/dashboard')}
                className="mb-3"
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                {t('docs.backToDashboard')}
              </Button>
              <h1 className="text-4xl font-bold flex items-center gap-3">
                <FileText className="h-10 w-10" />
                📄 {t('docs.title')}
              </h1>
              <p className="text-muted-foreground mt-2">
                {t('docs.subtitle')}
              </p>
            </div>
          </div>

          {/* Document Forms */}
          <Card className="mb-8">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-2xl">📚 {t('docs.documentForms')}</CardTitle>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={initSystemForms}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    {t('docs.initTemplates')}
                  </Button>
                  <Button
                    variant="default"
                    size="sm"
                    onClick={() => document.getElementById('upload-form').click()}
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    {t('docs.uploadDocx')}
                  </Button>
                  <input
                    id="upload-form"
                    type="file"
                    accept=".docx"
                    onChange={handleUploadForm}
                    className="hidden"
                  />
                </div>
              </div>
            </CardHeader>
            {/* Quick access to Document Editor */}
            <div className="px-6 pb-4">
              <Button
                size="lg"
                className="w-full bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 text-white shadow-md"
                onClick={() => navigate('/document-editor')}
              >
                <Eye className="h-5 w-5 mr-2" />
                Éditeur Visuel de Documents (PDF / Image / Word)
              </Button>
            </div>
            <CardContent>
              {forms.length === 0 ? (
                <div className="text-center py-12">
                  <FileText className="h-20 w-20 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground mb-4">{t('docs.noForms')}</p>
                  <Button onClick={initSystemForms}>
                    <Plus className="h-4 w-4 mr-2" />
                    {t('docs.initTemplates')}
                  </Button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  {forms.map((form) => (
                    <Card
                      key={form.id}
                      className="hover:shadow-xl transition-all cursor-pointer border-2 hover:border-primary"
                    >
                      <CardContent className="p-6">
                        <div className="flex flex-col items-center text-center">
                          <div className="w-24 h-32 bg-gradient-to-br from-blue-100 to-blue-200 rounded-lg mb-4 flex items-center justify-center shadow-md">
                            <FileText className="h-16 w-16 text-blue-600" />
                          </div>
                          
                          <h3 className="font-semibold text-lg mb-2">{form.name}</h3>
                          <p className="text-xs text-muted-foreground mb-4">
                            {form.description || t('docs.noDescription')}
                          </p>
                          
                          <Button
                            className="w-full"
                            size="sm"
                            onClick={() => handleUseForm(form)}
                          >
                            {t('docs.use')}
                          </Button>
                          
                          {!form.is_system && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="mt-2 text-red-600"
                              onClick={(e) => {
                                e.stopPropagation();
                                setItemToDelete({ type: 'form', id: form.id, name: form.name });
                                setShowDeleteDialog(true);
                              }}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Document History */}
          <Card>
            <CardHeader>
              <CardTitle className="text-2xl">📁 {t('docs.history')}</CardTitle>
            </CardHeader>
            <CardContent>
              {documents.length === 0 ? (
                <div className="text-center py-12">
                  <FileText className="h-20 w-20 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">{t('docs.noDocument')}</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {documents.map((doc) => {
                    // Déterminer si c'est un document RH ou normal
                    const isHRDoc = doc.template_name !== undefined;
                    const displayTitle = isHRDoc ? doc.template_name : doc.title;
                    const authorName = isHRDoc ? doc.created_by_name : doc.author_name;
                    const employeeName = isHRDoc ? doc.employee_name : null;
                    
                    return (
                      <Card key={doc.id} className="hover:shadow-md transition-shadow">
                        <CardContent className="p-4">
                          <div className="flex items-center gap-4">
                            <div className="w-16 h-20 bg-gray-100 rounded flex items-center justify-center flex-shrink-0">
                              <FileText className="h-8 w-8 text-gray-600" />
                            </div>
                            
                            <div className="flex-1">
                              <h4 className="font-semibold text-lg">{displayTitle}</h4>
                              <div className="text-sm text-muted-foreground">
                                <p>{t('docs.createdOn')}: {new Date(doc.created_at).toLocaleString('fr-FR')}</p>
                                <p>{t('docs.author')}: {authorName}</p>
                                {employeeName && <p>{t('docs.employeeLabel')}: {employeeName}</p>}
                                {!isHRDoc && doc.updated_at && (
                                  <p>{t('docs.modifiedOn')}: {new Date(doc.updated_at).toLocaleString('fr-FR')}</p>
                                )}
                              </div>
                            </div>
                            
                            <div className="flex gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handlePreview(doc)}
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                              {!isHRDoc && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleEditDocument(doc)}
                                >
                                  <Edit className="h-4 w-4" />
                                </Button>
                              )}
                              <Button
                                variant="destructive"
                                size="sm"
                                onClick={() => {
                                  setShowDeleteDialog(true);
                                  setItemToDelete({ 
                                    type: isHRDoc ? 'hr-doc' : 'document', 
                                    id: doc.id, 
                                    name: displayTitle 
                                  });
                                }}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* EDITOR VIEW - iFrame with Perfect Style Isolation */}
      {view === 'editor' && (
        <div className="min-h-screen bg-white">
          {/* Top Bar */}
          <div className="sticky top-0 z-50 bg-white border-b shadow-sm">
            <div className="flex items-center justify-between p-4">
              <Button
                variant="ghost"
                onClick={() => setView('library')}
              >
                <ArrowLeft className="h-5 w-5 mr-2" />
                {t('docs.back')}
              </Button>
              
              <Input
                value={documentTitle}
                onChange={(e) => setDocumentTitle(e.target.value)}
                placeholder={t('docs.docTitle')}
                className="max-w-md text-lg font-semibold"
              />
              
              <div className="flex gap-2">
                <Button
                  variant={editMode ? "default" : "outline"}
                  onClick={() => setEditMode(!editMode)}
                  title={t('docs.editModeTitle')}
                >
                  <MousePointer className="h-4 w-4 mr-2" />
                  {editMode ? t('docs.editModeOn') : t('docs.enableEdit')}
                </Button>
                <Button
                  variant="outline"
                  onClick={handlePrint}
                >
                  <Printer className="h-4 w-4 mr-2" />
                  {t('docs.print')}
                </Button>
                <Button onClick={handleSaveDocument}>
                  <Save className="h-4 w-4 mr-2" />
                  {t('docs.save')}
                </Button>
              </div>
            </div>

            {/* Toolbar */}
            <div className="flex items-center gap-1 px-4 py-2 border-t bg-gray-50 flex-wrap">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => execCommand('bold')}
                title={t('docs.bold')}
              >
                <Bold className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => execCommand('italic')}
                title={t('docs.italic')}
              >
                <Italic className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => execCommand('underline')}
                title={t('docs.underline')}
              >
                <UnderlineIcon className="h-4 w-4" />
              </Button>
              
              <div className="w-px h-6 bg-gray-300 mx-2" />
              
              <Button
                variant="ghost"
                size="sm"
                onClick={() => execCommand('justifyLeft')}
                title="Aligner à gauche"
              >
                <AlignLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => execCommand('justifyCenter')}
                title="Centrer"
              >
                <AlignCenter className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => execCommand('justifyRight')}
                title="Aligner à droite"
              >
                <AlignRight className="h-4 w-4" />
              </Button>
              
              <div className="w-px h-6 bg-gray-300 mx-2" />
              
              <Button
                variant="ghost"
                size="sm"
                onClick={() => execCommand('insertUnorderedList')}
                title="Liste à puces"
              >
                <List className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => execCommand('insertOrderedList')}
                title="Liste numérotée"
              >
                <ListOrdered className="h-4 w-4" />
              </Button>
              
              <div className="w-px h-6 bg-gray-300 mx-2" />
              
              <select
                className="px-2 py-1 border rounded text-sm"
                onChange={(e) => execCommand('fontSize', e.target.value)}
                defaultValue="3"
              >
                <option value="1">Très petit</option>
                <option value="2">Petit</option>
                <option value="3">Normal</option>
                <option value="4">Grand</option>
                <option value="5">Très grand</option>
                <option value="6">Énorme</option>
              </select>
              
              <input
                type="color"
                className="w-8 h-8 rounded border cursor-pointer"
                onChange={(e) => execCommand('foreColor', e.target.value)}
                title="Couleur du texte"
              />
              
              <input
                type="color"
                className="w-8 h-8 rounded border cursor-pointer ml-1"
                onChange={(e) => execCommand('hiliteColor', e.target.value)}
                title="Surligner"
              />
            </div>
          </div>

          {/* Document Page with iframe */}
          <div className="py-8 px-4" style={{ backgroundColor: '#e5e5e5' }}>
            <div 
              className="document-page mx-auto"
              style={{
                backgroundColor: 'white',
                boxShadow: '0 0 20px rgba(0,0,0,0.15)',
                minHeight: '297mm',
                width: '210mm',
                padding: '0',
                margin: '0 auto',
              }}
            >
              <iframe
                ref={iframeRef}
                title="Document Editor"
                srcDoc={`
                  <!DOCTYPE html>
                  <html>
                    <head>
                      <meta charset="UTF-8">
                      <style>
                        body {
                          margin: 20mm;
                          padding: 0;
                          font-family: 'Calibri', 'Arial', sans-serif;
                          font-size: 11pt;
                          line-height: 1.5;
                          color: #000;
                          background: white;
                        }
                        * { box-sizing: border-box; }
                        .editable-field {
                          border-bottom: 1px solid #000;
                          min-width: 100px;
                          display: inline-block;
                          padding: 2px 4px;
                        }
                        .editable-field:focus {
                          outline: 2px solid #2563eb;
                          background-color: #eff6ff;
                        }
                        @media print {
                          body { margin: 0; background: white; }
                          .editable-field:focus { outline: none; background: transparent; }
                        }
                      </style>
                    </head>
                    <body contenteditable="true">
                      ${editorContent || '<p><br></p>'}
                    </body>
                  </html>
                `}
                style={{
                  width: '100%',
                  minHeight: '297mm',
                  border: 'none',
                  display: 'block',
                  backgroundColor: 'white'
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* PREVIEW VIEW */}
      {view === 'preview' && currentDocument && (
        <div className="min-h-screen bg-gray-50">
          <div className="sticky top-0 z-50 bg-white border-b shadow-sm">
            <div className="flex items-center justify-between p-4">
              <Button
                variant="ghost"
                onClick={() => setView('library')}
              >
                <ArrowLeft className="h-5 w-5 mr-2" />
                {t('docs.back')}
              </Button>
              
              <h2 className="text-lg font-semibold">{documentTitle}</h2>
              
              <Button
                variant="outline"
                onClick={handlePrint}
              >
                <Printer className="h-4 w-4 mr-2" />
                {t('docs.print')}
              </Button>
            </div>
          </div>

          <div className="py-8 px-4" style={{ backgroundColor: '#e5e5e5' }}>
            <div 
              className="document-page mx-auto"
              style={{
                backgroundColor: 'white',
                boxShadow: '0 0 20px rgba(0,0,0,0.15)',
                minHeight: '297mm',
                width: '210mm',
                padding: '0',
                margin: '0 auto',
              }}
            >
              <iframe
                ref={iframeRef}
                title="Document Preview"
                srcDoc={`
                  <!DOCTYPE html>
                  <html>
                    <head>
                      <meta charset="UTF-8">
                      <style>
                        body {
                          margin: 20mm;
                          padding: 0;
                          font-family: 'Calibri', 'Arial', sans-serif;
                          font-size: 11pt;
                          line-height: 1.5;
                          color: #000;
                          background: white;
                        }
                        * { box-sizing: border-box; }
                        .editable-field {
                          border-bottom: 1px solid #000;
                          min-width: 100px;
                          display: inline-block;
                          padding: 2px 4px;
                        }
                      </style>
                    </head>
                    <body>
                      ${editorContent || '<p><br></p>'}
                    </body>
                  </html>
                `}
                style={{
                  width: '100%',
                  minHeight: '297mm',
                  border: 'none',
                  display: 'block',
                  backgroundColor: 'white',
                  pointerEvents: 'none'
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Delete Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('docs.confirmDelete')}</DialogTitle>
            <DialogDescription>
              {t('docs.deleteConfirm').replace('{name}', itemToDelete?.name || '')}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>
              {t('common.cancel')}
            </Button>
            <Button variant="destructive" onClick={handleDeleteConfirm}>
              {t('common.delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default DocumentsModuleV2;
