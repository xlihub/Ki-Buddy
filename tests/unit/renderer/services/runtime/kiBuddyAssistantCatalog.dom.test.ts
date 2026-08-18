import type { ProductExperience } from '@/common/platform/ki-buddy';
import type { Assistant } from '@/common/types/agent/assistantTypes';
import { createAionUiProductExperience, createKiBuddyProductExperience } from '@/common/platform/ki-buddy';
import { projectProductAssistantCatalog } from '@/renderer/services/runtime/catalogs/kiBuddyAssistantCatalog';
import { KI_BUDDY_PRODUCT_RESOURCE_REGISTRY } from '@/renderer/services/runtime/catalogs/kiBuddyResourceRegistry';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import productConfig from '../../../../../ki-buddy-product.json';

const { listAssistantsMock } = vi.hoisted(() => ({ listAssistantsMock: vi.fn() }));

vi.mock('@/common', () => ({
  ipcBridge: {
    assistants: {
      list: { invoke: listAssistantsMock },
    },
  },
}));

const assistant = (overrides: Partial<Assistant> & Pick<Assistant, 'id' | 'source'>): Assistant => ({
  id: overrides.id,
  source: overrides.source,
  name: overrides.id,
  name_i18n: {},
  description_i18n: {},
  enabled: true,
  sort_order: 0,
  agent_id: '632f31d2',
  agent: { type: 'aionrs', source: 'internal' },
  enabled_skills: [],
  custom_skill_names: [],
  disabled_builtin_skills: [],
  context_i18n: {},
  prompts: [],
  prompts_i18n: {},
  models: [],
  agent_status: 'online',
  team_selectable: true,
  deletable: false,
  ...overrides,
});

const kiBuddyExperience = (): ProductExperience => createKiBuddyProductExperience(productConfig.experience);

describe('projectProductAssistantCatalog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses one stable registry for product Agent, Assistant, Skill, and MCP identities', () => {
    expect(
      Object.values(KI_BUDDY_PRODUCT_RESOURCE_REGISTRY.agent).map(({ id, featureId }) => ({ id, featureId }))
    ).toEqual([{ id: '632f31d2', featureId: 'agents' }]);
    expect(
      Object.values(KI_BUDDY_PRODUCT_RESOURCE_REGISTRY.assistant).map(({ id, featureId }) => ({ id, featureId }))
    ).toEqual([
      { id: 'word-creator', featureId: 'assistants' },
      { id: 'ppt-creator', featureId: 'assistants' },
      { id: 'excel-creator', featureId: 'assistants' },
      { id: 'bare:632f31d2', featureId: 'assistants' },
    ]);
    expect(
      Object.values(KI_BUDDY_PRODUCT_RESOURCE_REGISTRY.skill).map(({ id, backendName }) => ({ id, backendName }))
    ).toEqual([
      { id: 'builtin:officecli-docx', backendName: 'officecli-docx' },
      { id: 'builtin:officecli-pptx', backendName: 'officecli-pptx' },
      { id: 'builtin:officecli-xlsx', backendName: 'officecli-xlsx' },
    ]);
    expect(KI_BUDDY_PRODUCT_RESOURCE_REGISTRY.mcp).toEqual({});
  });

  it('shows stable product and Custom Assistants with manage access', () => {
    const catalog = projectProductAssistantCatalog(
      [
        assistant({ id: 'word-creator', source: 'builtin' }),
        assistant({ id: 'ppt-creator', source: 'builtin' }),
        assistant({ id: 'excel-creator', source: 'builtin' }),
        assistant({ id: 'bare:632f31d2', source: 'generated' }),
        assistant({ id: 'my-assistant', source: 'user', deletable: true }),
        assistant({ id: 'cowork', source: 'builtin' }),
      ],
      kiBuddyExperience()
    );

    expect(catalog.entries.map(({ assistant: entry, access, origin }) => ({ id: entry.id, access, origin }))).toEqual([
      { id: 'word-creator', access: 'manage', origin: 'productBuiltin' },
      { id: 'ppt-creator', access: 'manage', origin: 'productBuiltin' },
      { id: 'excel-creator', access: 'manage', origin: 'productBuiltin' },
      { id: 'bare:632f31d2', access: 'manage', origin: 'productBuiltin' },
      { id: 'my-assistant', access: 'manage', origin: 'custom' },
    ]);
    expect(catalog.visibleAssistants.map(({ id, productAccess }) => ({ id, productAccess }))).toEqual([
      { id: 'word-creator', productAccess: 'manage' },
      { id: 'ppt-creator', productAccess: 'manage' },
      { id: 'excel-creator', productAccess: 'manage' },
      { id: 'bare:632f31d2', productAccess: 'manage' },
      { id: 'my-assistant', productAccess: 'manage' },
    ]);
  });

  it('hides upstream, Extension, and unknown Assistants with structured diagnostics', () => {
    const catalog = projectProductAssistantCatalog(
      [
        assistant({ id: 'cowork', source: 'builtin' }),
        assistant({
          id: 'extension-assistant',
          source: 'generated',
          agent: { type: 'acp', source: 'extension' },
        }),
        assistant({ id: 'future-assistant', source: 'future' as Assistant['source'] }),
      ],
      kiBuddyExperience()
    );

    expect(catalog.visibleAssistants).toEqual([]);
    expect(catalog.hiddenResources.map(({ resourceId, origin }) => ({ resourceId, origin }))).toEqual([
      { resourceId: 'cowork', origin: 'upstreamBuiltin' },
      { resourceId: 'extension-assistant', origin: 'extension' },
      { resourceId: 'future-assistant', origin: 'unclassified' },
    ]);
    expect(catalog.hiddenResources.every(({ code }) => code === 'product_resource_hidden')).toBe(true);
  });

  it('keeps every Assistant visible and manageable in AionUi', () => {
    const candidates = [
      assistant({ id: 'word-creator', source: 'builtin' }),
      assistant({ id: 'cowork', source: 'builtin' }),
      assistant({ id: 'my-assistant', source: 'user' }),
      assistant({
        id: 'extension-assistant',
        source: 'generated',
        agent: { type: 'acp', source: 'extension' },
      }),
    ];

    const catalog = projectProductAssistantCatalog(candidates, createAionUiProductExperience());

    expect(catalog.visibleAssistants.map(({ id, productAccess }) => ({ id, productAccess }))).toEqual(
      candidates.map(({ id }) => ({ id, productAccess: 'manage' }))
    );
    expect(catalog.hiddenResources).toEqual([]);
  });
});

describe('loadProductBuiltinAssistantResourceState', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reports a missing product Assistant instead of accepting a similarly named builtin', async () => {
    listAssistantsMock.mockResolvedValue([
      assistant({ id: 'word-assistant-with-a-new-id', source: 'builtin', name: 'Word Creator' }),
      assistant({ id: 'ppt-creator', source: 'builtin' }),
      assistant({ id: 'excel-creator', source: 'builtin' }),
      assistant({ id: 'bare:632f31d2', source: 'generated' }),
    ]);

    const { loadProductBuiltinAssistantResourceState } =
      await import('@/renderer/services/runtime/catalogs/kiBuddyAssistantCatalog');

    await expect(loadProductBuiltinAssistantResourceState(kiBuddyExperience())).resolves.toEqual({
      status: 'invalid',
      missing: [
        expect.objectContaining({
          code: 'required_product_resource_missing',
          kind: 'assistant',
          resourceId: 'word-creator',
        }),
      ],
    });
  });

  it('keeps integrity pending when the Assistant directory is unavailable', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    listAssistantsMock.mockRejectedValue(new Error('catalog unavailable'));
    const { loadProductBuiltinAssistantResourceState } =
      await import('@/renderer/services/runtime/catalogs/kiBuddyAssistantCatalog');

    await expect(loadProductBuiltinAssistantResourceState(kiBuddyExperience())).resolves.toEqual({
      status: 'pending',
      missing: [],
    });
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });
});
