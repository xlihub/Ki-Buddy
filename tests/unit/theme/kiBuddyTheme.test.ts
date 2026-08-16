import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const kiBuddyThemeCss = readFileSync(
  resolve(__dirname, '../../../packages/desktop/src/renderer/styles/themes/ki-buddy-color-scheme.css'),
  'utf8'
);
const arcoOverrideCss = readFileSync(
  resolve(__dirname, '../../../packages/desktop/src/renderer/styles/arco-override.css'),
  'utf8'
);
const loginPageCss = readFileSync(
  resolve(__dirname, '../../../packages/desktop/src/renderer/pages/ki-buddy/Login/LoginPage.module.css'),
  'utf8'
);

function readRule(selector: string): string {
  const selectorStart = kiBuddyThemeCss.indexOf(selector);
  if (selectorStart === -1) return '';
  const bodyStart = kiBuddyThemeCss.indexOf('{', selectorStart);
  let depth = 0;
  for (let index = bodyStart; index < kiBuddyThemeCss.length; index += 1) {
    if (kiBuddyThemeCss[index] === '{') depth += 1;
    if (kiBuddyThemeCss[index] === '}') depth -= 1;
    if (depth === 0) return kiBuddyThemeCss.slice(bodyStart + 1, index);
  }
  return '';
}

function relativeLuminance(hex: string): number {
  const channels = hex
    .slice(1)
    .match(/.{2}/g)!
    .map((value) => Number.parseInt(value, 16) / 255)
    .map((value) => (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4));
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

function contrastRatio(first: string, second: string): number {
  const firstLuminance = relativeLuminance(first);
  const secondLuminance = relativeLuminance(second);
  const lighter = Math.max(firstLuminance, secondLuminance);
  const darker = Math.min(firstLuminance, secondLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

describe('Ki-Buddy product color theme', () => {
  it('keeps approved ki-buddy-pro values in a product primitive layer', () => {
    const primitives = readRule("[data-product='ki-buddy']");

    expect(primitives).toContain('--ki-ref-color-red-500: #d8403a');
    expect(primitives).toContain('--ki-ref-color-red-600: #b42318');
    expect(primitives).toContain('--ki-ref-color-canvas-warm: #fffbfa');
    expect(primitives).not.toContain('--primary:');
  });

  it('maps light product actions onto the existing AionUi and Arco contract', () => {
    const lightTheme = readRule("[data-product='ki-buddy'][data-product-theme='ki-buddy-light']");

    expect(lightTheme).toContain('--ki-color-accent-bg: var(--ki-ref-color-red-600)');
    expect(lightTheme).toContain('--ki-color-on-accent: var(--ki-ref-color-surface-default)');
    expect(lightTheme).toContain('--primary: var(--ki-color-accent-bg)');
    expect(lightTheme).toContain('--brand: var(--ki-color-accent-fg)');
  });

  it('inherits upstream neutral surfaces instead of tinting product backgrounds red', () => {
    for (const selector of [
      "[data-product='ki-buddy'][data-product-theme='ki-buddy-light']",
      "[data-product='ki-buddy'][data-product-theme='ki-buddy-dark']",
    ]) {
      const theme = readRule(selector);
      for (const token of [
        '--aou-1:',
        '--bg-base:',
        '--bg-1:',
        '--fill:',
        '--color-primary-light-1:',
        '--color-primary-light-2:',
        '--color-primary-light-3:',
        '--brand-light:',
        '--color-brand-bg:',
        '--message-user-bg:',
        '--workspace-btn-bg:',
        '--color-guid-agent-bar:',
      ]) {
        expect(theme, `${selector} must inherit ${token}`).not.toContain(token);
      }
    }
  });

  it('scopes the light red product surface to the login card', () => {
    const lightTheme = readRule("[data-product='ki-buddy'][data-product-theme='ki-buddy-light']");

    expect(lightTheme).toContain('--ki-color-accent-container-subtle: var(--ki-ref-color-red-50)');
    expect(lightTheme).toContain('--ki-component-login-card-bg: linear-gradient(');
    expect(lightTheme).toContain('var(--ki-color-accent-container-subtle) 115%');
    expect(loginPageCss).toContain('background: var(--ki-component-login-card-bg)');
  });

  it('keeps the login card elevated without adding motion to the neutral form canvas', () => {
    const lightTheme = readRule("[data-product='ki-buddy'][data-product-theme='ki-buddy-light']");

    expect(lightTheme).toContain('--ki-component-login-card-shadow: 0 30px 74px');
    expect(loginPageCss).not.toContain('.formFrame:hover');
    expect(loginPageCss).not.toContain('.formStage::before');
  });

  it('moves the brand arcs along asynchronous diffusion and collision paths', () => {
    expect(loginPageCss).toContain('animation: brand-arc-diffuse');
    expect(loginPageCss).toContain('animation: orbit-collision-large');
    expect(loginPageCss).toContain('@keyframes orbit-collision-small');
  });

  it('stops the brand stage motion when reduced motion is requested', () => {
    expect(loginPageCss).toContain('@media (prefers-reduced-motion: reduce)');
    expect(loginPageCss).toContain('.brandStage::before,');
    expect(loginPageCss).toContain('animation: none;');
  });

  it('uses a readable dark accent and inherits upstream neutral surfaces and status colors', () => {
    const darkTheme = readRule("[data-product='ki-buddy'][data-product-theme='ki-buddy-dark']");

    expect(darkTheme).toContain('--ki-color-accent-bg: var(--ki-ref-color-red-400)');
    expect(darkTheme).toContain('--ki-color-on-accent: var(--ki-ref-color-fg-primary)');
    expect(darkTheme).toContain('--primary: var(--ki-color-accent-bg)');
    expect(darkTheme).not.toContain('--bg-base:');
    expect(darkTheme).not.toContain('--text-primary:');
    expect(kiBuddyThemeCss).not.toMatch(/--(?:success|warning|danger|info)\s*:/);
  });

  it('owns only the Arco action steps and leaves subtle background steps upstream', () => {
    const lightArco = readRule("[data-product='ki-buddy'][data-product-theme='ki-buddy-light'] body");
    const darkArco = readRule("[data-product='ki-buddy'][data-product-theme='ki-buddy-dark'] body");

    expect(lightArco).not.toContain('--arcoblue-1:');
    expect(lightArco).not.toContain('--arcoblue-4:');
    expect(lightArco).toContain('--arcoblue-5: var(--ki-color-accent-hover-rgb) !important');
    expect(lightArco).toContain('--arcoblue-6: var(--ki-color-accent-rgb) !important');
    expect(lightArco).not.toContain('--arcoblue-8:');
    expect(lightArco).not.toContain('--arcoblue-10:');
    expect(darkArco).toContain('--arcoblue-5: var(--ki-color-accent-hover-rgb) !important');
    expect(darkArco).toContain('--arcoblue-7: var(--ki-color-accent-pressed-rgb) !important');
  });

  it('pairs dark primary buttons with the product on-accent token', () => {
    expect(arcoOverrideCss).toContain(
      "html[data-product='ki-buddy'][data-product-theme='ki-buddy-dark'] body .arco-btn-primary:not(.arco-btn-disabled)"
    );
    expect(arcoOverrideCss).toContain('color: var(--ki-color-on-accent)');
  });

  it('uses the product accent only on selected leading icons', () => {
    expect(arcoOverrideCss).toContain(".settings-sider__item[data-selected='true'] .settings-sider__item-icon");
    expect(arcoOverrideCss).toContain("[data-sider-nav-selected='true'] .sider-nav__icon");
    expect(arcoOverrideCss).toContain('color: var(--ki-component-nav-item-selected-icon-fg) !important;');
    expect(kiBuddyThemeCss).toContain('--ki-component-nav-item-selected-icon-fg: var(--ki-color-accent-fg);');
  });

  it('keeps semantic aliases free of raw values and adapters free of primitive references', () => {
    expect(kiBuddyThemeCss).not.toMatch(/--ki-color-[\w-]+:\s*#/);

    for (const selector of [
      "[data-product='ki-buddy'][data-product-theme='ki-buddy-light']",
      "[data-product='ki-buddy'][data-product-theme='ki-buddy-dark']",
    ]) {
      const adapterLines = readRule(selector)
        .split('\n')
        .filter((line) => /^\s+--(?!ki-)/.test(line));
      expect(adapterLines.join('\n')).not.toContain('var(--ki-ref-');
    }
  });

  it('defines increased-contrast and forced-colors adaptations', () => {
    expect(kiBuddyThemeCss).toContain('@media (prefers-contrast: more)');
    expect(kiBuddyThemeCss).toContain('@media (forced-colors: active)');
    expect(kiBuddyThemeCss).toContain('--ki-color-focus-ring: Highlight');
    expect(kiBuddyThemeCss).toContain('outline-color: Highlight !important');
  });

  it('keeps primary action and dark focus combinations above WCAG thresholds', () => {
    expect(contrastRatio('#ffffff', '#b42318')).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio('#dd6f68', '#0e0e0e')).toBeGreaterThanOrEqual(3);
    expect(contrastRatio('#111827', '#dd6f68')).toBeGreaterThanOrEqual(4.5);
  });

  it('does not replace upstream typography, radius, spacing or shadow tokens', () => {
    expect(kiBuddyThemeCss).not.toMatch(/--(?:font|radius|space|shadow)-/);
  });
});
