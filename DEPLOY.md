# 发布与收录指南

本文件记录 `dsh-pending-review-glow` 的仓库发布流程，以及提交到 [awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin) 收录清单的完整步骤。

## 仓库信息

| 项 | 值 |
| --- | --- |
| 远程地址 | https://github.com/BroCC57/dsh-pending-review-glow |
| 默认分支 | `main` |
| 许可证 | MIT |
| 仓库创建时间 | 2026-10-17 13:35:54 UTC（北京时区 21:35） |

## 当前状态

核实时间：2026-10-17，来源：GitHub API。

| 项目 | 状态 |
| --- | --- |
| 代码已推送 `main` | ✅ |
| 根目录有 `package.json` 与 `cordis.patch.yml` | ✅ |
| `LICENSE`（MIT） | ✅ |
| 仓库 Description | ✅ |
| topic `dsh-plugin` | ❌ **待补** |
| 提交收录 PR | ❌ 等满 1 天 |

---

## 一、首次发布（已完成，留档备查）

在插件目录 `plugins/dsh-pending-review-glow` 下执行：

```powershell
git init
git add -A
git commit -m "Initial commit: dsh-pending-review-glow"
git branch -M main
git remote add origin https://github.com/BroCC57/dsh-pending-review-glow.git
git push -u origin main
```

### 几个要点

- **要在插件目录里执行**，不要在上级 `plugins/` 目录。否则仓库根目录会变成 `plugins/dsh-pending-review-glow/...`，多嵌套一层，收录 CI 读取根目录 `package.json` 会失败。
- GitHub 建仓库时 **README / .gitignore / license 全选关闭**（"空仓库"）。若勾了 README，远程会先有一个提交，推送时会被拒绝，需要 `git pull --rebase origin main` 才能解决。
- `git branch -M main` 不能省。旧版 Git 默认分支是 `master`，GitHub 默认是 `main`，要对齐。

---

## 二、日常改动

```powershell
git add -A
git commit -m "说明改了什么"
git push
```

只改文件内容时不需要再 `init`、`branch -M`、`remote add`。

---

## 三、收录到 awesome-dsh-plugin

规则原文：https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/blob/main/contributing.md

### 3.1 前置条件核对

| 要求 | 本项目情况 |
| --- | --- |
| `package.json` 声明 `dsh.bundle` | ✅ `dsh.bundle.patch` 指向 `./cordis.patch.yml` |
| 仓库有真实可用代码 | ✅ `lib/index.js`、`lib/client.js` |
| 仓库创建满 1 天 | 2026-10-18 21:35（北京时区）之后可提交 |
| 加 `dsh-plugin` topic | ❌ 待办，见下 |
| 描述属实、无营销词 | ✅ 只写了已实现的行为 |
| 仓库公开 | ✅ Public |

**只有 `dsh.client` 没有 `dsh.bundle` 是最常见的被拒原因**，本仓库已正确声明两者。

### 3.2 补 topic（待办）

仓库页 → 右侧 About 区域 → 齿轮图标 → Topics → 输入 `dsh-plugin` → Save。

补完可用下面命令核实（返回的 `topics` 数组里应出现它）：

```
https://api.github.com/repos/BroCC57/dsh-pending-review-glow
```

### 3.3 提交 PR

**时间窗**：仓库创建于 2026-10-17 21:35，CI 强制检查"创建满 1 天"，所以 **2026-10-18 21:35 之后**再提。

**步骤**：

1. Fork `awesome-dsh-plugin/awesome-dsh-plugin`
2. 新建一个文件，路径 `data/plugins/BroCC57__dsh-pending-review-glow.yml`（owner 与 repo 之间是**两个下划线**）
3. 内容如下
4. 提交 PR。**一个 PR 最多 3 条**，本仓库只占 1 条，不涉及

```yaml
url: https://github.com/BroCC57/dsh-pending-review-glow
name: BroCC57/dsh-pending-review-glow
category: ui
description:
  en: Highlights sidebar session rows by state (pending approval, running, just finished) with color, animation and a matching status dot.
  zh: 按待审批、运行中、刚完成三种状态给侧边栏会话行上色并加呼吸动效，行尾配同色状态点。
```

### 3.4 提交注意

- **不要手工编辑仓库里的两个 README**。它们由 `data/plugins/*.yml` 生成，合并后自动重建。手工改会因行号移位而改到别人的条目。
- 描述里若出现**英文冒号加空格**（如 `state: pending`），整句必须加引号，否则 YAML 解析成嵌套键。上面的内容已避开。
- 分类 `ui`：本插件是给会话行加状态高亮与动效，属 UI 增强，不是皮肤（皮肤应放 `theme`）。若维护者认为该换，他们会直接改，不会因此打回。

### 3.5 CI 检查顺序

1. 每个 PR 最多 3 条
2. `dsh.bundle` 存在（从仓库根、或 `packages/` · `plugins/` · `apps/` 子包读取）
3. 仓库创建满 1 天
4. `awesome-lint` 与站点构建

失败会明确说明要改什么，在同一分支推送修复即可，不用重开 PR。CI 通过是前置条件，不是结论——维护者还会读源码核对描述。

---

## 四、可选增强

### 截图

在仓库里 `package.json` 旁边放 `screenshots.json`，列 1–8 张图，路径相对该文件：

```json
["assets/shot-1.png", "assets/shot-2.png"]
```

必须是 GitHub 托管的 https 图片，相对路径不能跳出插件目录（不能以 `/` 开头，不能含 `..`）。不声明也可以，市场会从 README 自动抽取。

### npm 发布

不影响收录。发布后市场可显示下载量。要求：包的 `repository` 字段指回本仓库，且需去掉 `package.json` 里的 `"private": true`。**不要在收录条目的 yml 里手写 `npm:` 键**，会被校验拒绝，映射自动采集。

### peerDependencies 写法

若将来依赖官方 `@deepseek-ai/*` 包，版本范围必须带显式预发布分支，否则静默排除所有预发布构建：

```jsonc
"@deepseek-ai/dsh-tools": ">=0.0.1-rc.1 <0.1.0 || >=0.1.0-rc.1 <0.2.0-0"
```

---

## 五、排错备忘

### `warning: LF will be replaced by CRLF`

Windows 版 Git 的 `core.autocrlf=true` 所致。**无害**：提交进仓库的仍是 LF，仅在本地检出时转换。可忽略。

想彻底消除，在仓库根加 `.gitattributes`：

```
* text=auto eol=lf
```

### `fatal: unable to auto-detect email address`

首次提交前需配置身份：

```powershell
git config --global user.name "BroCC57"
git config --global user.email "你的GitHub邮箱"
```

邮箱建议用 GitHub 的 noreply 地址（Settings → Emails），否则提交不会关联到账号头像。

### `fatal: unable to access ... Could not resolve host: github.com`

DNS 瞬时失败，不是 git 配置问题。排查顺序：

```powershell
nslookup github.com
nslookup www.baidu.com
Resolve-DnsName github.com -Server 223.5.5.5
Test-NetConnection github.com -Port 443
git config --global --list | findstr /i proxy
```

修复：`ipconfig /flushdns`；或把网卡 DNS 改成 `223.5.5.5` / `119.29.29.29`；或若使用代理软件，为其配置 `git config --global http.proxy`。

本地 commit 不会因此丢失，网络恢复后直接 `git push -u origin main` 即可。

### `error: remote origin already exists`

```powershell
git remote set-url origin https://github.com/BroCC57/dsh-pending-review-glow.git
```
