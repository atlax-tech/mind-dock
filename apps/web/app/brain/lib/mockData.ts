import { reseed, randomInt, randomFloat, pickRandom, shuffleArray } from './seededRandom'
import type { BrainNode, BrainEdge, ClusterAnchor } from './types'

const DOC_LABELS = [
  'React Server Components', 'TypeScript 5.8 Patterns', 'Node.js Streams API',
  'PostgreSQL Query Optimization', 'Redis Cluster Architecture', 'GraphQL Schema Design',
  'Docker Multi-Stage Builds', 'Kubernetes Pod Networking', 'AWS Lambda Cold Starts',
  'WebAssembly in Browser', 'CSS Container Queries', 'Next.js App Router',
  'Prisma ORM Best Practices', 'Authentication with JWT', 'OAuth 2.0 Flow',
  'Microservices Communication', 'Event Sourcing Pattern', 'CQRS Implementation',
  'Domain-Driven Design', 'Clean Architecture in Frontend', 'Vite Plugin System',
  'ESBuild Performance', 'Turborepo Monorepo', 'PNPM Workspaces',
  'Tailwind CSS Design System', 'Radix UI Components', 'Storybook Documentation',
  'Playwright E2E Testing', 'Vitest Unit Testing', 'MSW Mock Service Worker',
  'TanStack Query Caching', 'Zustand State Management', 'Jotai Atomic State',
  'RxJS Observable Patterns', 'Effect TS Library', 'Zod Schema Validation',
  'tRPC End-to-End Types', 'OpenAPI Specification', 'gRPC Protocol Buffers',
  'WebSocket Real-time', 'Server-Sent Events', 'WebRTC Peer Connection',
  'IndexedDB Browser Storage', 'Service Worker Cache', 'Web Vitals Metrics',
  'Lighthouse Performance', 'Core Web Vitals', 'Accessibility ARIA Patterns',
  'Internationalization i18n', 'Feature Flags LaunchDarkly', 'A/B Testing Framework',
  'Error Monitoring Sentry', 'Log Aggregation Loki', 'Distributed Tracing',
  'CI/CD Pipeline GitHub Actions', 'Terraform Infrastructure', 'Pulumi IaC',
  'Cloudflare Workers', 'Edge Computing Patterns', 'CDN Cache Strategies',
  'Rate Limiting Algorithms', 'Circuit Breaker Pattern', 'Bulkhead Pattern',
  'API Gateway Kong', 'Service Mesh Istio', 'Observability with OpenTelemetry',
  'Data Lake Architecture', 'Apache Kafka Streams', 'Debezium CDC',
  'Machine Learning Pipeline', 'Vector Database Pinecone', 'LLM Prompt Engineering',
  'RAG Architecture', 'LangChain Patterns', 'Semantic Search',
  'Neural Network Basics', 'Computer Vision with OpenCV', 'NLP with Transformers',
  'Blockchain Consensus', 'Smart Contract Security', 'Zero Knowledge Proofs',
  'Quantum Computing Basics', 'Cryptography Fundamentals', 'OAuth 2.1 Migration',
  'WebAuthn Passkeys', 'Zero Trust Security', 'Supply Chain Security',
]

const TAG_LABELS = [
  'react', 'typescript', 'javascript', 'node', 'python', 'rust', 'golang',
  'api', 'database', 'performance', 'security', 'testing', 'devops',
  'frontend', 'backend', 'fullstack', 'mobile', 'cloud', 'serverless',
  'container', 'orchestration', 'monitoring', 'logging', 'tracing',
  'ci-cd', 'automation', 'scalability', 'reliability', 'availability',
  'latency', 'throughput', 'caching', 'indexing', 'partitioning',
  'sharding', 'replication', 'consistency', 'consensus', 'raft',
  'paxos', 'grpc', 'rest', 'graphql', 'websocket', 'http2', 'http3',
  'tls', 'mtls', 'jwt', 'saml', 'oidc', 'rbac', 'abac',
  'microservice', 'monolith', 'hexagonal', 'onion', 'layered',
  'event-driven', 'reactive', 'functional', 'imperative', 'declarative',
  'composition', 'inheritance', 'polymorphism', 'encapsulation', 'abstraction',
  'solid', 'dry', 'kiss', 'yagni', 'tdd', 'bdd', 'ddd',
  'agile', 'scrum', 'kanban', 'lean', 'devops-culture', 'gitops',
  'terraform', 'ansible', 'puppet', 'chef', 'helm', 'kustomize',
  'prometheus', 'grafana', 'elk', 'datadog', 'newrelic', 'sentry',
  'postgres', 'mysql', 'mongo', 'redis', 'cassandra', 'neo4j',
  'kafka', 'rabbitmq', 'sqs', 'sns', 'pubsub', 'nats',
  'docker', 'kubernetes', 'nomad', 'consul', 'vault', 'istio',
  'aws', 'gcp', 'azure', 'cloudflare', 'vercel', 'netlify',
  'linux', 'macos', 'windows', 'shell', 'bash', 'zsh',
  'vim', 'emacs', 'vscode', 'intellij', 'cursor', 'copilot',
  'prisma', 'drizzle', 'typeorm', 'sequelize', 'knex', 'mongoose',
  'tailwind', 'chakra', 'mui', 'antd', 'shadcn', 'radix',
  'nextjs', 'nuxt', 'svelte', 'remix', 'astro', 'gatsby',
  'vite', 'webpack', 'esbuild', 'swc', 'turbopack', 'rollup',
  'jest', 'vitest', 'cypress', 'playwright', 'storybook', 'chromatic',
  'redux', 'zustand', 'mobx', 'recoil', 'jotai', 'valtio',
  'react-query', 'swr', 'apollo', 'urql', 'relay', 'fetch',
  'eslint', 'prettier', 'biome', 'oxc', 'oxlint', 'stylelint',
  'github', 'gitlab', 'bitbucket', 'linear', 'jira', 'notion',
  'slack', 'discord', 'teams', 'zoom', 'meet', 'webex',
  'figma', 'sketch', 'zeplin', 'invision', 'penpot', 'lunacy',
  'ml', 'ai', 'llm', 'genai', 'transformer', 'diffusion',
  'wasm', 'webgpu', 'webgl', 'canvas', 'svg', 'threejs',
  'pwa', 'spa', 'ssr', 'ssg', 'isr', 'edge',
  'oauth', 'openid', 'sso', 'ldap', 'kerberos', 'fido',
]

const ORPHAN_LABELS = [
  'Quantum Entanglement', 'Dark Matter Theory', 'String Theory Basics',
  'CRISPR Gene Editing', 'Neuroscience of Memory', 'Climate Modeling',
  'Ancient Rome Economics', 'Renaissance Art History', 'Buddhist Philosophy',
  'Ocean Current Systems', 'Plate Tectonics', 'Stellar Evolution',
  'Game Theory Applications', 'Behavioral Economics', 'Linguistic Relativity',
  'Music Theory Harmony', 'Culinary Chemistry', 'Urban Planning Principles',
  'Renewable Energy Grid', 'Space Exploration History', 'Mycology Networks',
  'Permaculture Design', 'Cognitive Biases', 'Sleep Science',
  'Meditation Research', 'Biohacking Methods', 'Nutritional Biochemistry',
  'Martial Arts Philosophy', 'Origami Mathematics', 'Vexillology Principles',
  'Typography History', 'Color Theory Physics', 'Sound Engineering',
  'Cartography Techniques', 'Calligraphy Art',
]

const CLUSTER_ANCHORS: ClusterAnchor[] = [
  { name: 'dense-core', x: 0.36, y: 0.60, weight: 0.38 },
  { name: 'bottom-left', x: 0.22, y: 0.76, weight: 0.20 },
  { name: 'upper-mid', x: 0.56, y: 0.24, weight: 0.16 },
  { name: 'right-chain', x: 0.78, y: 0.44, weight: 0.14 },
  { name: 'bottom-chain', x: 0.52, y: 0.84, weight: 0.07 },
  { name: 'scatter', x: 0.50, y: 0.50, weight: 0.05 },
]

export interface MockDataResult {
  nodes: Map<string, BrainNode>
  edges: Map<string, BrainEdge>
  documentIds: string[]
  tagIds: string[]
  orphanIds: string[]
}

export function generateMockData(): MockDataResult {
  reseed()

  const nodes = new Map<string, BrainNode>()
  const edges = new Map<string, BrainEdge>()
  const documentIds: string[] = []
  const tagIds: string[] = []
  const orphanIds: string[] = []

  const docLabels = shuffleArray([...DOC_LABELS])
  const tagLabels = shuffleArray([...TAG_LABELS])
  const orphanLabels = shuffleArray([...ORPHAN_LABELS])

  const totalDocs = 80
  const docPerCluster = CLUSTER_ANCHORS.map((a) => Math.max(1, Math.round(a.weight * totalDocs)))
  docPerCluster[docPerCluster.length - 1] = totalDocs - docPerCluster.slice(0, -1).reduce((a, b) => a + b, 0)

  const allTagsPool = shuffleArray(tagLabels.slice(0, 220))
  let tagIdx = 0

  function makeNode(
    id: string,
    type: 'document' | 'tag' | 'orphan',
    label: string,
    cluster: string,
    parentId: string | null,
    tx: number,
    ty: number,
    extra: Partial<BrainNode> = {},
  ): BrainNode {
    return {
      id,
      type,
      label,
      cluster,
      importance: extra.importance ?? (type === 'document' ? randomFloat(0, 1) : randomFloat(0, 0.3)),
      parentId,
      targetX: tx,
      targetY: ty,
      z: extra.z ?? randomFloat(-0.3, 0.3),
      phase: extra.phase ?? randomFloat(0, Math.PI * 2),
      amplitude: extra.amplitude ?? (type === 'document' ? randomFloat(0.4, 1.2) : randomFloat(0.1, 0.6)),
      speed: extra.speed ?? (type === 'document' ? randomFloat(0.6, 1.4) : randomFloat(0.4, 1.6)),
      currentX: tx,
      currentY: ty,
      currentZ: 0,
      vx: 0,
      vy: 0,
      baseRadius: extra.baseRadius ?? (type === 'document' ? randomFloat(2.8, 5.2) : randomFloat(1.5, 2.6)),
      currentRadius: extra.currentRadius ?? 0,
      currentOpacity: 1,
      targetOpacity: 1,
      entranceDelay: extra.entranceDelay ?? (type === 'tag' ? 150 + randomFloat(0, 200) : 0),
      neighbors: new Set(),
      incidentEdges: new Set(),
    }
  }

  function addEdge(srcId: string, tgtId: string): BrainEdge {
    const eid = `edge-${srcId}-${tgtId}`
    const edge: BrainEdge = {
      id: eid,
      source: srcId,
      target: tgtId,
      currentOpacity: 0,
      targetOpacity: 1,
    }
    edges.set(eid, edge)

    const src = nodes.get(srcId)
    const tgt = nodes.get(tgtId)
    if (src) {
      src.neighbors.add(tgtId)
      src.incidentEdges.add(eid)
    }
    if (tgt) {
      tgt.neighbors.add(srcId)
      tgt.incidentEdges.add(eid)
    }
    return edge
  }

  let docIdx = 0
  for (let ci = 0; ci < CLUSTER_ANCHORS.length; ci++) {
    const anchor = CLUSTER_ANCHORS[ci]
    const count = docPerCluster[ci]

    for (let di = 0; di < count && docIdx < docLabels.length; di++, docIdx++) {
      const id = `doc-${docIdx}`
      documentIds.push(id)

      const angle = randomFloat(0, Math.PI * 2)
      const radius = ci === CLUSTER_ANCHORS.length - 1
        ? randomFloat(0.05, 0.45)
        : randomFloat(0.005, 0.06)
      const tx = anchor.x + Math.cos(angle) * radius
      const ty = anchor.y + Math.sin(angle) * radius

      const importance = randomFloat(0, 1)
      const baseRadius = 2.8 + (importance > 0.7 ? randomFloat(2.8, 4.4) : 0)

      const docNode = makeNode(id, 'document', docLabels[docIdx] || `Document ${docIdx}`, anchor.name, null, tx, ty, {
        importance,
        baseRadius,
        currentRadius: baseRadius,
        z: randomFloat(-0.3, 0.3),
        amplitude: randomFloat(0.4, 1.2),
        speed: randomFloat(0.6, 1.4),
        entranceDelay: 0,
      })
      nodes.set(id, docNode)

      const numTags = randomInt(3, 12)
      const tagSpreadAngle = randomFloat(Math.PI / 3, Math.PI)
      const tagDirection = randomFloat(0, Math.PI * 2)
      const minDist = 14
      const maxDist = 38

      for (let ti = 0; ti < numTags && tagIdx < 220; ti++, tagIdx++) {
        const tid = `tag-${tagIdx}`
        tagIds.push(tid)

        const ta = tagDirection - tagSpreadAngle / 2 + (tagSpreadAngle / (numTags - 1 || 1)) * ti
        const td = randomFloat(minDist, maxDist)

        const canvasW = 1.0
        const canvasH = 1.0
        const ttx = Math.max(0.02, Math.min(0.98, tx + (Math.cos(ta) * td) / (canvasW * 1000)))
        const tty = Math.max(0.02, Math.min(0.98, ty + (Math.sin(ta) * td) / (canvasH * 1000)))

        const tagNode = makeNode(tid, 'tag', allTagsPool[tagIdx] || `Tag ${tagIdx}`, anchor.name, id, ttx, tty, {
          baseRadius: randomFloat(1.5, 2.6),
          currentRadius: randomFloat(1.5, 2.6),
          z: randomFloat(-0.15, 0.15),
          amplitude: randomFloat(0.2, 0.6),
          speed: randomFloat(0.8, 1.6),
          entranceDelay: 150 + randomFloat(0, 200),
        })
        nodes.set(tid, tagNode)

        addEdge(id, tid)
      }
    }
  }

  while (tagIdx < 220) {
    const tid = `tag-${tagIdx}`
    tagIds.push(tid)
    tagIdx++

    const parentDoc = pickRandom(documentIds)
    const parent = nodes.get(parentDoc)
    if (!parent) continue

    const ta = randomFloat(0, Math.PI * 2)
    const td = randomFloat(14, 38)
    const canvasW = 1.0
    const canvasH = 1.0
    const ttx = Math.max(0.02, Math.min(0.98, parent.targetX + Math.cos(ta) * td / (canvasW * 1000)))
    const tty = Math.max(0.02, Math.min(0.98, parent.targetY + Math.sin(ta) * td / (canvasH * 1000)))

    const tagNode = makeNode(tid, 'tag', allTagsPool[tagIdx - 1] || `Tag ${tagIdx - 1}`, parent.cluster, parentDoc, ttx, tty, {
      baseRadius: randomFloat(1.5, 2.6),
      currentRadius: randomFloat(1.5, 2.6),
      z: randomFloat(-0.15, 0.15),
      amplitude: randomFloat(0.2, 0.6),
      speed: randomFloat(0.8, 1.6),
      entranceDelay: 150 + randomFloat(0, 200),
    })
    nodes.set(tid, tagNode)

    addEdge(parentDoc, tid)
  }

  const crossEdgesCount = randomInt(140, 200)
  for (let i = 0; i < crossEdgesCount; i++) {
    const src = pickRandom(documentIds)
    let tgt = pickRandom(tagIds)
    for (let attempt = 0; attempt < 20; attempt++) {
      const srcNode = nodes.get(src)
      if (srcNode && !srcNode.neighbors.has(tgt)) break
      tgt = pickRandom(tagIds)
    }

    const srcNode = nodes.get(src)
    if (srcNode && !srcNode.neighbors.has(tgt)) {
      addEdge(src, tgt)
    }
  }

  const tagTagEdges = randomInt(30, 60)
  for (let i = 0; i < tagTagEdges; i++) {
    const t1 = pickRandom(tagIds)
    let t2 = pickRandom(tagIds)
    for (let attempt = 0; attempt < 20; attempt++) {
      if (t1 !== t2 && !nodes.get(t1)?.neighbors.has(t2)) break
      t2 = pickRandom(tagIds)
    }
    if (t1 !== t2 && nodes.get(t1)) {
      const t1Node = nodes.get(t1)
      if (t1Node && !t1Node.neighbors.has(t2)) {
        addEdge(t1, t2)
      }
    }
  }

  for (let oi = 0; oi < 35 && oi < orphanLabels.length; oi++) {
    const oid = `orphan-${oi}`
    orphanIds.push(oid)

    const region = randomFloat(0, 1)
    let ox: number, oy: number
    if (region < 0.25) {
      ox = randomFloat(0.02, 0.12)
      oy = randomFloat(0.02, 0.15)
    } else if (region < 0.5) {
      ox = randomFloat(0.88, 0.98)
      oy = randomFloat(0.02, 0.15)
    } else if (region < 0.75) {
      ox = randomFloat(0.88, 0.98)
      oy = randomFloat(0.85, 0.98)
    } else {
      ox = randomFloat(0.02, 0.12)
      oy = randomFloat(0.85, 0.98)
    }

    const orphanNode = makeNode(oid, 'orphan', orphanLabels[oi], 'scatter', null, ox, oy, {
      baseRadius: randomFloat(1.8, 2.6),
      currentRadius: randomFloat(1.8, 2.6),
      z: randomFloat(-0.1, 0.1),
      amplitude: randomFloat(0.1, 0.3),
      speed: randomFloat(0.4, 1.0),
      entranceDelay: 600 + randomFloat(0, 800),
      importance: 0,
    })
    nodes.set(oid, orphanNode)
  }

  return { nodes, edges, documentIds, tagIds, orphanIds }
}
