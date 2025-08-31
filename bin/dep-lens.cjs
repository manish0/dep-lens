#!/usr/bin/env node
/**
 * Outdated dependency checker (Declared vs Latest)
 *
 * - Compares ONLY what you declared in package.json (range or exact) vs the registry latest.
 * - If latest does NOT satisfy declared → it's outdated.
 * - "Outdated since" = publish time of the earliest version that exceeds your declared range.
 *
 * Features:
 * - @regitry-group -> https://npm.pkg.github.com by default
 * - Per-scope auth via --scope-auth=@scope=env:VARNAME (or pass raw token)
 * - Tries both plain and encoded URL paths
 * - Normalizes versions (handles "v1.2.3")
 *
 * Usage:
 *   node check-outdated-declared-vs-latest.cjs [path/to/package.json]
 *     [--days=60]
 *     [--include-dev] [--include-peer] [--include-optional]
 *     [--registry=https://registry.npmjs.org]
 *     [--scope-registry=@regitry-group=https://npm.pkg.github.com]
 *     [--skip-registry=<scope>]
 *     [--scope-auth=@regitry-group=env:GITHUB_TOKEN]
 *     [--verbose]
 */

const fs = require("fs");
const path = require("path");
const os = require("os");
const https = require("https");
const semver = require("semver");

// ---------- CLI ARGS ----------
const argv = process.argv.slice(2);
const pkgPathArg = argv.find(a => !a.startsWith("--")) || "package.json";
const DAYS_ARG = Number((argv.find(a => a.startsWith("--days=")) || "").split("=")[1]) || 60;
const INCLUDE_DEV = argv.includes("--include-dev");
const INCLUDE_PEER = argv.includes("--include-peer");
const INCLUDE_OPT = argv.includes("--include-optional");
const VERBOSE = argv.includes("--verbose");


// Default registry for everything else
const DEFAULT_REGISTRY =
  (argv.find(a => a.startsWith("--registry=")) || "").split("=")[1] ||
  "https://registry.npmjs.org";

// function parseScopePairs(flagName) {
//   return Object.fromEntries(
//     argv
//       .filter(a => a.startsWith(`--${flagName}=`))
//       .map(flag => {
//         const firstEq = flag.indexOf("=");
//         const remainder = flag.slice(firstEq + 1); // "@scope=https://host"
//         const secondEq = remainder.indexOf("=");
//         const scope = remainder.slice(0, secondEq);
//         const value = remainder.slice(secondEq + 1);
//         return [scope, value];
//       })
//   );
// }

// Get default scope registry from CLI arg if provided, else empty object
const defaultScopeRegistryArg = argv.find(a => a.startsWith("--default-scope-registry="));
const DEFAULT_SCOPE_REGISTRY = defaultScopeRegistryArg
  ? JSON.parse(defaultScopeRegistryArg.split("=")[1])
  : {};

// Parse repeatable flags: --scope-registry=@scope=https://host
function parseScopePairs(flagName) {
  return Object.fromEntries(
    argv
      .filter(a => a.startsWith(`--${flagName}=`))
      .map(flag => {
        const firstEq = flag.indexOf("=");
        const remainder = flag.slice(firstEq + 1); // "@scope=https://host"
        const secondEq = remainder.indexOf("=");
        const scope = remainder.slice(0, secondEq);
        const value = remainder.slice(secondEq + 1);
        return [scope, value];
      })
  );
}

const userScopeRegistry = parseScopePairs("scope-registry");
const scopeRegistryMap = { ...DEFAULT_SCOPE_REGISTRY, ...userScopeRegistry };

// Per-scope auth: --scope-auth=@registry-name=env:GITHUB_TOKEN  (or raw token)


const scopeAuthMap = Object.fromEntries(
  argv
    .filter(a => a.startsWith("--scope-auth="))
    .map(flag => {
      const firstEq = flag.indexOf("=");
      const remainder = flag.slice(firstEq + 1); // "@scope=env:GITHUB_TOKEN" or "@scope=username:password" or "@scope=token"
      const secondEq = remainder.indexOf("=");
      const scope = remainder.slice(0, secondEq);
      const spec = remainder.slice(secondEq + 1);
      let token = null;
      if (spec?.startsWith("env:")) {
        const envName = spec.slice(4);
        token = process.env[envName] || null;
      } else if (spec?.includes(":")) {
        // Azure DevOps: username:password
        token = Buffer.from(spec).toString("base64");
      } else {
        // GitHub token or raw token
        token = spec || null;
      }
      return [scope, token];
    })
);

const now = new Date();

// ---------- HELPERS ----------
function daysBetween(a, b) {
  const ms = Math.abs(a.getTime() - b.getTime());
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

function parseScope(pkgName) {
  if (pkgName.startsWith("@")) {
    const idx = pkgName.indexOf("/");
    if (idx > 0) return pkgName.slice(0, idx); // "@scope"
  }
  return null;
}

function resolveRegistryAndAuth(pkgName) {
  const scope = parseScope(pkgName);
  const registry =
    (scope && scopeRegistryMap[scope]) ||
    DEFAULT_REGISTRY;

  const headers = {
    "Accept": "application/json",
    "User-Agent": "declared-vs-latest-checker"
  };

  const token = scope ? scopeAuthMap[scope] : null;
  if (token) headers["Authorization"] = `Bearer ${token}`;

  if (VERBOSE) {
    console.error(`[registry] ${pkgName} → ${registry}${token ? " (auth)" : ""}`);
  }

  return { registry: registry.replace(/\/$/, ""), headers };
}

function httpsJson(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers }, (res) => {
      if (res.statusCode < 200 || res.statusCode >= 300) {
        res.resume();
        return reject(new Error(`GET ${url} → ${res.statusCode}`));
      }
      let raw = "";
      res.on("data", chunk => (raw += chunk));
      res.on("end", () => {
        try { resolve(JSON.parse(raw)); } catch (e) { reject(e); }
      });
    });
    req.on("error", reject);
  });
}

async function getPackageMetadata(pkgName) {
  const { registry, headers } = resolveRegistryAndAuth(pkgName);
  const isGPR = /npm\.pkg\.github\.com$/.test(registry);

  // Try both plain and encoded paths
  const urls = isGPR
    ? [ `${registry}/${pkgName}`, `${registry}/${encodeURIComponent(pkgName)}` ]
    : [ `${registry}/${encodeURIComponent(pkgName)}`, `${registry}/${pkgName}` ];

  let lastErr;
  for (const url of urls) {
    try {
      if (VERBOSE) console.error(`[fetch] ${pkgName} ← ${url}`);
      const meta = await httpsJson(url, headers);
      meta.__registry = registry;
      meta.__headers = headers;
      meta.__url = url;
      return meta;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

// Normalize a version string (handles "v1.2.3")
function normalizeVersion(v) {
  if (!v) return null;
  const c = semver.coerce(v);
  return c ? c.version : null;
}

// Return [{raw, norm}] sorted ascending by norm
function sortVersionsNormalized(rawVersions) {
  const normalized = rawVersions
    .map(v => ({ raw: v, norm: normalizeVersion(v) }))
    .filter(x => !!x.norm);
  normalized.sort((a, b) => semver.compare(a.norm, b.norm));
  return normalized;
}

// ---------- MAIN ----------
(async function main() {
  const resolvedPkgPath = path.resolve(process.cwd(), pkgPathArg);
  if (!fs.existsSync(resolvedPkgPath)) {
    console.error(`❌ package.json not found at: ${resolvedPkgPath}`);
    process.exit(1);
  }

  const pkg = JSON.parse(fs.readFileSync(resolvedPkgPath, "utf8"));
  const projectDir = path.dirname(resolvedPkgPath); // not used now but kept if you extend later

  const sections = [
    ["dependencies", true],
    ["devDependencies", INCLUDE_DEV],
    ["peerDependencies", INCLUDE_PEER],
    ["optionalDependencies", INCLUDE_OPT],
  ].filter(([, include]) => include);

  if (sections.length === 0) sections.push(["dependencies", true]);

  const all = {};
  for (const [section] of sections) Object.assign(all, pkg[section] || {});

  const names = Object.keys(all)
                .filter(name => {
                    const  skipRegistry  = parseScopePairs("skip-registry");
                    if (skipRegistry) {
                      const scope = parseScope(name);
                      let check = true;
                      Object.values(skipRegistry).forEach(value => {
                        if (scope && value === scope) {
                        if (VERBOSE) console.error(`[skip] ${name} (registry: ${scope})`);
                        check= false;
                      }
                      });
                      return check;
                    }
                  return true;
                })
                .sort();
  if (names.length === 0) {
    console.log("No dependencies found in the selected sections.");
    process.exit(0);
  }

  const limit = (function pLimit(concurrency) {
    let active = 0;
    const queue = [];
    const next = () => {
      if (queue.length === 0 || active >= concurrency) return;
      const { fn, resolve, reject } = queue.shift();
      active++;
      Promise.resolve()
        .then(fn)
        .then(v => { active--; resolve(v); next(); })
        .catch(e => { active--; reject(e); next(); });
    };
    return (fn) => new Promise((resolve, reject) => { queue.push({ fn, resolve, reject }); next(); });
  })(Math.min(10, Math.max(2, os.cpus()?.length || 4)));

  const rows = [];
  const now = new Date();

  await Promise.all(
    names.map((name) =>
      limit(async () => {
        const declared = all[name]; // what you wrote in package.json
        try {
          const meta = await getPackageMetadata(name);

          // Build normalized version list and latest
          const rawList = Object.keys(meta.versions || {});
          const normalized = sortVersionsNormalized(rawList); // [{raw, norm}] asc

          const rawLatestTag = meta["dist-tags"]?.latest;
          const latestNormFromTag = normalizeVersion(rawLatestTag);
          const latestEntry =
            latestNormFromTag
              ? (normalized.find(x => x.norm === latestNormFromTag) || normalized[normalized.length - 1])
              : normalized[normalized.length - 1];

          if (!latestEntry) return; // no semver versions

          const latestRaw = latestEntry.raw;
          const latestNorm = latestEntry.norm;

          // Determine if "latest" satisfies the declared range/exact
          let isOutdated = true;
          if (semver.validRange(declared) && latestNorm) {
            isOutdated = !semver.satisfies(latestNorm, declared);
          } else {
            // If declared is not a valid range, try exact version comparison
            const declaredExact = normalizeVersion(declared);
            if (declaredExact && latestNorm) {
              isOutdated = semver.gt(latestNorm, declaredExact);
            } else {
              // Non-semver specs (git, file:, tag) — can't reason, skip
              if (VERBOSE) console.error(`[skip] ${name} declared="${declared}" (non-semver)`);
              return;
            }
          }

          if (!isOutdated) return;

          // Outdated since: find the earliest version that does NOT satisfy the declared range
          // Strategy:
          //  - If declared is a range: compute all satisfying; pick maxSat; earliestOutOfRange = first > maxSat
          //  - If declared is exact: earliestOutOfRange = first > declaredExact
          const timeMap = meta.time || {};
          let earliestOutRaw = null;

          if (semver.validRange(declared)) {
            const satNorms = normalized.map(x => x.norm).filter(v => semver.satisfies(v, declared));
            let maxSat = null;
            if (satNorms.length) maxSat = satNorms[satNorms.length - 1];
            earliestOutRaw = normalized
              .filter(x => !semver.satisfies(x.norm, declared) && (!maxSat || semver.gt(x.norm, maxSat)))
              .map(x => x.raw)[0] || null;
          } else {
            const declaredExact = normalizeVersion(declared);
            if (declaredExact) {
              earliestOutRaw = normalized.filter(x => semver.gt(x.norm, declaredExact)).map(x => x.raw)[0] || null;
            }
          }

          // Choose date: publish time of earliestOutRaw, else latest
          let outdatedSinceDate = null;
          let outdatedSinceVersion = null;

          if (earliestOutRaw && timeMap[earliestOutRaw]) {
            outdatedSinceDate = new Date(timeMap[earliestOutRaw]);
            outdatedSinceVersion = earliestOutRaw;
          } else if (timeMap[latestRaw]) {
            outdatedSinceDate = new Date(timeMap[latestRaw]);
            outdatedSinceVersion = latestRaw;
          }

          const daysOutdated = outdatedSinceDate ? daysBetween(now, outdatedSinceDate) : null;
          if (daysOutdated === null || daysOutdated < DAYS_ARG) return;

          rows.push({
            name,
            declared,
            latest: latestNorm,
            outdatedSinceVersion: outdatedSinceVersion || "(unknown)",
            outdatedSinceDate: outdatedSinceDate ? outdatedSinceDate.toISOString().slice(0, 10) : "(unknown)",
            daysOutdated,
            status: `OUTDATED >=${DAYS_ARG}d`,
          });
        } catch (err) {
          rows.push({
            name,
            declared,
            latest: "(error)",
            outdatedSinceVersion: "(error)",
            outdatedSinceDate: "(error)",
            daysOutdated: "(error)",
            status: `Error: ${err.message || err}`
          });
        }
      })
    )
  );

  if (rows.length === 0) {
    console.log(`✅ No dependencies (declared vs latest) are outdated by ≥ ${DAYS_ARG} days.`);
    process.exit(0);
  }

  // Sort: most stale first, then name
  rows.sort((a, b) => {
    const ad = typeof a.daysOutdated === "number" ? a.daysOutdated : -1;
    const bd = typeof b.daysOutdated === "number" ? b.daysOutdated : -1;
    if (ad !== bd) return bd - ad;
    return a.name.localeCompare(b.name);
  });

  console.table(rows);
})();
