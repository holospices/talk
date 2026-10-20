import type { ImageProvidersSettings } from '../types'

export type ComfyWorkflow = Record<string, unknown>
type Node = { class_type?: unknown; inputs?: Record<string, unknown>; _meta?: { title?: unknown } }
export type ComfyInputBinding = { nodeId: string; inputName: string }
export type ComfyBindingKind = 'positivePrompt' | 'negativePrompt' | 'seed' | 'steps' | 'cfg' | 'sampler' | 'scheduler' | 'width' | 'height'

export interface ComfyBindingOption extends ComfyInputBinding {
  classType: string
  title: string
  value: unknown
}

export interface ComfyWorkflowAnalysis {
  nodeCount: number
  nodeTypes: string[]
  outputNodes: Array<{ nodeId: string; classType: string; title: string }>
  detectedBindings: NonNullable<ImageProvidersSettings['comfyui']['workflowBindings']>
}

function asNode(value: unknown): Node | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Node : undefined
}

function node(workflow: ComfyWorkflow, id: string | undefined): Node | undefined {
  return id ? asNode(workflow[id]) : undefined
}

function entries(workflow: ComfyWorkflow): Array<[string, Node]> {
  return Object.entries(workflow).flatMap(([id, value]) => {
    const item = asNode(value)
    return item ? [[id, item] as [string, Node]] : []
  })
}

function classType(item: Node): string {
  return typeof item.class_type === 'string' ? item.class_type : ''
}

function nodeTitle(id: string, item: Node): string {
  const title = item._meta?.title
  return typeof title === 'string' && title.trim() ? title.trim() : `${classType(item)} #${id}`
}

function connectedNodeId(value: unknown): string | undefined {
  return Array.isArray(value) && (typeof value[0] === 'string' || typeof value[0] === 'number') ? String(value[0]) : undefined
}

function isOutputNode(item: Node): boolean {
  const type = classType(item)
  return /^(SaveImage|PreviewImage)$/.test(type)
    || (/(save|preview|output).*image|image.*(save|output)/i.test(type) && !!item.inputs && ('images' in item.inputs || 'image' in item.inputs))
}

function primitiveInputs(workflow: ComfyWorkflow): ComfyBindingOption[] {
  return entries(workflow).flatMap(([nodeId, item]) => Object.entries(item.inputs ?? {}).flatMap(([inputName, value]) => {
    if (value !== null && typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') return []
    return [{ nodeId, inputName, classType: classType(item), title: nodeTitle(nodeId, item), value }]
  }))
}

const inputMatchers: Record<ComfyBindingKind, RegExp> = {
  positivePrompt: /^(text|prompt|positive|positive_prompt|caption)$/i,
  negativePrompt: /^(text|prompt|negative|negative_prompt|caption)$/i,
  seed: /(^|_)(seed|noise_seed)(_|$)/i,
  steps: /(^|_)steps?(_|$)/i,
  cfg: /(^|_)(cfg|guidance|guidance_scale)(_|$)/i,
  sampler: /sampler(_name)?/i,
  scheduler: /scheduler/i,
  width: /(^|_)width(_|$)/i,
  height: /(^|_)height(_|$)/i,
}

export function getComfyWorkflowBindingOptions(workflow: ComfyWorkflow, kind: ComfyBindingKind): ComfyBindingOption[] {
  const matcher = inputMatchers[kind]
  const expectedType = ['seed', 'steps', 'cfg', 'width', 'height'].includes(kind) ? 'number' : 'string'
  return primitiveInputs(workflow)
    .filter((option) => matcher.test(option.inputName) && typeof option.value === expectedType)
    .sort((a, b) => {
      const aCore = /KSampler|CLIPTextEncode|EmptyLatentImage/i.test(a.classType) ? 0 : 1
      const bCore = /KSampler|CLIPTextEncode|EmptyLatentImage/i.test(b.classType) ? 0 : 1
      return aCore - bCore || Number(a.nodeId) - Number(b.nodeId)
    })
}

function firstBinding(workflow: ComfyWorkflow, kind: ComfyBindingKind): ComfyInputBinding | undefined {
  const option = getComfyWorkflowBindingOptions(workflow, kind)[0]
  return option ? { nodeId: option.nodeId, inputName: option.inputName } : undefined
}

function findUpstreamBinding(
  workflow: ComfyWorkflow,
  startNodeId: string | undefined,
  kind: ComfyBindingKind,
): ComfyInputBinding | undefined {
  if (!startNodeId) return undefined
  const matcher = inputMatchers[kind]
  const visited = new Set<string>()
  const queue = [startNodeId]
  while (queue.length > 0) {
    const currentId = queue.shift()!
    if (visited.has(currentId)) continue
    visited.add(currentId)
    const current = node(workflow, currentId)
    if (!current?.inputs) continue
    const direct = Object.entries(current.inputs).find(([name, value]) => matcher.test(name) && (typeof value === 'string' || typeof value === 'number'))
    if (direct) return { nodeId: currentId, inputName: direct[0] }
    for (const value of Object.values(current.inputs)) {
      const upstreamId = connectedNodeId(value)
      if (upstreamId && !visited.has(upstreamId)) queue.push(upstreamId)
    }
  }
  return undefined
}

export function validateComfyWorkflow(value: unknown): ComfyWorkflow {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('工作流 JSON 必须是对象')
  const workflow = value as ComfyWorkflow
  const rows = entries(workflow)
  if (!rows.length) throw new Error('工作流中没有节点')
  if (Object.keys(workflow).length !== rows.length || rows.some(([, item]) => typeof item.class_type !== 'string')) {
    throw new Error('这不是 ComfyUI API Format 工作流，请在 ComfyUI 中选择“Save (API Format)”后再导入')
  }
  if (!rows.some(([, item]) => isOutputNode(item))) {
    throw new Error('工作流中没有可识别的图片输出节点，请加入 SaveImage 或 PreviewImage')
  }
  return workflow
}

export function detectComfyWorkflowBindings(workflow: ComfyWorkflow): NonNullable<ImageProvidersSettings['comfyui']['workflowBindings']> {
  const rows = entries(workflow)
  const sampler = rows.find(([, item]) => /KSampler/i.test(classType(item)))
  const samplerInputs = sampler?.[1].inputs ?? {}
  const positiveNodeId = connectedNodeId(samplerInputs.positive)
  const negativeNodeId = connectedNodeId(samplerInputs.negative)
  const latentNodeId = connectedNodeId(samplerInputs.latent_image)
  const outputNodeId = rows.find(([, item]) => isOutputNode(item))?.[0]
  return {
    positivePrompt: findUpstreamBinding(workflow, positiveNodeId, 'positivePrompt') ?? firstBinding(workflow, 'positivePrompt'),
    negativePrompt: findUpstreamBinding(workflow, negativeNodeId, 'negativePrompt'),
    seed: sampler ? firstMatchingInput(sampler[0], sampler[1], 'seed') : firstBinding(workflow, 'seed'),
    steps: sampler ? firstMatchingInput(sampler[0], sampler[1], 'steps') : firstBinding(workflow, 'steps'),
    cfg: sampler ? firstMatchingInput(sampler[0], sampler[1], 'cfg') : firstBinding(workflow, 'cfg'),
    sampler: sampler ? firstMatchingInput(sampler[0], sampler[1], 'sampler') : firstBinding(workflow, 'sampler'),
    scheduler: sampler ? firstMatchingInput(sampler[0], sampler[1], 'scheduler') : firstBinding(workflow, 'scheduler'),
    width: findUpstreamBinding(workflow, latentNodeId, 'width') ?? firstBinding(workflow, 'width'),
    height: findUpstreamBinding(workflow, latentNodeId, 'height') ?? firstBinding(workflow, 'height'),
    outputNodeId,
    positivePromptNodeId: positiveNodeId,
    negativePromptNodeId: negativeNodeId,
    samplerNodeId: sampler?.[0],
    latentNodeId,
  }
}

function firstMatchingInput(nodeId: string, item: Node, kind: ComfyBindingKind): ComfyInputBinding | undefined {
  const inputName = Object.keys(item.inputs ?? {}).find((name) => inputMatchers[kind].test(name))
  return inputName ? { nodeId, inputName } : undefined
}

export function analyzeComfyWorkflow(workflow: ComfyWorkflow): ComfyWorkflowAnalysis {
  const rows = entries(workflow)
  return {
    nodeCount: rows.length,
    nodeTypes: Array.from(new Set(rows.map(([, item]) => classType(item)))).sort(),
    outputNodes: rows.flatMap(([nodeId, item]) => isOutputNode(item)
      ? [{ nodeId, classType: classType(item), title: nodeTitle(nodeId, item) }]
      : []),
    detectedBindings: detectComfyWorkflowBindings(workflow),
  }
}

function legacyBinding(
  workflow: ComfyWorkflow,
  direct: ComfyInputBinding | undefined,
  legacyNodeId: string | undefined,
  names: string[],
): ComfyInputBinding | undefined {
  if (direct) return direct
  const item = node(workflow, legacyNodeId)
  const inputName = names.find((name) => item?.inputs && name in item.inputs)
  return legacyNodeId && inputName ? { nodeId: legacyNodeId, inputName } : undefined
}

function setBinding(workflow: ComfyWorkflow, binding: ComfyInputBinding | undefined, value: unknown, label: string, required = false): void {
  const item = node(workflow, binding?.nodeId)
  if (!binding || !item?.inputs || !(binding.inputName in item.inputs)) {
    if (required) throw new Error(`无法定位${label}输入，请在工作流映射中手动选择节点字段`)
    return
  }
  item.inputs[binding.inputName] = value
}

export function injectComfyWorkflow(
  config: ImageProvidersSettings['comfyui'],
  query: string,
  joinedPrompt: (prefix: string, prompt: string) => string,
): ComfyWorkflow {
  const source = validateComfyWorkflow(config.workflow)
  const workflow = structuredClone(source)
  const detected = detectComfyWorkflowBindings(workflow)
  const saved = config.workflowBindings ?? {}
  const bindings = { ...detected, ...saved }
  const positive = legacyBinding(workflow, bindings.positivePrompt, bindings.positivePromptNodeId, ['text', 'prompt'])
  const negative = legacyBinding(workflow, bindings.negativePrompt, bindings.negativePromptNodeId, ['text', 'prompt'])
  const samplerNodeId = bindings.samplerNodeId
  const latentNodeId = bindings.latentNodeId

  setBinding(workflow, positive, joinedPrompt(config.promptPrefix, query), '正面提示词', true)
  if (config.workflowOverrides.negativePrompt) setBinding(workflow, negative, config.negativePrompt, '负面提示词')
  if (config.workflowOverrides.seed) {
    const seed = Math.floor(Math.random() * 4_294_967_295)
    const seedBinding = legacyBinding(workflow, bindings.seed, samplerNodeId, ['seed', 'noise_seed'])
    setBinding(workflow, seedBinding, seed, 'Seed')
  }
  if (config.workflowOverrides.steps) setBinding(workflow, legacyBinding(workflow, bindings.steps, samplerNodeId, ['steps']), config.steps, '步数')
  if (config.workflowOverrides.cfg) setBinding(workflow, legacyBinding(workflow, bindings.cfg, samplerNodeId, ['cfg']), config.cfg, 'CFG')
  if (config.workflowOverrides.sampler) setBinding(workflow, legacyBinding(workflow, bindings.sampler, samplerNodeId, ['sampler_name']), config.sampler, '采样器')
  if (config.workflowOverrides.scheduler) setBinding(workflow, legacyBinding(workflow, bindings.scheduler, samplerNodeId, ['scheduler']), config.scheduler, '调度器')
  if (config.workflowOverrides.width) setBinding(workflow, legacyBinding(workflow, bindings.width, latentNodeId, ['width']), config.width, '宽度')
  if (config.workflowOverrides.height) setBinding(workflow, legacyBinding(workflow, bindings.height, latentNodeId, ['height']), config.height, '高度')
  return workflow
}
