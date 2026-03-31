/**
 * Monorepo ildizidagi `package.json` skriptlari uchun: cwd qayerda bo‘lishidan qat’i nazar
 * `backend` papkasida `npm run <script>` ishga tushadi (`--prefix backend` xatosi oldini olish).
 */
const { spawnSync } = require("child_process");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..");
const backendDir = path.join(repoRoot, "backend");
const npmScript = process.argv[2] || "db:deploy";

const result = spawnSync("npm", ["run", npmScript], {
  cwd: backendDir,
  stdio: "inherit",
  shell: true,
  env: process.env
});

process.exit(result.status === null ? 1 : result.status);
