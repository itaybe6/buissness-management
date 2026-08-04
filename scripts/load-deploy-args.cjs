/** Prints deploy_edge_function arguments JSON to stdout for MCP invocation. */
const args = require('../mcp-deploy-args.json');
process.stdout.write(JSON.stringify(args));
