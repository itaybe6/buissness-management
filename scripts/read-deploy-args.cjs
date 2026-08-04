#!/usr/bin/env node
/** Prints deploy_edge_function arguments JSON to stdout (for MCP). */
const args = require('../mcp-deploy-args.json');
process.stdout.write(JSON.stringify({
  name: args.name,
  entrypoint_path: args.entrypoint_path,
  verify_jwt: args.verify_jwt,
  files: args.files,
}));
