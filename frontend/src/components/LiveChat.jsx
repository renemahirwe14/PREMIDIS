import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { ScrollArea } from './ui/scroll-area';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Send, MessageCircle, Loader2, Users, X } from 'lucide-react';
import axios from '../config/api';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

const LiveChat = () => {
  const { user } = useAuth();
  const [messages, setMessages] = useState([]);
  const [users, setUsers] = useState([]);
  const [unreadCounts, setUnreadCounts] = useState({});
  const [totalUnread, setTotalUnread] = useState(0);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null); // null = broadcast
  const [showUserList, setShowUserList] = useState(false);
  const messagesEndRef = useRef(null);
  const pollIntervalRef = useRef(null);

  useEffect(() => {
    fetchMessages();
    fetchUsers();
    fetchUnreadCounts();
    
    // Poll for new messages every 5 seconds
    pollIntervalRef.current = setInterval(() => {
      fetchMessages();
      fetchUnreadCounts();
    }, 5000);
    
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, [selectedUser]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    // Mark messages as read when viewing a conversation
    if (selectedUser) {
      markAsRead(selectedUser.id);
    }
  }, [selectedUser, messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const fetchMessages = async () => {
    try {
      const params = selectedUser ? { recipient_id: selectedUser.id } : {};
      const response = await axios.get(`${API_URL}/api/communication/chat/messages`, { params });
      setMessages(response.data.messages || []);
    } catch (error) {
      console.error('Error fetching messages:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchUsers = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/communication/chat/users`);
      setUsers(response.data.users || []);
    } catch (error) {
      console.error('Error fetching users:', error);
    }
  };

  const fetchUnreadCounts = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/communication/chat/unread`);
      setUnreadCounts(response.data.unread || {});
      setTotalUnread(response.data.total || 0);
    } catch (error) {
      console.error('Error fetching unread counts:', error);
    }
  };

  const markAsRead = async (senderId) => {
    try {
      await axios.post(`${API_URL}/api/communication/chat/mark-read/${senderId}`);
      fetchUnreadCounts(); // Refresh counts
    } catch (error) {
      console.error('Error marking messages as read:', error);
    }
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() || sending) return;

    setSending(true);
    try {
      const payload = {
        content: newMessage,
        recipient_id: selectedUser?.id || null
      };
      
      await axios.post(`${API_URL}/api/communication/chat/messages`, payload);
      setNewMessage('');
      fetchMessages();
      fetchUnreadCounts();
    } catch (error) {
      toast.error(t('chat.sendError'));
    } finally {
      setSending(false);
    }
  };

  const handleUserSelect = (u) => {
    setSelectedUser(u);
    // Mark messages as read immediately on selection
    if (unreadCounts[u.id]) {
      markAsRead(u.id);
    }
  };

  const formatTime = (dateStr) => {
    try {
      return format(new Date(dateStr), 'HH:mm', { locale: fr });
    } catch {
      return '';
    }
  };

  const formatDate = (dateStr) => {
    try {
      return format(new Date(dateStr), 'dd MMM yyyy', { locale: fr });
    } catch {
      return '';
    }
  };

  // Group messages by date
  const groupedMessages = messages.reduce((groups, message) => {
    const date = formatDate(message.created_at);
    if (!groups[date]) {
      groups[date] = [];
    }
    groups[date].push(message);
    return groups;
  }, {});

  return (
    <Card className="h-[500px] flex flex-col">
      <CardHeader className="pb-3 border-b">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <MessageCircle className="h-5 w-5" />
            {selectedUser ? (
              <span>{t('chat.chatWith')} {selectedUser.first_name} {selectedUser.last_name}</span>
            ) : (
              <span>{t('chat.generalChat')}</span>
            )}
            {totalUnread > 0 && !selectedUser && (
              <Badge variant="destructive" className="ml-2">
                {totalUnread} {totalUnread > 1 ? t('chat.newMessagesPlural') : t('chat.newMessages')}
              </Badge>
            )}
          </CardTitle>
          <div className="flex gap-2">
            {selectedUser && (
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => setSelectedUser(null)}
              >
                <X className="h-4 w-4 mr-1" />
                {t('chat.back')}
              </Button>
            )}
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => setShowUserList(!showUserList)}
            >
              <Users className="h-4 w-4 mr-1" />
              {showUserList ? t('chat.hide') : t('chat.users')}
            </Button>
          </div>
        </div>
      </CardHeader>

      <div className="flex-1 flex overflow-hidden">
        {/* User List Sidebar */}
        {showUserList && (
          <div className="w-48 border-r p-2 overflow-y-auto">
            <p className="text-xs text-muted-foreground mb-2 px-2">{t('chat.privateChats')}</p>
            <Button
              variant={!selectedUser ? 'secondary' : 'ghost'}
              size="sm"
              className="w-full justify-start mb-1"
              onClick={() => setSelectedUser(null)}
            >
              <Users className="h-4 w-4 mr-2" />
              {t('chat.all')}
            </Button>
            {users.map((u) => {
              const unreadCount = unreadCounts[u.id]?.count || 0;
              return (
                <Button
                  key={u.id}
                  variant={selectedUser?.id === u.id ? 'secondary' : 'ghost'}
                  size="sm"
                  className="w-full justify-start mb-1 relative"
                  onClick={() => handleUserSelect(u)}
                >
                  <Avatar className="h-5 w-5 mr-2">
                    <AvatarImage src={u.avatar_url ? (u.avatar_url.startsWith('http') ? u.avatar_url : `${axios.defaults.baseURL}${u.avatar_url}`) : null} />
                    <AvatarFallback className="text-xs">
                      {u.first_name?.[0]}{u.last_name?.[0]}
                    </AvatarFallback>
                  </Avatar>
                  <span className="truncate text-xs flex-1 text-left">{u.first_name}</span>
                  {unreadCount > 0 && (
                    <Badge 
                      variant="destructive" 
                      className="ml-auto h-5 min-w-[20px] px-1 text-[10px] rounded-full"
                    >
                      {unreadCount}
                    </Badge>
                  )}
                  {unreadCount > 0 && (
                    <span className="absolute top-1 right-1 h-2 w-2 bg-red-500 rounded-full animate-pulse" />
                  )}
                </Button>
              );
            })}
          </div>
        )}

        {/* Messages Area */}
        <div className="flex-1 flex flex-col">
          <ScrollArea className="flex-1 p-4">
            {loading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : messages.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <MessageCircle className="h-12 w-12 mx-auto mb-4 opacity-30" />
                <p>{t('chat.noMessage')}</p>
                <p className="text-sm">{t('chat.beFirst')}</p>
              </div>
            ) : (
              <div className="space-y-4">
                {Object.entries(groupedMessages).map(([date, dateMessages]) => (
                  <div key={date}>
                    <div className="flex justify-center mb-4">
                      <Badge variant="secondary" className="text-xs">
                        {date}
                      </Badge>
                    </div>
                    {dateMessages.map((message) => {
                      const isOwn = message.sender_id === user?.id;
                      return (
                        <div
                          key={message.id}
                          className={`flex ${isOwn ? 'justify-end' : 'justify-start'} mb-3`}
                        >
                          <div className={`flex gap-2 max-w-[80%] ${isOwn ? 'flex-row-reverse' : ''}`}>
                            {!isOwn && (
                              <Avatar className="h-8 w-8">
                                <AvatarImage src={message.sender_avatar ? (message.sender_avatar.startsWith('http') ? message.sender_avatar : `${API_URL}${message.sender_avatar.startsWith('/api/') ? '' : '/api'}${message.sender_avatar}`) : null} />
                                <AvatarFallback className="text-xs bg-primary/10">
                                  {message.sender_name?.split(' ').map(n => n[0]).join('')}
                                </AvatarFallback>
                              </Avatar>
                            )}
                            <div>
                              {!isOwn && (
                                <p className="text-xs text-muted-foreground mb-1">
                                  {message.sender_name}
                                </p>
                              )}
                              <div
                                className={`rounded-2xl px-4 py-2 ${
                                  isOwn
                                    ? 'bg-primary text-primary-foreground'
                                    : 'bg-muted'
                                }`}
                              >
                                <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                              </div>
                              <p className={`text-xs text-muted-foreground mt-1 ${isOwn ? 'text-right' : ''}`}>
                                {formatTime(message.created_at)}
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>
            )}
          </ScrollArea>

          {/* Message Input */}
          <form onSubmit={handleSendMessage} className="p-4 border-t">
            <div className="flex gap-2">
              <Input
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder={selectedUser ? `${t('chat.messageTo').replace('{name}', selectedUser.first_name)}` : t('chat.messageAll')}
                disabled={sending}
                className="flex-1"
                data-testid="chat-input"
              />
              <Button type="submit" disabled={sending || !newMessage.trim()} data-testid="send-message-btn">
                {sending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </Card>
  );
};

export default LiveChat;
