// 命令模板：content 中的 {参数名} 占位符解析（requirements.md §11）

/** 提取 content 中所有去重后的占位符名（按首次出现顺序） */
export function extractPlaceholders(content: string): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  const re = /\{([^{}]+)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    const name = m[1].trim();
    if (name && !seen.has(name)) {
      seen.add(name);
      result.push(name);
    }
  }
  return result;
}

/** 用参数值填充模板，未提供的占位符替换为空串 */
export function fillTemplate(content: string, values: Record<string, string>): string {
  return content.replace(/\{([^{}]+)\}/g, (_match, name: string) => values[name.trim()] ?? '');
}
