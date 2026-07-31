import {
  convertToExcalidrawElements,
  exportToSvg,
  serializeAsJSON,
} from "@excalidraw/excalidraw";
import {parseMermaidToExcalidraw} from "@excalidraw/mermaid-to-excalidraw";

export async function convertMermaidToExcalidraw(source) {
  const converted = await parseMermaidToExcalidraw(source);
  const elements = convertToExcalidrawElements(converted.elements, {
    regenerateIds: false,
  });
  const appState = {
    exportBackground: false,
    viewBackgroundColor: "#ffffff",
  };
  const svg = await exportToSvg({
    elements,
    appState,
    files: converted.files,
    renderEmbeddables: false,
    skipInliningFonts: true,
  });
  return {
    skeletons: converted.elements,
    elements,
    files: converted.files,
    sceneJson: serializeAsJSON(elements, appState, converted.files, "local"),
    svg: svg.outerHTML,
  };
}
