import type { Code, Root } from "mdast";
import type { Plugin } from "unified";

const langAliasMap: Record<string, string> = {
  c: "c",
  h: "c",
  cpp: "cpp",
  "c++": "cpp",
  cc: "cpp",
  cxx: "cpp",
  hpp: "cpp",
  asm: "asm",
  s: "asm",
  armasm: "asm",
  assembly: "asm",
  gas: "asm",
  gnuasm: "asm",
};

function visitTree(node: any) {
  if (!node || typeof node !== "object")
    return;

  if (node.type === "code" && typeof node.lang === "string") {
    const normalized = node.lang.trim().toLowerCase();
    node.lang = langAliasMap[normalized] || normalized;
  }

  if (Array.isArray(node.children)) {
    node.children.forEach((child: any) => visitTree(child));
  }
}

export const remarkCodeLangAlias: Plugin<[], Root> = () => {
  return (tree: Root) => {
    visitTree(tree);
  };
};
