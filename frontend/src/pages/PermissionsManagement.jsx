import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import DashboardLayout from '../components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Checkbox } from '../components/ui/checkbox';
import { 
  Shield, Users, UserCheck, Save, Loader2, 
  RefreshCw, Check, X, AlertCircle, Scan
} from 'lucide-react';
import api from '../config/api';
import { toast } from 'sonner';

const PermissionsManagement = () => {
  const { isAdmin } = useAuth();
  const [modules, setModules] = useState([]);
  const [roles, setRoles] = useState([]);
  const [rolePermissions, setRolePermissions] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [activeRole, setActiveRole] = useState('admin');
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Récupérer la structure des permissions
      const structureResponse = await api.get('/api/permissions/structure');
      setModules(structureResponse.data.modules || []);

      // Récupérer tous les rôles
      const rolesResponse = await api.get('/api/permissions/roles');
      const rolesData = rolesResponse.data.roles || [];
      setRoles(rolesData);

      // Construire un objet rolePermissions pour chaque rôle
      const permissionsMap = {};
      rolesData.forEach(role => {
        permissionsMap[role.role] = new Set(role.permissions);
      });
      setRolePermissions(permissionsMap);
      
      // Définir le premier rôle comme actif par défaut
      if (rolesData.length > 0) {
        setActiveRole(rolesData[0].role);
      }
    } catch (error) {
      console.error('Erreur lors du chargement des permissions:', error);
      toast.error(t('permissions.loadError'));
    } finally {
      setLoading(false);
    }
  };

  const handleScanPermissions = async () => {
    setScanning(true);
    try {
      const response = await api.post('/api/permissions/scan');
      toast.success(`${response.data.total_permissions} ${t('permissions.scanned')}`);
      await fetchData();
      setHasChanges(false);
    } catch (error) {
      console.error('Erreur lors du scan:', error);
      toast.error(t('permissions.scanError'));
    } finally {
      setScanning(false);
    }
  };

  const handleTogglePermission = (role, permissionPath, isChecked) => {
    setRolePermissions(prev => {
      const newPermissions = new Set(prev[role] || []);
      
      if (isChecked) {
        newPermissions.add(permissionPath);
      } else {
        newPermissions.delete(permissionPath);
      }
      
      return {
        ...prev,
        [role]: newPermissions
      };
    });
    setHasChanges(true);
  };

  const handleSaveRole = async (roleName) => {
    setSaving(true);
    try {
      const permissionsArray = Array.from(rolePermissions[roleName] || []);
      await api.put(`/api/permissions/roles/${roleName}`, {
        permissions: permissionsArray
      });
      toast.success(t('permissions.roleSaved'));
      setHasChanges(false);
    } catch (error) {
      console.error('Erreur lors de la sauvegarde:', error);
      toast.error(t('permissions.saveError'));
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAll = async () => {
    setSaving(true);
    try {
      const savePromises = roles.map(role => {
        const permissionsArray = Array.from(rolePermissions[role.role] || []);
        return api.put(`/api/permissions/roles/${role.role}`, {
          permissions: permissionsArray
        });
      });
      
      await Promise.all(savePromises);
      toast.success(t('permissions.allSaved'));
      setHasChanges(false);
    } catch (error) {
      console.error('Erreur lors de la sauvegarde:', error);
      toast.error(t('permissions.saveError'));
    } finally {
      setSaving(false);
    }
  };

  const getRoleBadgeColor = (roleName) => {
    const colors = {
      'super_admin': 'bg-purple-600',
      'admin': 'bg-red-500',
      'secretary': 'bg-blue-500',
      'employee': 'bg-green-500'
    };
    return colors[roleName] || 'bg-gray-500';
  };

  const getRoleIcon = (roleName) => {
    if (roleName === 'admin' || roleName === 'super_admin') return Shield;
    if (roleName === 'secretary') return UserCheck;
    return Users;
  };

  const getPermissionsCount = (roleName) => {
    return rolePermissions[roleName]?.size || 0;
  };

  if (!isAdmin()) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-96">
          <div className="text-center">
            <Shield className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
            <h2 className="text-xl font-semibold">{t('permissions.accessDenied')}</h2>
            <p className="text-muted-foreground">{t('permissions.adminOnly')}</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-96">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6" data-testid="permissions-page">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
              <Shield className="h-8 w-8 text-primary" />
              {t('permissions.title')}
            </h1>
            <p className="text-muted-foreground">{t('permissions.subtitle')}</p>
          </div>
          
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              onClick={handleScanPermissions}
              disabled={scanning}
            >
              {scanning ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Scan className="mr-2 h-4 w-4" />
              )}
              {t('permissions.scan')}
            </Button>
            <Button 
              onClick={handleSaveAll} 
              disabled={saving || !hasChanges}
            >
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <Save className="mr-2 h-4 w-4" />
              {t('permissions.saveAll')}
            </Button>
          </div>
        </div>

        {/* Info Banner */}
        {hasChanges && (
          <Card className="border-orange-500 bg-orange-50 dark:bg-orange-950">
            <CardContent className="pt-6">
              <div className="flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-orange-600 mt-0.5" />
                <div>
                  <h3 className="font-semibold text-orange-900 dark:text-orange-100">{t('permissions.unsavedChanges')}</h3>
                  <p className="text-sm text-orange-700 dark:text-orange-200">
                    {t('permissions.unsavedDesc')}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {roles.map((role) => {
            const RoleIcon = getRoleIcon(role.role);
            return (
              <Card key={role.role}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <RoleIcon className="h-5 w-5 text-muted-foreground" />
                    <Badge className={getRoleBadgeColor(role.role)}>
                      {role.label}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{getPermissionsCount(role.role)}</div>
                  <p className="text-xs text-muted-foreground">{t('permissions.activePermissions')}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Role Tabs */}
        <Tabs value={activeRole} onValueChange={setActiveRole}>
          <TabsList className="grid w-full grid-cols-2 lg:grid-cols-4">
            {roles.map((role) => {
              const RoleIcon = getRoleIcon(role.role);
              return (
                <TabsTrigger key={role.role} value={role.role} className="flex items-center gap-2">
                  <RoleIcon className="h-4 w-4" />
                  <span className="hidden sm:inline">{role.label}</span>
                  <span className="sm:hidden">{role.role}</span>
                </TabsTrigger>
              );
            })}
          </TabsList>

          {roles.map((role) => (
            <TabsContent key={role.role} value={role.role} className="mt-6">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <Badge className={getRoleBadgeColor(role.role)}>{role.label}</Badge>
                      </CardTitle>
                      <CardDescription className="mt-2">
                        {role.description}
                      </CardDescription>
                    </div>
                    <Button 
                      size="sm"
                      onClick={() => handleSaveRole(role.role)}
                      disabled={saving || !hasChanges}
                    >
                      {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      <Save className="mr-2 h-4 w-4" />
                      {t('permissions.save')}
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-6">
                  {modules.map((module) => (
                    <div key={module.module} className="space-y-3">
                      <div className="flex items-center gap-2 border-b pb-2">
                        <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                          <Shield className="h-4 w-4 text-primary" />
                        </div>
                        <h3 className="font-semibold text-lg">{module.label}</h3>
                        <Badge variant="secondary" className="ml-auto">
                          {module.permissions.filter(p => rolePermissions[role.role]?.has(p.full_path)).length}/{module.permissions.length}
                        </Badge>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 pl-10">
                        {module.permissions.map((permission) => {
                          const isChecked = rolePermissions[role.role]?.has(permission.full_path) || false;
                          const isWildcard = rolePermissions[role.role]?.has('*') || false;
                          
                          return (
                            <div 
                              key={permission.full_path}
                              className={`flex items-start space-x-3 p-3 rounded-lg border transition-colors ${
                                isChecked || isWildcard 
                                  ? 'bg-primary/5 border-primary/30' 
                                  : 'bg-muted/30 hover:bg-muted/50'
                              }`}
                            >
                              <Checkbox
                                id={`${role.role}-${permission.full_path}`}
                                checked={isChecked || isWildcard}
                                disabled={isWildcard}
                                onCheckedChange={(checked) => 
                                  handleTogglePermission(role.role, permission.full_path, checked)
                                }
                                className="mt-1"
                              />
                              <label
                                htmlFor={`${role.role}-${permission.full_path}`}
                                className="flex-1 cursor-pointer"
                              >
                                <p className="text-sm font-medium leading-none mb-1">
                                  {permission.label}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {permission.action}
                                </p>
                              </label>
                              {(isChecked || isWildcard) && (
                                <Check className="h-4 w-4 text-primary flex-shrink-0 mt-1" />
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </TabsContent>
          ))}
        </Tabs>

        {/* Info Card */}
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="pt-6">
            <div className="flex items-start gap-4">
              <Shield className="h-6 w-6 text-primary mt-0.5 flex-shrink-0" />
              <div className="space-y-2">
                <h3 className="font-semibold">{t('permissions.aboutTitle')}</h3>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>• {t('permissions.aboutScan')}</li>
                  <li>• {t('permissions.aboutWildcard')}</li>
                  <li>• {t('permissions.aboutEffect')}</li>
                  <li>• {t('permissions.aboutGrouped')}</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default PermissionsManagement;
