const a = require('../invoke-args.cjs');
console.log(JSON.stringify({
  name: a.name,
  entrypoint_path: a.entrypoint_path,
  verify_jwt: a.verify_jwt,
  fileCount: a.files.length,
  fileNames: a.files.map((f) => f.name),
  indexImports: a.files.find((f) => f.name === 'index.ts').content.includes('./fonts.ts'),
}));
