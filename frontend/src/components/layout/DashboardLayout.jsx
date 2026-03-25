import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useTheme } from '../../contexts/ThemeContext';
import { Button } from '../ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { Sheet, SheetContent, SheetTrigger } from '../ui/sheet';
import {
  LayoutDashboard,
  MessageSquare,
  Users,
  Clock,
  Settings,
  LogOut,
  Menu,
  ChevronDown,
  Globe,
  User,
  UserCheck,
  Moon,
  Sun,
  Shield,
  Bell,
  Building2,
  FileText,
  Sparkles
} from 'lucide-react';
import NotificationCenter from '../NotificationCenter';
import Logo from '../Logo';

const DashboardLayout = ({ children }) => {
  const { user, logout, isAdmin, canManageEmployees } = useAuth();
  const { t, language, setLanguage, availableLanguages } = useLanguage();
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const navItems = [
    { path: '/dashboard', icon: LayoutDashboard, labelKey: 'nav.dashboard' },
    { path: '/communication', icon: MessageSquare, labelKey: 'nav.communication' },
    { path: '/administration', icon: Users, labelKey: 'nav.administration', canManage: true },
    { path: '/time-management', icon: Clock, labelKey: 'nav.timeManagement' },
    { path: '/behavior', icon: UserCheck, labelKey: 'nav.behavior' },
    { path: '/documents', icon: FileText, labelKey: 'nav.documents' },
    { path: '/sites', icon: Building2, labelKey: 'nav.sites', adminOnly: true },
    { path: '/permissions', icon: Shield, labelKey: 'nav.permissions', adminOnly: true },
    { path: '/my-profile', icon: User, labelKey: 'nav.myProfile', employeeOnly: true },
  ];

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const NavContent = () => (
    <nav className="flex flex-col gap-1.5 px-3 py-4">
      {navItems.map((item) => {
        if (item.canManage && !canManageEmployees()) return null;
        if (item.adminOnly && !isAdmin()) return null;
        if (item.employeeOnly && (isAdmin() || canManageEmployees())) return null;
        const isActive = location.pathname.startsWith(item.path);
        
        return (
          <Link
            key={item.path}
            to={item.path}
            onClick={() => setSidebarOpen(false)}
            className={`
              flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all duration-200 relative
              ${isActive 
                ? 'nav-active-glow text-white font-semibold shadow-lg' 
                : 'hover:bg-white/10 dark:hover:bg-white/5 text-foreground/65 hover:text-foreground'
              }
            `}
            data-testid={`nav-${item.labelKey}`}
          >
            <item.icon className={`h-[18px] w-[18px] ${isActive ? 'drop-shadow-sm' : ''}`} />
            <span className="text-sm">{t(item.labelKey)}</span>
            {isActive && (
              <Sparkles className="h-3 w-3 ml-auto opacity-60" />
            )}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="min-h-screen bg-background bg-mesh">
      {/* Desktop Sidebar */}
      <aside className="fixed left-0 top-0 z-40 hidden h-screen w-[260px] lg:flex lg:flex-col glass-strong bg-mesh-sidebar">
        {/* Logo area */}
        <div className="flex h-16 items-center px-5 border-b border-white/10 dark:border-white/5">
          <Logo size="default" showText={true} />
        </div>
        
        <div className="flex flex-col flex-1 overflow-hidden">
          <div className="flex-1 overflow-y-auto py-2">
            <NavContent />
          </div>
          
          {/* Bottom settings */}
          <div className="border-t border-white/10 dark:border-white/5 p-3">
            <Link
              to="/settings"
              className="flex items-center gap-3 px-4 py-2.5 rounded-xl text-foreground/60 hover:bg-white/10 dark:hover:bg-white/5 hover:text-foreground transition-all"
              data-testid="nav-settings"
            >
              <Settings className="h-[18px] w-[18px]" />
              <span className="text-sm font-medium">{t('nav.settings')}</span>
            </Link>
          </div>
        </div>
      </aside>

      {/* Mobile Sidebar */}
      <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <SheetContent side="left" className="w-[260px] p-0 glass-strong bg-mesh-sidebar">
          <div className="flex h-16 items-center border-b border-white/10 dark:border-white/5 px-5">
            <Logo size="default" showText={true} />
          </div>
          <NavContent />
        </SheetContent>
      </Sheet>

      {/* Main Content */}
      <div className="lg:pl-[260px]">
        {/* Top Bar */}
        <header className="sticky top-0 z-30 h-16 glass border-b border-white/10 dark:border-white/5">
          <div className="flex h-full items-center justify-between px-4 lg:px-6">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="icon"
                className="lg:hidden"
                onClick={() => setSidebarOpen(true)}
                data-testid="mobile-menu-btn"
              >
                <Menu className="h-5 w-5" />
              </Button>
              
              <div className="hidden sm:block">
                <h2 className="text-base font-semibold">{t('dashboard.welcome')}, <span className="text-gradient">{user?.first_name}</span></h2>
                <p className="text-xs text-muted-foreground mt-0.5">{user?.role?.replace('_', ' ')}</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* Dark Mode Toggle */}
              <Button
                variant="ghost"
                size="icon"
                onClick={toggleTheme}
                className="rounded-full h-9 w-9 hover:bg-white/10 dark:hover:bg-white/10"
                data-testid="theme-toggle"
              >
                {theme === 'dark' ? (
                  <Sun className="h-[18px] w-[18px] text-amber-400" />
                ) : (
                  <Moon className="h-[18px] w-[18px]" />
                )}
              </Button>

              {/* Language Selector */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="gap-2 h-9 px-3 rounded-full hover:bg-white/10 dark:hover:bg-white/10" data-testid="language-selector">
                    <Globe className="h-4 w-4" />
                    <span className="hidden sm:inline text-sm">{availableLanguages.find(l => l.code === language)?.name}</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="glass-strong">
                  {availableLanguages.map((lang) => (
                    <DropdownMenuItem
                      key={lang.code}
                      onClick={() => setLanguage(lang.code)}
                      className={language === lang.code ? 'bg-primary/10 text-primary' : ''}
                    >
                      <span className="mr-2">{lang.flag}</span>
                      {lang.name}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Notifications */}
              <NotificationCenter />

              {/* User Menu */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="gap-2 pl-2 h-9 rounded-full hover:bg-white/10 dark:hover:bg-white/10" data-testid="user-menu-btn">
                    <Avatar className="h-7 w-7 ring-2 ring-primary/20">
                      <AvatarImage src={user?.avatar_url ? (user.avatar_url.startsWith('http') ? user.avatar_url : `${process.env.REACT_APP_BACKEND_URL}${user.avatar_url.startsWith('/api/') ? '' : '/api'}${user.avatar_url}`) : null} />
                      <AvatarFallback className="bg-gradient-to-br from-primary to-secondary text-white text-xs font-bold">
                        {user?.first_name?.[0]}{user?.last_name?.[0]}
                      </AvatarFallback>
                    </Avatar>
                    <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56 glass-strong">
                  <div className="px-3 py-2.5">
                    <p className="font-semibold text-sm">{user?.first_name} {user?.last_name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{user?.email}</p>
                  </div>
                  <DropdownMenuSeparator className="bg-border/50" />
                  <DropdownMenuItem asChild>
                    <Link to="/settings" className="cursor-pointer">
                      <Settings className="mr-2 h-4 w-4" />
                      {t('nav.settings')}
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator className="bg-border/50" />
                  <DropdownMenuItem onClick={handleLogout} className="text-destructive cursor-pointer">
                    <LogOut className="mr-2 h-4 w-4" />
                    {t('nav.logout')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="p-4 lg:p-6">
          <div className="animate-fade-in">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
};

export default DashboardLayout;
