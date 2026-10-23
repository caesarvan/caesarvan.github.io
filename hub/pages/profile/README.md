# Caesar Fan

多页静态个人站。对外署名 **Caesar Fan**。

- 中文：`index.html`
- English：`index.html?lang=en`

语言参数会在页面跳转时保留，因此中英文版本都可以直接分享 URL。

## 视觉与主题

- 首次访问跟随系统 `prefers-color-scheme`
- 顶部按钮可在浅色 / 深色模式间切换，选择保存在浏览器本地
- Liquid Glass 风格：半透明材质、背景模糊、边缘高光与指针响应
- Maple Mono CN v7.9 本地 WOFF2 子集，不依赖外部字体服务
- 机构阶段使用完整 Logo lockup，素材来源见 `BRAND_ASSETS.md`

## 页面

| 文件 | 内容 |
| --- | --- |
| `index.html` | 首页与统一纵向时间轴（教育、科研、工作、荣誉、产品背景） |
| `work.html` | 兼容旧链接的专业经历详情 |
| `projects.html` | GitHub 自有项目 |
| `awards.html` | 荣誉 |
| `about.html` | 分阶段经历：本科科研、硕士研究、基带芯片、AI 芯片 |
| `contact.html` | 联系（仅 GitHub） |

本站不展示真名与电话。职业经历中的机构标识使用可追溯的现有
Logo，来源见 [`BRAND_ASSETS.md`](BRAND_ASSETS.md)。

## 本地预览

```bash
python3 -m http.server 8080
```

打开 `预览服务器显示的 Local 地址`。

文案与项目列表：`assets/i18n.js`。

学生阶段的姿态数据图来自公开仓库 `caesarvan/NUS_Medical_Care`，
来源记录在 `BRAND_ASSETS.md`。

首页使用连续滚动时间轴；教育经历与工作经历不再分开。滚轮进入不同阶段时，主题色和阶段指示会自动切换：

- 苏州大学：校徽红与暖金
- NUS：官方蓝 `#003D7C` / 橙 `#EF7C00`
- 华为经历：品牌红
- NVIDIA 当前阶段：NVIDIA Green `#76B900`
