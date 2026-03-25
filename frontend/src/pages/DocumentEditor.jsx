import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useNavigate, useParams } from 'react-router-dom';
import DashboardLayout from '../components/layout/DashboardLayout';
import axios from '../config/api';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { toast } from 'sonner';
import {
  ArrowLeft, Save, Download, FileText, Upload, Plus, Trash2, 
  ZoomIn, ZoomOut, Undo2, Redo2, Type, Image, CheckSquare, Calendar,
  Pen, Loader2, Eye, Maximize, Minimize,
  Bold, Italic, MousePointer, FileUp, History, RotateCcw, X, Edit3
} from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
  DialogDescription
} from '../components/ui/dialog';

// ===================== OVERLAY ELEMENT COMPONENT =====================
const OverlayElement = ({ element, isSelected, onSelect, onUpdate, onDelete, zoom, containerRect }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0, elemX: 0, elemY: 0 });

  const handleMouseDown = (e) => {
    if (isEditing) return;
    e.stopPropagation();
    e.preventDefault();
    onSelect(element.id);
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      elemX: element.x,
      elemY: element.y
    };
    setIsDragging(true);

    const handleMouseMove = (moveEvent) => {
      const dx = (moveEvent.clientX - dragStartRef.current.x) / zoom;
      const dy = (moveEvent.clientY - dragStartRef.current.y) / zoom;
      onUpdate(element.id, {
        x: Math.max(0, dragStartRef.current.elemX + dx),
        y: Math.max(0, dragStartRef.current.elemY + dy)
      });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
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
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); e.target.blur(); }
    if (e.key === 'Escape') setIsEditing(false);
  };

  const baseStyle = {
    position: 'absolute',
    left: `${element.x}px`,
    top: `${element.y}px`,
    cursor: isDragging ? 'grabbing' : (isEditing ? 'text' : 'grab'),
    zIndex: isSelected ? 100 : 10,
    userSelect: isEditing ? 'text' : 'none',
    outline: isSelected ? '2px solid #3b82f6' : 'none',
    outlineOffset: '3px',
    borderRadius: '3px',
    minWidth: '20px',
    minHeight: '20px',
  };

  return (
    <div
      style={baseStyle}
      onMouseDown={handleMouseDown}
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
            padding: '2px 6px',
            background: isEditing ? 'rgba(255,255,255,0.95)' : (isSelected ? 'rgba(59,130,246,0.05)' : 'transparent'),
            whiteSpace: 'pre-wrap',
            minWidth: '60px',
            borderRadius: '2px',
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
            padding: '3px 8px',
            background: isEditing ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.6)',
            border: '1px dashed #aaa',
            borderRadius: '4px',
          }}
        >
          {element.content || new Date().toLocaleDateString('fr-FR')}
        </div>
      )}

      {element.type === 'checkbox' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '3px', background: 'rgba(255,255,255,0.5)', borderRadius: '3px' }}>
          <input
            type="checkbox"
            checked={element.checked || false}
            onChange={() => onUpdate(element.id, { checked: !element.checked })}
            style={{ width: '20px', height: '20px', cursor: 'pointer', accentColor: '#3b82f6' }}
          />
          {element.label && <span style={{ fontSize: '13px' }}>{element.label}</span>}
        </div>
      )}

      {element.type === 'image' && (
        <div style={{
          width: `${element.width || 150}px`,
          height: `${element.height || 100}px`,
          overflow: 'hidden',
          border: isSelected ? 'none' : '1px dashed #ccc',
          borderRadius: '4px',
          background: 'rgba(255,255,255,0.3)',
        }}>
          {element.imageData ? (
            <img src={element.imageData} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} draggable={false} />
          ) : (
            <div className="flex items-center justify-center h-full text-gray-400 text-xs">
              <Image className="h-8 w-8" />
            </div>
          )}
        </div>
      )}

      {element.type === 'signature' && (
        <div style={{
          width: `${element.width || 200}px`,
          height: `${element.height || 60}px`,
          border: '2px dashed #888',
          borderRadius: '6px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(255,255,255,0.7)',
        }}>
          {element.imageData ? (
            <img src={element.imageData} alt="Signature" style={{ maxWidth: '100%', maxHeight: '100%' }} draggable={false} />
          ) : (
            <span style={{ fontSize: '12px', color: '#888' }}>✍ Signature</span>
          )}
        </div>
      )}

      {/* Delete + position indicator */}
      {isSelected && !isEditing && (
        <>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(element.id); }}
            className="absolute -top-3 -right-3 bg-red-500 hover:bg-red-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs shadow-lg transition-colors"
            title="Supprimer"
          >
            <X className="h-3 w-3" />
          </button>
          <div className="absolute -bottom-5 left-0 text-[9px] text-blue-500 font-mono opacity-60">
            x:{Math.round(element.x)} y:{Math.round(element.y)}
          </div>
        </>
      )}
    </div>
  );
};

// ===================== TOOL BUTTON =====================
const ToolButton = ({ icon: Icon, label, active, onClick }) => (
  <button
    onClick={onClick}
    title={label}
    className={`h-9 w-9 rounded-lg flex items-center justify-center transition-all ${
      active 
        ? 'bg-primary text-primary-foreground shadow-md scale-105' 
        : 'hover:bg-accent text-muted-foreground hover:text-foreground'
    }`}
  >
    <Icon className="h-4 w-4" />
  </button>
);

// ===================== MAIN DOCUMENT EDITOR =====================
const DocumentEditor = () => {
  const { user, isAdmin } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const { docId } = useParams();

  // View mode
  const [view, setView] = useState(docId ? 'editor' : 'list');
  
  // Document list
  const [documents, setDocuments] = useState([]);
  const [listLoading, setListLoading] = useState(true);

  // Editor state
  const [document, setDocument] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Overlay elements
  const [elements, setElements] = useState([]);
  const [selectedElementId, setSelectedElementId] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [zoom, setZoom] = useState(0.75);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [activeTool, setActiveTool] = useState('select');

  // History (undo/redo)
  const [undoStack, setUndoStack] = useState([]);
  const [redoStack, setRedoStack] = useState([]);

  // Dialogs
  const [showImageUpload, setShowImageUpload] = useState(false);
  const [uploadTarget, setUploadTarget] = useState(null);
  const [showHistory, setShowHistory] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const editorRef = useRef(null);

  // ========= Fetch documents list =========
  useEffect(() => {
    fetchDocuments();
  }, []);

  useEffect(() => {
    if (docId) {
      loadDocument(docId);
      setView('editor');
    }
  }, [docId]);

  const fetchDocuments = async () => {
    try {
      setListLoading(true);
      const res = await axios.get('/api/documents/editor-docs');
      setDocuments(res.data.documents || []);
    } catch (err) {
      console.error('Error fetching documents:', err);
    } finally {
      setListLoading(false);
    }
  };

  const loadDocument = async (id) => {
    try {
      setLoading(true);
      const res = await axios.get(`/api/documents/editor-docs/${id}`);
      setDocument(res.data);
      setElements(res.data.overlay_elements || []);
      setUndoStack([JSON.stringify(res.data.overlay_elements || [])]);
      setRedoStack([]);
      setCurrentPage(1);
      setSelectedElementId(null);
    } catch (err) {
      toast.error('Erreur chargement document');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // ========= Undo/Redo =========
  const pushUndo = useCallback((newElements) => {
    setUndoStack(prev => [...prev, JSON.stringify(newElements)]);
    setRedoStack([]);
  }, []);

  const undo = () => {
    if (undoStack.length <= 1) return;
    const current = undoStack[undoStack.length - 1];
    const prev = undoStack[undoStack.length - 2];
    setRedoStack(r => [...r, current]);
    setUndoStack(u => u.slice(0, -1));
    setElements(JSON.parse(prev));
  };

  const redo = () => {
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    setRedoStack(r => r.slice(0, -1));
    setUndoStack(u => [...u, next]);
    setElements(JSON.parse(next));
  };

  // ========= Element operations =========
  const addElement = (type, extraProps = {}) => {
    const id = `el_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
    const newElement = {
      id, type,
      x: 80 + Math.random() * 150,
      y: 80 + Math.random() * 150,
      page: currentPage,
      content: type === 'text' ? 'Nouveau texte' : type === 'date' ? new Date().toLocaleDateString('fr-FR') : '',
      fontSize: 16, color: '#000000', bold: false, italic: false, checked: false,
      width: type === 'image' ? 150 : type === 'signature' ? 200 : undefined,
      height: type === 'image' ? 100 : type === 'signature' ? 60 : undefined,
      ...extraProps
    };
    const newElements = [...elements, newElement];
    setElements(newElements);
    setSelectedElementId(id);
    pushUndo(newElements);
    setActiveTool('select');
    if (type === 'image') { setUploadTarget(id); setShowImageUpload(true); }
  };

  const updateElement = (id, updates) => {
    setElements(prev => prev.map(el => el.id === id ? { ...el, ...updates } : el));
  };

  const commitElements = () => pushUndo(elements);

  const deleteElement = (id) => {
    const newElements = elements.filter(el => el.id !== id);
    setElements(newElements);
    setSelectedElementId(null);
    pushUndo(newElements);
  };

  // ========= Save =========
  const saveOverlay = async () => {
    if (!document) return;
    try {
      setSaving(true);
      await axios.put(`/api/documents/editor-docs/${document.id}/overlay`, { elements });
      toast.success('Sauvegardé !');
      // Refresh document to get updated history
      const res = await axios.get(`/api/documents/editor-docs/${document.id}`);
      setDocument(res.data);
    } catch (err) {
      toast.error('Erreur de sauvegarde');
    } finally { setSaving(false); }
  };

  // ========= Generate PDF =========
  const generatePDF = async () => {
    if (!document) return;
    try {
      setGenerating(true);
      const res = await axios.post(`/api/documents/editor-docs/${document.id}/generate-pdf`, { elements });
      const backendUrl = process.env.REACT_APP_BACKEND_URL || '';
      window.open(`${backendUrl}${res.data.pdf_url}`, '_blank');
      toast.success('PDF généré !');
    } catch (err) {
      toast.error('Erreur de génération PDF');
    } finally { setGenerating(false); }
  };

  // ========= Upload =========
  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    try {
      setUploading(true);
      const res = await axios.post('/api/documents/upload-file', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      toast.success('Document uploadé !');
      fetchDocuments();
      navigate(`/document-editor/${res.data.document.id}`);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erreur upload');
    } finally { setUploading(false); e.target.value = ''; }
  };

  // ========= Image upload for element =========
  const handleImageUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file || !uploadTarget) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      updateElement(uploadTarget, { imageData: ev.target.result });
      commitElements();
      setShowImageUpload(false);
      setUploadTarget(null);
    };
    reader.readAsDataURL(file);
  };

  // ========= Canvas click =========
  const handleCanvasClick = (e) => {
    if (activeTool === 'select') { setSelectedElementId(null); return; }
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / zoom;
    const y = (e.clientY - rect.top) / zoom;
    addElement(activeTool, { x, y });
  };

  // ========= Delete document =========
  const handleDeleteDocument = async (id) => {
    try {
      await axios.delete(`/api/documents/editor-docs/${id}`);
      toast.success('Document supprimé');
      setDocuments(prev => prev.filter(d => d.id !== id));
      setDeleteConfirm(null);
      if (document?.id === id) { setDocument(null); setView('list'); }
    } catch (err) { toast.error('Erreur suppression'); }
  };

  // ========= Keyboard shortcuts =========
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (view !== 'editor') return;
      if (e.ctrlKey && e.key === 'z') { e.preventDefault(); undo(); }
      if (e.ctrlKey && e.key === 'y') { e.preventDefault(); redo(); }
      if (e.ctrlKey && e.key === 's') { e.preventDefault(); saveOverlay(); }
      if (e.key === 'Delete' && selectedElementId) deleteElement(selectedElementId);
      if (e.key === 'Escape') { setSelectedElementId(null); setActiveTool('select'); }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [view, selectedElementId, elements, undoStack]);

  const selectedElement = elements.find(el => el.id === selectedElementId);
  const currentPageInfo = document?.pages?.[currentPage - 1];
  const pageCount = document?.page_count || 1;
  const backendUrl = process.env.REACT_APP_BACKEND_URL || '';

  // ========= FORMAT FILE SIZE =========
  const formatSize = (bytes) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
  };

  // ======================================================
  // FULLSCREEN EDITOR (breaks out of layout)
  // ======================================================
  if (isFullscreen && document) {
    return renderEditor(true);
  }

  // ======================================================
  // RENDER WITH DASHBOARD LAYOUT
  // ======================================================
  function renderEditor(fullscreen = false) {
    const wrapperClass = fullscreen 
      ? 'fixed inset-0 z-[9999] flex flex-col bg-background' 
      : 'flex flex-col h-[calc(100vh-8rem)]';

    return (
      <div className={wrapperClass}>
        {/* TOOLBAR */}
        <div className="bg-card border-b shadow-sm px-3 py-2 flex items-center gap-2 flex-wrap shrink-0">
          {fullscreen && (
            <Button variant="ghost" size="sm" onClick={() => setIsFullscreen(false)} className="mr-1">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          )}
          
          <div className="flex-shrink-0 mr-2 max-w-[180px]">
            <p className="text-sm font-semibold truncate" title={document?.name}>{document?.name}</p>
          </div>

          <div className="w-px h-6 bg-border" />

          {/* Tools */}
          <div className="flex items-center gap-0.5 bg-muted dark:bg-muted/50 rounded-lg p-1">
            <ToolButton icon={MousePointer} label="Sélection" active={activeTool === 'select'} onClick={() => setActiveTool('select')} />
            <ToolButton icon={Type} label="Texte" active={activeTool === 'text'} onClick={() => setActiveTool('text')} />
            <ToolButton icon={Image} label="Image" active={activeTool === 'image'} onClick={() => setActiveTool('image')} />
            <ToolButton icon={Pen} label="Signature" active={activeTool === 'signature'} onClick={() => setActiveTool('signature')} />
            <ToolButton icon={CheckSquare} label="Case" active={activeTool === 'checkbox'} onClick={() => setActiveTool('checkbox')} />
            <ToolButton icon={Calendar} label="Date" active={activeTool === 'date'} onClick={() => setActiveTool('date')} />
          </div>

          <div className="w-px h-6 bg-border" />

          {/* Text properties */}
          {selectedElement && (selectedElement.type === 'text' || selectedElement.type === 'date') && (
            <div className="flex items-center gap-1.5">
              <select
                value={selectedElement.fontSize || 16}
                onChange={(e) => { updateElement(selectedElementId, { fontSize: parseInt(e.target.value) }); commitElements(); }}
                className="h-8 rounded-md border bg-background dark:bg-muted px-2 text-sm"
              >
                {[8, 10, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48].map(s => (
                  <option key={s} value={s}>{s}px</option>
                ))}
              </select>
              <input type="color" value={selectedElement.color || '#000000'}
                onChange={(e) => { updateElement(selectedElementId, { color: e.target.value }); commitElements(); }}
                className="h-8 w-8 rounded-md border cursor-pointer"
              />
              <Button variant={selectedElement.bold ? 'default' : 'outline'} size="sm" className="h-8 w-8 p-0"
                onClick={() => { updateElement(selectedElementId, { bold: !selectedElement.bold }); commitElements(); }}>
                <Bold className="h-3.5 w-3.5" />
              </Button>
              <Button variant={selectedElement.italic ? 'default' : 'outline'} size="sm" className="h-8 w-8 p-0"
                onClick={() => { updateElement(selectedElementId, { italic: !selectedElement.italic }); commitElements(); }}>
                <Italic className="h-3.5 w-3.5" />
              </Button>
              <div className="w-px h-6 bg-border" />
            </div>
          )}

          {/* Undo/Redo */}
          <Button variant="ghost" size="sm" onClick={undo} disabled={undoStack.length <= 1} className="h-8 w-8 p-0">
            <Undo2 className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={redo} disabled={redoStack.length === 0} className="h-8 w-8 p-0">
            <Redo2 className="h-4 w-4" />
          </Button>

          <div className="w-px h-6 bg-border" />

          {/* Zoom */}
          <Button variant="ghost" size="sm" onClick={() => setZoom(z => Math.max(0.25, z - 0.15))} className="h-8 w-8 p-0">
            <ZoomOut className="h-4 w-4" />
          </Button>
          <span className="text-xs font-mono min-w-[36px] text-center">{Math.round(zoom * 100)}%</span>
          <Button variant="ghost" size="sm" onClick={() => setZoom(z => Math.min(2, z + 0.15))} className="h-8 w-8 p-0">
            <ZoomIn className="h-4 w-4" />
          </Button>

          <div className="w-px h-6 bg-border" />

          <Button variant="ghost" size="sm" onClick={() => setIsFullscreen(!isFullscreen)} className="h-8 w-8 p-0">
            {isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
          </Button>

          <div className="flex-1" />

          {/* Actions */}
          <Button variant="ghost" size="sm" onClick={() => setShowHistory(true)}>
            <History className="h-4 w-4 mr-1" /> <span className="hidden md:inline">Historique</span>
          </Button>
          <Button variant="outline" size="sm" onClick={saveOverlay} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
            <span className="hidden md:inline">Sauvegarder</span>
          </Button>
          <Button size="sm" onClick={generatePDF} disabled={generating}>
            {generating ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Download className="h-4 w-4 mr-1" />}
            <span className="hidden md:inline">Générer PDF</span>
          </Button>
        </div>

        {/* CANVAS */}
        <div className="flex-1 overflow-auto bg-muted/50 dark:bg-muted/20" style={{ padding: '24px' }}>
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="h-10 w-10 animate-spin text-primary" />
            </div>
          ) : !currentPageInfo ? (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              <p>Document non trouvé</p>
            </div>
          ) : (
            <div
              ref={editorRef}
              className="relative mx-auto bg-white shadow-2xl rounded-sm"
              style={{
                width: `${(currentPageInfo.width || 800) * zoom}px`,
                height: `${(currentPageInfo.height || 1100) * zoom}px`,
                cursor: activeTool !== 'select' ? 'crosshair' : 'default',
              }}
              onClick={handleCanvasClick}
            >
              {/* Background image */}
              {currentPageInfo.image_url && (
                <img
                  src={`${backendUrl}${currentPageInfo.image_url}`}
                  alt={`Page ${currentPage}`}
                  className="absolute inset-0 w-full h-full rounded-sm"
                  style={{ pointerEvents: 'none' }}
                  draggable={false}
                  onError={(e) => { console.error('Image load error:', e.target.src); }}
                />
              )}
              {currentPageInfo.html_content && (
                <div
                  className="absolute inset-0 p-8 overflow-auto"
                  style={{ pointerEvents: 'none', transform: `scale(${zoom})`, transformOrigin: 'top left' }}
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
                      onUpdate={updateElement}
                      onDelete={deleteElement}
                      zoom={zoom}
                    />
                  ))}
              </div>
            </div>
          )}
        </div>

        {/* PAGE NAVIGATION */}
        {pageCount > 1 && (
          <div className="bg-card border-t px-4 py-2 flex items-center justify-center gap-4 shrink-0">
            <Button variant="outline" size="sm" disabled={currentPage <= 1}
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}>
              ← Précédente
            </Button>
            <span className="text-sm font-medium">Page {currentPage} / {pageCount}</span>
            <Button variant="outline" size="sm" disabled={currentPage >= pageCount}
              onClick={() => setCurrentPage(p => Math.min(pageCount, p + 1))}>
              Suivante →
            </Button>
          </div>
        )}

        {/* DIALOGS */}
        <Dialog open={showImageUpload} onOpenChange={setShowImageUpload}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Ajouter une image</DialogTitle>
              <DialogDescription>Sélectionnez une image à placer sur le document</DialogDescription>
            </DialogHeader>
            <Input type="file" accept="image/*" onChange={handleImageUpload} />
          </DialogContent>
        </Dialog>

        <Dialog open={showHistory} onOpenChange={setShowHistory}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Historique des versions</DialogTitle>
              <DialogDescription>Versions sauvegardées</DialogDescription>
            </DialogHeader>
            <div className="max-h-[400px] overflow-y-auto space-y-2 py-2">
              {document?.history?.length > 0 ? (
                document.history.slice().reverse().map((h, idx) => (
                  <div key={h.id || idx} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                    <div>
                      <p className="text-sm font-medium">Version {document.history.length - idx}</p>
                      <p className="text-xs text-muted-foreground">{new Date(h.saved_at).toLocaleString('fr-FR')}</p>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => {
                      setElements(h.overlay_elements || []);
                      pushUndo(h.overlay_elements || []);
                      setShowHistory(false);
                      toast.success('Version restaurée');
                    }}>
                      <RotateCcw className="h-3 w-3 mr-1" /> Restaurer
                    </Button>
                  </div>
                ))
              ) : (
                <p className="text-center text-sm text-muted-foreground py-8">
                  Aucun historique. Sauvegardez pour créer une version.
                </p>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // ======================================================
  // DOCUMENT LIST VIEW
  // ======================================================
  const renderList = () => (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold">Éditeur de Documents</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Uploadez et modifiez vos documents PDF, images et Word
          </p>
        </div>
        <label className="cursor-pointer">
          <input type="file" accept=".pdf,.jpg,.jpeg,.png,.gif,.webp,.doc,.docx" onChange={handleFileUpload} className="hidden" disabled={uploading} />
          <Button size="default" asChild disabled={uploading}>
            <span>
              {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
              Uploader un document
            </span>
          </Button>
        </label>
      </div>

      {listLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
        </div>
      ) : documents.length === 0 ? (
        <Card className="border-2 border-dashed border-primary/20">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <FileUp className="h-16 w-16 text-muted-foreground/30 mb-4" />
            <h3 className="text-lg font-semibold mb-2">Aucun document</h3>
            <p className="text-sm text-muted-foreground mb-4 text-center">
              Commencez par uploader un PDF, une image ou un document Word
            </p>
            <p className="text-xs text-muted-foreground mb-6">
              Formats : PDF, JPG, PNG, GIF, WebP, DOC, DOCX
            </p>
            <label className="cursor-pointer">
              <input type="file" accept=".pdf,.jpg,.jpeg,.png,.gif,.webp,.doc,.docx" onChange={handleFileUpload} className="hidden" />
              <Button size="lg" asChild>
                <span><Upload className="mr-2 h-5 w-5" /> Choisir un fichier</span>
              </Button>
            </label>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {documents.map(doc => (
            <Card key={doc.id} className="group hover:shadow-lg transition-all border hover:border-primary/30 overflow-hidden">
              {/* Thumbnail preview */}
              <div
                className="h-40 bg-muted/50 dark:bg-muted/20 flex items-center justify-center cursor-pointer overflow-hidden relative"
                onClick={() => navigate(`/document-editor/${doc.id}`)}
              >
                {doc.pages?.[0]?.image_url ? (
                  <img
                    src={`${backendUrl}${doc.pages[0].image_url}`}
                    alt={doc.name}
                    className="w-full h-full object-contain p-2"
                    onError={(e) => { e.target.style.display = 'none'; }}
                  />
                ) : (
                  <FileText className="h-12 w-12 text-muted-foreground/40" />
                )}
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                  <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="bg-primary text-primary-foreground px-4 py-2 rounded-lg shadow-lg text-sm font-medium flex items-center gap-2">
                      <Edit3 className="h-4 w-4" /> Ouvrir l'éditeur
                    </div>
                  </div>
                </div>
              </div>
              
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="min-w-0 flex-1" onClick={() => navigate(`/document-editor/${doc.id}`)} style={{cursor:'pointer'}}>
                    <p className="font-medium text-sm truncate">{doc.name}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                        {doc.file_type?.toUpperCase() || 'PDF'}
                      </span>
                      <span className="text-xs text-muted-foreground">{doc.page_count || 1} page(s)</span>
                      <span className="text-xs text-muted-foreground">{formatSize(doc.size)}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1.5">
                      {new Date(doc.updated_at || doc.created_at).toLocaleDateString('fr-FR', {
                        day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
                      })}
                    </p>
                  </div>
                  <Button
                    variant="ghost" size="sm"
                    className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 text-destructive hover:text-destructive"
                    onClick={(e) => { e.stopPropagation(); setDeleteConfirm(doc.id); }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Delete confirmation */}
      <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Supprimer ce document ?</DialogTitle>
            <DialogDescription>Cette action est irréversible. Le document et tous ses fichiers seront supprimés.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>Annuler</Button>
            <Button variant="destructive" onClick={() => handleDeleteDocument(deleteConfirm)}>Supprimer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );

  // ======================================================
  // MAIN RENDER
  // ======================================================
  return (
    <DashboardLayout>
      {view === 'list' && !docId && renderList()}
      {(view === 'editor' || docId) && (
        <div>
          {/* Back to list button */}
          <div className="flex items-center gap-3 mb-4">
            <Button variant="ghost" size="sm" onClick={() => { navigate('/document-editor'); setView('list'); setDocument(null); }}>
              <ArrowLeft className="h-4 w-4 mr-2" /> Retour à la liste
            </Button>
          </div>
          {renderEditor(false)}
        </div>
      )}
    </DashboardLayout>
  );
};

export default DocumentEditor;
