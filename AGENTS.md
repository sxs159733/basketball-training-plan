# AGENTS.md

本仓库是纯静态站点（HTML/CSS/JS），**没有构建步骤**，仓库根目录就是发布目录，入口为 `index.html`。

## 改动约定

- 训练安排改 `data.js`（每天对应集数、训练项、复盘要点）；渲染、打卡与导出在 `app.js`，样式在 `styles.css`。
- 不要改动已有的天序号与集数对应关系，除非明确要求调整计划。
- 不要修改 `.github/workflows/pages.yml` 和 README 里的在线地址。
- 打卡状态存在浏览器 `localStorage`，不随仓库同步。
- 一次提交只做一件事，保持现有中文文案风格。

## 本地验证

```bash
python -m http.server 8080
# 打开 http://127.0.0.1:8080 ，确认 28 天日程、打卡与导出正常
```

## 发布

推送到 `main` 后，GitHub Actions 自动发布到 GitHub Pages，约 1–2 分钟生效。
