import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { ScrollArea } from './ui/scroll-area';
import { Separator } from './ui/separator';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from './ui/popover';
import { 
  Bell, MessageSquare, Calendar, FileText, 
  CheckCircle, AlertCircle, Info, X, Check, Lock
} from 'lucide-react';
import axios from '../config/api';
import { format, formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';

const NotificationCenter = () => {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    fetchNotifications();
    // Poll for new notifications every 30 seconds
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchNotifications = async () => {
    try {
      // Fetch system notifications from new API
      const response = await axios.get('/api/notifications');
      const systemNotifs = response.data.notifications || [];
      const unread = response.data.unread_count || 0;
      
      // Format notifications to include icon and color
      const formatted = systemNotifs.map(notif => ({
        ...notif,
        icon: getIconForType(notif.type),
        color: getColorForType(notif.type),
        content: notif.message,
        timestamp: notif.created_at
      }));
      
      setNotifications(formatted);
      setUnreadCount(unread);
    } catch (error) {
      console.error('Failed to fetch notifications:', error);
    }
  };
  
  const getIconForType = (type) => {
    const iconMap = {
      'info': Info,
      'success': CheckCircle,
      'warning': AlertCircle,
      'error': AlertCircle,
      'login': Lock,
      'leave_overlap': Calendar,
      'leave_reminder': Calendar,
      'custom': Bell
    };
    return iconMap[type] || Bell;
  };
  
  const getColorForType = (type) => {
    const colorMap = {
      'info': 'text-blue-500',
      'success': 'text-green-500',
      'warning': 'text-orange-500',
      'error': 'text-red-500',
      'login': 'text-purple-500',
      'leave_overlap': 'text-yellow-500',
      'leave_reminder': 'text-cyan-500',
      'custom': 'text-primary'
    };
    return colorMap[type] || 'text-gray-500';
  };

  const markAsRead = async (notificationId) => {
    try {
      await axios.put(`/api/notifications/${notificationId}/read`);
      fetchNotifications();
    } catch (error) {
      console.error('Failed to mark notification as read:', error);
    }
  };

  const markAllAsRead = async () => {
    try {
      await axios.put('/api/notifications/read-all');
      fetchNotifications();
    } catch (error) {
      console.error('Failed to mark all as read:', error);
    }
  };

  const getTimeAgo = (timestamp) => {
    try {
      return formatDistanceToNow(new Date(timestamp), { addSuffix: true, locale: fr });
    } catch (e) {
      return '';
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button 
          variant="ghost" 
          size="icon" 
          className="relative rounded-full"
          data-testid="notification-bell"
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <>
              {/* Badge with count */}
              <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white z-10">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
              
              {/* Animated pulsing dot */}
              <span className="absolute -top-0.5 -right-0.5 flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
              </span>
            </>
          )}
        </Button>
      </PopoverTrigger>
      
      <PopoverContent className="w-96 p-0" align="end">
        <div className="flex items-center justify-between p-4 border-b">
          <div>
            <h3 className="font-semibold">{t('notif.title')}</h3>
            <p className="text-sm text-muted-foreground">
              {unreadCount > 0 ? `${unreadCount} ${t('notif.unread')}` : t('notif.allRead')}
            </p>
          </div>
          {unreadCount > 0 && (
            <Button 
              variant="ghost" 
              size="sm"
              onClick={markAllAsRead}
              className="text-xs"
            >
              <Check className="h-3 w-3 mr-1" />
              {t('notif.markAllRead')}
            </Button>
          )}
        </div>

        <ScrollArea className="h-[400px]">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Bell className="h-12 w-12 opacity-30 mb-4" />
              <p className="text-sm">{t('notif.noNotification')}</p>
            </div>
          ) : (
            <div className="divide-y">
              {notifications.map((notif) => {
                const Icon = notif.icon;
                return (
                  <div
                    key={notif.id}
                    className={`p-4 hover:bg-muted/50 transition-colors cursor-pointer ${
                      !notif.read ? 'bg-primary/5' : ''
                    }`}
                    onClick={() => markAsRead(notif.id)}
                    data-testid={`notification-${notif.id}`}
                  >
                    <div className="flex gap-3">
                      <div className={`flex-shrink-0 p-2 rounded-full bg-muted ${notif.color}`}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <p className={`text-sm font-medium ${!notif.read ? 'text-foreground' : 'text-muted-foreground'}`}>
                            {notif.title}
                          </p>
                          {!notif.read && (
                            <div className="h-2 w-2 rounded-full bg-primary flex-shrink-0 mt-1.5" />
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground line-clamp-2 mt-0.5">
                          {notif.content}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {getTimeAgo(notif.timestamp)}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>

        <div className="p-3 border-t">
          <Button variant="ghost" className="w-full text-sm" onClick={() => setOpen(false)}>
            Voir toutes les notifications
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default NotificationCenter;
