# 芊柠AI视频工作台

芊柠AI视频工作台是面向短视频和短剧创作流程的 Web 工作台，基于开源项目 [xuanyustudio/LocalMiniDrama](https://github.com/xuanyustudio/LocalMiniDrama) 改造，保留原项目的 AI 短剧创作能力，并增加了适合服务器部署的账号登录、管理员权限、用户项目隔离和 PostgreSQL 身份数据存储。

本项目适合在个人服务器、内网工作站或团队测试服务器上部署，用于统一管理短剧项目、素材、分镜、图片生成、视频生成和合成导出流程。

## 功能概览

- 项目管理：创建、导入、导出短剧项目，按项目管理分集、资源和生成结果。
- 剧本流程：支持故事生成、剧本编辑、分集管理和分镜拆解。
- 素材管理：支持角色、场景、道具素材库，便于跨项目复用。
- 分镜制作：支持分镜脚本、图片提示词、视频提示词、参考图和分镜视频管理。
- AI 生成：可对接文本、图片、视频类 AI 服务，支持多服务商和 OpenAI 兼容接口。
- 合成导出：支持把多个分镜视频合成为完整剧集文件。
- 账号权限：管理员可管理用户、AI 配置和全部项目；普通用户只能访问自己的项目。
- 服务器部署：提供 Docker Compose 部署入口，媒体文件写入独立 `data/` 目录。

## 界面预览

以下截图来自原开源项目，用于展示核心工作流。本仓库版本在此基础上加入了服务器部署、登录和权限隔离能力。

<div align="center">
  <img src="https://raw.githubusercontent.com/xuanyustudio/LocalMiniDrama/main/%E9%A1%B9%E7%9B%AE%E6%88%AA%E5%9B%BE/%E9%A6%96%E9%A1%B5%E6%88%AA%E5%9B%BE.png" alt="项目首页" width="960" />
  <br />
  <sub>项目首页和项目卡片</sub>
</div>

<br />

<table>
  <tr>
    <td align="center">
      <img src="https://raw.githubusercontent.com/xuanyustudio/LocalMiniDrama/main/%E9%A1%B9%E7%9B%AE%E6%88%AA%E5%9B%BE/%E6%AD%A6%E4%BE%A0.png" alt="剧集管理" width="480" />
      <br />
      <sub>剧集管理、分集和资源库</sub>
    </td>
    <td align="center">
      <img src="https://raw.githubusercontent.com/xuanyustudio/LocalMiniDrama/main/%E9%A1%B9%E7%9B%AE%E6%88%AA%E5%9B%BE/%E6%AD%A6%E4%BE%A0%E5%88%86%E9%95%9C.png" alt="分镜制作" width="480" />
      <br />
      <sub>分镜制作、图片和视频生成</sub>
    </td>
  </tr>
  <tr>
    <td align="center">
      <img src="https://raw.githubusercontent.com/xuanyustudio/LocalMiniDrama/main/%E9%A1%B9%E7%9B%AE%E6%88%AA%E5%9B%BE/%E4%B8%93%E4%B8%9A%E5%88%86%E9%95%9C.png" alt="专业分镜参数" width="480" />
      <br />
      <sub>景别、运镜、灯光、景深等分镜参数</sub>
    </td>
    <td align="center">
      <img src="https://raw.githubusercontent.com/xuanyustudio/LocalMiniDrama/main/%E9%A1%B9%E7%9B%AE%E6%88%AA%E5%9B%BE/%E6%9C%AC%E5%89%A7%E5%9C%BA%E6%99%AF%E5%BA%93.png" alt="场景库" width="480" />
      <br />
      <sub>场景库和素材复用</sub>
    </td>
  </tr>
</table>

## 账号和权限

本仓库版本启用了登录和权限隔离：

- 管理员可以进入用户管理、AI 配置，并查看全部项目。
- 普通用户只能查看和操作自己创建的项目。
- 账号、角色、权限、项目归属映射等身份数据存储在 PostgreSQL。
- 图片、视频、音频、导出文件等大体积媒体文件保存到独立 `data/` 目录。

生产或公网部署时，请通过服务器本地 `.env` 设置强密码和随机 `JWT_SECRET`，不要把真实密钥提交到仓库。

## 快速部署

准备一个 PostgreSQL 数据库，然后复制环境变量示例：

```bash
cp .env.example .env
```

编辑 `.env`，至少配置：

```env
AUTH_ENABLED=true
JWT_SECRET=change-this-to-a-long-random-string
ADMIN_USERNAME=admin
ADMIN_PASSWORD=change-me-before-first-login
PGHOST=127.0.0.1
PGPORT=5432
PGDATABASE=qnvideo-gzt
PGUSER=qnvideo-gzt
PGPASSWORD=change-me
STORAGE_BASE_URL=http://localhost:20880/static
```

启动服务：

```bash
docker compose -f docker-compose.codex.yml up -d --build
```

默认端口：

- Web：`20880`
- API：`20881`，默认只绑定服务器本机 `127.0.0.1`

运行数据目录：

```text
data/
```

部署、更新和重建容器时请保留 `data/`，避免删除用户上传素材和生成结果。

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

## 项目结构

```text
backend-node/              后端服务，提供 API、身份认证、项目和素材管理
frontweb/                  前端 Web 应用
data/                      本地运行数据目录，不提交到仓库
docker-compose.codex.yml   Docker Compose 部署入口
```

## AI 服务商

项目保留原项目的多服务商接入思路，可按实际需要配置文本、图片和视频模型。常见方向包括：

- OpenAI 兼容接口
- 阿里云 DashScope / 通义
- 火山引擎 Volcengine / 豆包 / Seedance
- 可灵 Kling
- Vidu
- Google Gemini / Imagen / Veo
- 本地部署或内网模型服务

不同服务商的 API 格式、模型能力和计费策略不同，请在管理员的 AI 配置中按需设置并测试连接。

## 许可证与致谢

本项目保留 MIT License。

本仓库基于 [xuanyustudio/LocalMiniDrama](https://github.com/xuanyustudio/LocalMiniDrama) 的开源成果进行服务器部署和权限能力改造，感谢原作者和社区贡献者。
