# Ki-Buddy 桌面客户端设计 Token 最佳实践与实施方案

> 调研日期：2026-08-14
> 范围：设计 token、颜色主题、桌面端状态与可访问性，以及 Ki-Buddy 在 AionUi 上的产品 overlay 方案
> 不在范围内：组件重做、字体、间距、圆角、阴影、动效、布局和业务模块显隐

## 1. 结论

Ki-Buddy 应继续使用 AionUi 的组件、字体、间距、圆角、阴影和主题切换机制，只增加一层产品颜色语义。推荐结构是：

```text
Ki-Buddy primitive
  -> Ki-Buddy semantic
    -> AionUi / Arco adapter
      -> 现有组件
```

产品差异不应通过“把所有 AionUi 数字色阶换成红色”表达，而应集中在以下界面角色：

- 主操作、链接和关键进度使用品牌红；桌面侧栏以中性灰底表达当前位置，仅让前导图标使用品牌红。
- 大面积 canvas、普通 surface、正文、分隔线仍以中性色为主；light 模式可以使用 ki-buddy-pro 已有的暖白 canvas。
- keyboard focus 使用独立的 `focus-ring` token，不依赖 hover 或组件填充色。
- `negative/error`、`warning`、`success`、`info` 与品牌语义分离；尤其不能再把 `info` 映射成红色。
- light、dark、increased contrast、forced colors 是不同条件，不应依靠色阶反转自动推导。

这与主流规范一致：Fluent 将颜色分为 neutral、shared semantic 和 brand，并明确建议避免在大面积 surface 过度使用品牌色；Material 3 使用 `primary`、`onPrimary`、`primaryContainer`、`surfaceContainer` 等用途角色；Spectrum 将 global、alias、component token 分开，并按主题对同一语义返回不同值。来源：[Fluent 2 Color](https://fluent2.microsoft.design/color)、[Material 3 ColorScheme](https://developer.android.com/reference/kotlin/androidx/wear/compose/material3/ColorScheme)、[Spectrum Design Tokens](https://spectrum.adobe.com/page/design-tokens/)。

## 2. 当前实现观察

当前文件为 `packages/desktop/src/renderer/styles/themes/ki-buddy-color-scheme.css`。它已经满足两个基础条件：

- primitive 只使用 ki-buddy-pro 已有颜色值；
- 通过 `[data-product='ki-buddy']` 与 AionUi 默认主题隔离。

但目前仍难以形成稳定、清晰的产品主题，主要原因如下。

### 2.1 缺少产品 semantic 层

当前 primitive 直接赋给 `--primary`、`--aou-*`、`--bg-*`、`--danger` 等 AionUi 变量。这样无法表达“某个红色为什么用在这里”，也无法独立调整 focus、selection、link、primary action 和 tinted container。

DTCG 将 alias 定义为对另一个 token 的引用，并指出 token 用于建立跨工具、跨团队的共同语言；Spectrum 的示例也明确展示 global → alias → component-specific 的引用关系。2025.10 文档是稳定的 W3C Community Group Final Report，适合实现，但不是 W3C Recommendation。来源：[Design Tokens Format Module 2025.10](https://www.w3.org/community/reports/design-tokens/CG-FINAL-format-20251028/)、[Spectrum Design Tokens](https://spectrum.adobe.com/page/design-tokens/)。

### 2.2 品牌与状态语义发生冲突

light 模式中：

```css
--primary: var(--ki-red-600);
--danger: var(--ki-red-600);
--info: var(--ki-red-500);
```

三个不同含义几乎使用同一视觉语言。Fluent 将红色作为 danger、黄色作为 caution、绿色作为 positive，并要求 semantic color 只表达重要状态；Spectrum 将 negative、notice、positive、informative、accent 设为独立语义。来源：[Fluent 2 Color](https://fluent2.microsoft.design/color)、[Spectrum Color System](https://spectrum.adobe.com/page/color-system/)。

品牌主色为红色不意味着不能使用红色表达错误，但 token 身份必须分离，错误状态还必须同时显示图标或文本。Apple、Fluent 和 Spectrum 都明确要求颜色不能成为唯一的信息载体。来源：[Apple HIG Color](https://developer.apple.com/design/human-interface-guidelines/color)、[Fluent 2 Accessibility](https://fluent2.microsoft.design/accessibility)、[Spectrum Using Color](https://spectrum.adobe.com/page/using-color/)。

### 2.3 dark 模式的主要红色不适合承担所有交互角色

按 WCAG 2.x 相对亮度公式计算，当前色值有以下结果：

| 组合                            | 对比度 | 判断                                                |
| ------------------------------- | -----: | --------------------------------------------------- |
| `#b42318`（red-600）/ `#fffbfa` | 6.40:1 | light 模式品牌前景可用                              |
| 白色 / `#b42318`                | 6.57:1 | light 模式主按钮可用                                |
| `#dd6f68`（red-400）/ `#0e0e0e` | 6.02:1 | dark 模式品牌前景可用                               |
| `#111827` / `#dd6f68`           | 5.53:1 | dark 模式主按钮可用                                 |
| `#d8403a`（red-500）/ 白色      | 4.45:1 | 低于 4.5:1，不应用于普通字号白字按钮                |
| `#b42318` / `#0e0e0e`           | 2.94:1 | 低于 3:1，不应用于 dark 模式 focus/outline/必要图形 |

WCAG 2.2 AA 要求普通文字至少 4.5:1，大字号文字至少 3:1；识别控件、选中态和 focus 的必要视觉信息至少 3:1。阈值不能四舍五入。来源：[WCAG 2.2 Contrast Minimum](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)、[WCAG 2.2 Non-text Contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html)。

因此 dark 模式不能继续将 red-600 同时用于品牌文字、focus、outline 和主操作。对 dark neutral surface，应使用 red-400 作为可见品牌前景；实心按钮使用 red-400 背景和深色 `on-accent`。

### 2.4 light 与 dark 的产品表达不对称

当前 light 模式覆盖 canvas、surface、text、border 和状态色，dark 模式只覆盖品牌色。主题切换后，产品语义的范围随之变化。Apple 要求自定义颜色提供 light、dark 和 increased contrast 变体；Spectrum 也将 color theme 与 device mode 分开建模。来源：[Apple HIG Color](https://developer.apple.com/design/human-interface-guidelines/color)、[Spectrum Color Fundamentals](https://spectrum.adobe.com/page/color-fundamentals/)。

这不代表 dark 模式必须增加一套新的 Ki-Buddy 深色 primitive。既定约束只允许采用 ki-buddy-pro 已有颜色，因此 dark surface 可以继续引用 AionUi 中性色；Ki-Buddy semantic 层负责明确这一继承关系。

### 2.5 缺少 focus、selection、on-color 和 elevation surface 角色

当前只有 `primary`、`brand` 和数字色阶，无法显式验证以下组合：

- 主按钮背景与按钮文字；
- selected 背景与 selected indicator；
- focus ring 与相邻 surface；
- dialog/popover surface 与基础 canvas；
- 品牌前景与普通正文。

Material 3 将 `primary` 与 `onPrimary`、`primaryContainer` 与 `onPrimaryContainer` 配对，并提供不同 prominence 的 `surfaceContainer`；Fluent 的 focus 不通过改变控件颜色表达，而是增加更明显的 stroke。来源：[Material 3 ColorScheme](https://developer.android.com/reference/kotlin/androidx/wear/compose/material3/ColorScheme)、[Fluent 2 Color](https://fluent2.microsoft.design/color)。

### 2.6 真实客户端视觉审计

审计对象是本地打包产物 `out/mac-arm64/Ki-Buddy.app`。实际完成了首次使用三页、登录表单 focus/校验、首页、助手、Agents/模型/技能/工具/外观/关于设置、MCP 菜单与 JSON 导入弹窗的操作；同时切换并检查了 light、dark 两种主题。账户页包含个人信息，因此只检查交互与布局，没有保存或纳入截图。

实机暴露了三个仅靠阅读 CSS 不容易发现的问题：

1. `ConfigProvider` 只改写 Arco `--arcoblue-5`、`--arcoblue-6`、`--arcoblue-7`。`--arcoblue-1` 到 `--arcoblue-4` 仍是蓝色，因此 onboarding 的低强调渐变、Arco light container 和部分 focus 背景仍带上游蓝色。
2. 设置侧栏当前项直接使用 UnoCSS 的 `!bg-fill-3`，实际消费的是 Arco 中性 fill，而不是产品 selection token；即使 CTA 已经变红，活动导航仍保持灰色。
3. dark 模式的实心主操作继续使用 `red-600` 与白色文字，视觉很暗；若把背景直接换成 `red-400` 又不同时提供深色 `on-accent`，普通字号按钮文字会低于 4.5:1。

因此本次 token 设计需要同时覆盖完整 Arco primary ramp、AionUi selection 语义、设置导航的 component token，以及 dark `accent + on-accent` 配对，不能只改 `--primary`。

## 3. 推荐的三层 token 架构

Material Web 明确采用 reference → system → component：reference 保存具体值，system 表达设计角色，component 再映射 system token；CSS custom properties 可以用 selector 限定作用域。该结构可直接对应 Ki-Buddy primitive → Ki-Buddy semantic → AionUi/Arco adapter。来源：[Material Web Theming](https://material-web.dev/theming/material-theming/)。

### 3.1 Layer 1：product primitive

这一层只记录来源明确的原始值，不直接用于组件：

```css
--ki-ref-color-red-50: #fff1f0;
/* ...保留 ki-buddy-pro 的完整 red-50 ～ red-900... */
--ki-ref-color-red-400: #dd6f68;
--ki-ref-color-red-600: #b42318;

--ki-ref-color-canvas-warm: #fffbfa;
--ki-ref-color-surface: #ffffff;
--ki-ref-color-surface-subtle: #f9fafb;
--ki-ref-color-surface-muted: #f3f0ee;
--ki-ref-color-fg-primary: #111827;
--ki-ref-color-border: #e5e7eb;
--ki-ref-color-border-warm: #ede6e3;
```

命名只描述颜色本身，不写 `button`、`selected`、`danger` 等用途。DTCG 格式允许通过 group、type、description、alias 和 `$deprecated` 表达结构与生命周期；Fluent 也将 raw value 放在 context-agnostic global token。来源：[Design Tokens Format Module 2025.10](https://www.w3.org/community/reports/design-tokens/CG-FINAL-format-20251028/)、[Fluent 2 Design Tokens](https://fluent2.microsoft.design/design-tokens)。

### 3.2 Layer 2：product semantic

推荐建立以下最小语义集合：

| Token                            | light          | dark                     | 用途                      |
| -------------------------------- | -------------- | ------------------------ | ------------------------- |
| `--ki-color-accent-fg`           | red-600        | red-400                  | 链接、活动图标、强调文字  |
| `--ki-color-accent-bg`           | red-600        | red-400                  | 主操作实心背景            |
| `--ki-color-on-accent`           | white          | fg-primary               | 主操作上的文字和图标      |
| `--ki-color-accent-bg-hover`     | red-700        | red-300                  | hover                     |
| `--ki-color-accent-bg-pressed`   | red-800        | red-200                  | pressed                   |
| `--ki-color-accent-container`    | red-50         | red-900                  | 低强调品牌容器            |
| `--ki-color-on-accent-container` | red-700        | red-200                  | 品牌容器内容              |
| `--ki-color-selection-bg`        | red-100        | red-900                  | tab、列表等选中背景       |
| `--ki-color-selection-indicator` | red-600        | red-400                  | 选中边线、check、活动标识 |
| `--ki-color-focus-ring`          | red-600        | red-400                  | keyboard focus outline    |
| `--ki-color-surface-canvas`      | canvas-warm    | 继承 Aion `bg-base`      | 窗口基础背景              |
| `--ki-color-surface-default`     | surface        | 继承 Aion `bg-1`         | 内容 surface              |
| `--ki-color-surface-subtle`      | surface-subtle | 继承 Aion `bg-2`         | sidebar、次级分区         |
| `--ki-color-surface-raised`      | surface        | 继承 Aion dialog surface | dialog、popover、menu     |
| `--ki-color-border-default`      | border-warm    | 继承 Aion `border-base`  | 普通分隔与边框            |

侧栏导航沿用 AionUi 的 `--color-fill-3` 表达选中背景，只增加 `--ki-component-nav-item-selected-icon-fg` 并映射到 `--ki-color-accent-fg`。这样无需为灰色背景复制一份产品 token，“当前位置”和“产品识别”分别由上游灰底与 Ki-Buddy 红色前导图标承担，主页侧栏与设置侧栏使用同一状态表达。

这里的 dark hover/pressed 遵循“与 dark surface 的对比逐步增加”，不采用 light 模式的固定变暗规则。Spectrum 明确说明 theme-specific color 在 light 主题随交互变暗，在 dark 主题随交互变亮；keyboard focus 是 hover 表现加独立 focus indicator。来源：[Spectrum Using Color](https://spectrum.adobe.com/page/using-color/)。

`surface-raised` 只选择现有 AionUi surface；不改变阴影值。Apple 指出 dark 模式中的前景 elevated surface 应比 base 更亮；Fluent 认为 elevation 由 surface 与既有 shadow/light 共同表达。来源：[Apple HIG Dark Mode](https://developer.apple.com/design/human-interface-guidelines/dark-mode)、[Fluent 2 Elevation](https://fluent2.microsoft.design/elevation)。

### 3.3 Layer 3：AionUi / Arco adapter

现有组件继续引用 AionUi 和 Arco token。Ki-Buddy 只在产品 selector 下做 alias：

```css
[data-product='ki-buddy'] {
  --primary: var(--ki-color-accent-bg);
  --brand: var(--ki-color-accent-fg);
  --brand-light: var(--ki-color-accent-container);
  --brand-hover: var(--ki-color-accent-bg-hover);
  --border-special: var(--ki-color-selection-indicator);
  --message-user-bg: var(--ki-color-accent-container);
}
```

适配规则：

1. 每个 AionUi alias 必须指向一个用途明确的 Ki semantic token，禁止直接指向 `red-*`。
2. 不覆盖 font、spacing、radius、shadow、motion、component size。
3. 不在组件文件里添加 Ki-Buddy 条件分支；组件仍由原设计系统维护。
4. `success`、`warning`、`danger`、`info` 默认继承 AionUi semantic token。若后续需要改变，应作为 status palette 单独设计和验证。
5. 不应把 `--aou-1 ～ --aou-10` 当成一种含义。现有代码同时把它们用于背景、文字、选中和边框，迁移时要按真实用途逐步改为 semantic alias；在迁移完成前可以保留兼容映射，但必须有用途清单和对比度测试。

Spectrum 建议组件通过 common UI framework 使用 token，而不是由每个产品直接消费底层值；组件专用 token 也不应在无关组件之间互换。来源：[Spectrum Design Tokens](https://spectrum.adobe.com/page/design-tokens/)。这正适合 Ki-Buddy 作为 AionUi 产品变体：产品提供语义，AionUi 和 Arco 继续提供组件实现。

## 4. 红色主品牌的使用规则

### 4.1 应使用品牌红的位置

- 每个页面最多一个最高优先级的 primary action。
- 当前导航、当前 tab、选中对象的 indicator。
- keyboard focus ring。
- 可交互链接和关键进度。
- 少量 product-owned illustration、logo 和空状态装饰。
- 用户消息或助手入口的低强调 tinted container。

Fluent 建议将品牌色用于 CTA 和 selected state，同时避免大面积品牌 surface，以免破坏层级；Spectrum 也要求颜色节制并服务于层级和沟通。来源：[Fluent 2 Color](https://fluent2.microsoft.design/color)、[Spectrum Color System](https://spectrum.adobe.com/page/color-system/)。

### 4.2 不应使用品牌红的位置

- 普通正文和不可交互装饰文字。
- 所有 toolbar、sidebar、card 和 dialog 的大面积背景。
- `info`、`success`、`warning`。
- 仅依靠红色区分的 error、selected、focus 或连接状态。
- disabled 状态；disabled 应沿用中性色层级。

Apple 明确建议避免用同一种颜色同时表达交互和非交互内容，并提醒红色在不同文化中可能表示危险或正向趋势。来源：[Apple HIG Color](https://developer.apple.com/design/human-interface-guidelines/color)。

### 4.3 品牌红与 error 的关系

建议保留两组独立 token：

```css
--ki-color-accent-*;
--color-danger-*; /* 继续来自 AionUi status system */
```

即使两者都属于红色色相，也不得互相 alias。error 组件必须同时有 error icon、标题或可读标签；primary action 则通过位置、文案和控件形态表达交互。这样可以防止“所有红色都像报错”或“报错看起来像主操作”。

## 5. 桌面端 surface、elevation、focus 与 selection

### 5.1 Surface 与 elevation

推荐保留 AionUi 的 surface 数量和 shadow ramp，仅建立用途映射：

```text
canvas
  -> default surface（主内容、sidebar）
    -> raised surface（menu、popover、dialog）
      -> modal scrim（阻断下层交互）
```

- light：使用暖白 canvas + 白色 default/raised surface，靠边框和既有 shadow 分层。
- dark：使用 AionUi `#0e0e0e → #1a1a1a → #262626` 的中性 surface 层级；前景 surface 比 base 更亮。
- 品牌红只作为局部 accent，不为 card、dialog、sidebar 整体染红。
- 高层 surface 的阴影继续使用 AionUi/Arco 现有 token，避免产品 fork。

Apple 建议 dark 模式使用 base/elevated background 形成深度；Fluent 将 solid、mica、acrylic、smoke 作为不同材料，并指出 solid 是最常见且支持 light/dark 的材料。Electron 当前没有必要为了品牌重做原生材料。来源：[Apple HIG Dark Mode](https://developer.apple.com/design/human-interface-guidelines/dark-mode)、[Fluent 2 Material](https://fluent2.microsoft.design/material)。

### 5.2 Keyboard focus

- 使用 `outline` 或等效外圈，不以背景色变化作为唯一 focus 标识。
- light 使用 red-600，dark 使用 red-400。
- focus indicator 与相邻背景至少 3:1；跨复杂背景时可采用双色 ring。
- hover 不应覆盖 focus；selected + focus 可以同时存在。
- forced colors 下使用系统 `Highlight`/`CanvasText`，不要全局设置 `forced-color-adjust: none`。

Fluent 的 focus 通过更粗 stroke 区分键盘与鼠标状态；WCAG 要求自定义 focus indicator 与相邻颜色有足够对比；W3C CSS Color Adjustment 规范说明 forced colors 会使用用户的系统 palette，并移除 box-shadow。来源：[Fluent 2 Color](https://fluent2.microsoft.design/color)、[WCAG 2.2 Non-text Contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html)、[CSS Color Adjustment Module Level 1](https://www.w3.org/TR/css-color-adjust-1/)。

### 5.3 Selection

选中态使用两项视觉信号：

- 低强调 `selection-bg`；
- 高对比 `selection-indicator`、check icon、边线或字重变化。

对于高频桌面侧栏，本方案采用中性 `fill-3` 作为低强调背景，品牌红仅用于前导矢量图标。内置 `@icon-park/react` 图标继承 `currentColor`，无需维护第二套图片资源；扩展提供的 bitmap 图标不强制染色。

Material 3 要求状态具有两个视觉 indicator，并允许 selected 与 hover 组合；Spectrum 也将 selected 与 keyboard focus 视为当前操作的重要状态。来源：[Material 3 States](https://m3.material.io/foundations/interaction/states/overview)、[Spectrum Color System](https://spectrum.adobe.com/page/color-system/)。

## 6. Light、dark 与高对比度

### 6.1 Light / dark

- 两套主题显式定义 semantic token，不通过数组 reverse 生成 dark 主题。
- `on-*` 与其 container 成对验证。
- 初始化时声明 `color-scheme: light dark`，使浏览器原生控件遵循系统外观。
- 系统主题变化时继续使用 AionUi 当前机制切换，Ki-Buddy overlay 只更换 alias 值。

Apple 指出 dark 并非 light 的简单反相；Material 3 示例也分别建立 `lightColorScheme` 和 `darkColorScheme`。来源：[Apple HIG Dark Mode](https://developer.apple.com/design/human-interface-guidelines/dark-mode)、[Material 3 in Compose](https://developer.android.com/develop/ui/compose/designsystems/material3)。

产品身份与颜色模式应保持正交：`data-product='ki-buddy'` 选择产品 semantic，`data-theme='light|dark'` 选择同名 semantic 的具体值。Spectrum Theme API 也将 system、color、scale 分为独立维度，且切换 color 后 token 名称不变。来源：[Spectrum Web Components Theme API](https://opensource.adobe.com/spectrum-web-components/tools/theme/api/)。

### 6.2 Increased contrast

建议增加 `@media (prefers-contrast: more)`：

- 提高 border、focus、selection indicator 与相邻 surface 的亮度差。
- 去掉依赖低 opacity 的必要信息。
- 不扩大品牌色覆盖面。
- 同时测试 light + increased contrast、dark + increased contrast。

Apple 要求自定义颜色同时提供 light、dark 和 increased contrast 变体；Fluent token 原生考虑 light、dark、high-contrast 和 brand。来源：[Apple HIG Color](https://developer.apple.com/design/human-interface-guidelines/color)、[Fluent 2 Design Tokens](https://fluent2.microsoft.design/design-tokens/)。

### 6.3 Forced colors

建议增加 `@media (forced-colors: active)`，只为必要状态指定系统颜色：

```css
:focus-visible {
  outline-color: Highlight;
}

[aria-selected='true'] {
  border-color: Highlight;
  color: HighlightText;
}
```

普通元素应允许 Chromium 使用用户 palette。W3C 规范指出 forced colors 会自动替换背景、边框、文字、outline 等颜色，并将 `box-shadow` 计算为 `none`；只有组件自己完整处理用户需求时才应使用 `forced-color-adjust: none`。来源：[CSS Color Adjustment Module Level 1](https://www.w3.org/TR/css-color-adjust-1/)。

## 7. 可访问性验收标准

每个主题和交互状态至少验证：

| 对象                                   | 要求                                                    |
| -------------------------------------- | ------------------------------------------------------- |
| 普通文字                               | 与背景 ≥ 4.5:1                                          |
| 大字号文字                             | 与背景 ≥ 3:1                                            |
| icon、input border、selected indicator | 与相邻颜色 ≥ 3:1                                        |
| 自定义 focus ring                      | 与相邻颜色 ≥ 3:1                                        |
| 主按钮文字/icon                        | text ≥ 4.5:1，icon ≥ 3:1                                |
| error、warning、success、info          | 颜色之外必须有 icon、标签或文本                         |
| disabled                               | 无 WCAG 强制阈值，但必须与 enabled 有明确区别且仍可辨认 |

来源：[WCAG 2.2 Contrast Minimum](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)、[WCAG 2.2 Non-text Contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html)、[Fluent 2 Button](https://fluent2.microsoft.design/components/web/react/core/button/usage)。

建议自动化检查以下矩阵：

```text
light × default contrast
light × increased contrast
dark × default contrast
dark × increased contrast
forced-colors light
forced-colors dark
```

界面截图检查至少覆盖：登录、首页/引导、conversation、workspace picker、settings、dialog/popover、notification 与 error state。自动化对比度不能替代真实窗口检查，因为桌面系统的缩放、字体抗锯齿、透明度和显示器环境会改变实际感知；Apple 也建议在不同显示条件和设备上测试。来源：[Apple HIG Color](https://developer.apple.com/design/human-interface-guidelines/color)、[Apple HIG Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility/)。

## 8. 命名与治理

### 8.1 命名规则

推荐格式：

```text
--ki-ref-color-{family}-{step}
--ki-color-{role}-{property}-{state?}
```

示例：

```css
--ki-ref-color-red-600;
--ki-color-accent-bg;
--ki-color-accent-bg-hover;
--ki-color-on-accent;
--ki-color-selection-indicator;
--ki-color-surface-raised;
```

名称表达用途，不表达某个页面或当前颜色值。Fluent 要求 alias 名称能直接看出功能；Spectrum 强调 human-readable、predictable、受控词汇，并按 context → common unit → clarification 排列。来源：[Fluent 2 Design Tokens](https://fluent2.microsoft.design/design-tokens/)、[Spectrum Design Tokens](https://spectrum.adobe.com/page/design-tokens/)。

### 8.2 单一来源与变更流程

- primitive 保持单一来源，并记录来自 ki-buddy-pro 的文件与同步日期。
- semantic token 必须写用途、允许使用位置、禁止使用位置和 paired token。
- adapter 文件只包含 alias，不出现新的 hex。
- 新 token 需附 light/dark/high-contrast 对比度结果和代表性截图。
- token 重命名时先标记 deprecated，再迁移调用方；不能直接删除公共 token。
- CI 检查 primitive 重复值、未解析 alias、循环引用、semantic 直接硬编码、组件直接使用 `--ki-ref-*`。
- 主题变更生成 token diff 和关键页面 screenshot diff。

DTCG token 格式支持 `$description`、`$type`、`$deprecated`、alias 和 group inheritance，适合表达这些治理信息。来源：[Design Tokens Format Module 2025.10](https://www.w3.org/community/reports/design-tokens/CG-FINAL-format-20251028/)。

## 9. 对 AionUi 的实施建议

### 阶段 A：建立语义和测试

1. 在 Ki-Buddy theme 中将现有 primitive 改名为 `--ki-ref-*`。
2. 增加本文件第 3.2 节的 semantic token。
3. 为每个 semantic token 建立 light/dark pairing 和 contrast 单元测试。
4. 测试 AionUi 身份未启用时不存在任何 Ki-Buddy token 覆盖。

### 阶段 B：调整 adapter

1. `primary/brand` 指向 accent semantic。
2. `info/success/warning/danger` 恢复 AionUi status semantic。
3. dark `primary/focus/selection` 从 red-600 调整为 red-400。
4. 检查 Arco 的完整 primary ramp 与 ConfigProvider 注入结果，不能只验证 `--primary`。
5. 建立 Aion alias → Ki semantic 对照表，避免同一旧 token 同时承载背景与文字。

### 阶段 C：桌面可访问性

1. 增加 `prefers-contrast: more` 和 `forced-colors: active`。
2. 对 focus、selected、input border、主按钮运行 3:1/4.5:1 检查。
3. 在真实 Electron 窗口完成 light/dark/高对比截图回归。

### 阶段 D：逐步减少数字 alias

`--aou-*` 是历史数字色阶，当前被多个不同用途共同消费。优先迁移以下高价值位置：

- sidebar / settings 当前项；
- workspace picker selected item；
- send box focus 与 active state；
- conversation user message；
- guide assistant selection；
- dialog、popover、search active item。

迁移应改变 token 引用，不重做组件视觉结构。最终效果仍由 AionUi/Arco 组件呈现，Ki-Buddy 只拥有产品颜色决策。

## 10. 建议的验收判断

完成后的 Ki-Buddy 应同时满足：

- 移除 logo 后，仍能从主操作、活动导航、选中态、focus 和用户消息识别红色产品主题。
- 移除所有业务内容后，页面主体仍是中性、可长时间阅读的桌面工作区，不是大面积红色界面。
- error 与 primary action 不会仅凭颜色产生同义。
- light、dark、increased contrast 和 forced colors 都能辨认 focus、selection 和控件边界。
- AionUi 原组件、字体、间距、圆角、阴影和布局没有 fork。
- AionUi 产品身份下的视觉与行为不受 Ki-Buddy overlay 影响。

## 11. 实施与实机复核结果

本次已按本文方案实现三层颜色 token，业务组件结构没有重做：

- primitive 只采用 `ki-buddy-pro/apps/desktop/src/renderer/src/styles/global.css` 已有的红色、暖白 surface、文字和边框值；
- semantic 层定义 accent、on-accent、selection、focus、surface 和 border 角色；
- adapter 层继续服务现有 AionUi/Arco 组件，只接管高显著度的 `--arcoblue-5` 至 `--arcoblue-7`；其余色阶保持上游中性色，避免淡红背景扩散到普通卡片、输入区与列表；
- 主页与设置侧栏共用导航 component token：选中底色保持 AionUi 中性 `fill-3`，前导矢量图标使用 Ki-Buddy accent；
- 产品配置新增 `cliName`，内部 CLI 的 agent catalog、assistant catalog、产品 locale layer 统一显示 `Ki CLI`，并使用 Ki-Buddy 产品图标；
- 助手身份替换只作用于 `source: generated` 的内部 CLI 助手；官方助手与用户助手继续显示自己的名称和头像；
- `success`、`warning`、`danger`、`info` 保持独立状态语义，因此 MCP 导入提示等 informative surface 仍可使用蓝色，这不代表品牌 token 未生效；
- dark 主操作使用 red-400 与深色 `on-accent`，focus/必要图形与深色背景满足非文字 3:1 要求；
- 增加 `prefers-contrast: more` 与 `forced-colors: active` 适配。

实机复核期间发现，替换 `.app` 目录后旧 Electron 进程仍可能继续显示旧资源。第一次复核因此混入旧样式；后续先确认两个 `com.xlihub.ki-buddy` 进程都已退出，再启动新包。最终结论均来自干净重启后的产物。

实机确认的产品识别点包括：主按钮、首页 `Ki CLI` 选择项、活动 tab、主页/设置侧栏的红色选中图标、slider、switch、focus 与 selected indicator。大面积 canvas、普通卡片、字体、间距、圆角、阴影和布局继续沿用 AionUi，符合本任务限定的采用范围。
