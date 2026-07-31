import assert from "node:assert/strict";
import {mkdir, readFile, writeFile} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";

import {instance as createViz} from "@viz-js/viz";
import ELK from "elkjs/lib/elk.bundled.js";
import {FabricObject, loadSVGFromString, util} from "fabric/node";
import {JSDOM} from "jsdom";
import puppeteer from "puppeteer-core";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const fixtures = path.join(root, "fixtures");
const output = path.join(root, "output");

await mkdir(output, {recursive: true});

const canvasIr = JSON.parse(
  await readFile(path.join(fixtures, "canvas-ir.json"), "utf8"),
);
const dot = await readFile(path.join(fixtures, "diagram.dot"), "utf8");
const mermaidSource = await readFile(
  path.join(fixtures, "diagram.mmd"),
  "utf8",
);

validateCanonicalIds(canvasIr);
const elkLayout = await verifyElkLayout(canvasIr);
await writeFile(
  path.join(output, "elk-layout.json"),
  `${JSON.stringify(elkLayout, null, 2)}\n`,
);

const graphvizSvg = await verifyGraphviz(dot);
await writeFile(path.join(output, "graphviz.svg"), graphvizSvg);

const fabricRoundTrip = await verifyFabricRoundTrip(graphvizSvg);
await writeFile(
  path.join(output, "fabric-roundtrip.json"),
  `${JSON.stringify(fabricRoundTrip, null, 2)}\n`,
);

const mermaidResult = await verifyMermaid(mermaidSource);
const excalidrawResult = await verifyMermaidToExcalidraw(mermaidSource);
const d2Result = await verifyD2();

const report = {
  ok: true,
  verifiedAt: new Date().toISOString(),
  checks: {
    canonicalIr: {
      objectCount: canvasIr.objects.length,
      edgeCount: canvasIr.edges.length,
      timelineReferenceCount: canvasIr.timeline.length,
    },
    elk: {
      idsPreserved: true,
      nodeCount: elkLayout.children.length,
      routedEdgeCount: elkLayout.edges.length,
    },
    graphviz: {
      explicitNodeAndEdgeIdsPreserved: true,
      svgBytes: Buffer.byteLength(graphvizSvg),
    },
    fabric: fabricRoundTrip.summary,
    mermaid: mermaidResult,
    mermaidToExcalidraw: excalidrawResult.summary,
    d2: d2Result,
  },
};

await writeFile(
  path.join(output, "verification.json"),
  `${JSON.stringify(report, null, 2)}\n`,
);

console.log(JSON.stringify(report, null, 2));

function validateCanonicalIds(ir) {
  const targetIds = new Set([
    ...ir.objects.map(({id}) => id),
    ...ir.edges.map(({id}) => id),
  ]);
  assert.equal(targetIds.size, ir.objects.length + ir.edges.length);

  for (const edge of ir.edges) {
    assert(targetIds.has(edge.from), `Missing edge source: ${edge.from}`);
    assert(targetIds.has(edge.to), `Missing edge target: ${edge.to}`);
  }
  for (const cue of ir.timeline) {
    assert(targetIds.has(cue.targetId), `Missing cue target: ${cue.targetId}`);
  }
}

async function verifyElkLayout(ir) {
  const elk = new ELK();
  const graph = {
    id: ir.documentId,
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "RIGHT",
      "elk.spacing.nodeNode": "50",
      "elk.layered.spacing.nodeNodeBetweenLayers": "80",
    },
    children: ir.objects.map((object) => ({
      id: object.id,
      width: object.width,
      height: object.height,
    })),
    edges: ir.edges.map((edge) => ({
      id: edge.id,
      sources: [edge.from],
      targets: [edge.to],
    })),
  };

  const result = await elk.layout(graph);
  assert.deepEqual(
    result.children.map(({id}) => id).sort(),
    graph.children.map(({id}) => id).sort(),
  );
  assert.deepEqual(
    result.edges.map(({id}) => id).sort(),
    graph.edges.map(({id}) => id).sort(),
  );
  for (const node of result.children) {
    assert(Number.isFinite(node.x) && Number.isFinite(node.y));
  }
  for (const edge of result.edges) {
    assert(edge.sections?.length, `ELK did not route ${edge.id}`);
  }
  return result;
}

async function verifyGraphviz(source) {
  const viz = await createViz();
  const svg = viz.renderString(source, {
    engine: "dot",
    format: "svg",
  });

  const svgDocument = new JSDOM(svg, {contentType: "image/svg+xml"}).window
    .document;
  for (const id of [
    "diagram-rag",
    "node-source",
    "node-retrieve",
    "node-model",
    "node-answer",
    "edge-source-retrieve",
    "edge-retrieve-model",
    "edge-model-answer",
  ]) {
    assert(svgDocument.getElementById(id), `Graphviz dropped explicit id: ${id}`);
  }
  return svg;
}

async function verifyFabricRoundTrip(svg) {
  FabricObject.customProperties = ["objectId", "sourceGroupId", "sourceTag"];
  const partCounts = new Map();
  const parsed = await loadSVGFromString(svg, (element, object) => {
    const group = element.closest?.("g.node[id], g.edge[id]");
    const sourceGroupId = group?.id || element.id || "diagram-rag";
    const sourceTag = element.localName;
    const counterKey = `${sourceGroupId}:${sourceTag}`;
    const partIndex = partCounts.get(counterKey) ?? 0;
    partCounts.set(counterKey, partIndex + 1);
    object.set({
      objectId: `${sourceGroupId}::${sourceTag}-${partIndex}`,
      sourceGroupId,
      sourceTag,
    });
  });

  const objects = parsed.objects.filter(Boolean);
  assert(objects.length > 0, "Fabric did not parse Graphviz SVG objects");
  const serialized = objects.map((object) => object.toObject());
  const importedIds = serialized
    .map(({objectId}) => objectId)
    .filter(Boolean)
    .sort();
  assert.equal(new Set(importedIds).size, importedIds.length);
  assert(
    serialized.some(({sourceGroupId}) => sourceGroupId === "node-model"),
    "Fabric reviver did not recover Graphviz group ids",
  );

  const restored = await util.enlivenObjects(serialized);
  const restoredIds = restored
    .map(({objectId}) => objectId)
    .filter(Boolean)
    .sort();
  assert.deepEqual(restoredIds, importedIds);

  const editableText = restored.find(
    (object) => object.type === "text" && object.sourceGroupId === "node-model",
  );
  assert(editableText, "Expected an editable Fabric text object for node-model");
  editableText.set({text: "LLM / 大模型"});
  assert.equal(editableText.text, "LLM / 大模型");

  return {
    summary: {
      svgObjectCount: objects.length,
      customIdsSurviveJsonRoundTrip: true,
      graphvizGroupIdsRecoveredByReviver: true,
      textObjectEditableAfterRestore: true,
      caveat: "One diagram node maps to several Fabric leaf objects; the adapter must group them by sourceGroupId.",
    },
    objects: restored.map((object) => object.toObject()),
  };
}

async function verifyMermaid(source) {
  const executablePath =
    process.env.CHROME_PATH ||
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
  const browser = await puppeteer.launch({
    executablePath,
    headless: true,
    args: ["--disable-gpu", "--no-sandbox"],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({width: 1280, height: 720, deviceScaleFactor: 1});
    await page.setContent("<!doctype html><html><body><main id=\"host\"></main></body></html>");
    await page.addScriptTag({
      path: path.join(root, "node_modules", "mermaid", "dist", "mermaid.min.js"),
    });
    const result = await page.evaluate(async (diagramSource) => {
      globalThis.mermaid.initialize({
        startOnLoad: false,
        deterministicIds: true,
        deterministicIDSeed: "e02-rag",
        securityLevel: "strict",
        theme: "base",
        flowchart: {htmlLabels: false},
      });
      const rendered = await globalThis.mermaid.render(
        "mermaid-rag",
        diagramSource,
      );
      const host = document.querySelector("#host");
      host.innerHTML = rendered.svg;
      const semanticNodeIds = ["source", "retrieve", "model", "answer"];
      const nodeMap = Object.fromEntries(
        semanticNodeIds.map((sourceId) => {
          const element = host.querySelector(
            `g.node[id*="-${sourceId}-"], g.node[id$="-${sourceId}"]`,
          );
          if (element) {
            element.dataset.objectId = `node-${sourceId}`;
          }
          return [sourceId, element?.id ?? null];
        }),
      );
      return {
        svg: host.querySelector("svg").outerHTML,
        nodeMap,
        edgeIds: [...host.querySelectorAll(".edgePath path[id], path.flowchart-link[id]")].map(
          (element) => element.id,
        ),
      };
    }, source);

    for (const [sourceId, generatedId] of Object.entries(result.nodeMap)) {
      assert(generatedId, `Mermaid SVG is missing node ${sourceId}`);
    }
    await writeFile(path.join(output, "mermaid.svg"), result.svg);
    return {
      realChromiumSvgRendered: true,
      deterministicIdConfigEnabled: true,
      generatedNodeIds: result.nodeMap,
      generatedEdgeIds: result.edgeIds,
      semanticDataObjectIdsInjected: true,
      caveat:
        "Mermaid DOM ids contain generated prefixes/suffixes. The adapter must inject canonical data-object-id attributes before animation.",
    };
  } finally {
    await browser.close();
  }
}

async function verifyD2() {
  const svg = await readFile(path.join(output, "d2.svg"), "utf8");
  const document = new JSDOM(svg, {contentType: "image/svg+xml"}).window
    .document;
  const classNames = [...document.querySelectorAll("g[class]")].flatMap(
    (element) => [...element.classList],
  );
  const semanticNodeClasses = Object.fromEntries(
    ["source", "retrieve", "model", "answer"].map((sourceId) => [
      sourceId,
      Buffer.from(sourceId, "utf8").toString("base64"),
    ]),
  );
  for (const [sourceId, encodedClass] of Object.entries(semanticNodeClasses)) {
    assert(
      classNames.includes(encodedClass),
      `D2 SVG is missing the encoded class for ${sourceId}`,
    );
  }
  const explicitIds = [...document.querySelectorAll("g[id]")].map(
    (element) => element.id,
  );
  return {
    realCliSvgRendered: true,
    version: "v0.7.1",
    semanticNodeClasses,
    semanticIdsRecoverableFromBase64Class: true,
    explicitSemanticGroupIdsPresent: explicitIds.includes("source"),
    caveat:
      "D2 encodes semantic keys as base64 CSS classes rather than SVG id attributes. An adapter can recover them, but should inject canonical data-object-id attributes before animation.",
  };
}

async function verifyMermaidToExcalidraw(source) {
  const executablePath =
    process.env.CHROME_PATH ||
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
  const browser = await puppeteer.launch({
    executablePath,
    headless: true,
    args: ["--disable-gpu", "--no-sandbox"],
  });

  try {
    const page = await browser.newPage();
    await page.setContent("<!doctype html><html><body></body></html>");
    await page.addScriptTag({
      path: path.join(output, "mermaid-to-excalidraw.js"),
    });
    const conversions = await page.evaluate(async (diagramSource) => {
      const convert = globalThis.ExcalidrawMermaidBridge
        .convertMermaidToExcalidraw;
      const first = await convert(diagramSource);
      const second = await convert(diagramSource);
      return {
        first: {
          skeletons: first.skeletons,
          elements: first.elements,
          files: first.files,
          sceneJson: first.sceneJson,
          svg: first.svg,
        },
        secondIds: second.elements.map(({id}) => id),
      };
    }, source);

    const {elements} = conversions.first;
    assert(elements.length > 0, "Mermaid-to-Excalidraw returned no elements");
    const ids = elements.map(({id}) => id);
    assert.equal(new Set(ids).size, ids.length, "Excalidraw ids are not unique");
    const idSet = new Set(ids);
    for (const semanticId of ["source", "retrieve", "model", "answer"] ) {
      assert(idSet.has(semanticId), `Semantic node id was not preserved: ${semanticId}`);
    }
    for (const element of elements) {
      for (const bound of element.boundElements ?? []) {
        assert(idSet.has(bound.id), `Broken boundElements id: ${bound.id}`);
      }
      for (const bindingName of ["startBinding", "endBinding"]) {
        const binding = element[bindingName];
        if (binding) {
          assert(
            idSet.has(binding.elementId),
            `Broken ${bindingName} elementId: ${binding.elementId}`,
          );
        }
      }
      if (element.containerId) {
        assert(idSet.has(element.containerId), `Broken containerId: ${element.containerId}`);
      }
    }

    const jsonRoundTrip = JSON.parse(JSON.stringify(conversions.first));
    assert.deepEqual(
      jsonRoundTrip.elements.map(({id}) => id),
      ids,
    );
    const secondIds = conversions.secondIds;
    const deterministicAcrossConversions = ids.every(
      (id, index) => id === secondIds[index],
    );
    const canonicalTextMap = Object.fromEntries(
      elements
        .filter(({type, text}) => type === "text" && text)
        .map(({text, id, containerId}) => [text, {textElementId: id, containerId}]),
    );
    const serializedScene = JSON.parse(conversions.first.sceneJson);
    assert.equal(serializedScene.type, "excalidraw");
    assert.deepEqual(
      serializedScene.elements.map(({id}) => id),
      ids,
    );
    const exportedSvgDocument = new JSDOM(conversions.first.svg, {
      contentType: "image/svg+xml",
    }).window.document;
    const semanticIdsInExportedSvgDom = [
      "source",
      "retrieve",
      "model",
      "answer",
    ].filter((id) => exportedSvgDocument.getElementById(id));

    await writeFile(
      path.join(output, "excalidraw-elements.json"),
      `${JSON.stringify(conversions.first, null, 2)}\n`,
    );
    await writeFile(
      path.join(output, "excalidraw.scene.json"),
      `${JSON.stringify(serializedScene, null, 2)}\n`,
    );
    await writeFile(path.join(output, "excalidraw.svg"), conversions.first.svg);
    return {
      summary: {
        realChromiumConversionTested: true,
        elementCount: elements.length,
        elementTypes: [...new Set(elements.map(({type}) => type))].sort(),
        idsUniqueAndJsonRoundTripStable: true,
        officialSceneSerializationPreservesIds: true,
        svgExportTested: true,
        semanticIdsInExportedSvgDom,
        bindingsReferenceExistingElements: true,
        deterministicAcrossFreshConversions: deterministicAcrossConversions,
        semanticMermaidNodeIdsPreserved: true,
        canonicalTextMap,
        caveat:
          "Container ids survive conversion, but generated text ids change and exported SVG lacks semantic DOM ids. Persist the scene and map canonical ids; use SVG export as a static snapshot, not as the editable timeline source.",
      },
    };
  } finally {
    await browser.close();
  }
}
