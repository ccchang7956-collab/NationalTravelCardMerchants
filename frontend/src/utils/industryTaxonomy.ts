export interface IndustryOption {
  industry_code: string;
  industry_name: string;
  industry_group_code: string;
  industry_group_name: string;
  industry_group_order: number;
}

export interface IndustryGroup {
  code: string;
  name: string;
  order: number;
  details: IndustryOption[];
}

export function normalizeIndustryCode(value: unknown): string {
  if (typeof value !== "string") return "";
  const code = value.trim();
  return /^(?:\d{2}|\d{2}-\d{2}|\d{6})$/.test(code) ? code : "";
}

export function groupIndustryOptions(options: IndustryOption[]): IndustryGroup[] {
  const groups = new Map<string, IndustryGroup>();
  for (const option of options) {
    let group = groups.get(option.industry_group_code);
    if (!group) {
      group = {
        code: option.industry_group_code,
        name: option.industry_group_name,
        order: option.industry_group_order,
        details: [],
      };
      groups.set(group.code, group);
    }
    group.details.push(option);
  }
  return [...groups.values()].sort((a, b) => a.order - b.order || a.code.localeCompare(b.code));
}
