import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import DashboardLayout from '../components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { ScrollArea } from '../components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '../components/ui/dialog';
import { Separator } from '../components/ui/separator';
import { 
  Bell, Search, Filter, Calendar, CheckCircle, AlertCircle, 
  Info, Lock, Trash2, Eye, Check, RefreshCw, ChevronRight,
  Clock, AlertTriangle, XCircle, MessageSquare
} from 'lucide-react';
import axios from '../config/api';
import { format, formatDistanceToNow } from 'date-fns';
import { fr, enUS, hi } from 'date-fns/locale';
import { toast } from 'sonner';

const NotificationsModule = () => {
  const { user } = useAuth();
  const { t, language } = useLanguage();
  
  // State
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [skip, setSkip] = useState(0);
  const limit = 20;
  
  // Filters
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [periodFilter, setPeriodFilter] = useState('all');
  const [unreadOnly, setUnreadOnly] = useState(false);
  
  // Detail modal
  const [selectedNotification, setSelectedNotification] = useState(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  
  // Delete confirmation
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [notificationToDelete, setNotificationToDelete] = useState(null);

  // Get locale for date-fns
  const getLocale = () => {
    const locales = { fr, en: enUS, hi };
    return locales[language] || fr;
  };

  // Notification types config
  const typeConfig = {
    info: { 
      icon: Info, 
      color: 'text-blue-500', 
      bg: 'bg-blue-100 dark:bg-blue-900/30',
      label: t('notif.types.info')
    },
    success: { 
      icon: CheckCircle, 
      color: 'text-green-500', 
      bg: 'bg-green-100 dark:bg-green-900/30',
      label: t('notif.types.success')
    },
    warning: { 
      icon: AlertTriangle, 
      color: 'text-orange-500', 
      bg: 'bg-orange-100 dark:bg-orange-900/30',
      label: t('notif.types.warning')
    },
    error: { 
      icon: XCircle, 
      color: 'text-red-500', 
      bg: 'bg-red-100 dark:bg-red-900/30',
      label: t('notif.types.error')
    },
    login: { 
      icon: Lock, 
      color: 'text-purple-500', 
      bg: 'bg-purple-100 dark:bg-purple-900/30',
      label: t('notif.types.login')
    },
    leave: { 
      icon: Calendar, 
      color: 'text-cyan-500', 
      bg: 'bg-cyan-100 dark:bg-cyan-900/30',
      label: t('notif.types.leave')
    },
    leave_overlap: { 
      icon: AlertCircle, 
      color: 'text-yellow-500', 
      bg: 'bg-yellow-100 dark:bg-yellow-900/30',
      label: t('notif.types.leave_overlap')
    },
    leave_reminder: { 
      icon: Clock, 
      color: 'text-teal-500', 
      bg: 'bg-teal-100 dark:bg-teal-900/30',
      label: t('notif.types.leave_reminder')
    },
    custom: { 
      icon: MessageSquare, 
      color: 'text-primary', 
      bg: 'bg-primary/10',
      label: t('notif.types.custom')
    },
    system: { 
      icon: Bell, 
      color: 'text-gray-500', 
      bg: 'bg-gray-100 dark:bg-gray-800',
      label: t('notif.types.system')
    }
  };

  // Fetch notifications
  const fetchNotifications = useCallback(async (reset = false) => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      
      if (reset) {
        params.append('skip', '0');
        setSkip(0);
      } else {
        params.append('skip', skip.toString());
      }
      params.append('limit', limit.toString());
      
      if (search) params.append('search', search);
      if (typeFilter !== 'all') params.append('notification_type', typeFilter);
      if (periodFilter !== 'all') params.append('period', periodFilter);
      if (unreadOnly) params.append('unread_only', 'true');
      
      const response = await axios.get(`/api/notifications?${params.toString()}`);
      const { notifications: newNotifications, unread_count, total: totalCount, has_more } = response.data;
      
      if (reset) {
        setNotifications(newNotifications);
      } else {
        setNotifications(prev => [...prev, ...newNotifications]);
      }
      
      setUnreadCount(unread_count);
      setTotal(totalCount);
      setHasMore(has_more);
    } catch (error) {
      console.error('Failed to fetch notifications:', error);
      toast.error('Erreur lors du chargement des notifications');
    } finally {
      setLoading(false);
    }
  }, [skip, search, typeFilter, periodFilter, unreadOnly]);

  // Initial fetch and polling
  useEffect(() => {
    fetchNotifications(true);
    
    // Poll every 30 seconds
    const interval = setInterval(() => fetchNotifications(true), 30000);
    return () => clearInterval(interval);
  }, [search, typeFilter, periodFilter, unreadOnly]);

  // Load more
  const loadMore = () => {
    setSkip(prev => prev + limit);
  };

  useEffect(() => {
    if (skip > 0) {
      fetchNotifications(false);
    }
  }, [skip]);

  // Mark as read
  const markAsRead = async (notificationId) => {
    try {
      await axios.put(`/api/notifications/${notificationId}/read`);
      setNotifications(prev => 
        prev.map(n => n.id === notificationId ? { ...n, read: true } : n)
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (error) {
      console.error('Failed to mark as read:', error);
    }
  };

  // Mark all as read
  const markAllAsRead = async () => {
    try {
      await axios.put('/api/notifications/read-all');
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
      setUnreadCount(0);
      toast.success(t('notif.markAllRead'));
    } catch (error) {
      console.error('Failed to mark all as read:', error);
    }
  };

  // View notification detail
  const viewDetail = async (notification) => {
    try {
      const response = await axios.get(`/api/notifications/${notification.id}`);
      setSelectedNotification(response.data);
      setDetailModalOpen(true);
      
      // Update local state if now read
      if (!notification.read) {
        setNotifications(prev => 
          prev.map(n => n.id === notification.id ? { ...n, read: true } : n)
        );
        setUnreadCount(prev => Math.max(0, prev - 1));
      }
    } catch (error) {
      console.error('Failed to fetch notification detail:', error);
      // Fallback to local data
      setSelectedNotification(notification);
      setDetailModalOpen(true);
    }
  };

  // Delete notification
  const confirmDelete = (notification) => {
    setNotificationToDelete(notification);
    setDeleteDialogOpen(true);
  };

  const deleteNotification = async () => {
    if (!notificationToDelete) return;
    
    try {
      await axios.delete(`/api/notifications/${notificationToDelete.id}`);
      setNotifications(prev => prev.filter(n => n.id !== notificationToDelete.id));
      setTotal(prev => prev - 1);
      if (!notificationToDelete.read) {
        setUnreadCount(prev => Math.max(0, prev - 1));
      }
      toast.success(t('notif.deleted'));
      setDeleteDialogOpen(false);
      setNotificationToDelete(null);
    } catch (error) {
      console.error('Failed to delete notification:', error);
      toast.error('Erreur lors de la suppression');
    }
  };

  // Format time
  const formatTime = (timestamp) => {
    try {
      return formatDistanceToNow(new Date(timestamp), { addSuffix: true, locale: getLocale() });
    } catch {
      return '';
    }
  };

  const formatFullDate = (timestamp) => {
    try {
      return format(new Date(timestamp), 'PPpp', { locale: getLocale() });
    } catch {
      return timestamp;
    }
  };

  // Get config for notification type
  const getTypeConfig = (type) => {
    return typeConfig[type] || typeConfig.system;
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 p-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Bell className="h-6 w-6 text-primary" />
              {t('notif.moduleTitle')}
            </h1>
            <p className="text-muted-foreground">{t('notif.moduleDesc')}</p>
          </div>
          
          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <Badge variant="destructive" className="text-sm px-3 py-1">
                {unreadCount} {t('notif.unread')}
              </Badge>
            )}
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => fetchNotifications(true)}
              disabled={loading}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              {t('common.refresh')}
            </Button>
            {unreadCount > 0 && (
              <Button 
                variant="default" 
                size="sm"
                onClick={markAllAsRead}
              >
                <Check className="h-4 w-4 mr-2" />
                {t('notif.markAllRead')}
              </Button>
            )}
          </div>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col md:flex-row gap-4">
              {/* Search */}
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder={t('notif.searchPlaceholder')}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-10"
                />
              </div>

              {/* Type filter */}
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-full md:w-[180px]">
                  <SelectValue placeholder={t('notif.allTypes')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('notif.allTypes')}</SelectItem>
                  <SelectItem value="info">{t('notif.types.info')}</SelectItem>
                  <SelectItem value="success">{t('notif.types.success')}</SelectItem>
                  <SelectItem value="warning">{t('notif.types.warning')}</SelectItem>
                  <SelectItem value="error">{t('notif.types.error')}</SelectItem>
                  <SelectItem value="login">{t('notif.types.login')}</SelectItem>
                  <SelectItem value="leave">{t('notif.types.leave')}</SelectItem>
                  <SelectItem value="leave_overlap">{t('notif.types.leave_overlap')}</SelectItem>
                  <SelectItem value="leave_reminder">{t('notif.types.leave_reminder')}</SelectItem>
                </SelectContent>
              </Select>

              {/* Period filter */}
              <Select value={periodFilter} onValueChange={setPeriodFilter}>
                <SelectTrigger className="w-full md:w-[180px]">
                  <SelectValue placeholder={t('notif.allPeriods')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('notif.allPeriods')}</SelectItem>
                  <SelectItem value="day">{t('notif.today')}</SelectItem>
                  <SelectItem value="week">{t('notif.thisWeek')}</SelectItem>
                  <SelectItem value="month">{t('notif.thisMonth')}</SelectItem>
                  <SelectItem value="year">{t('notif.thisYear')}</SelectItem>
                </SelectContent>
              </Select>

              {/* Unread only toggle */}
              <Button
                variant={unreadOnly ? "default" : "outline"}
                size="sm"
                onClick={() => setUnreadOnly(!unreadOnly)}
                className="whitespace-nowrap"
              >
                <Filter className="h-4 w-4 mr-2" />
                {t('notif.unreadOnly')}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Notifications List */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">
                {total} {t('notif.total')}
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {loading && notifications.length === 0 ? (
              <div className="flex items-center justify-center py-12">
                <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <Bell className="h-16 w-16 opacity-30 mb-4" />
                <p className="text-lg font-medium">{t('notif.noResults')}</p>
                <p className="text-sm">{t('notif.noResultsDesc')}</p>
              </div>
            ) : (
              <ScrollArea className="max-h-[600px]">
                <div className="divide-y">
                  {notifications.map((notif) => {
                    const config = getTypeConfig(notif.type);
                    const Icon = config.icon;
                    
                    return (
                      <div
                        key={notif.id}
                        className={`p-4 hover:bg-muted/50 transition-colors cursor-pointer group ${
                          !notif.read ? 'bg-primary/5 border-l-4 border-l-primary' : ''
                        }`}
                        onClick={() => viewDetail(notif)}
                      >
                        <div className="flex items-start gap-4">
                          {/* Icon */}
                          <div className={`flex-shrink-0 p-3 rounded-full ${config.bg}`}>
                            <Icon className={`h-5 w-5 ${config.color}`} />
                          </div>
                          
                          {/* Content */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1">
                                <p className={`font-medium ${!notif.read ? 'text-foreground' : 'text-muted-foreground'}`}>
                                  {notif.title}
                                </p>
                                <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                                  {notif.message}
                                </p>
                              </div>
                              
                              {/* Status indicator */}
                              {!notif.read && (
                                <div className="flex-shrink-0">
                                  <div className="h-3 w-3 rounded-full bg-primary animate-pulse" />
                                </div>
                              )}
                            </div>
                            
                            {/* Meta */}
                            <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {formatTime(notif.created_at)}
                              </span>
                              <Badge variant="outline" className="text-xs">
                                {config.label}
                              </Badge>
                            </div>
                          </div>
                          
                          {/* Actions */}
                          <div className="flex-shrink-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={(e) => {
                                e.stopPropagation();
                                viewDetail(notif);
                              }}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive"
                              onClick={(e) => {
                                e.stopPropagation();
                                confirmDelete(notif);
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                
                {/* Load more */}
                {hasMore && (
                  <div className="p-4 text-center">
                    <Button
                      variant="outline"
                      onClick={loadMore}
                      disabled={loading}
                    >
                      {loading ? (
                        <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                      ) : null}
                      {t('notif.loadMore')}
                    </Button>
                  </div>
                )}
              </ScrollArea>
            )}
          </CardContent>
        </Card>

        {/* Detail Modal */}
        <Dialog open={detailModalOpen} onOpenChange={setDetailModalOpen}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {selectedNotification && (
                  <>
                    {(() => {
                      const config = getTypeConfig(selectedNotification.type);
                      const Icon = config.icon;
                      return <Icon className={`h-5 w-5 ${config.color}`} />;
                    })()}
                    {t('notif.detail')}
                  </>
                )}
              </DialogTitle>
            </DialogHeader>
            
            {selectedNotification && (
              <div className="space-y-4">
                {/* Title */}
                <div>
                  <h3 className="text-lg font-semibold">{selectedNotification.title}</h3>
                </div>
                
                <Separator />
                
                {/* Full message */}
                <div>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                    {selectedNotification.message}
                  </p>
                </div>
                
                <Separator />
                
                {/* Meta info */}
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">{t('notif.type')}</p>
                    <Badge variant="outline" className="mt-1">
                      {getTypeConfig(selectedNotification.type).label}
                    </Badge>
                  </div>
                  <div>
                    <p className="text-muted-foreground">{t('notif.status')}</p>
                    <Badge variant={selectedNotification.read ? "secondary" : "default"} className="mt-1">
                      {selectedNotification.read ? t('notif.read') : t('notif.unreadStatus')}
                    </Badge>
                  </div>
                  <div>
                    <p className="text-muted-foreground">{t('notif.receivedAt')}</p>
                    <p className="font-medium mt-1">{formatFullDate(selectedNotification.created_at)}</p>
                  </div>
                  {selectedNotification.read_at && (
                    <div>
                      <p className="text-muted-foreground">{t('notif.readAt')}</p>
                      <p className="font-medium mt-1">{formatFullDate(selectedNotification.read_at)}</p>
                    </div>
                  )}
                </div>
              </div>
            )}
            
            <DialogFooter className="flex gap-2">
              <Button variant="outline" onClick={() => setDetailModalOpen(false)}>
                {t('notif.back')}
              </Button>
              <Button
                variant="destructive"
                onClick={() => {
                  setDetailModalOpen(false);
                  confirmDelete(selectedNotification);
                }}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                {t('notif.delete')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-destructive">
                <Trash2 className="h-5 w-5" />
                {t('notif.delete')}
              </DialogTitle>
              <DialogDescription>
                {t('notif.deleteConfirm')}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
                {t('common.cancel')}
              </Button>
              <Button variant="destructive" onClick={deleteNotification}>
                <Trash2 className="h-4 w-4 mr-2" />
                {t('notif.delete')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
};

export default NotificationsModule;
