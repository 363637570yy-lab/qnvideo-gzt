const express = require('express');
const response = require('../response');
const identityService = require('../services/identityService');
const { requireAuth, requireAdmin } = require('../middleware/auth');

module.exports = function authRoutes(log) {
  const r = express.Router();

  r.post('/login', async (req, res) => {
    try {
      const { username, password } = req.body || {};
      const result = await identityService.login(username, password, log);
      if (!result) return response.unauthorized(res, '用户名或密码错误');
      response.success(res, result);
    } catch (err) {
      log?.error?.('login failed', { error: err.message });
      response.error(res, 503, 'AUTH_UNAVAILABLE', '账号服务不可用，请检查 PostgreSQL 连接');
    }
  });

  r.get('/me', requireAuth(log), (req, res) => {
    response.success(res, { user: req.user });
  });

  r.get('/users', requireAuth(log), requireAdmin(), async (req, res) => {
    try {
      response.success(res, await identityService.listUsers(log));
    } catch (err) {
      log?.error?.('list users failed', { error: err.message });
      response.internalError(res, err.message);
    }
  });

  r.post('/users', requireAuth(log), requireAdmin(), async (req, res) => {
    try {
      const user = await identityService.createUser(req.body || {}, req.user, log);
      response.created(res, user);
    } catch (err) {
      response.badRequest(res, err.message);
    }
  });

  r.put('/users/:id', requireAuth(log), requireAdmin(), async (req, res) => {
    try {
      const user = await identityService.updateUser(req.params.id, req.body || {}, req.user, log);
      if (!user) return response.notFound(res, '用户不存在');
      response.success(res, user);
    } catch (err) {
      response.badRequest(res, err.message);
    }
  });

  return r;
};
