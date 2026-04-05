import * as fs from "fs";
import * as path from "path";
const __dirname = path.resolve();

const name = process.argv[2];
if (!name) {
  console.error("❌ Usage: ts-node nest-remove.ts <module-name>");
  process.exit(1);
}
const srcPath = path.join(__dirname, "src", name);
const appModulePath = path.join(__dirname, "src", "app.module.ts");
const pascalName = name.charAt(0).toUpperCase() + name.slice(1);

// 1. Delete the folder
if (fs.existsSync(srcPath)) {
  fs.rmSync(srcPath, { recursive: true, force: true });
  console.log(`✅ Deleted src/${name}`);
} else {
  console.warn(`⚠️ No directory src/${name} found`);
}

// 2. Remove from app.module.ts
if (fs.existsSync(appModulePath)) {
  let content = fs.readFileSync(appModulePath, "utf-8");

  // Remove import
  const importRegex = new RegExp(
    `import \\{\\s*${pascalName}Module\\s*\\} from ['"]./${name}/${name}\\.module['"];\\n?`,
    "g",
  );
  content = content.replace(importRegex, "");

  // Remove from @Module imports
  const importsRegex = new RegExp(`\\b${pascalName}Module,?\\s*`, "g");
  content = content.replace(importsRegex, "");

  fs.writeFileSync(appModulePath, content);
  console.log(`✅ Cleaned app.module.ts references`);
} else {
  console.warn(`⚠️ src/app.module.ts not found`);
}
