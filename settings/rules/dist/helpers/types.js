export const getTypeString = (node, typeChecker, parserServices) => {
  const tsNode = parserServices.esTreeNodeToTSNodeMap.get(node);
  const type = typeChecker.getTypeAtLocation(tsNode);
  const typeString = typeChecker.typeToString(type);
  return typeString;
};
export const createReportData = (node, messageId) => ({
  node,
  messageId,
  data: { name: node.name },
});
export const memoize = (fn) => {
  let cached;
  return () => {
    if (cached === undefined) {
      cached = fn();
    }
    return cached;
  };
};
