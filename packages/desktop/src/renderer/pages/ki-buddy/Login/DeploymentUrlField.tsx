import { AutoComplete, Button, Input, Tag } from '@arco-design/web-react';
import { CloseSmall } from '@icon-park/react';
import React from 'react';
import type { DeploymentHistory } from './deploymentHistory';

type DeploymentUrlFieldProps = {
  disabled?: boolean;
  error?: boolean;
  history: DeploymentHistory;
  id?: string;
  inputLabel: string;
  clearLabel: string;
  lastSuccessfulLabel: string;
  onChange?: (value: string) => void;
  placeholder: string;
  value?: string;
};

const DeploymentUrlField: React.FC<DeploymentUrlFieldProps> = ({
  disabled,
  error,
  history,
  id,
  inputLabel,
  clearLabel,
  lastSuccessfulLabel,
  onChange,
  placeholder,
  value,
}) => (
  <AutoComplete
    disabled={disabled}
    error={error}
    filterOption={false}
    placeholder={placeholder}
    value={value}
    onChange={onChange}
    virtualListProps={{ height: 240 }}
    inputProps={{
      id,
      'aria-label': inputLabel,
      autoComplete: 'url',
      size: 'large',
      suffix:
        value && !disabled ? (
          <Button
            type='text'
            shape='circle'
            size='mini'
            aria-label={clearLabel}
            icon={<CloseSmall theme='outline' size={14} />}
            onMouseDown={(event) => event.preventDefault()}
            onClick={(event) => {
              event.stopPropagation();
              onChange?.('');
            }}
          />
        ) : undefined,
    }}
  >
    {history.successfulUrls.map((url) => (
      <AutoComplete.Option key={url} value={url}>
        <div className='min-w-0 w-full flex items-center justify-between gap-12px'>
          <span className='min-w-0 truncate'>{url}</span>
          {url === history.lastSuccessful ? (
            <Tag size='small' className='shrink-0'>
              {lastSuccessfulLabel}
            </Tag>
          ) : null}
        </div>
      </AutoComplete.Option>
    ))}
  </AutoComplete>
);

export default DeploymentUrlField;
