import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useNavigate, useParams } from 'react-router-dom';
import axios from '../config/api';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { toast } from 'sonner';
import {
  ArrowLeft, Save, Download, FileText, Upload, Plus, Trash2, 
  ZoomIn, ZoomOut, Undo2, Redo2, Type, Image, CheckSquare, Calendar,
  Pen, Move, Loader2, Eye, GripVertical, Maximize, Minimize,
  Bold, Italic, MousePointer, FileUp, History, RotateCcw
} from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
  DialogDescription
} from '../components/ui/dialog';

// ===================== OVERLAY ELEMENT COMPONENT =====================
const OverlayElement = ({ element, isSelected, onSelect, onUpdate, onDelete, zoom }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const elemRef = useRef(null);

  const handlePointerDown = (e) => {
    if (isEditing) return;
    e.stopPropagation();
    e.preventDefault();
    onSelect(element.id);
    const rect = e.currentTarget.parentElement.getBoundingClientRect();
    setDragOffset({
      x: e.clientX / zoom - element.x,
      y: e.clientY / zoom - element.y
    });
    setIsDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e) => {
    if (!isDragging) return;
    e.preventDefault();
    const newX = Math.max(0, e.clientX / zoom - dragOffset.x);
    const newY = Math.max(0, e.clientY / zoom - dragOffset.y);
    onUpdate(element.id, { x: newX, y: newY });
  };

  const handlePointerUp = (e) => {
    setIsDragging(false);
  };

  const handleDoubleClick = (e) => {
    e.stopPropagation();
    if (element.type === 'text' || element.type === 'date') {
      setIsEditing(true);
    } else if (element.type === 'checkbox') {
      onUpdate(element.id, { checked: !element.checked });
    }
  };

  const handleBlur = (e) => {
    setIsEditing(false);
    onUpdate(element.id, { content: e.target.innerText });
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      e.target.blur();
    }
    if (e.key === 'Escape') {
      setIsEditing(false);
    }
  };

  const style = {
    position: 'absolute',
    left: `${element.x}px`,
    top: `${element.y}px`,
    cursor: isDragging ? 'grabbing' : (isEditing ? 'text' : 'grab'),
    zIndex: isSelected ? 100 : 10,
    userSelect: isEditing ? 'text' : 'none',
    outline: isSelected ? '2px solid #3b82f6' : 'none',
    outlineOffset: '2px',
    borderRadius: '2px',
    minWidth: '20px',
    minHeight: '20px'
  };

  return (
    <div
      ref={elemRef}
      style={style}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onDoubleClick={handleDoubleClick}
      onClick={(e) => { e.stopPropagation(); onSelect(element.id); }}
    >
      {element.type === 'text' && (
        <div
          contentEditable={isEditing}
          suppressContentEditableWarning
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          style={{
            fontSize: `${element.fontSize || 16}px`,
            color: element.color || '#000000',
            fontWeight: element.bold ? 'bold' : 'normal',
            fontStyle: element.italic ? 'italic' : 'normal',
            padding: '2px 4px',
            background: isEditing ? 'rgba(255,255,255,0.9)' : 'transparent',
            whiteSpace: 'pre-wrap',
            minWidth: '50px'
          }}
        >
          {element.content || 'Texte...'}
        </div>
      )}

      {element.type === 'date' && (
        <div
          contentEditable={isEditing}
          suppressContentEditableWarning
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          style={{
            fontSize: `${element.fontSize || 14}px`,
            color: element.color || '#000000',
            padding: '2px 6px',
            background: isEditing ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.5)',
            border: '1px dashed #999',
            borderRadius: '3px'
          }}
        >
          {element.content || new Date().toLocaleDateString('fr-FR')}
        </div>
      )}

      {element.type === 'checkbox' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '2px' }}>
          <input
            type="checkbox"
            checked={element.checked || false}
            onChange={() => onUpdate(element.id, { checked: !element.checked })}
            style={{ width: '18px', height: '18px', cursor: 'pointer' }}
          />
          {element.label && <span style={{ fontSize: '13px' }}>{element.label}</span>}
        </div>
      )}

      {element.type === 'image' && (
        <div style={{
          width: `${element.width || 150}px`,
          height: `${element.height || 100}px`,
          overflow: 'hidden',
          border: isSelected ? 'none' : '1px dashed #ccc'
        }}>
          {element.imageData ? (
            <img
              src={element.imageData}
              alt="Element"
              style={{ width: '100%', height: '100%', objectFit: 'contain' }}
              draggable={false}
            />
          ) : (
            <div className="flex items-center justify-center h-full bg-gray-100 text-gray-400 text-xs">
              <Image className="h-6 w-6" />
            </div>
          )}
        </div>
      )}

      {element.type === 'signature' && (
        <div style={{
          width: `${element.width || 200}px`,
          height: `${element.height || 60}px`,
          border: '1px dashed #666',
          borderRadius: '4px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'rgba(255,255,255,0.7)'
        }}>
          {element.imageData ? (
            <img src={element.imageData} alt="Signature" style={{ maxWidth: '100%', maxHeight: '100%' }} draggable={false} />
          ) : (
            <span style={{ fontSize: '11px', color: '#999' }}>Signature</span>
          )}
        </div>
      )}

      {/* Delete button on selected */}
      {isSelected && !isEditing && (
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(element.id); }}
          className="absolute -top-3 -right-3 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs shadow hover:bg-red-600"
        >
          ×
        </button>
      )}
    </div>
  );
};

// ===================== MAIN EDITOR COMPONENT =====================
const DocumentEditor = () => {
  const { user } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const { docId } = useParams();

  // Document state
  const [document, setDocument] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);

  // Editor state
  const [elements, setElements] = useState([]);
  const [selectedElementId, setSelectedElementId] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [activeTool, setActiveTool] = useState('select'); // 'select', 'text', 'image', 'checkbox', 'date', 'signature'

  // History (undo/redo)
  const [history, setHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [showHistory, setShowHistory] = useState(false);

  // Upload dialog
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [showImageUpload, setShowImageUpload] = useState(false);
  const [uploadTarget, setUploadTarget] = useState(null); // element id for image upload

  const editorRef = useRef(null);
  const containerRef = useRef(null);

  // ========= Load document =========
  useEffect(() => {
    if (docId) {
      loadDocument(docId);
    } else {
      setLoading(false);
    }
  }, [docId]);

  const loadDocument = async (id) => {
    try {
      setLoading(true);
      const res = await axios.get(`/api/documents/editor-docs/${id}`);
      setDocument(res.data);
      setElements(res.data.overlay_elements || []);
      pushHistory(res.data.overlay_elements || []);
    } catch (err) {
      toast.error('Erreur chargement document');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // ========= History management =========
  const pushHistory = useCallback((newElements) => {
    setHistory(prev => {
      const newHistory = prev.slice(0, historyIndex + 1);
      newHistory.push(JSON.parse(JSON.stringify(newElements)));
      return newHistory;
    });
    setHistoryIndex(prev => prev + 1);
  }, [historyIndex]);

  const undo = () => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      setHistoryIndex(newIndex);
      setElements(JSON.parse(JSON.stringify(history[newIndex])));
    }
  };

  const redo = () => {
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1;
      setHistoryIndex(newIndex);
      setElements(JSON.parse(JSON.stringify(history[newIndex])));
    }
  };

  // ========= Element operations =========
  const addElement = (type, extraProps = {}) => {
    const newElement = {
      id: `elem_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      type,
      x: 100 + Math.random() * 200,
      y: 100 + Math.random() * 200,
      page: currentPage,
      content: type === 'text' ? 'Nouveau texte' : type === 'date' ? new Date().toLocaleDateString('fr-FR') : '',
      fontSize: 16,
      color: '#000000',
      bold: false,
      italic: false,
      checked: false,
      width: type === 'image' ? 150 : type === 'signature' ? 200 : undefined,
      height: type === 'image' ? 100 : type === 'signature' ? 60 : undefined,
      ...extraProps
    };
    
    const newElements = [...elements, newElement];
    setElements(newElements);
    setSelectedElementId(newElement.id);
    pushHistory(newElements);
    setActiveTool('select');

    // If image, open file picker
    if (type === 'image') {
      setUploadTarget(newElement.id);
      setShowImageUpload(true);
    }
  };

  const updateElement = (id, updates) => {
    setElements(prev => prev.map(el => el.id === id ? { ...el, ...updates } : el));
  };

  const commitUpdate = () => {
    pushHistory(elements);
  };

  const deleteElement = (id) => {
    const newElements = elements.filter(el => el.id !== id);
    setElements(newElements);
    setSelectedElementId(null);
    pushHistory(newElements);
  };

  // ========= Save overlay =========
  const saveOverlay = async () => {
    if (!document) return;
    try {
      setSaving(true);
      await axios.put(`/api/documents/editor-docs/${document.id}/overlay`, { elements });
      toast.success('Sauvegardé !');
    } catch (err) {
      toast.error('Erreur de sauvegarde');
    } finally {
      setSaving(false);
    }
  };

  // ========= Generate PDF =========
  const generatePDF = async () => {
    if (!document) return;
    try {
      setGenerating(true);
      const res = await axios.post(`/api/documents/editor-docs/${document.id}/generate-pdf`, { elements });
      const backendUrl = process.env.REACT_APP_BACKEND_URL || '';
      const pdfUrl = `${backendUrl}${res.data.pdf_url}`;
      window.open(pdfUrl, '_blank');
      toast.success('PDF généré !');
    } catch (err) {
      toast.error('Erreur de génération PDF');
      console.error(err);
    } finally {
      setGenerating(false);
    }
  };

  // ========= Upload new document =========
  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const formData = new FormData();
    formData.append('file', file);
    
    try {
      setLoading(true);
      const res = await axios.post('/api/documents/upload-file', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      toast.success('Document uploadé !');
      navigate(`/document-editor/${res.data.document.id}`);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erreur upload');
    } finally {
      setLoading(false);
    }
  };

  // ========= Image upload for element =========
  const handleImageUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file || !uploadTarget) return;
    
    const reader = new FileReader();
    reader.onload = (event) => {
      updateElement(uploadTarget, { imageData: event.target.result });
      commitUpdate();
      setShowImageUpload(false);
      setUploadTarget(null);
    };
    reader.readAsDataURL(file);
  };

  // ========= Click on canvas (add element if tool active) =========
  const handleCanvasClick = (e) => {
    if (activeTool === 'select') {
      setSelectedElementId(null);
      return;
    }
    
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / zoom;
    const y = (e.clientY - rect.top) / zoom;
    
    if (activeTool === 'text') addElement('text', { x, y });
    else if (activeTool === 'date') addElement('date', { x, y });
    else if (activeTool === 'checkbox') addElement('checkbox', { x, y });
    else if (activeTool === 'image') addElement('image', { x, y });
    else if (activeTool === 'signature') addElement('signature', { x, y });
  };

  // ========= Keyboard shortcuts =========
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.ctrlKey && e.key === 'z') { e.preventDefault(); undo(); }
      if (e.ctrlKey && e.key === 'y') { e.preventDefault(); redo(); }
      if (e.ctrlKey && e.key === 's') { e.preventDefault(); saveOverlay(); }
      if (e.key === 'Delete' && selectedElementId) { deleteElement(selectedElementId); }
      if (e.key === 'Escape') { setSelectedElementId(null); setActiveTool('select'); }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedElementId, elements, historyIndex]);

  // ========= Selected element =========
  const selectedElement = elements.find(el => el.id === selectedElementId);

  // ========= Get current page info =========
  const currentPageInfo = document?.pages?.[currentPage - 1];
  const pageCount = document?.page_count || 1;
  const backendUrl = process.env.REACT_APP_BACKEND_URL || '';

  // ========= RENDER: No document - show upload =========
  if (!docId && !loading) {
    return (
      <div className="min-h-screen bg-gray-100 dark:bg-gray-900 p-6">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center gap-3 mb-6">
            <Button variant="ghost" onClick={() => navigate('/documents')}>
              <ArrowLeft className="h-4 w-4 mr-2" /> Retour
            </Button>
            <h1 className="text-2xl font-bold">Éditeur de Documents</h1>
          </div>

          <Card className="border-2 border-dashed border-primary/30">
            <CardContent className="flex flex-col items-center justify-center py-20">
              <FileUp className="h-20 w-20 text-primary/40 mb-6" />
              <h2 className="text-xl font-semibold mb-2">Uploader un document</h2>
              <p className="text-muted-foreground mb-6 text-center max-w-md">
                Uploadez un PDF, une image ou un document Word pour commencer l'édition avec l'éditeur visuel
              </p>
              <p className="text-xs text-muted-foreground mb-4">
                Formats acceptés : PDF, JPG, PNG, GIF, WebP, DOC, DOCX
              </p>
              <label className="cursor-pointer">
                <input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.gif,.webp,.doc,.docx"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <Button size="lg" asChild>
                  <span>
                    <Upload className="mr-2 h-5 w-5" />
                    Choisir un fichier
                  </span>
                </Button>
              </label>
            </CardContent>
          </Card>

          {/* Recent documents list */}
          <RecentDocuments navigate={navigate} />
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 dark:bg-gray-900 flex items-center justify-center">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  if (!document) {
    return (
      <div className="min-h-screen bg-gray-100 dark:bg-gray-900 flex items-center justify-center">
        <p className="text-muted-foreground">Document non trouvé</p>
      </div>
    );
  }

  // ========= MAIN EDITOR RENDER =========
  return (
    <div className={`flex flex-col bg-gray-100 dark:bg-gray-900 ${isFullscreen ? 'fixed inset-0 z-50' : 'min-h-screen'}`}>
      {/* ===== TOP TOOLBAR ===== */}
      <div className="bg-white dark:bg-gray-800 border-b shadow-sm px-4 py-2 flex items-center gap-2 flex-wrap">
        {/* Back + Title */}
        <Button variant="ghost" size="sm" onClick={() => navigate('/documents')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-shrink-0 mr-2">
          <h2 className="text-sm font-semibold truncate max-w-[200px]" title={document.name}>
            {document.name}
          </h2>
        </div>

        <div className="w-px h-6 bg-border" />

        {/* Tool Selection */}
        <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
          <ToolButton icon={MousePointer} label="Sélection" active={activeTool === 'select'} onClick={() => setActiveTool('select')} />
          <ToolButton icon={Type} label="Texte" active={activeTool === 'text'} onClick={() => setActiveTool('text')} />
          <ToolButton icon={Image} label="Image" active={activeTool === 'image'} onClick={() => setActiveTool('image')} />
          <ToolButton icon={Pen} label="Signature" active={activeTool === 'signature'} onClick={() => setActiveTool('signature')} />
          <ToolButton icon={CheckSquare} label="Case" active={activeTool === 'checkbox'} onClick={() => setActiveTool('checkbox')} />
          <ToolButton icon={Calendar} label="Date" active={activeTool === 'date'} onClick={() => setActiveTool('date')} />
        </div>

        <div className="w-px h-6 bg-border" />

        {/* Element Properties (when selected) */}
        {selectedElement && (selectedElement.type === 'text' || selectedElement.type === 'date') && (
          <div className="flex items-center gap-2">
            <select
              value={selectedElement.fontSize || 16}
              onChange={(e) => { updateElement(selectedElementId, { fontSize: parseInt(e.target.value) }); commitUpdate(); }}
              className="h-8 rounded border bg-background px-2 text-sm"
            >
              {[8, 10, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48].map(s => (
                <option key={s} value={s}>{s}px</option>
              ))}
            </select>
            <input
              type="color"
              value={selectedElement.color || '#000000'}
              onChange={(e) => { updateElement(selectedElementId, { color: e.target.value }); commitUpdate(); }}
              className="h-8 w-8 rounded border cursor-pointer"
            />
            <Button
              variant={selectedElement.bold ? 'default' : 'outline'}
              size="sm"
              className="h-8 w-8 p-0"
              onClick={() => { updateElement(selectedElementId, { bold: !selectedElement.bold }); commitUpdate(); }}
            >
              <Bold className="h-3 w-3" />
            </Button>
            <Button
              variant={selectedElement.italic ? 'default' : 'outline'}
              size="sm"
              className="h-8 w-8 p-0"
              onClick={() => { updateElement(selectedElementId, { italic: !selectedElement.italic }); commitUpdate(); }}
            >
              <Italic className="h-3 w-3" />
            </Button>
            <div className="w-px h-6 bg-border" />
          </div>
        )}

        {/* Undo/Redo */}
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={undo} disabled={historyIndex <= 0} className="h-8 w-8 p-0">
            <Undo2 className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={redo} disabled={historyIndex >= history.length - 1} className="h-8 w-8 p-0">
            <Redo2 className="h-4 w-4" />
          </Button>
        </div>

        <div className="w-px h-6 bg-border" />

        {/* Zoom */}
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={() => setZoom(z => Math.max(0.25, z - 0.25))} className="h-8 w-8 p-0">
            <ZoomOut className="h-4 w-4" />
          </Button>
          <span className="text-xs font-medium min-w-[40px] text-center">{Math.round(zoom * 100)}%</span>
          <Button variant="ghost" size="sm" onClick={() => setZoom(z => Math.min(3, z + 0.25))} className="h-8 w-8 p-0">
            <ZoomIn className="h-4 w-4" />
          </Button>
        </div>

        <div className="w-px h-6 bg-border" />

        {/* Fullscreen */}
        <Button variant="ghost" size="sm" onClick={() => setIsFullscreen(!isFullscreen)} className="h-8 w-8 p-0">
          {isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
        </Button>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Save & Generate */}
        <Button variant="ghost" size="sm" onClick={() => setShowHistory(true)}>
          <History className="h-4 w-4 mr-1" /> Historique
        </Button>
        <Button variant="outline" size="sm" onClick={saveOverlay} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
          Sauvegarder
        </Button>
        <Button size="sm" onClick={generatePDF} disabled={generating}>
          {generating ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Download className="h-4 w-4 mr-1" />}
          Générer PDF
        </Button>
      </div>

      {/* ===== EDITOR CANVAS ===== */}
      <div ref={containerRef} className="flex-1 overflow-auto bg-gray-200 dark:bg-gray-800 p-6">
        <div
          ref={editorRef}
          className="relative mx-auto shadow-2xl bg-white"
          style={{
            width: `${(currentPageInfo?.width || 800) * zoom}px`,
            height: `${(currentPageInfo?.height || 1100) * zoom}px`,
            transform: `scale(1)`,
            transformOrigin: 'top center',
            cursor: activeTool !== 'select' ? 'crosshair' : 'default'
          }}
          onClick={handleCanvasClick}
        >
          {/* Document Background */}
          {currentPageInfo?.image_url && (
            <img
              src={`${backendUrl}${currentPageInfo.image_url}`}
              alt={`Page ${currentPage}`}
              className="absolute inset-0 w-full h-full"
              style={{ pointerEvents: 'none', imageRendering: 'auto' }}
              draggable={false}
            />
          )}
          {currentPageInfo?.html_content && (
            <div
              className="absolute inset-0 p-8 overflow-auto"
              style={{ pointerEvents: 'none' }}
              dangerouslySetInnerHTML={{ __html: currentPageInfo.html_content }}
            />
          )}

          {/* Overlay Elements */}
          <div className="absolute inset-0" style={{ transform: `scale(${zoom})`, transformOrigin: 'top left' }}>
            {elements
              .filter(el => el.page === currentPage)
              .map(el => (
                <OverlayElement
                  key={el.id}
                  element={el}
                  isSelected={selectedElementId === el.id}
                  onSelect={setSelectedElementId}
                  onUpdate={(id, updates) => updateElement(id, updates)}
                  onDelete={deleteElement}
                  zoom={zoom}
                />
              ))}
          </div>
        </div>
      </div>

      {/* ===== PAGE NAVIGATION ===== */}
      {pageCount > 1 && (
        <div className="bg-white dark:bg-gray-800 border-t px-4 py-2 flex items-center justify-center gap-4">
          <Button
            variant="outline"
            size="sm"
            disabled={currentPage <= 1}
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
          >
            Page précédente
          </Button>
          <span className="text-sm font-medium">
            Page {currentPage} / {pageCount}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={currentPage >= pageCount}
            onClick={() => setCurrentPage(p => Math.min(pageCount, p + 1))}
          >
            Page suivante
          </Button>
        </div>
      )}

      {/* ===== IMAGE UPLOAD DIALOG ===== */}
      <Dialog open={showImageUpload} onOpenChange={setShowImageUpload}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ajouter une image</DialogTitle>
            <DialogDescription>Sélectionnez une image à ajouter sur le document</DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Input
              type="file"
              accept="image/*"
              onChange={handleImageUpload}
            />
          </div>
        </DialogContent>
      </Dialog>

      {/* ===== HISTORY DIALOG ===== */}
      <Dialog open={showHistory} onOpenChange={setShowHistory}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Historique des versions</DialogTitle>
            <DialogDescription>Versions sauvegardées de ce document</DialogDescription>
          </DialogHeader>
          <div className="max-h-[400px] overflow-y-auto space-y-2 py-2">
            {document?.history?.length > 0 ? (
              document.history.slice().reverse().map((h, idx) => (
                <div key={h.id || idx} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                  <div>
                    <p className="text-sm font-medium">Version {document.history.length - idx}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(h.saved_at).toLocaleString('fr-FR')}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setElements(h.overlay_elements || []);
                      pushHistory(h.overlay_elements || []);
                      setShowHistory(false);
                      toast.success('Version restaurée');
                    }}
                  >
                    <RotateCcw className="h-3 w-3 mr-1" />
                    Restaurer
                  </Button>
                </div>
              ))
            ) : (
              <p className="text-center text-sm text-muted-foreground py-8">
                Aucun historique disponible. Sauvegardez pour créer une version.
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

// ========= Tool Button Component =========
const ToolButton = ({ icon: Icon, label, active, onClick }) => (
  <button
    onClick={onClick}
    title={label}
    className={`h-8 w-8 rounded flex items-center justify-center transition-colors ${
      active ? 'bg-primary text-primary-foreground shadow-sm' : 'hover:bg-accent text-muted-foreground hover:text-foreground'
    }`}
  >
    <Icon className="h-4 w-4" />
  </button>
);

// ========= Recent Documents Sub-component =========
const RecentDocuments = ({ navigate }) => {
  const [docs, setDocs] = useState([]);
  const [loadingDocs, setLoadingDocs] = useState(true);

  useEffect(() => {
    const fetchDocs = async () => {
      try {
        const res = await axios.get('/api/documents/editor-docs');
        setDocs(res.data.documents || []);
      } catch (err) {
        console.error(err);
      } finally {
        setLoadingDocs(false);
      }
    };
    fetchDocs();
  }, []);

  const handleDelete = async (id) => {
    try {
      await axios.delete(`/api/documents/editor-docs/${id}`);
      setDocs(prev => prev.filter(d => d.id !== id));
      toast.success('Document supprimé');
    } catch (err) {
      toast.error('Erreur suppression');
    }
  };

  if (loadingDocs) return <div className="mt-6 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></div>;
  if (docs.length === 0) return null;

  return (
    <div className="mt-8">
      <h3 className="text-lg font-semibold mb-4">Documents récents</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {docs.map(doc => (
          <Card key={doc.id} className="cursor-pointer hover:shadow-lg transition-shadow group">
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0" onClick={() => navigate(`/document-editor/${doc.id}`)}>
                  <div className="flex items-center gap-2 mb-2">
                    <FileText className="h-5 w-5 text-primary flex-shrink-0" />
                    <p className="font-medium text-sm truncate">{doc.name}</p>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {doc.page_count || 1} page(s) • {doc.file_type?.toUpperCase()}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {new Date(doc.updated_at).toLocaleDateString('fr-FR')}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100"
                  onClick={(e) => { e.stopPropagation(); handleDelete(doc.id); }}
                >
                  <Trash2 className="h-4 w-4 text-red-500" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default DocumentEditor;
