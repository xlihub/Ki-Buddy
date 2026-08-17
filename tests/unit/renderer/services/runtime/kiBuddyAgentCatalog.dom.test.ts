import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  KI_BUDDY_PRODUCT_CAPABILITY,
  createAionUiProductExperience,
  createKiBuddyProductExperience,
} from '@/common/platform/ki-buddy';
import type { ManagedAgent } from '@/renderer/utils/model/agentTypes';
import type { Assistant } from '@/common/types/agent/assistantTypes';
import {
  KI_CLI_PRODUCT_RESOURCE_ID,
  loadProductAgentCatalog,
  loadProductBuiltinAgentResourceState,
  projectProductAssistantCandidates,
  projectProductAgentCatalog,
} from '@/renderer/services/runtime/kiBuddyAgentCatalog';
import productConfig from '../../../../../ki-buddy-product.json';

const { requestManagedAgentsMock } = vi.hoisted(() => ({ requestManagedAgentsMock: vi.fn() }));

vi.mock('@/renderer/utils/model/agentTypes', async () => {
  const actual = await vi.importActual<typeof import('@/renderer/utils/model/agentTypes')>(
    '@/renderer/utils/model/agentTypes'
  );
  return {
    ...actual,
    requestManagedAgents: requestManagedAgentsMock,
  };
});

const agent = (overrides: Partial<ManagedAgent> & Pick<ManagedAgent, 'id' | 'name'>): ManagedAgent => ({
  agent_type: 'acp',
  agent_source: 'builtin',
  enabled: true,
  installed: true,
  status: 'online',
  ...overrides,
});

const candidates = [
  agent({
    id: KI_CLI_PRODUCT_RESOURCE_ID,
    name: 'Renamed internal runtime',
    agent_type: 'aionrs',
    agent_source: 'internal',
  }),
  agent({ id: 'builtin-claude', name: 'Claude Code' }),
  agent({ id: 'custom-1', name: 'My Agent', agent_source: 'custom' }),
  agent({ id: 'extension-1', name: 'Extension Agent', agent_source: 'extension', isExtension: true }),
  agent({
    id: 'future-1',
    name: 'Future Agent',
    agent_source: 'future' as ManagedAgent['agent_source'],
  }),
];

const assistant = (id: string, agentId: string, source: 'internal' | 'builtin' | 'custom'): Assistant => ({
  id,
  source: 'generated',
  name: id,
  name_i18n: {},
  description_i18n: {},
  enabled: true,
  sort_order: 1,
  agent_id: agentId,
  agent: { type: source === 'internal' ? 'aionrs' : 'acp', source },
  enabled_skills: [],
  custom_skill_names: [],
  disabled_builtin_skills: [],
  context_i18n: {},
  prompts: [],
  prompts_i18n: {},
  models: [],
  agent_status: 'online',
  team_selectable: true,
  deletable: true,
});

describe('projectProductAgentCatalog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the stable KiCLI resource with use access and Custom Agents with manage access', () => {
    const catalog = projectProductAgentCatalog(candidates, createKiBuddyProductExperience(productConfig.experience));

    expect(catalog.entries.map(({ agent: entry, origin, access }) => ({ id: entry.id, origin, access }))).toEqual([
      { id: KI_CLI_PRODUCT_RESOURCE_ID, origin: 'productBuiltin', access: 'use' },
      { id: 'custom-1', origin: 'custom', access: 'manage' },
    ]);
    expect(catalog.visibleAgents).toEqual([
      { ...candidates[0], productAccess: 'use' },
      { ...candidates[2], productAccess: 'manage' },
    ]);
  });

  it('hides upstream, Extension, and unclassified Agents with non-sensitive structured diagnostics', () => {
    const catalog = projectProductAgentCatalog(candidates, createKiBuddyProductExperience(productConfig.experience));

    expect(catalog.hiddenResources).toEqual([
      expect.objectContaining({ resourceId: 'builtin-claude', origin: 'upstreamBuiltin' }),
      expect.objectContaining({ resourceId: 'extension-1', origin: 'extension' }),
      expect.objectContaining({ resourceId: 'future-1', origin: 'unclassified' }),
    ]);
    expect(catalog.hiddenResources.every((record) => record.code === 'product_resource_hidden')).toBe(true);
    expect(catalog.hiddenResources[0]).not.toHaveProperty('command');
    expect(catalog.hiddenResources[0]).not.toHaveProperty('env');
  });

  it('does not identify a similarly named or similarly typed Agent as KiCLI without the stable product ID', () => {
    const catalog = projectProductAgentCatalog(
      [
        agent({
          id: 'wrong-id',
          name: 'Ki CLI',
          agent_type: 'aionrs',
          agent_source: 'internal',
        }),
        agent({
          id: KI_CLI_PRODUCT_RESOURCE_ID,
          name: 'Ki CLI',
          agent_type: 'acp',
          agent_source: 'builtin',
        }),
      ],
      createKiBuddyProductExperience(productConfig.experience)
    );

    expect(catalog.entries).toEqual([]);
    expect(catalog.hiddenResources.map(({ resourceId, origin }) => ({ resourceId, origin }))).toEqual([
      { resourceId: 'wrong-id', origin: 'unclassified' },
      { resourceId: KI_CLI_PRODUCT_RESOURCE_ID, origin: 'upstreamBuiltin' },
    ]);
  });

  it('keeps every Agent visible and manageable in AionUi', () => {
    const catalog = projectProductAgentCatalog(candidates, createAionUiProductExperience());

    expect(catalog.visibleAgents).toEqual(candidates.map((candidate) => ({ ...candidate, productAccess: 'manage' })));
    expect(catalog.entries.every(({ access }) => access === 'manage')).toBe(true);
    expect(catalog.hiddenResources).toEqual([]);
  });

  it('loads one projected catalog and emits structured records for hidden Agents', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    requestManagedAgentsMock.mockResolvedValue(candidates);

    const catalog = await loadProductAgentCatalog(createKiBuddyProductExperience(productConfig.experience));

    expect(catalog.visibleAgents.map(({ id }) => id)).toEqual([KI_CLI_PRODUCT_RESOURCE_ID, 'custom-1']);
    expect(info).toHaveBeenCalledWith(
      '[ProductExperience] Agent resources hidden by product policy',
      expect.objectContaining({ code: 'product_resource_projection', resources: catalog.hiddenResources })
    );
    info.mockRestore();
  });
});

describe('loadProductBuiltinAgentResourceState', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.__kiBuddyProductPresentation = null;
  });

  it('accepts the required KiCLI only when the backend directory contains its stable identity', async () => {
    requestManagedAgentsMock.mockResolvedValue([candidates[0]]);

    await expect(
      loadProductBuiltinAgentResourceState(createKiBuddyProductExperience(productConfig.experience))
    ).resolves.toEqual({ status: 'ready', missing: [] });
  });

  it('reports installation integrity when a similarly named Agent replaces the required KiCLI identity', async () => {
    window.__kiBuddyProductPresentation = {
      ...KI_BUDDY_PRODUCT_CAPABILITY,
      brand: { ...KI_BUDDY_PRODUCT_CAPABILITY.brand, cliName: 'Configured CLI' },
    };
    requestManagedAgentsMock.mockResolvedValue([
      agent({ id: 'wrong-id', name: 'Ki CLI', agent_type: 'aionrs', agent_source: 'internal' }),
    ]);

    await expect(
      loadProductBuiltinAgentResourceState(createKiBuddyProductExperience(productConfig.experience))
    ).resolves.toEqual({
      status: 'invalid',
      missing: [
        {
          code: 'required_product_resource_missing',
          featureId: 'agents',
          kind: 'agent',
          origin: 'productBuiltin',
          resourceId: KI_CLI_PRODUCT_RESOURCE_ID,
          resourceName: 'Configured CLI',
        },
      ],
    });
  });

  it('keeps integrity pending when the backend directory is unavailable', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    requestManagedAgentsMock.mockRejectedValue(new Error('catalog unavailable'));

    await expect(
      loadProductBuiltinAgentResourceState(createKiBuddyProductExperience(productConfig.experience))
    ).resolves.toEqual({ status: 'pending', missing: [] });
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });
});

describe('projectProductAssistantCandidates', () => {
  it('uses the authoritative projected Agent directory for Guid and conversation Assistant candidates', () => {
    const assistants = [
      assistant('ki-cli-assistant', KI_CLI_PRODUCT_RESOURCE_ID, 'internal'),
      assistant('upstream-assistant', 'builtin-claude', 'builtin'),
      assistant('custom-assistant', 'custom-1', 'custom'),
      assistant('stale-custom-assistant', 'custom-removed', 'custom'),
    ];
    const catalog = projectProductAgentCatalog(candidates, createKiBuddyProductExperience(productConfig.experience));

    const visible = projectProductAssistantCandidates(assistants, catalog);

    expect(visible.map(({ id }) => id)).toEqual(['ki-cli-assistant', 'custom-assistant']);
  });
});
