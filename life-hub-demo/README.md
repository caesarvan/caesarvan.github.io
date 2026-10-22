# Caesar Life OS · 交互概念 Demo

此目录是独立静态子站，不覆盖根目录的 Hexo 首页与文章。业务数据均为虚构演示。当前浏览器新增事项、日程、账目、主题与自定义页签保存在 `localStorage`；阅读花园在独立的受信页面中运行，其编辑状态只在当前页面会话保留。不调用真实账户、交易、日历或健康接口。

## 扩展约定

所有侧栏、搜索、应用目录和独立页入口都从 `modules.json` 生成。注册表版本为 1，编辑器可以关联 `modules.schema.json`。内置功能由 `core.js`（图标、状态与共享工具）、`widgets.js`（摘要卡片）、`views.js`（领域视图）、`app.js`（路由、导航与表单）分工；新增独立页面无需改这些文件。

### 新增一个独立静态页

1. 创建 `pages/<slug>/index.html` 和所需的局部 CSS、JS。页面的资源路径相对自身文件，不使用域名根路径。
2. 在 `modules.json` 的 `modules` 数组中添加：

```json
{
  "id": "learning",
  "title": "学习空间",
  "eyebrow": "KEEP YOUR CURIOSITY ALIVE",
  "description": "把好奇心，慢慢变成自己的知识。",
  "icon": "book",
  "color": "#4b8a87",
  "type": "page",
  "href": "./pages/learning/index.html",
  "order": 85,
  "group": "extension",
  "enabled": true
}
```

3. 执行 `node validate.mjs`。通过后提交页面和注册项，导航、搜索、“所有空间”与首页扩展入口自动出现。无需更改导航 HTML 或服务器路由。

外部网站用 `type: "link"` 和 HTTPS `href`，在独立窗口打开。`enabled: false` 隐藏一个模块但保留原件；`order` 控制入口顺序。隐藏首页摘要卡片不会删除模块。

### 路由与静态页面边界

- 外壳采用 `#/module-id` hash 路由，刷新、分享、前进后退不依赖服务器重写，适合 GitHub Pages。
- 同源、受信任的独立页以有标题的 `iframe` 加载，使用 `sandbox="allow-scripts allow-forms allow-same-origin"`，支持自建页面的 ES modules 与浏览器存储。iframe 提供文档、样式和全局变量的结构隔离，不作为安全边界；同源页面均视为已审核的受信代码，可以拥有相同源权限。父外壳目前不读取独立页 DOM 或模块数据，主题以 URL 参数传入。
- `iframe` 适合逐步集成现有静态页，不代表所有页面必须重构成一个框架。外部网站不默认嵌入，避免站点禁止嵌入或权限混淆。
- 外壳与独立页不提供通用任意消息执行或密钥传递。未来确需跨模块通信时，再引入带版本与来源校验的窄接口。
- 外壳级“添加页签”是本地演示偏好；要使新页签对所有设备生效，需按上述流程提交注册表和页面。
- 新增模块不得写入账号密钥或默认公开真实财务、健康、家庭与行程资料。接入真实数据时单独设计身份与后端，静态页面不承载私密凭据。

## 预览与验证

从本目录运行 `python3 -m http.server 4173`，打开服务器地址。需要 HTTP 服务以加载模块 JSON，不能直接双击文件预览。前端无编译步骤和 npm 依赖；字体外部服务不可用时会回退系统字体。

```sh
node validate.mjs
```

验证覆盖注册表字段、唯一 ID/静态页路径、模块类型、独立页目录边界、链接目标存在、HTML 标题/语言、本地资源与 JS 导入、JS 语法。浏览器 QA 另行覆盖布局和交互。

## 持续集成与发布

仓库级 `.github/workflows/life-hub-ci.yml` 在相关 push/PR 运行同一校验，仅使用只读仓库权限，不改根站、不另设重复发布流水线。现有 GitHub Pages 发布方式保持；若它仍从 `main` 分支发布，CI 与 Pages 可能并行，**当前 CI 并非强制的发布前门禁**。

真正需要“校验成功才能上线”时，采用完整站点的 `validate → assemble → deploy` 工作流，并把 Pages 发布源切到 GitHub Actions。产物必须同时包含原 Hexo 根站与本子站。不能只上传子站而替换根站。现有 Hexo 后续全量重新生成时，也必须保留/复制本目录；在发现上游 Hexo 源项目后再把复制步骤纳入同一流水线。

## 调研来源（2026-10-22）

- [Anthropic frontend-design](https://github.com/anthropics/skills/blob/main/skills/frontend-design/SKILL.md)：视觉方向、信息层级、卡片节奏（Apache 2.0）。
- [Vercel web-design-guidelines](https://github.com/vercel-labs/agent-skills/blob/main/skills/web-design-guidelines/SKILL.md) 与 [规则源](https://github.com/vercel-labs/web-interface-guidelines/blob/main/command.md)：语义、焦点、状态、动效与响应式（仓库 README 标明 MIT）。
- [UI UX Pro Max](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill/blob/main/.claude/skills/ui-ux-pro-max/SKILL.md)：色彩、排版、触控、可访问性（MIT）。

本项目学习设计原则并原创实现，没有运行第三方安装脚本或复制其业务模板。旅行插画为原创 SVG。
