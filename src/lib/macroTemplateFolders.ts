import type {
  MacroChartTemplate,
  MacroTemplateFolder,
  MacroTemplateFolderScope,
} from "@/lib/data/macroPresetTemplates";

export function foldersForScope(
  folders: MacroTemplateFolder[],
  scope: MacroTemplateFolderScope,
): MacroTemplateFolder[] {
  return folders.filter((f) => f.scope === scope);
}

export function createMacroTemplateFolder(
  name: string,
  scope: MacroTemplateFolderScope,
): MacroTemplateFolder {
  return {
    id: `folder-${scope}-${Date.now().toString(36)}`,
    name,
    scope,
  };
}

export function buildTemplateFolderGroups(
  templates: MacroChartTemplate[],
  folders: MacroTemplateFolder[],
  getFolderId: (tpl: MacroChartTemplate) => string | null | undefined,
): Array<{ folder: MacroTemplateFolder | null; templates: MacroChartTemplate[] }> {
  const validFolderIds = new Set(folders.map((f) => f.id));
  const buckets = new Map<string | null, MacroChartTemplate[]>();
  buckets.set(null, []);

  for (const folder of folders) {
    buckets.set(folder.id, []);
  }

  for (const tpl of templates) {
    const raw = getFolderId(tpl);
    const key = raw && validFolderIds.has(raw) ? raw : null;
    const list = buckets.get(key) ?? buckets.get(null)!;
    list.push(tpl);
  }

  const groups: Array<{ folder: MacroTemplateFolder | null; templates: MacroChartTemplate[] }> =
    [];
  for (const folder of folders) {
    groups.push({ folder, templates: buckets.get(folder.id) ?? [] });
  }
  const loose = buckets.get(null) ?? [];
  if (loose.length > 0) {
    groups.push({ folder: null, templates: loose });
  }
  return groups;
}
