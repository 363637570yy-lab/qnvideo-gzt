# 芊柠AI视频工作台

芊柠AI视频工作台是面向短视频和短剧创作流程的 Web 工作台，基于开源项目 [xuanyustudio/LocalMiniDrama](https://github.com/xuanyustudio/LocalMiniDrama) 改造，保留原项目的 AI 短剧创作能力，并增加了适合服务器部署的账号登录、管理员权限、用户项目隔离和 PostgreSQL 身份数据存储。

本项目适合部署到个人服务器、内网工作站或团队测试服务器，用于统一管理短剧项目、素材、分镜、图片生成、视频生成和合成导出流程。

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

## 运行要求

- Docker 24+ 和 Docker Compose v2。
- PostgreSQL 14+。账号、角色、权限和项目归属映射需要 PostgreSQL。
- 如需本地开发，建议使用 Node.js 20；最低要求 Node.js 18。
- Docker 部署会在后端镜像内安装 FFmpeg；本地开发如需合成视频，请先把 FFmpeg 安装到系统 PATH，或设置 `FFMPEG_PATH` / `FFPROBE_PATH`。
- 如需调用国外 AI 服务商，可在 `.env` 中配置 `HTTP_PROXY` / `HTTPS_PROXY` / `ALL_PROXY`；不需要代理时留空即可。

## Docker 部署

下面命令会启动一个 PostgreSQL 容器，再启动芊柠AI视频工作台。示例密码请改成你自己的强密码。

### 1. 克隆项目

```bash
git clone https://github.com/363637570yy-lab/qnvideo-gzt.git
cd qnvideo-gzt
```

### 2. 启动 PostgreSQL

```bash
docker volume create qnvideo-gzt-postgres

docker run -d \
  --name qnvideo-gzt-postgres \
  --restart unless-stopped \
  -e POSTGRES_DB=qnvideo_gzt \
  -e POSTGRES_USER=qnvideo_gzt \
  -e POSTGRES_PASSWORD=please-change-this-password \
  -p 127.0.0.1:5432:5432 \
  -v qnvideo-gzt-postgres:/var/lib/postgresql/data \
  postgres:16-alpine
```

Windows PowerShell 也可以使用同一条命令，把换行符改成反引号：

```powershell
docker volume create qnvideo-gzt-postgres

docker run -d `
  --name qnvideo-gzt-postgres `
  --restart unless-stopped `
  -e POSTGRES_DB=qnvideo_gzt `
  -e POSTGRES_USER=qnvideo_gzt `
  -e POSTGRES_PASSWORD=please-change-this-password `
  -p 127.0.0.1:5432:5432 `
  -v qnvideo-gzt-postgres:/var/lib/postgresql/data `
  postgres:16-alpine
```

### 3. 创建环境变量文件

Linux / macOS：

```bash
cp .env.example .env
```

Windows PowerShell：

```powershell
Copy-Item .env.example .env
```

编辑 `.env`，至少确认这些值：

```env
AUTH_ENABLED=true
JWT_SECRET=replace-with-a-long-random-string
ADMIN_USERNAME=admin
ADMIN_PASSWORD=replace-with-admin-password

PGHOST=host.docker.internal
PGPORT=5432
PGDATABASE=qnvideo_gzt
PGUSER=qnvideo_gzt
PGPASSWORD=please-change-this-password

STORAGE_BASE_URL=http://localhost:20880/static
```

说明：

- 第一次启动时会用 `ADMIN_USERNAME` 和 `ADMIN_PASSWORD` 创建管理员账号。
- 如果你使用已有 PostgreSQL，把 `PGHOST`、`PGPORT`、`PGDATABASE`、`PGUSER`、`PGPASSWORD` 改成对应连接信息。
- 如果部署到公网域名，建议把 `STORAGE_BASE_URL` 改成你的真实访问地址，例如 `https://example.com/static`。
- 如果 AI 服务商需要代理，在 `.env` 中设置 `HTTP_PROXY` 和 `HTTPS_PROXY`，例如 `http://host.docker.internal:7890`。

### 4. 启动应用

```bash
docker compose -f docker-compose.codex.yml up -d --build
```

访问：

- Web：`http://localhost:20880`
- API 健康检查：`http://127.0.0.1:20881/health`

检查运行状态：

```bash
docker compose -f docker-compose.codex.yml ps
docker compose -f docker-compose.codex.yml logs -f
```

停止服务：

```bash
docker compose -f docker-compose.codex.yml down
```

注意：不要删除 `data/` 目录，也不要删除 PostgreSQL volume，否则会丢失上传素材、生成结果或账号数据。

## 本地开发

本地开发需要先准备 PostgreSQL。可以直接使用上面 Docker 部署中的 PostgreSQL 容器。

### 1. 启动后端

Linux / macOS：

```bash
cd backend-node
npm install

export AUTH_ENABLED=true
export JWT_SECRET=dev-secret-change-me
export ADMIN_USERNAME=admin
export ADMIN_PASSWORD=admin-dev-password
export PGHOST=127.0.0.1
export PGPORT=5432
export PGDATABASE=qnvideo_gzt
export PGUSER=qnvideo_gzt
export PGPASSWORD=please-change-this-password
export STORAGE_BASE_URL=http://localhost:5679/static

npm run migrate
npm run dev
```

Windows PowerShell：

```powershell
cd backend-node
npm install

$env:AUTH_ENABLED = "true"
$env:JWT_SECRET = "dev-secret-change-me"
$env:ADMIN_USERNAME = "admin"
$env:ADMIN_PASSWORD = "admin-dev-password"
$env:PGHOST = "127.0.0.1"
$env:PGPORT = "5432"
$env:PGDATABASE = "qnvideo_gzt"
$env:PGUSER = "qnvideo_gzt"
$env:PGPASSWORD = "please-change-this-password"
$env:STORAGE_BASE_URL = "http://localhost:5679/static"

npm run migrate
npm run dev
```

后端默认地址：

- API：`http://localhost:5679/api/v1`
- 健康检查：`http://localhost:5679/health`

### 2. 启动前端

另开一个终端：

```bash
cd frontweb
npm install
npm run dev
```

前端默认地址：

- `http://localhost:3013`

Vite 会把 `/api` 和 `/static` 代理到 `http://127.0.0.1:5679`。

### 3. 测试和构建

后端：

```bash
cd backend-node
npm test
```

前端：

```bash
cd frontweb
npm test
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
