# The SnakeBall Battle 上线准备

## 当前状态

这个仓库现在有两部分：

- 根目录：现有 Canvas 单机前端。
- `server/`：线上房间与匹配服务器骨架，使用 WebSocket，固定 11 条蛇，真人不足自动补机器人。

目前后端已经能做：

- 创建房间并生成房间码
- 输入房间码加入
- 快速匹配
- 每个房间固定 11 个名额
- 真人不足时用机器人补满
- WebSocket 连接与基础输入消息

下一步要做的是把前端游戏模拟逐步迁到服务器端，让同一房间里的玩家看到同一个世界。

## 本地运行后端

```bash
cd server
npm install
npm run dev
```

打开：

```text
http://localhost:3000
```

健康检查：

```text
http://localhost:3000/health
```

## 推荐上线架构

第一版可以先用一个 Node 服务同时托管网页和 WebSocket：

```text
https://你的域名
  /           前端网页
  /ws         WebSocket 联机服务
  /health     健康检查
```

这样域名配置最简单，朋友打开一个网址就能玩。

## Render 部署参数

如果不用 `render.yaml`，手动创建 Render Web Service 时这样填：

```text
Root Directory: 留空
Build Command: cd server && npm install
Start Command: node server/server.js
```

`server/server.js` 会同时提供：

- `/` 当前网页
- `/ws` WebSocket
- `/health` 健康检查

后面玩家变多后，再拆成：

```text
https://www.your-domain.com     前端
https://api.your-domain.com     WebSocket 后端
```

## 你买好域名后需要准备的信息

- 域名是什么
- 域名在哪个平台买的
- 是否有 GitHub 账号
- 是否愿意用 Render / Railway / Fly.io 之类的海外服务器
- 主要玩家是否在中国大陆

如果服务器放中国大陆，通常需要备案；海外服务器通常不用备案，但国内网络速度可能波动。
