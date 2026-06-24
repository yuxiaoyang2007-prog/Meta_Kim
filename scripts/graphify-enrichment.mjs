const META_AGENT_GOVERNANCE_EDGES = Object.freeze([
  ["meta-warden", "meta-conductor", "delegates_workflow_governance"],
  ["meta-warden", "meta-prism", "delegates_quality_review"],
  ["meta-warden", "meta-chrysalis", "gates_evolution_writeback"],
  ["meta-conductor", "meta-artisan", "requests_capability_loadout"],
  ["meta-conductor", "meta-librarian", "requests_memory_strategy"],
  ["meta-conductor", "meta-sentinel", "requests_safety_boundary"],
  ["meta-conductor", "meta-genesis", "requests_identity_design"],
  ["meta-conductor", "meta-scout", "requests_external_discovery"],
  ["meta-prism", "meta-warden", "reports_review_decision"],
  ["meta-chrysalis", "meta-warden", "requests_writeback_approval"],
]);

function normalizedId(value) {
  return String(value ?? "").replace(/\\/g, "/").toLowerCase();
}

function findAgentNodeId(graph, agentId) {
  const expectedPath = `canonical/agents/${agentId}.md`;
  const expectedSuffix = `/${expectedPath}`;
  const nodes = Array.isArray(graph?.nodes) ? graph.nodes : [];
  const match = nodes.find((node) => {
    const candidates = [
      node.id,
      node.path,
      node.file,
      node.file_path,
      node.source_file,
      node.label,
      node.name,
    ].map(normalizedId);
    return candidates.some(
      (candidate) =>
        candidate === expectedPath ||
        candidate.endsWith(expectedSuffix) ||
        candidate.includes(expectedPath),
    );
  });
  return match?.id ?? null;
}

function edgeKey(edge) {
  return [
    String(edge?.source ?? ""),
    String(edge?.target ?? ""),
    String(edge?.relation ?? edge?.type ?? ""),
  ].join("\u0000");
}

function addNodeTypeAliases(graph) {
  let changed = 0;
  if (!Array.isArray(graph?.nodes)) return changed;
  for (const node of graph.nodes) {
    if (
      node &&
      typeof node === "object" &&
      node.type == null &&
      typeof node.file_type === "string" &&
      node.file_type
    ) {
      node.type = node.file_type;
      changed += 1;
    }
  }
  return changed;
}

export function enrichMetaKimGraph(graph) {
  if (!graph || typeof graph !== "object") {
    return {
      changed: false,
      addedAgentGovernanceEdges: 0,
      nodeTypeAliases: 0,
    };
  }

  const nodeTypeAliases = addNodeTypeAliases(graph);
  if (!Array.isArray(graph.links)) {
    graph.links = [];
  }
  const existingEdges = new Set(graph.links.map(edgeKey));
  let addedAgentGovernanceEdges = 0;

  for (const [sourceAgent, targetAgent, governanceKind] of META_AGENT_GOVERNANCE_EDGES) {
    const source = findAgentNodeId(graph, sourceAgent);
    const target = findAgentNodeId(graph, targetAgent);
    if (!source || !target) continue;
    const edge = {
      source,
      target,
      relation: "governs",
      kind: "agent_governance",
      governanceKind,
      sourceRef: `canonical/agents/${sourceAgent}.md`,
      targetRef: `canonical/agents/${targetAgent}.md`,
      metaKimGenerated: true,
    };
    const key = edgeKey(edge);
    if (existingEdges.has(key)) continue;
    graph.links.push(edge);
    existingEdges.add(key);
    addedAgentGovernanceEdges += 1;
  }

  const changed = nodeTypeAliases > 0 || addedAgentGovernanceEdges > 0;
  graph.meta_kim_enrichment = {
    schemaVersion: "meta-kim-graph-enrichment-v0.1",
    nodeTypeAliases,
    agentGovernanceEdges: addedAgentGovernanceEdges,
  };

  return {
    changed,
    addedAgentGovernanceEdges,
    nodeTypeAliases,
  };
}
