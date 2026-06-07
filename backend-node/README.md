# 芊柠AI视频工作台后端

后端基于 Node.js 与 Express，提供短视频项目、素材库、AI 配置、生成任务、项目导入导出、身份认证和权限控制接口。

## 启动

```bash
npm install
npm start
```

## 测试

```bash
npm test
```

## 关键配置

- 默认配置文件：`configs/config.yaml`
- Docker 部署配置：仓库根目录 `docker-compose.codex.yml`
- 数据目录：部署环境挂载到 `/app/data`
- PostgreSQL 连接：通过 `.env` 注入，不提交真实密码

## 身份与权限

- 初始管理员账号和密码通过环境变量 `ADMIN_USERNAME`、`ADMIN_PASSWORD` 注入。
- 管理员可管理用户、AI 配置和全部项目。
- 普通用户只能访问自己的项目和素材数据。

## 健康检查

```bash
curl -s http://127.0.0.1:5679/health
```
