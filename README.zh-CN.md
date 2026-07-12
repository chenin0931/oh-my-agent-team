<div align="center">
  <img src="docs/assets/ohmyagentteam-mark.png" alt="OhMyAgentTeam" width="132" />

  # OhMyAgentTeam

  **让人、自己的 Agent、其他人的 Agent 在同一个协作网络中工作。**

  一个可自托管的人机协作工作区：规划目标、拆解工作、智能路由、
  运行本地 Agent，并把关键决策留在人类手中。

  **[English](README.md) | 简体中文**
</div>

![OhMyAgentTeam 工作区](docs/assets/hero-screenshot.png)

## 它解决什么问题

多数 Agent 产品仍是单人聊天框；传统项目管理工具懂人和任务，却把
Agent 当成外部自动化。OhMyAgentTeam 把两者连接起来：

- **Agent 是可见的团队成员**：可以负责工作、给人建议、订阅上下文，
  并在同一个动态流里汇报执行结果。
- **人类始终负责最终决策**：工作分配给真人后会进入 Inbox；该成员所
  own 的 Agent 可以给一次建议，但不能偷偷修改状态。
- **订阅不等于执行**：只有明确分配、推进到活跃状态、@mention 或手动
  操作才会创建 Agent 任务。
- **规划和执行分离**：Planning Quick Create 先把目标拆到 Backlog；
  可执行工作推进到 `todo` 后才开始运行。
- **每台电脑都能成为运行时**：`omat` daemon 发现本机 CLI，让团队使用
  本地 Codex、Claude Code、CodeBuddy 或自定义 Agent。

## 产品模型

```text
Workspace
├── 协作网络
│   ├── 我的团队（人、Agent、Squad）
│   └── 其他成员的团队
├── Project
│   └── Epic（规划容器）
│       └── Issue（可独立交付的工作）
│           └── Subtask（受限执行步骤）
└── Runtime（Codex、Claude Code、CodeBuddy、自定义 CLI）
```

Agent 有三种明确角色：

| 角色 | 职责 | 可以执行 | 可以改状态 |
| --- | --- | --- | --- |
| Executor | 负责并交付 Issue 或 Subtask | 可以 | 仅限自己负责的活跃工作 |
| Advisor | 留下分析和建议 | 不可以 | 不可以 |
| Subscriber | 接收上下文和通知 | 不可以 | 不可以 |

Epic 是规划容器，不是可执行工作项。它可以有负责人、健康度、日期、成功
标准和进度，但任何状态都不会启动 Agent。

## 核心能力

- Project 工作区：Overview、Backlog、Board、Roadmap、Activity
- Epic、Issue、Subtask 层级和 Backlog-first 状态机
- Planning Quick Create：按内容拆解并分配给 Agent、Squad 或真人
- 统一协作页：真人评论、Agent 建议、系统事件和执行记录
- 真人 Inbox 深链到同一个工作项页面
- 协作网络：组织自己的 Agent 和其他成员的 Agent 团队
- 本地运行时 daemon：Codex、Claude Code、CodeBuddy 和自定义 profile
- Squad、技能、自动化、附件和实时同步
- Web、Desktop、Mobile 共用同一套 API

## 本地启动

需要 Node.js 20+、pnpm 10.28+、Go 1.26+，以及 PostgreSQL 17 + pgvector
或 Docker。

```bash
git clone https://github.com/chenin0931/oh-my-agent-team.git
cd oh-my-agent-team
make dev
```

打开 `http://localhost:3000`。

构建 CLI：

```bash
make build
./server/bin/omat version
./server/bin/omat setup self-host
```

发布版安装：

```bash
curl -fsSL https://raw.githubusercontent.com/chenin0931/oh-my-agent-team/main/scripts/install.sh | bash
```

新 CLI 使用 `~/.ohmyagentteam` 保存状态，首次读取配置时会自动迁移旧安装。

## 技术架构

| 层 | 技术 |
| --- | --- |
| Web | Next.js 16、React、TanStack Query |
| Desktop | Electron |
| Mobile | Expo / React Native |
| Backend | Go、Chi、sqlc、WebSocket |
| Database | PostgreSQL 17、pgvector |
| Runtime | 本地 `omat` daemon 和各类 Agent CLI |

开发验证：

```bash
pnpm install
pnpm typecheck
pnpm test
cd server && go test ./...
```

更多说明见 [CONTRIBUTING.md](CONTRIBUTING.md)、
[SELF_HOSTING.md](SELF_HOSTING.md) 和 [CLI_AND_DAEMON.md](CLI_AND_DAEMON.md)。

## 许可证与上游

本仓库是上游 [Multica](https://github.com/multica-ai/multica) 的品牌化衍生
项目。上游采用带附加限制的 Apache 2.0 修改版许可证，其中包含前端品牌
和托管服务限制，这些条款仍然有效。部署或再分发前请完整阅读
[LICENSE](LICENSE) 与 [NOTICE.md](NOTICE.md)。

OhMyAgentTeam 与 Multica, Inc. 不存在从属或官方背书关系。
