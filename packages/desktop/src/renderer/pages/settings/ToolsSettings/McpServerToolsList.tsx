import React from 'react';
import { useTranslation } from 'react-i18next';
import { Tooltip } from '@arco-design/web-react';
import type { IMcpServer } from '@/common/config/storage';
import type { ProductResourceOrigin } from '@/common/platform/ki-buddy';
import { resolveKiBuddyMcpToolDescriptionKey } from '@/renderer/services/runtime/catalogs/kiBuddyResourceRegistry';

interface McpServerToolsListProps {
  server: IMcpServer;
  origin?: ProductResourceOrigin;
}

const McpServerToolsList: React.FC<McpServerToolsListProps> = ({ server, origin }) => {
  const { t } = useTranslation();

  if (!server.tools || server.tools.length === 0) {
    return null;
  }

  return (
    <div className='space-y-3'>
      <div>
        <div className='space-y-2'>
          {server.tools.map((tool, index) => {
            const productDescriptionKey = resolveKiBuddyMcpToolDescriptionKey(server, origin, tool.name);
            const description = productDescriptionKey
              ? t(productDescriptionKey)
              : tool.description || t('settings.mcpNoDescription');
            return (
              <div key={index} className='rounded-lg border border-2 bg-bg-2 px-4 py-3'>
                <div className='flex gap-4'>
                  <div className='flex-shrink-0 min-w-0 w-1/3'>
                    <div className='break-words text-sm font-semibold text-t-primary'>{tool.name}</div>
                  </div>
                  <div className='flex-1 min-w-0'>
                    <Tooltip content={description}>
                      <div className='line-clamp-1 cursor-pointer text-xs leading-5 text-t-secondary'>
                        {description}
                      </div>
                    </Tooltip>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default McpServerToolsList;
