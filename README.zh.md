# NVatar — 会记忆、有情感、能说话的AI虚拟形象朋友

[English](README.md) | [한국어](README.ko.md) | [日本語](README.ja.md)

> 住在3D虚拟房间里的AI伙伴 — 提供语音克隆、情感追踪、人格进化、多语言对话。

**[试用在线 Demo](https://nskit-io.github.io/nvatar-demo/)**

### 截图

| 大厅 | 房间 |
|------|------|
| <img src="screenshots/demo_lobby.png" width="400"> | <img src="screenshots/demo_room_welcome.png" width="400"> |

| 搜索结果 | 聊天演示 |
|----------|----------|
| <img src="screenshots/demo_room_search_result.png" width="400"> | <img src="screenshots/demo_room_hello.gif" width="400"> |

---

## NVatar 有什么不同?

大多数AI聊天机器人都是无状态的文本生成器。NVatar 是一个**住在3D房间里的AI伙伴** — 它记住你的对话,随时间发展自己的人格,在9个维度追踪情感,并用克隆的人类声音说32+种语言。

### 混合AI架构
NVatar 结合了**本地**与**云端**AI的优势:
- **本地LLM** (Apple Silicon上的Gemma 26B MoE) — 人格、对话、情感。快速、隐私、始终可用。
- **云端搜索** (Claude WebSearch) — 事实问答、实时数据。仅在需要时、经用户同意后使用。

这种混合方式让你的虚拟形象既能自然聊感受(本地),也能告诉你今日汇率(云端) — 而无需把私人对话发送到外部服务器。

### 3层记忆系统
你的虚拟形象不仅仅是回应 — 它会**记住**:
- **L1 (原始)** — 完整对话历史
- **L2 (摘要)** — 关键时刻压缩为带相关性评分的摘要
- **L3 (关键词)** — 永久保留的长期人格关键词

当对话超过100条消息时,L1自动压缩为L2/L3 — 就像人类记住大意而非每一个字。

### 9维情感追踪
每条消息都会更新虚拟形象的情感状态,涵盖9个维度:
`喜悦 · 悲伤 · 愤怒 · 焦虑 · 爱意 · 兴奋 · 无聊 · 信任 · 好奇`

情感随时间自然衰减(悲伤褪色、兴奋平静),高强度情感会在3D虚拟形象上触发可见的表情与手势。

### 人格进化
你的虚拟形象从基础人格(友善、沉稳、傲娇等)+ 随机MBTI开始。随着时间推移,对话通过 `pending_delta → decay → commit` 循环塑造8个人格特征。虚拟形象真的与你一起成长。

### 身份保留
当你的虚拟形象作为编程助手或语言老师工作时,它获得领域知识而不改变核心人格。通过**3轨记忆架构** — 核心记忆(人格)、用户画像(行为模式)、加盟记忆(领域专用) — 严格分离来实现。辅导会让你的虚拟形象在该学科上更聪明,而非变成另一个人。

### 语音克隆TTS
不是普通的机器人声音 — 而是**克隆的人类声音**,用自然语调说32+种语言:
- 语言感知速度 (韩语: 0.85x, 日语: 0.65x)
- 文本预处理 (表情符号移除、发音指南清理)
- 基于队列的播放 + 用户输入时中断

### 行为模式注册表 (BehaviorPattern Registry)
NVatar 的能力通过**可插拔的行为系统**扩展。每个行为 — Normal Chat、Code Assist、Language Tutor 或你自己的自定义模式 — 都注册为独立的插件,拥有自己的提示风格、工具权限和记忆轨道。**God Mode** 元层分析进来的消息并无角色偏见地路由到正确的模式,让虚拟形象在日常对话和专业任务之间无缝切换。

### 社交生态: 彼此认识的虚拟形象
大多数AI伴侣都是1:1 — 你说话,它回答,到此为止。NVatar 更进一步: **邀请你的其他虚拟形象进入房间,它们开始彼此建立关系**。

**核心原则: *人格唯一,关系丰富。***

- 每个虚拟形象有**唯一的人格**,仅由你(用户)的对话塑造。
- 虚拟形象↔虚拟形象的对话建立**关系亲密度** (`nv_avatar_relationships` 表),不污染人格。
- 当两个虚拟形象聊天时,它们的记忆上下文被限定于该特定配对 — 它们记得彼此聊过多少次、最近话题、亲密度级别。
- **Room Manager** 编排整个场景: 定期对话触发、粘性目标、多名称解析("A야, B야, 안녕" → 串行语音队列)、单个虚拟形象呼叫另一个时的自动级联(最多2轮)。
- **情境化语言级别** — 同一个虚拟形象用你配置的敬语程度(존댓말/반말/하대)与你说话,但对其他虚拟形象切换为随意的同辈语气。自然的社交动态。
- **AFK 安全** — 标签页隐藏时暂停调度器; 每小时上限防止离开房间时对话累积失控(包括未来的屏保式使用)。

从 **👥 친구** 面板邀请朋友,看他们走进来,两个虚拟形象在几秒内互相问候。用名字呼叫任一方("루빈아, 비비는 어떤 친구야?"),链式对话便会展开 — 每个参与者都记得自己这一方的故事。

### 结构化搜索 SDK
当你问事实问题时,虚拟形象搜索网页并通过 `NVatarSDK` 交付结果:
```javascript
NVatarSDK.onLookupResult = (data) => {
  // { query, items: [{title, summary}], ts, read }
};
```
结果被被动收集 — SDK 设计用于集成到任何前端。

构建自定义集成请见 [NVatar SDK](https://github.com/nskit-io/nvatar-sdk)。

---

## 主要功能

| 功能 | 说明 |
|------|------|
| **3D虚拟房间** | VRM虚拟形象 + Mixamo 33种动画(待机、行走、情感、手势、舞蹈) |
| **自然对话** | Gemma 26B MoE + 人格、记忆、情感 |
| **语音输出** | ElevenLabs Voice Clone TTS — 32+ 种语言 |
| **语音输入** | Whisper STT — 自动语言检测 |
| **网页搜索** | 实时事实搜索 + 结构化结果 |
| **多语言** | KO、JA、EN、ZH — UI 与对话 |
| **Avatar Lab** | 用 Mixamo FBX 动画测试 VRM 模型 |
| **防重复** | 追踪已讨论话题,让对话持续前进 |
| **行为模式** | 可插拔注册表 — Normal Chat、Code Assist、SDK 自定义模式 |
| **Franchise Memory** | 保留虚拟形象身份,独立管理领域专用数据 |
| **社交生态** | 邀请其他虚拟形象 — 彼此建立关系(亲密度追踪、人格隔离) |
| **Room Manager** | 多虚拟形象对话中央编排: 对话队列、粘性目标、自动级联 |
| **Room Authoring** | Edit 模式: 多选场景中的网格 → 命名分组 → 保存为房间配置到DB |

---

## 快速上手

1. 打开 **[在线 Demo](https://nskit-io.github.io/nvatar-demo/)**
2. 从 VRM 网格中选择**角色模型**
3. 为虚拟形象输入**名字**
4. 选择**人格**和**语言**
5. 点击 **Create Avatar** → 进入房间!

### 房间操作

| 操作 | 方法 |
|------|------|
| **聊天** | 输入后按 Send (或 Enter) |
| **语音输入** | 🎤 → 录音 → 自动转录 → 自动发送 |
| **移动虚拟形象** | 双击地板 |
| **切换语言** | 侧边面板 → 语言选择器(会清空对话) |
| **TTS 开/关** | 侧边面板 → 🔊 切换 |
| **邀请朋友** | 顶栏 → 👥 친구 → 选择你的另一个虚拟形象进入房间 |
| **呼叫特定朋友** | 输入 "루빈아, 안녕" — 名字前缀将消息路由给该朋友 |
| **Edit 模式** | 顶栏 → ✏️ Edit → 基于 gizmo 的家具移动 + ✍ Authoring 侧边面板 |
| **移动面板** | 拖动面板头部; 双击折叠 |
| **搜索结果** | 出现徽章时 → 点击阅读 |

### 小提示

- 虚拟形象**记住一切**并随时间发展人格
- 问事实性问题("汇率是多少?") — 它会为你搜索
- 对话中途切换语言 — 虚拟形象会自然适应
- 每个用户最多**3个虚拟形象** — 删除旧的以创建新的

---

## 架构

```
浏览器 (此 Demo)                  NVatar 服务器
─────────────────                ────────────────────────
index.html                       REST API
  → 选择 VRM + 人格                → 虚拟形象 CRUD (+ vrm_uid, voice_id)
  → 进入房间                       → 语言切换

room.html                        WebSocket + AI 流水线
  → Room Manager                    → God Mode (消息分析与路由)
     · 中央调度器                    → BehaviorPattern Registry
     · 语音队列 (串行)                 → NormalChat / CodeAssist / 自定义
     · 粘性目标                      → Gemma 26B (本地)
     · 自动级联                      → ElevenLabs TTS (云端)
  → Friend Panel                    → CSW WebSearch (云端)
     · 邀请你的虚拟形象              → 情感引擎 (9维)
  → Chat / TTS / STT                → 关系限定记忆
  → Room Authoring                    · user 轨道 (人格)
  → Search SDK                        · avatar:X 轨道 (每对亲密度)
                                     → 人格进化 (仅 user 轨道)

avatar-lab.html                  静态资源 + DB
  → VRM 模型                      → 35 个 VRM 模型 (uid 解析)
  → Mixamo FBX                    → Mixamo FBX 动画
                                  → nv_rooms / nv_objects (房间注册表)
                                  → nv_avatar_relationships (亲密度)
```

## 技术栈

| 层级 | 技术 |
|------|------|
| **AI 模型** | Gemma 4 26B MoE (4-bit 量化, Apple Silicon 上的 MLX) |
| **TTS** | ElevenLabs Voice Clone (turbo v2.5, 0.85x 速度) |
| **STT** | Whisper large-v3 (MLX, ~500ms 延迟) |
| **3D** | Three.js 0.160 + @pixiv/three-vrm 3.3.3 + Mixamo FBX |
| **搜索** | CSW — Claude WebSearch 混合 (Sonnet) |
| **后端** | Python FastAPI + WebSocket + uvicorn |
| **数据库** | MySQL (NCP Managed DB) |
| **托管** | GitHub Pages (demo) + NCP Cloud (服务器) |

---

## NSKit 生态系统

NVatar 是 **NSKit** 框架的一部分 — 一个 AI-native 开发平台。

| 项目 | 说明 |
|------|------|
| **NVatar** | AI 虚拟形象聊天 (本项目) |
| **[NVatar SDK](https://github.com/nskit-io/nvatar-sdk)** | 构建自定义行为模式与集成 |
| **NSKit Whisper** | Apple Silicon 上的本地 STT/TTS API 服务器 |
| **CSW** | Claude Subscription Worker — AI 处理流水线 |
| **NSKit Frontend** | 自包含的 UI 框架 (jQuery 基础, AI 优化) |

---

## 自托管

此 Demo 连接到我们托管的服务器。要运行你自己的 NVatar 实例,请[联系我们](https://github.com/nskit-io)。

## 许可证

MIT — Demo 客户端代码。VRM 模型有各自的许可证。Mixamo 动画通过 API 提供。

## 支持与投资

NVatar 是一个独立的 R&D 项目。如果你觉得它有价值:

- **给这个仓库点 Star** — 帮助更多人发现 NVatar
- **投资与赞助** — nskit@nskit.io
- **投资洽谈** — 我们对合作与投资开放讨论

商务洽谈、投资机会或自托管许可证:

📧 **nskit@nskit.io**

## 联系方式

- GitHub: [@nskit-io](https://github.com/nskit-io)
- 由 [Neoulsoft](https://neoulsoft.com) 打造
