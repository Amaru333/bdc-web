import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const mode = process.argv[2] ?? 'offline';
const requestedApp = process.argv[3];

if (!['offline', 'online', 'unique'].includes(mode)) {
  console.error('Usage: node scripts/check-links.mjs <offline|online|unique>');
  process.exit(1);
}

const appsDirectory = join(root, 'apps');
const discoveredApps = readdirSync(appsDirectory, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => {
    const directory = join(appsDirectory, entry.name);
    const packagePath = join(directory, 'package.json');

    if (!existsSync(packagePath)) return null;

    const packageJson = JSON.parse(readFileSync(packagePath, 'utf8'));
    if (!packageJson.scripts?.build) return null;

    return { directory, name: entry.name, workspace: packageJson.name };
  })
  .filter(Boolean);

const apps = requestedApp
  ? discoveredApps.filter(
      (app) => app.name === requestedApp || app.workspace === requestedApp,
    )
  : discoveredApps;

if (requestedApp && apps.length === 0) {
  console.error(`No buildable app workspace found for "${requestedApp}".`);
  process.exit(1);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    stdio: 'inherit',
    ...options,
  });

  if (result.error?.code === 'ENOENT') {
    console.error(
      `Could not find ${command}. Install it and ensure it is on PATH.`,
    );
    process.exit(1);
  }

  return result;
}

let hasFailures = false;

for (const app of apps) {
  console.log(`\nBuilding ${app.workspace}...`);
  const build = run('npm', ['run', 'build', '--workspace', app.workspace]);
  if (build.status !== 0) {
    hasFailures = true;
    continue;
  }

  console.log(`\nChecking links in ${app.name}...`);
  const args = [
    '--config',
    join(root, 'lychee.toml'),
    '--root-dir',
    join(app.directory, 'dist'),
  ];

  if (mode === 'online') {
    args.push(
      '--scheme',
      'https',
      '--scheme',
      'http',
      '--cache',
      '--max-cache-age',
      '2d',
    );
  } else {
    args.push('--offline');
  }

  if (mode === 'unique') args.push('--format', 'compact');
  args.push(`apps/${app.name}/dist/**/*.html`);

  const check = run(
    'lychee',
    args,
    mode === 'unique' ? { stdio: 'pipe' } : undefined,
  );

  if (mode === 'unique') {
    const output = `${check.stdout ?? ''}\n${check.stderr ?? ''}`;
    const distUrl = new URL(`${join(app.directory, 'dist')}/`, 'file:').href;
    const links = [...output.matchAll(/file:\/\/\/[^ )\n]+/g)]
      .map(([url]) => url.replace(distUrl, '/'))
      .filter((url, index, all) => all.indexOf(url) === index)
      .sort();
    console.log(links.join('\n'));
  } else if (check.status !== 0) {
    hasFailures = true;
  }
}

if (hasFailures) process.exit(1);
