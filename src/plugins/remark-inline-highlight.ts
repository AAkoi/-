import type { Content, Parent, Root, Text } from "mdast";
import type { Plugin } from "unified";

function cloneText(value: string): Text {
  return {
    type: "text",
    value,
  };
}

function flushMarkedNodes(result: Content[], markedNodes: Content[]) {
  if (markedNodes.length === 0)
    return;

  result.push({ type: "html", value: "<mark class=\"frosti-mark\">" });
  result.push(...markedNodes);
  result.push({ type: "html", value: "</mark>" });
  markedNodes.length = 0;
}

function transformInlineChildren(parent: Parent) {
  if (!Array.isArray(parent.children) || parent.children.length === 0)
    return;

  const result: Content[] = [];
  const markedNodes: Content[] = [];
  let inMark = false;

  const pushNode = (node: Content) => {
    if (inMark)
      markedNodes.push(node);
    else
      result.push(node);
  };

  for (const child of parent.children as Content[]) {
    if (child.type !== "text") {
      pushNode(child);
      continue;
    }

    const segments = child.value.split("==");
    segments.forEach((segment, index) => {
      if (segment) {
        pushNode(cloneText(segment));
      }

      if (index < segments.length - 1) {
        if (inMark) {
          flushMarkedNodes(result, markedNodes);
          inMark = false;
        }
        else {
          inMark = true;
        }
      }
    });
  }

  if (inMark) {
    result.push(cloneText("=="));
    result.push(...markedNodes);
  }

  parent.children = result;
}

function visitTree(node: any) {
  if (!node || typeof node !== "object")
    return;

  if (Array.isArray(node.children)) {
    node.children.forEach((child: any) => visitTree(child));
    transformInlineChildren(node as Parent);
  }
}

export const remarkInlineHighlight: Plugin<[], Root> = () => {
  return (tree: Root) => {
    visitTree(tree);
  };
};
