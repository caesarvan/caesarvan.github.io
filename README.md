# Caesar · Life OS

统一入口：https://caesarvan.github.io/ （自动进入 `/hub/`）。

首页直接读取 `hub/data/` 的已授权业务快照，展示财务趋势、投资、微众资产构成、旅行和资料索引。每个领域保留自己的数据时间与口径；读取失败和未同步状态明确展示。各领域共用外壳导航，嵌入模式保留业务筛选、隐藏重复全局顶栏，跨模块链接回到外壳路由。

个人站来源 `caesarvan/ai`，导入版本见 `hub/pages/profile/MIGRATION.md`，保留中英和全部页面。原 `ai` 仓库继续保留；`life-hub-demo/` 是历史概念演示，不在真实业务导航内。

2026-10-23 用户明确授权移除旧 Hexo。旧内容可从迁移前提交 `6c1d6bb12f6169de3c5c79a4091d337a580c9625` 恢复；本地另存移除前归档。不再从 Hexo 生成根站。

## 维护

- 模块登记：`hub/modules.json`；首页摘要：`hub/overview.js`；嵌入协议：`hub/embed.js`。
- 数据刷新只更新对应 `hub/data/*.json` 与 `datasets.json` 校验登记，保留 schema、实际采样时点和未知值。
- 凭证、邮件附件及无关原件不公开。
- 本地验证：`node hub/validate.mjs`；HTTP 预览仓库根目录。
