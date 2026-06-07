# 芊柠AI视频工作台

芊柠AI视频工作台是面向短视频和短剧创作流程的 Web 工作台，支持项目管理、剧本拆解、角色/场景/道具素材、分镜生成、图片生成、视频生成、合成导出、账号登录和管理员权限控制。

## 项目结构

```text
backend-node/        后端服务，提供 API、身份认证、项目和素材管理
frontweb/            前端 Web 应用
data/                本地运行数据目录，不提交到仓库
docker-compose.codex.yml
                    Docker Compose 部署入口
```

## 本地开发

后端：

```bash
cd backend-node
npm install
npm test
npm start
```

前端：

```bash
cd frontweb
npm install
npm run dev
npm run build
```

## 数据策略

- 账号、角色、权限、项目归属等结构化身份数据使用 PostgreSQL。
- 图片、视频、音频、导出文件等大体积媒体文件写入 `data/`。
- `.env`、数据库文件、生成媒体文件、模型/API 密钥不要提交到 Git。

## 运维资料

服务器地址、端口、测试账号、部署目录和 Codex 操作规则都保存在上级工作区的运维文档中，不写入本公开项目仓库。
