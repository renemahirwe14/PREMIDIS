import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import DashboardLayout from '../components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';
import { 
  FileText, Loader2, Eye, Edit, Trash2, Printer, 
  Calendar, User, Filter, Search, Download
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../components/ui/dialog';
import api from '../config/api';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

const DocumentsRHHistory = () => {
  const { user, isAdmin } = useAuth();
  const { t } = useLanguage();
  const [documents, setDocuments] = useState([]);
  const [filteredDocuments, setFilteredDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedDocument, setSelectedDocument] = useState(null);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);

  useEffect(() => {
    fetchDocuments();
  }, []);

  useEffect(() => {
    filterDocuments();
  }, [documents, searchTerm, statusFilter]);

  const fetchDocuments = async () => {
    setLoading(true);
    try {
      const response = await api.get('/api/hr-documents');
      setDocuments(response.data.documents || []);
    } catch (error) {
      console.error('Erreur lors du chargement des documents:', error);
      toast.error('Erreur lors du chargement des documents');
    } finally {
      setLoading(false);
    }
  };

  const filterDocuments = () => {
    let filtered = [...documents];

    // Filtre par recherche
    if (searchTerm) {
      filtered = filtered.filter(doc => 
        doc.employee_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        doc.template_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        doc.document_type?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Filtre par statut
    if (statusFilter !== 'all') {
      filtered = filtered.filter(doc => doc.status === statusFilter);
    }

    setFilteredDocuments(filtered);
  };

  const handleViewDocument = (doc) => {
    setSelectedDocument(doc);
    setViewDialogOpen(true);
  };

  const handlePrintDocument = (doc) => {
    // Créer une fenêtre d'impression avec le contenu du document
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Document - ${doc.template_name}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 40px; }
            @media print {
              body { padding: 20px; }
            }
            input[type="checkbox"] {
              -webkit-appearance: checkbox;
              -moz-appearance: checkbox;
              appearance: checkbox;
            }
          </style>
        </head>
        <body>
          ${doc.content}
          <script>
            // Auto-print when loaded
            window.onload = function() {
              window.print();
            }
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const handleDeleteDocument = async (docId) => {
    if (!window.confirm('Êtes-vous sûr de vouloir supprimer ce document ?')) {
      return;
    }

    try {
      await api.delete(`/api/hr-documents/${docId}`);
      toast.success('Document supprimé');
      fetchDocuments();
    } catch (error) {
      toast.error('Erreur lors de la suppression');
    }
  };

  const getStatusBadge = (status) => {
    const styles = {
      draft: { bg: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200', label: 'Brouillon' },
      pending_approval: { bg: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200', label: 'En attente' },
      approved: { bg: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200', label: 'Approuvé' },
      rejected: { bg: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200', label: 'Rejeté' }
    };

    const style = styles[status] || styles.draft;
    return <Badge className={style.bg}>{style.label}</Badge>;
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    try {
      return format(new Date(dateString), 'dd MMMM yyyy à HH:mm', { locale: fr });
    } catch {
      return dateString;
    }
  };

  if (!isAdmin()) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-96">
          <div className="text-center">
            <FileText className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
            <h2 className="text-xl font-semibold">Accès refusé</h2>
            <p className="text-muted-foreground">Seuls les administrateurs peuvent accéder à l'historique des documents</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6" data-testid="documents-rh-history-page">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <FileText className="h-8 w-8 text-primary" />
            Historique des Documents RH
          </h1>
          <p className="text-muted-foreground">Tous les documents générés automatiquement</p>
        </div>

        {/* Stats */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{documents.length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">Brouillons</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{documents.filter(d => d.status === 'draft').length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">Approuvés</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{documents.filter(d => d.status === 'approved').length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">En attente</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{documents.filter(d => d.status === 'pending_approval').length}</div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Rechercher par nom, type, employé..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              <div className="flex gap-2">
                <Button
                  variant={statusFilter === 'all' ? 'default' : 'outline'}
                  onClick={() => setStatusFilter('all')}
                  size="sm"
                >
                  Tous
                </Button>
                <Button
                  variant={statusFilter === 'draft' ? 'default' : 'outline'}
                  onClick={() => setStatusFilter('draft')}
                  size="sm"
                >
                  Brouillons
                </Button>
                <Button
                  variant={statusFilter === 'approved' ? 'default' : 'outline'}
                  onClick={() => setStatusFilter('approved')}
                  size="sm"
                >
                  Approuvés
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Documents List */}
        <Card>
          <CardHeader>
            <CardTitle>Documents générés ({filteredDocuments.length})</CardTitle>
            <CardDescription>
              Liste de tous les documents générés automatiquement depuis le module Congés
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : filteredDocuments.length === 0 ? (
              <div className="text-center py-8">
                <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p className="text-muted-foreground">Aucun document trouvé</p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredDocuments.map((doc) => (
                  <div
                    key={doc.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-lg border bg-card hover:bg-muted/50 transition-colors gap-4"
                  >
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-3">
                        <FileText className="h-5 w-5 text-primary flex-shrink-0" />
                        <div>
                          <p className="font-semibold">{doc.template_name || 'Document sans nom'}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge variant="secondary" className="text-xs">{doc.document_type || 'Document'}</Badge>
                            {getStatusBadge(doc.status)}
                          </div>
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm text-muted-foreground pl-8">
                        <div className="flex items-center gap-2">
                          <User className="h-3 w-3" />
                          <span>Employé: {doc.employee_name || 'N/A'}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Calendar className="h-3 w-3" />
                          <span>Créé: {formatDate(doc.created_at)}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <User className="h-3 w-3" />
                          <span>Par: {doc.created_by_name || 'N/A'}</span>
                        </div>
                        {doc.period_start && doc.period_end && (
                          <div className="flex items-center gap-2">
                            <Calendar className="h-3 w-3" />
                            <span>Période: {doc.period_start} → {doc.period_end}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleViewDocument(doc)}
                      >
                        <Eye className="h-4 w-4 mr-1" />
                        Voir
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handlePrintDocument(doc)}
                      >
                        <Printer className="h-4 w-4 mr-1" />
                        Imprimer
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => handleDeleteDocument(doc.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* View Document Dialog */}
        <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary" />
                {selectedDocument?.template_name}
              </DialogTitle>
              <DialogDescription>
                Document généré le {selectedDocument && formatDate(selectedDocument.created_at)}
              </DialogDescription>
            </DialogHeader>
            
            {selectedDocument && (
              <div className="space-y-4">
                {/* Metadata */}
                <div className="grid grid-cols-2 gap-4 p-4 bg-muted rounded-lg">
                  <div>
                    <p className="text-sm text-muted-foreground">Employé</p>
                    <p className="font-medium">{selectedDocument.employee_name}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Statut</p>
                    <div className="mt-1">{getStatusBadge(selectedDocument.status)}</div>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Créé par</p>
                    <p className="font-medium">{selectedDocument.created_by_name}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Date de création</p>
                    <p className="font-medium">{formatDate(selectedDocument.created_at)}</p>
                  </div>
                </div>

                {/* Document Content */}
                <div 
                  className="border rounded-lg p-6 bg-white"
                  dangerouslySetInnerHTML={{ __html: selectedDocument.content }}
                />

                {/* Actions */}
                <div className="flex justify-end gap-2">
                  <Button
                    variant="outline"
                    onClick={() => handlePrintDocument(selectedDocument)}
                  >
                    <Printer className="h-4 w-4 mr-2" />
                    Imprimer
                  </Button>
                  <Button onClick={() => setViewDialogOpen(false)}>
                    Fermer
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
};

export default DocumentsRHHistory;
