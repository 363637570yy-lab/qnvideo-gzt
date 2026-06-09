import { reactive, ref } from 'vue'

export function usePipelineRunner(options = {}) {
  const restMs = Number(options.restMs || 1000)

  const pipelineConcurrency = ref(8)
  const pipelineVideoConcurrency = ref(3)
  const pipelineRunning = ref(false)
  const pipelinePaused = ref(false)
  const pipelineErrorLog = ref([])
  const pipelineCurrentStep = ref('')
  const pipelineStepIndex = ref(0)
  const pipelineStepTotal = ref(10)
  const pipelineCountdown = ref(0)
  const pipelineCountdownMsg = ref('')
  const pipelineActiveTasks = reactive(new Set())
  let pipelineResolveResume = null

  function setPipelineConcurrencyFallback(imageConcurrency = 4, videoConcurrency = 3) {
    pipelineConcurrency.value = imageConcurrency
    pipelineVideoConcurrency.value = videoConcurrency
  }

  function resetPipelineState(totalSteps = 10) {
    pipelineErrorLog.value = []
    pipelineCurrentStep.value = ''
    pipelineStepIndex.value = 0
    pipelineStepTotal.value = totalSteps
    pipelinePaused.value = false
    pipelineCountdown.value = 0
    pipelineCountdownMsg.value = ''
    pipelineActiveTasks.clear()
  }

  function startPipeline(totalSteps = 10) {
    resetPipelineState(totalSteps)
    pipelineRunning.value = true
  }

  function finishPipeline() {
    pipelineRunning.value = false
    pipelineActiveTasks.clear()
  }

  async function runConcurrently(items, concurrency, fn, options = {}) {
    let index = 0
    let anyPaused = false
    const list = Array.isArray(items) ? items : []
    const safeConcurrency = Math.max(1, Math.floor(Number(concurrency) || 1))
    const getLabel = options.getLabel || (() => null)

    async function worker() {
      while (index < list.length) {
        const i = index++
        const item = list[i]
        const label = getLabel(item)
        if (label) pipelineActiveTasks.add(label)
        try {
          const result = await fn(item, i)
          if (result && typeof result === 'object' && result.paused) {
            anyPaused = true
            return
          }
        } finally {
          if (label) pipelineActiveTasks.delete(label)
        }
      }
    }

    const workers = Array.from({ length: Math.min(safeConcurrency, list.length) }, () => worker())
    await Promise.allSettled(workers)
    return { paused: anyPaused }
  }

  function waitForResume() {
    return new Promise((resolve) => {
      pipelineResolveResume = resolve
    })
  }

  function onPipelineResume() {
    pipelinePaused.value = false
    if (pipelineResolveResume) {
      pipelineResolveResume()
      pipelineResolveResume = null
    }
  }

  function addPipelineError(step, message) {
    const time = new Date().toLocaleTimeString('zh-CN')
    pipelineErrorLog.value = [...pipelineErrorLog.value, { time, step, message }]
  }

  async function checkPause() {
    while (pipelinePaused.value) {
      await waitForResume()
    }
  }

  function pipelineRest() {
    return new Promise((resolve) => setTimeout(resolve, restMs))
  }

  function skipPipelineCountdown() {
    pipelineCountdown.value = 0
  }

  async function runPipelineCountdown(totalSeconds, msg) {
    pipelineCountdown.value = totalSeconds
    pipelineCountdownMsg.value = msg
    try {
      while (pipelineCountdown.value > 0) {
        await checkPause()
        await new Promise((resolve) => setTimeout(resolve, 1000))
        if (pipelineCountdown.value > 0) pipelineCountdown.value--
      }
    } finally {
      pipelineCountdown.value = 0
      pipelineCountdownMsg.value = ''
    }
  }

  async function pipelineWithRetry(stepName, fn, maxRetries = 3) {
    let lastErr
    for (let retry = 0; retry < maxRetries; retry++) {
      try {
        const result = await fn()
        if (result && result.paused === true) return result
        return true
      } catch (err) {
        lastErr = err
        if (retry < maxRetries - 1) await pipelineRest()
      }
    }
    addPipelineError(stepName, `重试${maxRetries}次均失败: ` + (lastErr?.message || String(lastErr)))
    return false
  }

  function setPipelineStep(index, text) {
    pipelineStepIndex.value = index
    pipelineCurrentStep.value = `[步骤 ${index}/${pipelineStepTotal.value}] ${text}`
  }

  return {
    addPipelineError,
    checkPause,
    finishPipeline,
    onPipelineResume,
    pipelineActiveTasks,
    pipelineConcurrency,
    pipelineCountdown,
    pipelineCountdownMsg,
    pipelineCurrentStep,
    pipelineErrorLog,
    pipelinePaused,
    pipelineRest,
    pipelineRunning,
    pipelineStepIndex,
    pipelineStepTotal,
    pipelineVideoConcurrency,
    pipelineWithRetry,
    resetPipelineState,
    runConcurrently,
    runPipelineCountdown,
    setPipelineConcurrencyFallback,
    setPipelineStep,
    skipPipelineCountdown,
    startPipeline,
    waitForResume,
  }
}
