import { readFile } from "node:fs/promises";

const allowedRuntimeLicenses = new Set(["MIT", "ISC", "0BSD"]);
const requiredFiles = ["LICENSE", "NOTICE.md", "THIRD_PARTY_NOTICES.md", "ASSET_PROVENANCE.md"];
const deployedLegalFiles = ["public/license.txt", "public/legal.html", "public/third-party-notices.txt"];

const [manifestText, lockText, ...legalFiles] = await Promise.all([
  readFile(new URL("../package.json", import.meta.url), "utf8"),
  readFile(new URL("../package-lock.json", import.meta.url), "utf8"),
  ...[...requiredFiles, ...deployedLegalFiles].map((file) =>
    readFile(new URL(`../${file}`, import.meta.url), "utf8")
  ),
]);

const manifest = JSON.parse(manifestText);
const lock = JSON.parse(lockText);
const failures = [];

if (manifest.license !== "MIT") failures.push("package.json must declare the MIT license.");
if (manifest.author !== "Ross Mattheis") failures.push("package.json must identify Ross Mattheis as author.");
if (!manifest.maintainers?.some(({ name }) => name === "Ross Mattheis")) {
  failures.push("package.json must identify Ross Mattheis as a maintainer.");
}

const [license, notice, thirdPartyNotices, , publicLicense, legalPage, publicNotices] = legalFiles;
const requiredStatement =
  "ISO New England was not involved in the creation of this website. ISO New England has no ownership or other interest in this website. The website’s owner is solely responsible for the content and functionality.";
if (!notice.includes(requiredStatement)) failures.push("NOTICE.md is missing the required ISO New England statement.");
if (!legalPage.includes(requiredStatement)) failures.push("public/legal.html is missing the required ISO New England statement.");
if (license !== publicLicense) failures.push("public/license.txt has drifted from the repository LICENSE.");

for (const component of ["React", "Framer Motion", "Lucide", "tslib"]) {
  if (!thirdPartyNotices.includes(component) || !publicNotices.includes(component.toUpperCase())) {
    failures.push(`Third-party notices are missing ${component}.`);
  }
}

const runtimePackages = Object.entries(lock.packages || {})
  .filter(([path, metadata]) => path.startsWith("node_modules/") && metadata.dev !== true)
  .map(([path, metadata]) => ({
    name: path.replace(/^.*node_modules\//, ""),
    version: metadata.version,
    license: metadata.license,
  }))
  .sort((left, right) => left.name.localeCompare(right.name));

for (const dependency of runtimePackages) {
  if (!dependency.license) {
    failures.push(`${dependency.name}@${dependency.version} has no license metadata.`);
  } else if (!allowedRuntimeLicenses.has(dependency.license)) {
    failures.push(`${dependency.name}@${dependency.version} uses unreviewed license ${dependency.license}.`);
  }
}

if (failures.length) {
  console.error("License hygiene check failed:\n");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`License hygiene check passed for ${runtimePackages.length} runtime packages.`);
  console.log(`Allowed runtime licenses: ${[...allowedRuntimeLicenses].join(", ")}.`);
  console.log(`Required records present: ${[...requiredFiles, ...deployedLegalFiles].join(", ")}.`);
}
