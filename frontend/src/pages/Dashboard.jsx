import React, { useEffect, useState, useMemo } from 'react';
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
  UserCheck,
  TrendingUp,
  Building2,
  BarChart3
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

        {/* Department Stats for Admin - Enhanced Visual */}
        {isAdmin() && stats?.employees_by_department && (
          <Card className="overflow-hidden">
            <CardHeader className="bg-gradient-to-r from-primary/10 via-secondary/10 to-accent/10 border-b">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-primary/20">
                    <BarChart3 className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">{t('dashboard.employeesByDept')}</CardTitle>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      {t('dashboard.deptStatsDesc') || 'Répartition des effectifs par département'}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-3xl font-bold text-primary">{stats?.total_employees || 0}</p>
                  <p className="text-xs text-muted-foreground">{t('dashboard.totalEmployees')}</p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-6">
              {(() => {
                const departments = Object.entries(stats.employees_by_department);
                const maxCount = Math.max(...departments.map(([, count]) => count));
                const totalEmployees = departments.reduce((sum, [, count]) => sum + count, 0);
                
                // Colors for departments
                const colors = [
                  { bg: 'bg-blue-500', light: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-600 dark:text-blue-400' },
                  { bg: 'bg-emerald-500', light: 'bg-emerald-100 dark:bg-emerald-900/30', text: 'text-emerald-600 dark:text-emerald-400' },
                  { bg: 'bg-violet-500', light: 'bg-violet-100 dark:bg-violet-900/30', text: 'text-violet-600 dark:text-violet-400' },
                  { bg: 'bg-amber-500', light: 'bg-amber-100 dark:bg-amber-900/30', text: 'text-amber-600 dark:text-amber-400' },
                  { bg: 'bg-rose-500', light: 'bg-rose-100 dark:bg-rose-900/30', text: 'text-rose-600 dark:text-rose-400' },
                  { bg: 'bg-cyan-500', light: 'bg-cyan-100 dark:bg-cyan-900/30', text: 'text-cyan-600 dark:text-cyan-400' },
                  { bg: 'bg-orange-500', light: 'bg-orange-100 dark:bg-orange-900/30', text: 'text-orange-600 dark:text-orange-400' },
                  { bg: 'bg-indigo-500', light: 'bg-indigo-100 dark:bg-indigo-900/30', text: 'text-indigo-600 dark:text-indigo-400' },
                ];
                
                return (
                  <div className="space-y-6">
                    {/* Horizontal Bar Chart */}
                    <div className="space-y-4">
                      {departments
                        .sort((a, b) => b[1] - a[1])
                        .map(([dept, count], index) => {
                          const color = colors[index % colors.length];
                          const percentage = totalEmployees > 0 ? ((count / totalEmployees) * 100).toFixed(1) : 0;
                          const barWidth = maxCount > 0 ? (count / maxCount) * 100 : 0;
                          
                          return (
                            <div 
                              key={dept}
                              className="group cursor-pointer"
                              onClick={() => navigate(`/administration?department=${dept}`)}
                            >
                              <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-3">
                                  <div className={`w-3 h-3 rounded-full ${color.bg}`} />
                                  <span className="font-medium capitalize group-hover:text-primary transition-colors">
                                    {t(`departments.${dept}`) || dept.replace('_', ' ')}
                                  </span>
                                </div>
                                <div className="flex items-center gap-3">
                                  <span className={`text-sm font-medium ${color.text}`}>
                                    {percentage}%
                                  </span>
                                  <span className="text-lg font-bold min-w-[40px] text-right">
                                    {count}
                                  </span>
                                </div>
                              </div>
                              
                              {/* Progress Bar */}
                              <div className="relative h-8 rounded-lg bg-muted overflow-hidden group-hover:shadow-md transition-all">
                                <div 
                                  className={`absolute inset-y-0 left-0 ${color.bg} rounded-lg transition-all duration-700 ease-out flex items-center justify-end pr-3`}
                                  style={{ width: `${barWidth}%` }}
                                >
                                  {barWidth > 20 && (
                                    <span className="text-white text-sm font-semibold">
                                      {count} {count > 1 ? 'employés' : 'employé'}
                                    </span>
                                  )}
                                </div>
                                {barWidth <= 20 && (
                                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-medium text-muted-foreground">
                                    {count} {count > 1 ? 'employés' : 'employé'}
                                  </span>
                                )}
                                
                                {/* Hover overlay */}
                                <div className="absolute inset-0 bg-primary/0 group-hover:bg-primary/5 transition-colors" />
                              </div>
                            </div>
                          );
                        })}
                    </div>
                    
                    {/* Summary Cards */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t">
                      <div className="text-center p-3 rounded-lg bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20">
                        <Building2 className="h-5 w-5 mx-auto text-blue-500 mb-1" />
                        <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{departments.length}</p>
                        <p className="text-xs text-muted-foreground">{t('dashboard.departments') || 'Départements'}</p>
                      </div>
                      <div className="text-center p-3 rounded-lg bg-gradient-to-br from-emerald-50 to-emerald-100 dark:from-emerald-900/20 dark:to-emerald-800/20">
                        <Users className="h-5 w-5 mx-auto text-emerald-500 mb-1" />
                        <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{totalEmployees}</p>
                        <p className="text-xs text-muted-foreground">{t('dashboard.totalEmployees')}</p>
                      </div>
                      <div className="text-center p-3 rounded-lg bg-gradient-to-br from-violet-50 to-violet-100 dark:from-violet-900/20 dark:to-violet-800/20">
                        <TrendingUp className="h-5 w-5 mx-auto text-violet-500 mb-1" />
                        <p className="text-2xl font-bold text-violet-600 dark:text-violet-400">
                          {departments.length > 0 ? Math.round(totalEmployees / departments.length) : 0}
                        </p>
                        <p className="text-xs text-muted-foreground">{t('dashboard.avgPerDept') || 'Moy. / Dept'}</p>
                      </div>
                      <div className="text-center p-3 rounded-lg bg-gradient-to-br from-amber-50 to-amber-100 dark:from-amber-900/20 dark:to-amber-800/20">
                        <BarChart3 className="h-5 w-5 mx-auto text-amber-500 mb-1" />
                        <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">{maxCount}</p>
                        <p className="text-xs text-muted-foreground">{t('dashboard.largestDept') || 'Plus grand'}</p>
                      </div>
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
