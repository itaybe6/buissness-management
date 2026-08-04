// Outputs deploy_edge_function arguments JSON to stdout (for MCP invocation)
const fs = require("fs");
const path = require("path");
const j = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "deploy-args-min.json"), "utf8"),
);
process.stdout.write(
  JSON.stringify({
    name: j.name,
    entrypoint_path: j.entrypoint_path,
    verify_jwt: j.verify_jwt,
    files: j.files,
  }),
);
