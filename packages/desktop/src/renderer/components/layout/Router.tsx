import React, { Suspense } from 'react';
import { HashRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import AppLoader from '@renderer/components/layout/AppLoader';
import { useAuth } from '@renderer/hooks/context/AuthContext';
import { getKiBuddyRouteComponents, isProductFeatureEnabled } from '@/renderer/services/runtime/kiBuddyRuntime';
import { getSettingsExperienceProjection } from '@renderer/pages/settings/components/SettingsSider';
const Conversation = React.lazy(() => import('@renderer/pages/conversation'));
const Guid = React.lazy(() => import('@renderer/pages/guid'));
const AgentSettings = React.lazy(() => import('@renderer/pages/settings/AgentSettings'));
const AgentRepairPage = React.lazy(() => import('@renderer/pages/settings/AgentSettings/AgentRepairPage'));
const AssistantSettings = React.lazy(() => import('@renderer/pages/settings/AssistantSettings'));
const SkillsSettings = React.lazy(() => import('@renderer/pages/settings/SkillsSettings/SkillsHubSettings'));
const SkillDetailPage = React.lazy(() => import('@renderer/pages/settings/SkillsSettings/SkillDetailPage'));
const ToolsSettings = React.lazy(() => import('@renderer/pages/settings/ToolsSettings'));
const AppearanceSettings = React.lazy(() => import('@renderer/pages/settings/AppearanceSettings'));
const ModeSettings = React.lazy(() => import('@renderer/pages/settings/ModeSettings'));
const SystemSettings = React.lazy(() => import('@renderer/pages/settings/SystemSettings'));
const WebuiSettings = React.lazy(() => import('@renderer/pages/settings/WebuiSettings'));
const PetSettings = React.lazy(() => import('@renderer/pages/settings/PetSettings'));
const ExtensionSettingsPage = React.lazy(() => import('@renderer/pages/settings/ExtensionSettingsPage'));
const AionUiLoginPage = React.lazy(() => import('@renderer/pages/login'));
const ComponentsShowcase = React.lazy(() => import('@renderer/pages/TestShowcase'));
const ScheduledTasksPage = React.lazy(() => import('@renderer/pages/cron/ScheduledTasksPage'));
const TaskDetailPage = React.lazy(() => import('@renderer/pages/cron/ScheduledTasksPage/TaskDetailPage'));
const TeamIndex = React.lazy(() => import('@renderer/pages/team'));

const withRouteFallback = (Component: React.LazyExoticComponent<React.ComponentType>) => (
  <Suspense fallback={<AppLoader />}>
    <Component />
  </Suspense>
);

/**
 * Legacy `/settings/capabilities?tab=tools` deep links now map to the standalone
 * Tools page; everything else (skills tab or no tab) lands on the Skills page.
 */
const CapabilitiesRedirect: React.FC<{
  defaultSettingsPath: string;
  skillsEnabled: boolean;
  toolsEnabled: boolean;
}> = ({ defaultSettingsPath, skillsEnabled, toolsEnabled }) => {
  const { search } = useLocation();
  const tab = new URLSearchParams(search).get('tab');
  const target =
    tab === 'tools' && toolsEnabled ? '/settings/tools' : skillsEnabled ? '/settings/skills' : defaultSettingsPath;
  return <Navigate to={target} replace />;
};

const ProtectedLayout: React.FC<{ layout: React.ReactElement }> = ({ layout }) => {
  const { status } = useAuth();

  if (status === 'checking') {
    return <AppLoader />;
  }

  if (status !== 'authenticated') {
    return <Navigate to='/login' replace />;
  }

  return React.cloneElement(layout);
};

const PanelRoute: React.FC<{ layout: React.ReactElement }> = ({ layout }) => {
  const { status } = useAuth();
  const kiBuddyRoutes = getKiBuddyRouteComponents();
  const guidEnabled = isProductFeatureEnabled('guid');
  const conversationEnabled = isProductFeatureEnabled('conversation');
  const assistantsEnabled = isProductFeatureEnabled('assistants');
  const scheduledTasksEnabled = isProductFeatureEnabled('scheduledTasks');
  const teamEnabled = isProductFeatureEnabled('team');
  const componentShowcaseEnabled = isProductFeatureEnabled('componentShowcase');
  const settingsProjection = getSettingsExperienceProjection({
    includeProductEntries: Boolean(kiBuddyRoutes),
    isDesktop: true,
  });
  const enabledSettings = new Set(settingsProjection.entries.map(({ id }) => id));
  const { defaultPath: defaultSettingsPath, extensionSettingsEnabled } = settingsProjection;
  const LoginPage = kiBuddyRoutes?.LoginPage ?? AionUiLoginPage;

  const routes = (
    <HashRouter>
      <Routes>
        <Route
          path='/login'
          element={
            status === 'checking' ? (
              <AppLoader />
            ) : status === 'authenticated' ? (
              <Navigate to='/guid' replace />
            ) : (
              withRouteFallback(LoginPage)
            )
          }
        />
        <Route element={<ProtectedLayout layout={layout} />}>
          <Route index element={<Navigate to='/guid' replace />} />
          {guidEnabled && <Route path='/guid' element={withRouteFallback(Guid)} />}
          {conversationEnabled && <Route path='/conversation/:id' element={withRouteFallback(Conversation)} />}
          {teamEnabled && <Route path='/team/:id' element={withRouteFallback(TeamIndex)} />}
          {enabledSettings.has('model') && <Route path='/settings/model' element={withRouteFallback(ModeSettings)} />}
          {assistantsEnabled && <Route path='/assistants' element={withRouteFallback(AssistantSettings)} />}
          {/* Assistants moved out of Settings to a top-level entry; keep a redirect
              so old deep links / back-nav still land on the new page. */}
          <Route
            path='/settings/assistants'
            element={<Navigate to={assistantsEnabled ? '/assistants' : '/guid'} replace />}
          />
          {enabledSettings.has('agent') && (
            <>
              <Route path='/settings/agent' element={withRouteFallback(AgentSettings)} />
              <Route path='/settings/agent/:id/repair' element={withRouteFallback(AgentRepairPage)} />
            </>
          )}
          {/* Skills and Tools are top-level settings entries. */}
          {enabledSettings.has('skills') && (
            <>
              <Route path='/settings/skills' element={withRouteFallback(SkillsSettings)} />
              <Route path='/settings/skills/import-history' element={withRouteFallback(SkillsSettings)} />
              <Route path='/settings/skills/detail/:skillName' element={withRouteFallback(SkillDetailPage)} />
            </>
          )}
          {enabledSettings.has('tools') && <Route path='/settings/tools' element={withRouteFallback(ToolsSettings)} />}
          {/* Legacy routes — the previous combined "Capabilities" page is now two pages. */}
          <Route
            path='/settings/capabilities'
            element={
              <CapabilitiesRedirect
                defaultSettingsPath={defaultSettingsPath}
                skillsEnabled={enabledSettings.has('skills')}
                toolsEnabled={enabledSettings.has('tools')}
              />
            }
          />
          {enabledSettings.has('skills') && (
            <>
              <Route
                path='/settings/capabilities/skills/import-history'
                element={<Navigate to='/settings/skills/import-history' replace />}
              />
              <Route path='/settings/skills-hub' element={<Navigate to='/settings/skills' replace />} />
            </>
          )}
          {enabledSettings.has('appearance') && (
            <>
              <Route path='/settings/appearance' element={withRouteFallback(AppearanceSettings)} />
              <Route path='/settings/display' element={<Navigate to='/settings/appearance' replace />} />
            </>
          )}
          {enabledSettings.has('webui') && <Route path='/settings/webui' element={withRouteFallback(WebuiSettings)} />}
          {enabledSettings.has('pet') && <Route path='/settings/pet' element={withRouteFallback(PetSettings)} />}
          {enabledSettings.has('system') && (
            <Route path='/settings/system' element={withRouteFallback(SystemSettings)} />
          )}
          {enabledSettings.has('about') && <Route path='/settings/about' element={withRouteFallback(SystemSettings)} />}
          {enabledSettings.has('account') && kiBuddyRoutes && (
            <Route path='/settings/account' element={withRouteFallback(kiBuddyRoutes.AccountSettings)} />
          )}
          {extensionSettingsEnabled && (
            <Route path='/settings/ext/:tabId' element={withRouteFallback(ExtensionSettingsPage)} />
          )}
          <Route path='/settings' element={<Navigate to={defaultSettingsPath} replace />} />
          <Route path='/settings/*' element={<Navigate to={defaultSettingsPath} replace />} />
          {componentShowcaseEnabled && (
            <Route path='/test/components' element={withRouteFallback(ComponentsShowcase)} />
          )}
          {scheduledTasksEnabled && (
            <>
              <Route path='/scheduled' element={withRouteFallback(ScheduledTasksPage)} />
              <Route path='/scheduled/:job_id' element={withRouteFallback(TaskDetailPage)} />
            </>
          )}
        </Route>
        <Route path='*' element={<Navigate to={status === 'authenticated' ? '/guid' : '/login'} replace />} />
      </Routes>
    </HashRouter>
  );

  if (kiBuddyRoutes) {
    const StartupGate = kiBuddyRoutes.StartupGate;
    return (
      <Suspense fallback={<AppLoader />}>
        <StartupGate>{routes}</StartupGate>
      </Suspense>
    );
  }

  return routes;
};

export default PanelRoute;
