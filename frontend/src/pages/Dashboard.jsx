import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import DashboardLayout from '../components/layout/DashboardLayout';
import ModuleTile from '../components/ModuleTile';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Skeleton } from '../components/ui/skeleton';
import {
  MessageSquare,
  Users,
  Clock,
  Bell,
  UserCheck
} from 'lucide-react';
import axios from '../config/api';

const Dashboard = () => {
  const navigate = useNavigate();
  const { user, isAdmin, canManageEmployees } = useAuth();
  const { t } = useLanguage();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const response = await axios.get('/api/dashboard/stats');
      setStats(response.data);
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const modules = [
    {
      title: t('nav.communication'),
      icon: MessageSquare,
      description: t('dashboard.commDescription'),
      link: '/communication',
      color: 'primary',
      metric: stats?.unread_messages || 0,
      metricLabel: t('dashboard.unread'),
      badge: stats?.unread_messages > 0 ? t('dashboard.new') : null,
      badgeVariant: 'destructive'
    },
    {
      title: t('nav.administration'),
      icon: Users,
      description: t('dashboard.adminDescription'),
      link: '/administration',
      color: 'secondary',
      metric: stats?.total_employees || 0,
      metricLabel: t('dashboard.employees'),
      canManageOnly: true
    },
    {
      title: t('nav.timeManagement'),
      icon: Clock,
      description: t('dashboard.leavesDescription'),
      link: '/time-management',
      color: 'accent',
      metric: isAdmin() ? stats?.pending_leaves : stats?.my_leaves_pending,
      metricLabel: t('dashboard.waiting')
    },
    {
      title: t('nav.behavior'),
      icon: UserCheck,
      description: isAdmin() ? t('dashboard.behaviorDescAdmin') : t('dashboard.behaviorDescEmployee'),
      link: '/behavior',
      color: 'secondary'
    }
  ];

  // Clickable stat cards for admin
  const statCards = [
    {
      label: t('dashboard.totalEmployees'),
      value: stats?.total_employees || 0,
      icon: Users,
      color: 'border-l-primary',
      onClick: () => navigate('/administration')
    },
    {
      label: t('dashboard.pendingLeaves'),
      value: stats?.pending_leaves || 0,
      icon: Clock,
      color: 'border-l-secondary',
      onClick: () => navigate('/time-management?tab=leaves&status=pending')
    },
    {
      label: t('dashboard.announcements'),
      value: stats?.total_announcements || 0,
      icon: Bell,
      color: 'border-l-accent',
      onClick: () => navigate('/communication?tab=announcements')
    },
    {
      label: t('dashboard.unreadMessages'),
      value: stats?.unread_messages || 0,
      icon: MessageSquare,
      color: 'border-l-destructive',
      onClick: () => navigate('/communication?tab=chat')
    }
  ];

  return (
    <DashboardLayout>
      <div className="space-y-8" data-testid="dashboard-page">
        {/* Welcome Section */}
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold tracking-tight">
            {t('dashboard.welcome')}, {user?.first_name} 
          </h1>
          <p className="text-muted-foreground">
            {t('dashboard.subtitle')}
          </p>
        </div>

        {/* Quick Stats for Admin - CLICKABLE */}
        {isAdmin() && (
          <div className="grid gap-4 md:grid-cols-4">
            {loading ? (
              Array(4).fill(0).map((_, i) => (
                <Skeleton key={i} className="h-24" />
              ))
            ) : (
              statCards.map((stat, index) => (
                <Card 
                  key={index}
                  className={`${stat.color} border-l-4 cursor-pointer hover:shadow-lg hover:-translate-y-1 transition-all duration-200`}
                  onClick={stat.onClick}
                  data-testid={`stat-card-${index}`}
                >
                  <CardContent className="pt-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">{stat.label}</p>
                        <p className="text-2xl font-bold">{stat.value}</p>
                      </div>
                      <stat.icon className="h-8 w-8 text-muted-foreground/50" />
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        )}

        {/* Quick Stats for Employee */}
        {!isAdmin() && (
          <div className="grid gap-4 md:grid-cols-3">
            <Card 
              className="border-l-4 border-l-primary cursor-pointer hover:shadow-lg transition-all"
              onClick={() => navigate('/time-management?tab=leaves')}
            >
              <CardContent className="pt-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">{t('dashboard.myPendingLeaves')}</p>
                    <p className="text-2xl font-bold">{stats?.my_leaves_pending || 0}</p>
                  </div>
                  <Clock className="h-8 w-8 text-primary/50" />
                </div>
              </CardContent>
            </Card>
            
            <Card 
              className="border-l-4 border-l-secondary cursor-pointer hover:shadow-lg transition-all"
              onClick={() => navigate('/behavior')}
            >
              <CardContent className="pt-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">{t('dashboard.myBehavior')}</p>
                    <p className="text-2xl font-bold">{stats?.behavior_notes || 0}</p>
                  </div>
                  <UserCheck className="h-8 w-8 text-secondary/50" />
                </div>
              </CardContent>
            </Card>

            <Card 
              className="border-l-4 border-l-accent cursor-pointer hover:shadow-lg transition-all"
              onClick={() => navigate('/communication?tab=chat')}
            >
              <CardContent className="pt-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">{t('dashboard.unreadMessages')}</p>
                    <p className="text-2xl font-bold">{stats?.unread_messages || 0}</p>
                  </div>
                  <MessageSquare className="h-8 w-8 text-accent/50" />
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Module Tiles */}
        <div>
          <h2 className="text-xl font-semibold mb-4">{t('dashboard.modules')}</h2>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 stagger-children">
            {modules.map((module, index) => {
              if (module.canManageOnly && !canManageEmployees()) return null;
              return (
                <ModuleTile
                  key={module.title}
                  {...module}
                />
              );
            })}
          </div>
        </div>

        {/* Department Stats for Admin - Chart Style like Image */}
        {isAdmin() && stats?.employees_by_department && (
          <Card className="overflow-hidden border-l-4 border-l-violet-500">
            <CardContent className="p-6">
              {(() => {
                const departments = Object.entries(stats.employees_by_department);
                const maxCount = Math.max(...departments.map(([, count]) => count), 1);
                const totalEmployees = departments.reduce((sum, [, count]) => sum + count, 0);
                
                // Colors matching the image
                const colors = [
                  { bar: 'bg-violet-500', text: 'text-violet-600' },
                  { bar: 'bg-emerald-500', text: 'text-emerald-600' },
                  { bar: 'bg-amber-500', text: 'text-amber-600' },
                  { bar: 'bg-red-500', text: 'text-red-500' },
                  { bar: 'bg-violet-400', text: 'text-violet-500' },
                  { bar: 'bg-blue-500', text: 'text-blue-600' },
                  { bar: 'bg-cyan-500', text: 'text-cyan-600' },
                  { bar: 'bg-pink-500', text: 'text-pink-600' },
                ];
                
                // Calculate Y-axis steps
                const yAxisSteps = [];
                for (let i = maxCount; i >= 0; i--) {
                  yAxisSteps.push(i);
                }
                
                return (
                  <div className="space-y-6">
                    {/* Header */}
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <Users className="h-8 w-8 text-violet-500" />
                        <h3 className="text-xl font-bold text-foreground">
                          {t('dashboard.employeesByDept')}
                        </h3>
                      </div>
                      <div className="text-right">
                        <span className="text-muted-foreground">Total: </span>
                        <span className="text-3xl font-bold text-violet-600">{totalEmployees}</span>
                      </div>
                    </div>
                    
                    {/* Vertical Bar Chart */}
                    <div className="relative pt-4">
                      <div className="flex">
                        {/* Y-Axis */}
                        <div className="flex flex-col justify-between pr-2 text-right text-sm text-muted-foreground" style={{ height: '200px' }}>
                          {yAxisSteps.map((step) => (
                            <span key={step}>{step}</span>
                          ))}
                        </div>
                        
                        {/* Chart Area */}
                        <div className="flex-1 relative border-l border-b border-muted" style={{ height: '200px' }}>
                          {/* Grid lines */}
                          {yAxisSteps.slice(0, -1).map((step, idx) => (
                            <div 
                              key={step}
                              className="absolute w-full border-t border-dashed border-muted/50"
                              style={{ top: `${(idx / maxCount) * 100}%` }}
                            />
                          ))}
                          
                          {/* Bars Container */}
                          <div className="absolute inset-0 flex items-end justify-around px-2 pb-0">
                            {departments.map(([dept, count], index) => {
                              const color = colors[index % colors.length];
                              const heightPercent = (count / maxCount) * 100;
                              
                              return (
                                <div 
                                  key={dept}
                                  className="flex flex-col items-center group cursor-pointer"
                                  onClick={() => navigate(`/administration?department=${dept}`)}
                                  style={{ width: `${Math.max(60 / departments.length, 10)}%` }}
                                >
                                  {/* Value on top */}
                                  <span className="text-sm font-bold mb-1">{count}</span>
                                  
                                  {/* Bar */}
                                  <div 
                                    className={`w-full ${color.bar} rounded-t-md transition-all duration-500 hover:opacity-80 min-w-[30px] max-w-[60px]`}
                                    style={{ height: `${heightPercent}%`, minHeight: count > 0 ? '20px' : '0' }}
                                  />
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                      
                      {/* X-Axis Labels */}
                      <div className="flex ml-8 mt-2">
                        <div className="flex-1 flex justify-around">
                          {departments.map(([dept]) => (
                            <div 
                              key={dept}
                              className="text-xs text-muted-foreground transform -rotate-45 origin-top-left whitespace-nowrap"
                              style={{ width: `${Math.max(60 / departments.length, 10)}%` }}
                            >
                              <span className="capitalize">
                                {(t(`departments.${dept}`) || dept.replace('_', ' ')).substring(0, 15)}
                                {(t(`departments.${dept}`) || dept).length > 15 ? '...' : ''}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                    
                    {/* Department Cards Grid */}
                    <div className="grid grid-cols-2 gap-3 mt-8 pt-4 border-t">
                      {departments.map(([dept, count], index) => {
                        const color = colors[index % colors.length];
                        return (
                          <div 
                            key={dept}
                            className="p-4 rounded-lg border bg-card hover:shadow-md transition-all cursor-pointer"
                            onClick={() => navigate(`/administration?department=${dept}`)}
                          >
                            <p className="text-sm text-muted-foreground capitalize truncate">
                              {t(`departments.${dept}`) || dept.replace('_', ' ')}
                            </p>
                            <p className={`text-2xl font-bold ${color.text}`}>{count}</p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
};

export default Dashboard;
