export function parseModelList(models, defaultModel = '') {
  if (Array.isArray(models)) {
    return models.map((m) => String(m).trim()).filter(Boolean)
  }
  if (typeof models === 'string') {
    return models.split(/[\n,，]/).map((s) => s.trim()).filter(Boolean)
  }
  return defaultModel ? [String(defaultModel).trim()].filter(Boolean) : []
}

export function getSelectableModels(configs, serviceType, configId) {
  const list = Array.isArray(configs) ? configs : []
  const serviceConfigs = list
    .filter((c) => c.service_type === serviceType && c.is_active)
    .sort((a, b) => {
      const ao = Number(a.route_order ?? 0)
      const bo = Number(b.route_order ?? 0)
      if (ao !== bo) return ao - bo
      return Number(a.id ?? 0) - Number(b.id ?? 0)
    })
  const selectedConfig = configId
    ? list.find((c) => c.id === configId)
    : null
  const config = selectedConfig
    || serviceConfigs[0]

  if (!config) return []
  return parseModelList(config.model, config.default_model)
}
