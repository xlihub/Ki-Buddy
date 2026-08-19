import { Collapse } from '@arco-design/web-react';
import React from 'react';
import type { IMcpServer } from '@/common/config/storage';
import McpServerHeader from './McpServerHeader';
import McpServerToolsList from './McpServerToolsList';
import type { McpOAuthStatus } from '@/renderer/hooks/mcp/useMcpOAuth';
import type { ProductResourceAccess, ProductResourceOrigin } from '@/common/platform/ki-buddy';

interface McpServerItemProps {
  server: IMcpServer;
  access?: ProductResourceAccess;
  origin?: ProductResourceOrigin;
  isCollapsed: boolean;
  isTestingConnection: boolean;
  oauthStatus?: McpOAuthStatus;
  isLoggingIn?: boolean;
  /** Extension-contributed servers are read-only (no edit/delete) */
  isReadOnly?: boolean;
  onToggleCollapse: () => void;
  onTestConnection: (server: IMcpServer) => void;
  onEditServer: (server: IMcpServer) => void;
  onDeleteServer: (serverId: string) => void;
  onOAuthLogin?: (server: IMcpServer) => void;
}

const McpServerItem: React.FC<McpServerItemProps> = ({
  server,
  access,
  origin,
  isCollapsed,
  isTestingConnection,
  oauthStatus,
  isLoggingIn,
  isReadOnly,
  onToggleCollapse,
  onTestConnection,
  onEditServer,
  onDeleteServer,
  onOAuthLogin,
}) => {
  return (
    <Collapse
      key={server.id}
      data-product-resource-id={server.id}
      data-product-resource-origin={origin}
      data-product-resource-access={access}
      activeKey={isCollapsed ? ['1'] : []}
      onChange={onToggleCollapse}
      className='mb-4 [&_div.arco-collapse-item-header-title]:flex-1'
    >
      <Collapse.Item
        header={
          <McpServerHeader
            server={server}
            access={access}
            isTestingConnection={isTestingConnection}
            oauthStatus={oauthStatus}
            isLoggingIn={isLoggingIn}
            isReadOnly={isReadOnly}
            onTestConnection={onTestConnection}
            onEditServer={onEditServer}
            onDeleteServer={onDeleteServer}
            onOAuthLogin={onOAuthLogin}
          />
        }
        name='1'
        className={'[&_div.arco-collapse-item-content-box]:py-3'}
      >
        <McpServerToolsList server={server} />
      </Collapse.Item>
    </Collapse>
  );
};

export default McpServerItem;
